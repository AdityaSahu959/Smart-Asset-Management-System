const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createApp } = require('../app');
const { transaction } = require('../lib/records');
const v = require('../lib/validation');
const secret = randomBytes(48).toString('hex');
const user = { id: 7, full_name: 'Test User', email: 'test@example.org', role_id: 3, role_name: 'Viewer', is_active: 1 };
function token(options = {}, payload = { id: 7 }) {
  return jwt.sign({ token_version: 0, ...payload }, secret, { algorithm: 'HS256', issuer: 'smart-assets', audience: 'smart-assets-client', ...options });
}
async function request(db, path, { method = 'GET', body, authorization, origin, raw } = {}) {
  const server = createApp({ db, secret }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const headers = {};
    if (authorization) headers.Authorization = authorization;
    if (origin) headers.Origin = origin;
    if (body !== undefined || raw !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch('http://127.0.0.1:' + server.address().port + path,
      { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const forbiddenDb = { query() { throw new Error('Database must not be touched'); } };
test('startup fails closed for missing or weak JWT secrets', () => {
  for (const value of [undefined, '', 'short']) assert.throws(() => createApp({ db: forbiddenDb, secret: value }));
});
for (const path of ['/api/labs', '/api/assets/1', '/api/maintenance', '/api/maintenance/1', '/api/auth/me']) {
  test('unauthenticated request rejected: ' + path, async () => {
    const result = await request(forbiddenDb, path);
    assert.equal(result.status, 401);
  });
}
for (const authorization of ['Basic abc', 'Bearer', 'Bearer a b', 'Bearer invalid', 'Bearer ' + token({ expiresIn: -1 })]) {
  test('malformed/expired authorization rejected: ' + authorization.slice(0, 18), async () => {
    assert.equal((await request(forbiddenDb, '/api/labs', { authorization })).status, 401);
  });
}
test('wrong token issuer rejected without database access', async () => {
  const authorization = 'Bearer ' + token({ issuer: 'other' });
  assert.equal((await request(forbiddenDb, '/api/labs', { authorization })).status, 401);
});
test('invalid principal ID rejected', async () => {
  assert.equal((await request(forbiddenDb, '/api/labs', { authorization: 'Bearer ' + token({}, { id: '7' }) })).status, 401);
});
test('inactive account rejected on protected requests', async () => {
  const db = { query: async () => [[{ ...user, is_active: 0 }]] };
  assert.equal((await request(db, '/api/labs', { authorization: 'Bearer ' + token() })).status, 401);
});
for (const [method, path] of [['POST', '/api/labs'], ['PUT', '/api/assets/1'], ['DELETE', '/api/labs/1'], ['POST', '/api/maintenance/add']]) {
  test('Viewer cannot mutate: ' + method + ' ' + path, async () => {
    let calls = 0;
    const db = { query: async () => { calls++; return [[user]]; } };
    const result = await request(db, path, { method, body: {}, authorization: 'Bearer ' + token() });
    assert.equal(result.status, 403);
    assert.equal(calls, 1);
  });
}
test('current database role overrides stale token role claim', async () => {
  const db = { query: async () => [[user]] };
  const result = await request(db, '/api/labs', { method: 'POST', body: {}, authorization: 'Bearer ' + token({}, { id: 7, role_id: 1 }) });
  assert.equal(result.status, 403);
});
test('registration ignores supplied privileged role and hashes password', async () => {
  const password = 'A sufficiently long password';
  const calls = [];
  const connection = { query: async (sql, values) => { if (sql.includes('FROM audit_chain_state')) return [[{ sequence: 0, last_hash: '0'.repeat(64) }]]; calls.push([sql, values]); return sql.startsWith('SELECT') ? [[{ id: 3 }]] : [{ insertId: 12 }]; }, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  const db = { query: connection.query, getConnection: async () => connection };
  const result = await request(db, '/api/auth/register', { method: 'POST', body: { full_name: 'Test', email: 'TEST@example.org', password, confirm_password: password, role_id: 1 } });
  assert.equal(result.status, 201);
  assert.deepEqual(calls[0][1], ['Viewer']);
  assert.equal(calls[1][1][5], 3);
  assert.equal(calls[1][1][1], 'test@example.org');
  assert.notEqual(calls[1][1][2], password);
  assert.equal(await bcrypt.compare(password, calls[1][1][2]), true);
});
test('registration rejects invalid data before database access', async () => {
  const result = await request(forbiddenDb, '/api/auth/register', { method: 'POST', body: { full_name: 'Test', email: 'test@example.org', password: 'short', confirm_password: 'short' } });
  assert.equal(result.status, 400);
});
test('login returns allowlisted profile without password hash', async () => {
  const password = 'A sufficiently long password';
  const hash = await bcrypt.hash(password, 4);
  const db = { query: async () => [[{ ...user, password: hash, mobile: 'private' }]] };
  const result = await request(db, '/api/auth/login', { method: 'POST', body: { email: user.email, password } });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.password, undefined);
  assert.equal(result.body.user.mobile, undefined);
  assert.equal(jwt.verify(result.body.token, secret, { issuer: 'smart-assets', audience: 'smart-assets-client' }).id, 7);
});
test('inactive account cannot log in with valid password', async () => {
  const password = 'A sufficiently long password';
  const db = { query: async () => [[{ ...user, is_active: 0, password: await bcrypt.hash(password, 4) }]] };
  const result = await request(db, '/api/auth/login', { method: 'POST', body: { email: user.email, password } });
  assert.equal(result.status, 401);
});
test('legacy DOB/mobile password-reset cannot write', async () => {
  const result = await request(forbiddenDb, '/api/auth/forgot-password', { method: 'POST', body: { email: user.email, mobile: '1234567890', dob: '2000-01-01', new_password: 'stolen' } });
  assert.equal(result.status, 503);
});
test('database details redacted and unique conflicts mapped', async () => {
  for (const [code, expected] of [['ER_DUP_ENTRY', 409], ['ER_NO_REFERENCED_ROW_2', 400], ['ECONNREFUSED', 503], ['UNKNOWN', 500]]) {
    const db = { query: async () => { throw Object.assign(new Error('secret connection and SQL text'), { code }); } };
    const result = await request(db, '/api/auth/login', { method: 'POST', body: { email: user.email, password: 'some password' } });
    assert.equal(result.status, expected);
    assert.equal(JSON.stringify(result.body).includes('secret'), false);
  }
});
test('invalid JSON is rejected safely', async () => {
  assert.equal((await request(forbiddenDb, '/api/auth/login', { method: 'POST', raw: '{' })).status, 400);
});
test('CORS allows configured origin and excludes arbitrary origin', async () => {
  const allowed = await request(forbiddenDb, '/', { origin: 'http://localhost:5173' });
  const denied = await request(forbiddenDb, '/', { origin: 'https://untrusted.example' });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
test('transaction rolls back and releases connection on operation failure', async () => {
  const events = [];
  const db = { getConnection: async () => ({
    query: async () => [[{ sequence: 0, last_hash: '0'.repeat(64) }]], beginTransaction: async () => events.push('begin'), commit: async () => events.push('commit'),
    rollback: async () => events.push('rollback'), release: () => events.push('release'),
  }) };
  await assert.rejects(transaction(db, async () => { throw new Error('audit insert failed'); }));
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
});
test('transaction commits and releases on success', async () => {
  const events = [];
  const db = { getConnection: async () => ({
    query: async () => [[{ sequence: 0, last_hash: '0'.repeat(64) }]],
    beginTransaction: async () => events.push('begin'), commit: async () => events.push('commit'),
    rollback: async () => events.push('rollback'), release: () => events.push('release'),
  }) };
  assert.equal(await transaction(db, async () => 42), 42);
  assert.deepEqual(events, ['begin', 'commit', 'release']);
});
test('validation rejects invalid IDs, dates, oversized password bytes and malformed fields', () => {
  for (const value of ['0', '-1', '1 OR 1=1', '1.5', '2147483648']) assert.throws(() => v.id(value));
  for (const value of ['2026-02-30', '2026-13-01', 'not-date']) assert.throws(() => v.date(value, 'date'));
  assert.throws(() => v.password('😀'.repeat(20)));
  assert.throws(() => v.extra([{ label: '', value: 'bad' }]));
  assert.equal(v.date('2024-02-29', 'date'), '2024-02-29');
});

