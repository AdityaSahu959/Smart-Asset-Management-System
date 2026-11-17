// Opt-in integration test against the approved isolated local instance.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
const { createApp } = require('../app');
const { AIClient } = require('../lib/aiClient');
const db = require('../config/db');
async function run() {
  if (!process.argv.includes('--approved-local-fixtures')) throw new Error('Local synthetic fixtures require approval');
  const index = process.argv.indexOf('--data');
  if (index < 0) throw new Error('--data is required');
  const data = path.resolve(process.argv[index + 1]);
  const credentials = JSON.parse(fs.readFileSync(path.join(data, 'local-credentials.json'), 'utf8'));
  const [[identity]] = await db.query('SELECT @@port AS port, @@datadir AS data_directory');
  assert.equal(Number(identity.port), 3308);
  assert.equal(path.resolve(identity.data_directory).toLowerCase().replace(/[\\/]+$/, ''), data.toLowerCase().replace(/[\\/]+$/, ''));
  const messages = [];
  const checks = [];
  const server = createApp({ db, aiClient: new AIClient({ key: '' }), mailer: { configured: () => true, sendPasswordReset: async message => messages.push(message) } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(method, route, body, token, expected = 200) {
    const response = await fetch(base + route, {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    assert.equal(response.status, expected, method + ' ' + route + ': ' + (result.message || 'unexpected status'));
    return result;
  }
  try {
    const admin = await request('POST', '/api/auth/login', { email: credentials.adminEmail, password: credentials.adminPassword });
    assert.equal(admin.user.password, undefined);
    checks.push('Live admin login and password-hash redaction');
    const stamp = Date.now().toString(36);
    const password = crypto.randomBytes(24).toString('base64url');
    const techEmail = 'synthetic-tech-' + stamp + '@example.invalid';
    const viewerEmail = 'synthetic-viewer-' + stamp + '@example.invalid';
    await request('POST', '/api/auth/register', { full_name: 'Synthetic Technician ' + stamp, email: techEmail, password, confirm_password: password, role_id: 1 }, null, 201);
    const initialTech = await request('POST', '/api/auth/login', { email: techEmail, password });
    assert.equal(initialTech.user.role_name, 'Viewer');
    const roles = await request('GET', '/api/users/roles', null, admin.token);
    const technicianRole = roles.find(role => role.role_name === 'Technician');
    await request('PUT', '/api/users/' + initialTech.user.id, { role_id: technicianRole.id, is_active: true }, admin.token);
    await request('GET', '/api/auth/me', null, initialTech.token, 401);
    const tech = await request('POST', '/api/auth/login', { email: techEmail, password });
    checks.push('Registration cannot escalate privilege; role update revokes prior sessions');
    await request('POST', '/api/auth/register', { full_name: 'Synthetic Viewer ' + stamp, email: viewerEmail, password, confirm_password: password }, null, 201);
    const viewer = await request('POST', '/api/auth/login', { email: viewerEmail, password });
    await request('POST', '/api/labs', { lab_name: 'Forbidden' }, viewer.token, 403);
    await request('PUT', '/api/users/' + admin.user.id, { role_id: technicianRole.id, is_active: false }, admin.token, 409);
    checks.push('Viewer mutation rejected; last active Super Admin protected');
    const lab = await request('POST', '/api/labs', { lab_name: 'Synthetic QA लैब ' + stamp, lab_code: 'QA-' + stamp }, admin.token, 201);
    const asset = await request('POST', '/api/assets', { lab_id: lab.id, asset_name: 'Synthetic QA Computer', asset_code: 'QA-PC-' + stamp, purchase_date: '2024-01-01', asset_status: 'Available', asset_condition: 'Good' }, admin.token, 201);
    const loaded = await request('GET', '/api/labs/' + lab.id, null, viewer.token);
    assert.equal(loaded.lab_name, 'Synthetic QA लैब ' + stamp);
    const ticket = await request('POST', '/api/maintenance/add', { asset_id: asset.id, issue_description: 'Synthetic fixture: PC fails to start', source_type: 'synthetic', priority: 'High' }, admin.token, 201);
    assert.equal(ticket.manual_triage_required, true);
    await request('PUT', '/api/maintenance/' + ticket.id + '/status', { maintenance_status: 'Closed', resolution_summary: 'Invalid shortcut' }, admin.token, 409);
    await request('PUT', '/api/maintenance/' + ticket.id + '/assign', { technician_id: viewer.user.id }, admin.token, 400);
    await request('PUT', '/api/maintenance/' + ticket.id + '/assign', { technician_id: tech.user.id }, admin.token);
    await request('PUT', '/api/maintenance/' + ticket.id + '/status', { maintenance_status: 'In Progress' }, tech.token);
    await request('PUT', '/api/maintenance/' + ticket.id + '/status', { maintenance_status: 'Resolved' }, tech.token, 400);
    await request('PUT', '/api/maintenance/' + ticket.id + '/status', { maintenance_status: 'Resolved', resolution_summary: 'Synthetic fixture: replaced faulty test power supply; boot verified.' }, tech.token);
    await request('PUT', '/api/maintenance/' + ticket.id + '/status', { maintenance_status: 'Closed' }, tech.token, 403);
    await request('PUT', '/api/maintenance/' + ticket.id + '/status', { maintenance_status: 'Closed' }, admin.token);
    const history = await request('GET', '/api/maintenance/' + asset.id, null, viewer.token);
    assert.equal(history[0].reporter_id, admin.user.id);
    assert.equal(history[0].technician_id, tech.user.id);
    assert.equal(history[0].verified_by, admin.user.id);
    assert.equal(history[0].source_type, 'synthetic');
    checks.push('UTF-8 lab round trip and complete assigned maintenance lifecycle');
    await request('DELETE', '/api/assets/' + asset.id, null, admin.token, 409);
    await request('DELETE', '/api/maintenance/delete/' + ticket.id, null, admin.token, 409);
    await request('DELETE', '/api/labs/' + lab.id, null, admin.token, 409);
    await request('POST', '/api/assets/' + asset.id + '/retire', {}, admin.token);
    await request('POST', '/api/maintenance/add', { asset_id: asset.id, issue_description: 'Must not be created' }, admin.token, 409);
    checks.push('Repair history retained; retirement blocks new maintenance');
    await request('POST', '/api/auth/forgot-password', { email: techEmail }, null, 202);
    for (let attempt = 0; attempt < 20 && !messages.length; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(messages.length, 1);
    const resetToken = messages[0].token;
    const newPassword = crypto.randomBytes(24).toString('base64url');
    await request('POST', '/api/auth/reset-password', { token: resetToken, new_password: newPassword, confirm_password: newPassword });
    await request('POST', '/api/auth/reset-password', { token: resetToken, new_password: newPassword, confirm_password: newPassword }, null, 400);
    await request('GET', '/api/auth/me', null, tech.token, 401);
    await request('POST', '/api/auth/login', { email: techEmail, password: newPassword });
    const [[stored]] = await db.query('SELECT token_hash, consumed_at FROM password_reset_tokens WHERE user_id=? ORDER BY id DESC LIMIT 1', [tech.user.id]);
    assert.notEqual(stored.token_hash, resetToken); assert.ok(stored.consumed_at);
    checks.push('Single-use hashed recovery token works and revokes sessions (test mailer only)');
    const [activities] = await db.query('SELECT activity FROM activity_logs ORDER BY id');
    assert.ok(activities.some(row => JSON.parse(row.activity).action === 'password_reset'));
    checks.push('Real activity records persisted for business changes');
    const result = { passed: true, checks, fixtures: { lab: lab.id, asset: asset.id, ticket: ticket.id, technician: tech.user.id, viewer: viewer.user.id }, emailDelivery: 'test transport only; real SMTP not configured', timestamp: new Date().toISOString() };
    fs.writeFileSync(path.join(data, 'foundation-integration.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error('Foundation integration failed; sensitive details suppressed'); process.exitCode = 1; }).finally(() => db.end());

