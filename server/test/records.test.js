const { test } = require('node:test');
const assert = require('node:assert/strict');
const assets = require('../controllers/assetController');
const labs = require('../controllers/labController');
const maintenance = require('../controllers/maintenanceController');
function fixture(query) {
  const events = [];
  const connection = {
    query: async (sql, values) => { events.push([sql, values]); return sql.includes('FROM audit_chain_state') ? [[{ sequence: 0, last_hash: '0'.repeat(64) }]] : query(sql, values); },
    beginTransaction: async () => events.push('begin'), commit: async () => events.push('commit'),
    rollback: async () => events.push('rollback'), release: () => events.push('release'),
  };
  return { events, db: { getConnection: async () => connection, query: connection.query } };
}
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
test('asset deletion refuses maintenance history and rolls back', async () => {
  const { db, events } = fixture(async sql => sql.startsWith('SELECT *') ? [[{ id: 1 }]] : [[{ id: 9 }]]);
  await assert.rejects(assets(db).deleteAsset({ params: { id: '1' }, user: { id: 7 } }, response()), error => error.status === 409);
  assert.equal(events.some(event => Array.isArray(event) && event[0].startsWith('DELETE')), false);
  assert.deepEqual(events.slice(-2), ['rollback', 'release']);
});
test('lab with assets cannot be deleted', async () => {
  const { db, events } = fixture(async () => [[{ id: 1 }]]);
  await assert.rejects(labs(db).deleteLab({ params: { id: '1' }, user: { id: 7 } }, response()), error => error.status === 409);
  assert.equal(events.some(event => Array.isArray(event) && event[0].startsWith('DELETE')), false);
});
test('creating lab stores authenticated actor and activity in same transaction', async () => {
  const { db, events } = fixture(async sql => sql.startsWith('INSERT INTO labs') ? [{ insertId: 42 }] : [{ affectedRows: 1 }]);
  const res = response();
  await labs(db).createLab({ body: { lab_name: 'Lab A', created_by: 999 }, user: { id: 7 } }, res);
  const insert = events.find(event => Array.isArray(event) && event[0].startsWith('INSERT INTO labs'));
  const audit = events.find(event => Array.isArray(event) && event[0].startsWith('INSERT INTO activity_logs'));
  assert.equal(insert[1].at(-1), 7);
  assert.equal(audit[1][0], 7);
  assert.deepEqual(JSON.parse(audit[1][1]), { version: 1, action: 'create', entity: 'lab', entity_id: 42 });
  assert.deepEqual(events.slice(-2), ['commit', 'release']);
  assert.equal(res.statusCode, 201);
});
test('audit failure rolls back business operation', async () => {
  const { db, events } = fixture(async sql => {
    if (sql.startsWith('INSERT INTO activity_logs')) throw new Error('audit unavailable');
    return [{ insertId: 1 }];
  });
  await assert.rejects(labs(db).createLab({ body: { lab_name: 'Lab A' }, user: { id: 7 } }, response()));
  assert.equal(events.includes('commit'), false);
  assert.deepEqual(events.slice(-2), ['rollback', 'release']);
});
test('invalid lab name rejected before opening transaction', async () => {
  await assert.rejects(labs({ getConnection() { throw new Error('must not open'); } }).createLab({ body: { lab_name: ' ' }, user: { id: 7 } }, response()), error => error.status === 400);
});
test('missing record returns 404 rather than success', async () => {
  const { db } = fixture(async () => [[]]);
  await assert.rejects(assets(db).getSingleAsset({ params: { id: '9' } }, response()), error => error.status === 404);
});
test('asset creation validates lab exists before insert', async () => {
  const { db, events } = fixture(async () => [[]]);
  await assert.rejects(assets(db).createAsset({ body: { lab_id: 88, asset_name: 'PC' }, user: { id: 7 } }, response()), error => error.status === 404);
  assert.equal(events.some(event => Array.isArray(event) && event[0].startsWith('INSERT')), false);
});
test('maintenance creation cannot start in a closed state', async () => {
  await assert.rejects(maintenance({}).addMaintenance({ body: { asset_id: 1, issue_description: 'Fault', maintenance_status: 'Closed' } }, response()), error => error.status === 400);
});
test('maintenance history cannot be deleted', async () => {
  await assert.rejects(maintenance({}).deleteMaintenance(), error => error.status === 409);
});
