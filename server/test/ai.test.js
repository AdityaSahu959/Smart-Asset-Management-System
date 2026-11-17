const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CircuitBreaker, AIClient, AIUnavailable, TRIAGE_VERSION, EMBEDDING_VERSION, fingerprint } = require('../lib/aiClient');
const { eligible, recommendations } = require('../lib/aiMaintenance');
const maintenance = require('../controllers/maintenanceController');
test('breaker opens at threshold, blocks calls, admits one half-open probe and recovers', () => {
  let now = 0;
  const breaker = new CircuitBreaker({ threshold: 3, resetMs: 100, now: () => now });
  for (let index = 0; index < 3; index++) breaker.failure(breaker.enter());
  assert.equal(breaker.status().state, 'Open');
  assert.throws(() => breaker.enter(), AIUnavailable);
  now = 101;
  const probe = breaker.enter();
  assert.equal(breaker.status().state, 'Half-Open');
  assert.throws(() => breaker.enter(), AIUnavailable);
  breaker.success(probe);
  assert.equal(breaker.status().state, 'Closed');
});
test('late success from old request cannot close a newly opened breaker', () => {
  const breaker = new CircuitBreaker({ threshold: 1 });
  const old = breaker.enter(); breaker.failure(old); breaker.success(old);
  assert.equal(breaker.status().state, 'Open');
});
test('failed half-open probe opens breaker again', () => {
  let now = 0; const breaker = new CircuitBreaker({ threshold: 1, resetMs: 100, now: () => now });
  breaker.failure(breaker.enter()); now = 101; breaker.failure(breaker.enter());
  assert.equal(breaker.status().state, 'Open');
});
test('AI client times out and redacts internal failures', async () => {
  const client = new AIClient({ key: 'test-only-key-for-unit-tests-strong-enough', timeoutMs: 10, fetchImpl: async (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('private internal service detail')))) });
  await assert.rejects(client.triage('A computer cannot boot properly', 1), error => error instanceof AIUnavailable && !error.message.includes('private'));
});
test('AI client rejects malformed, mismatched and unsafe responses', async () => {
  const good = { request_id: '1', model_version: TRIAGE_VERSION, taxonomy_version: 'it-faults-v2', score: 0.8, category: 'Hardware Fault', manual_triage_required: false, safety_escalation_required: false, priority_suggestion: 'Medium' };
  for (const change of [{ score: 2 }, { model_version: 'wrong' }, { request_id: '2' }, { category: null }, { safety_escalation_required: true }]) {
    const client = new AIClient({ key: 'test-only-key-for-unit-tests-strong-enough', fetchImpl: async () => ({ ok: true, json: async () => ({ ...good, ...change }) }) });
    await assert.rejects(client.triage('A computer cannot boot properly', 1), AIUnavailable);
  }
});
test('verified real closed repairs alone are eligible for indexing', () => {
  const record = { maintenance_status: 'Closed', source_type: 'real', verified_by: 1, verified_at: '2026-01-01', resolution_summary: 'Confirmed repair' };
  assert.ok(eligible(record));
  for (const change of [{ maintenance_status: 'Open' }, { source_type: 'synthetic' }, { verified_by: null }, { resolution_summary: '' }]) assert.ok(!eligible({ ...record, ...change }));
});
test('empty history returns manual fallback without contacting AI', async () => {
  const result = await recommendations({ query: async () => [[]] }, { recommend() { throw new Error('must not call'); } }, { issue_description: 'Fault' });
  assert.equal(result.fallback, 'manual');
  assert.deepEqual(result.matches, []);
});
test('stale, corrupt and wrong-dimension stored vectors are excluded', async () => {
  const issue = 'Power fault'; const summary = 'Verified repair';
  const db = { query: async () => [[
    { id: 1, issue_description: issue, resolution_summary: summary, model_version: EMBEDDING_VERSION, vector_json: 'invalid JSON', text_fingerprint: fingerprint(issue, summary) },
    { id: 2, issue_description: issue, resolution_summary: summary, model_version: EMBEDDING_VERSION, vector_json: '[1]', text_fingerprint: fingerprint(issue, summary) },
    { id: 3, issue_description: issue, resolution_summary: summary, model_version: EMBEDDING_VERSION, vector_json: JSON.stringify([1, ...Array(383).fill(0)]), text_fingerprint: 'stale' },
  ]] };
  const result = await recommendations(db, { recommend() { throw new Error('must not call'); } }, { issue_description: issue });
  assert.equal(result.eligible_count, 0);
});
test('maintenance is committed before failed AI call, then manual review is persisted', async () => {
  const events = [];
  const record = { id: 9, issue_description: 'A computer cannot boot properly' };
  const connection = {
    async query(sql, values) {
      events.push(sql);
      if (sql.includes('FROM audit_chain_state')) return [[{ sequence: 0, last_hash: '0'.repeat(64) }]];
      if (sql.startsWith('SELECT * FROM assets')) return [[{ id: 4, asset_status: 'Available' }]];
      if (sql.startsWith('SELECT * FROM maintenance')) return [[record]];
      return [{ insertId: 9, affectedRows: 1 }];
    },
    async beginTransaction() { events.push('begin'); }, async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); }, release() { events.push('release'); },
  };
  const db = { getConnection: async () => connection };
  const ai = { async triage() { assert.ok(events.includes('commit')); events.push('ai'); throw new Error('worker offline'); } };
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await maintenance(db, ai).addMaintenance({ user: { id: 7, role_name: 'Admin' }, body: { asset_id: 4, issue_description: record.issue_description, priority: 'High' } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.manual_triage_required, true);
  assert.ok(events.some(event => event.includes("manual_triage_flag=TRUE")));
  assert.ok(events.indexOf('commit') < events.indexOf('ai'));
});

