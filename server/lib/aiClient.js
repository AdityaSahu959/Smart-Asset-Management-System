const crypto = require('node:crypto');
const TRIAGE_VERSION = 'valhalla/distilbart-mnli-12-3@ef9a58ce6a9cd44cd0d4c2f7db1cd67f81019a8b';
const EMBEDDING_VERSION = 'sentence-transformers/all-MiniLM-L6-v2@1110a243fdf4706b3f48f1d95db1a4f5529b4d41';
const CATEGORIES = ['Hardware Fault','OS and Software Crash','Network and DHCP Connectivity','Peripheral Defect','Power Infrastructure'];
const fingerprint = (issue, resolution) => crypto.createHash('sha256').update(issue + '\n' + resolution).digest('hex');
class AIUnavailable extends Error { constructor() { super('AI unavailable; manual review required'); } }
class CircuitBreaker {
  constructor({ threshold = 3, resetMs = 30000, now = Date.now } = {}) {
    if (!Number.isSafeInteger(threshold) || threshold < 1 || !Number.isFinite(resetMs) || resetMs < 1) throw new Error('Invalid circuit breaker configuration');
    this.threshold = threshold; this.resetMs = resetMs; this.now = now;
    this.state = 'Closed'; this.failures = 0; this.generation = 0; this.probing = false;
  }
  enter() {
    if (this.state === 'Open') {
      if (this.now() < this.openUntil) throw new AIUnavailable();
      this.state = 'Half-Open';
    }
    if (this.state === 'Half-Open') {
      if (this.probing) throw new AIUnavailable();
      this.probing = true;
    }
    return this.generation;
  }
  success(generation) {
    if (generation !== this.generation) return;
    this.failures = 0; this.state = 'Closed'; this.probing = false; this.generation++;
  }
  failure(generation) {
    if (generation !== this.generation) return;
    this.failures++;
    if (this.state === 'Half-Open' || this.failures >= this.threshold) {
      this.state = 'Open'; this.openUntil = this.now() + this.resetMs; this.probing = false; this.generation++;
    }
  }
  status() { return { state: this.state, failures: this.failures, retry_after_ms: this.state === 'Open' ? Math.max(0, this.openUntil - this.now()) : 0 }; }
}
function validVector(vector) {
  return Array.isArray(vector) && vector.length === 384 && vector.every(Number.isFinite) &&
    Math.abs(Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) - 1) <= 0.01;
}
class AIClient {
  constructor({ url = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000', key = process.env.AI_SERVICE_KEY, timeoutMs = Number(process.env.AI_TIMEOUT_MS || 3000), fetchImpl = fetch, breaker } = {}) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password) throw new Error('AI service must use an authenticated loopback endpoint');
    if (!Number.isFinite(timeoutMs) || timeoutMs < 10 || timeoutMs > 30000) throw new Error('Invalid AI timeout');
    this.url = parsed.origin; this.key = typeof key === 'string' && Buffer.byteLength(key) >= 32 ? key : undefined; this.timeoutMs = timeoutMs; this.fetch = fetchImpl;
    this.breaker = breaker || new CircuitBreaker({ threshold: Number(process.env.AI_BREAKER_THRESHOLD || 3), resetMs: Number(process.env.AI_BREAKER_RESET_MS || 30000) });
  }
  async post(endpoint, body, validate) {
    if (!this.key) throw new AIUnavailable();
    const generation = this.breaker.enter();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(this.url + endpoint, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-AI-Key': this.key }, body: JSON.stringify(body) });
      if (!response.ok) throw new AIUnavailable();
      const result = await response.json();
      if (!validate(result)) throw new AIUnavailable();
      this.breaker.success(generation);
      return result;
    } catch {
      this.breaker.failure(generation);
      throw new AIUnavailable();
    } finally { clearTimeout(timer); }
  }
  triage(description, id) {
    return this.post('/api/v1/triage', { description, request_id: String(id) }, result =>
      result?.request_id === String(id) && result.model_version === TRIAGE_VERSION && result.taxonomy_version === 'it-faults-v2' &&
      Number.isFinite(result.score) && result.score >= 0 && result.score <= 1 &&
      (result.category === null || CATEGORIES.includes(result.category)) &&
      typeof result.manual_triage_required === 'boolean' && typeof result.safety_escalation_required === 'boolean' &&
      ['Low','Medium','High','Critical'].includes(result.priority_suggestion) &&
      (result.category !== null || result.manual_triage_required) &&
      (!result.safety_escalation_required || result.manual_triage_required));
  }
  index(record) {
    const body = { ticket_id: record.id, issue_description: record.issue_description, resolution_summary: record.resolution_summary, status: 'Closed', verified: true, source_type: 'real' };
    return this.post('/api/v1/index-resolution', body, result =>
      result?.ticket_id === record.id && result.dimensions === 384 && result.model_version === EMBEDDING_VERSION &&
      result.text_fingerprint === fingerprint(record.issue_description, record.resolution_summary) && validVector(result.vector));
  }
  recommend(description, candidates) {
    return this.post('/api/v1/recommend', { description, historical_tickets: candidates, min_similarity: 0.45 }, result =>
      Array.isArray(result?.matches) && result.matches.length <= 3 && new Set(result.matches.map(match => match.ticket_id)).size === result.matches.length &&
      result.matches.every(match => {
        const original = candidates.find(candidate => candidate.ticket_id === match.ticket_id);
        return original && match.verified === true && match.model_version === EMBEDDING_VERSION &&
          Number.isFinite(match.similarity) && match.similarity >= 0.45 && match.similarity <= 1 &&
          match.issue_description === original.issue_description && match.resolution_summary === original.resolution_summary;
      }));
  }
}
module.exports = { AIClient, CircuitBreaker, AIUnavailable, fingerprint, validVector, TRIAGE_VERSION, EMBEDDING_VERSION, CATEGORIES };

