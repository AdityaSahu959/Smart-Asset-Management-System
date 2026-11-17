// Opt-in tests on the approved isolated instance; positive retrieval fixtures are rolled back.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
const db = require('../config/db');
const { createApp } = require('../app');
const { AIClient, CircuitBreaker, TRIAGE_VERSION } = require('../lib/aiClient');
const { indexResolution, recommendations } = require('../lib/aiMaintenance');
const { verify } = require('../lib/auditChain');
async function chain(connection) {
  const [rows] = await connection.query('SELECT user_id,activity,event_sequence,prev_hash,current_hash,canonical_payload,UNIX_TIMESTAMP(created_at) AS event_epoch FROM activity_logs ORDER BY event_sequence');
  const [states] = await connection.query('SELECT sequence,last_hash FROM audit_chain_state WHERE id=1');
  return verify(rows, states[0]);
}
async function run() {
  if (!process.argv.includes('--approved-local-fixtures')) throw new Error('Explicit approval required');
  const dataIndex = process.argv.indexOf('--data');
  if (dataIndex < 0) throw new Error('--data is required');
  const data = path.resolve(process.argv[dataIndex + 1]);
  const credentials = JSON.parse(fs.readFileSync(path.join(data, 'local-credentials.json'), 'utf8'));
  const [[identity]] = await db.query('SELECT @@port AS port,@@datadir AS data_directory');
  assert.equal(Number(identity.port), 3308);
  assert.equal(path.resolve(identity.data_directory).toLowerCase().replace(/[\\/]+$/, ''), data.toLowerCase().replace(/[\\/]+$/, ''));
  let offline = true, now = 0, workerCalls = 0;
  const breaker = new CircuitBreaker({ threshold: 3, resetMs: 100, now: () => now });
  const ai = new AIClient({ breaker, fetchImpl: async (...args) => { workerCalls++; if (offline) throw new Error('Simulated worker outage'); return fetch(...args); } });
  const server = createApp({ db, aiClient: ai }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(method, route, body, token, expected = 200) {
    const response = await fetch(base + route, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    assert.equal(response.status, expected, method + ' ' + route + ': ' + (result.message || 'unexpected response'));
    return result;
  }
  const checks = [];
  try {
    const admin = await request('POST', '/api/auth/login', { email: credentials.adminEmail, password: credentials.adminPassword });
    const stamp = Date.now().toString(36);
    const lab = await request('POST', '/api/labs', { lab_name: 'Synthetic AI QA lab', lab_code: 'AI-' + stamp }, admin.token, 201);
    const category = await request('POST', '/api/categories', { category_name: 'Synthetic AI QA Computers ' + stamp }, admin.token, 201);
    const asset = await request('POST', '/api/assets', { lab_id: lab.id, category_id: category.id, asset_name: 'Synthetic AI QA network computer', asset_code: 'AI-PC-' + stamp, purchase_date: '2025-01-01', warranty_expiry: '2027-01-01', assigned_to: 'Synthetic test custodian' }, admin.token, 201);
    const loaded = await request('GET', '/api/assets/details/' + asset.id, null, admin.token);
    assert.equal(loaded.category_id, category.id);
    assert.equal(loaded.warranty_expiry, '2027-01-01');
    const tickets = [];
    for (let index = 0; index < 4; index++) tickets.push(await request('POST', '/api/maintenance/add', { asset_id: asset.id, issue_description: 'Synthetic fixture: Ethernet is connected but DHCP cannot assign an IP address', source_type: 'synthetic', priority: 'Low' }, admin.token, 201));
    assert.ok(tickets.every(ticket => ticket.manual_triage_required));
    assert.equal(workerCalls, 3);
    assert.equal(breaker.status().state, 'Open');
    const [stored] = await db.query('SELECT ai_status,manual_triage_flag FROM maintenance WHERE id IN (?, ?, ?, ?)', tickets.map(ticket => ticket.id));
    assert.ok(stored.every(record => record.ai_status === 'failed' && record.manual_triage_flag));
    checks.push('Outage preserves four tickets and persists manual review; breaker stops repeated calls');
    offline = false; now = 101;
    const triaged = await request('POST', '/api/maintenance/' + tickets[0].id + '/triage', {}, admin.token);
    assert.ok(triaged.result);
    assert.equal(triaged.result.model_version, TRIAGE_VERSION);
    assert.equal(breaker.status().state, 'Closed');
    const [[triageRow]] = await db.query('SELECT ai_status,priority,ai_taxonomy_version FROM maintenance WHERE id=?', [tickets[0].id]);
    assert.equal(triageRow.ai_status, 'completed');
    assert.equal(triageRow.priority, 'Low');
    assert.equal(triageRow.ai_taxonomy_version, 'it-faults-v2');
    checks.push('Half-open probe recovers against the real model; AI does not overwrite recorded priority');
    const connection = await db.getConnection();
    const realAI = new AIClient();
    let rollbackTicket;
    const before = await chain(db);
    try {
      await connection.beginTransaction();
      await connection.query('SELECT sequence FROM audit_chain_state WHERE id=1 FOR UPDATE');
      const issue = 'Ethernet is connected but DHCP cannot assign an IP address';
      const resolution = 'Synthetic rollback-only fixture: corrected DHCP settings and verified gateway connectivity.';
      const [created] = await connection.query("INSERT INTO maintenance (asset_id,issue_description,maintenance_status,reporter_id,priority,source_type,resolution_summary,verified_by,verified_at,closed_at,resolution_index_status) VALUES (?, ?, 'Closed', ?, 'Medium', 'real', ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 'pending')", [asset.id, issue, admin.user.id, resolution, admin.user.id]);
      rollbackTicket = created.insertId;
      const [[record]] = await connection.query('SELECT * FROM maintenance WHERE id=?', [rollbackTicket]);
      // Nested helper commits are suppressed inside this explicit outer rollback-only fixture.
      const nested = { query: connection.query.bind(connection), beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
      const isolated = { query: nested.query, getConnection: async () => nested };
      assert.equal((await indexResolution(isolated, realAI, record, admin.user.id)).status, 'indexed');
      assert.equal((await indexResolution(isolated, realAI, record, admin.user.id)).reused, true);
      const result = await recommendations(isolated, realAI, { issue_description: issue });
      assert.equal(result.matches[0].ticket_id, rollbackTicket);
      assert.ok(result.matches[0].similarity > 0.99);
      assert.equal(result.matches[0].verified, true);
    } finally { await connection.rollback(); connection.release(); }
    const [absent] = await db.query('SELECT id FROM maintenance WHERE id=?', [rollbackTicket]);
    assert.equal(absent.length, 0);
    const after = await chain(db);
    assert.equal(after.valid, true); assert.equal(after.hash, before.hash);
    checks.push('Real embedding persisted and reused idempotently; real semantic retrieval matched; test data and audit writes rolled back');
    const empty = await recommendations(db, realAI, { issue_description: 'Ethernet cannot obtain an IP address' });
    assert.equal(empty.matches.length, 0); assert.equal(empty.fallback, 'manual');
    checks.push('Committed synthetic history excluded from retrieval; no-history manual fallback verified');
    const metrics = await request('GET', '/api/reliability/' + asset.id, null, admin.token);
    assert.equal(metrics.verified_failure_count, 0);
    assert.equal(metrics.mtbf_calendar_days_per_failure, null);
    assert.ok(metrics.ari !== null);
    checks.push('Reliability endpoint returns transparent age-based score without counting synthetic incidents');
    const result = { passed: true, checks, syntheticFixtures: { lab: lab.id, asset: asset.id, ticketIds: tickets.map(ticket => ticket.id) }, model: TRIAGE_VERSION, positiveRetrievalFixtureCommitted: false };
    fs.writeFileSync(path.join(data, 'ai-integration.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error.sql ? 'AI integration failed; SQL details suppressed' : error.message); process.exitCode = 1; }).finally(() => db.end());

