const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
const db = require('../config/db');
const { transaction, audit } = require('../lib/records');
const { verify } = require('../lib/auditChain');
async function snapshot(connection) {
  const [rows] = await connection.query('SELECT user_id,activity,event_sequence,prev_hash,current_hash,canonical_payload,UNIX_TIMESTAMP(created_at) AS event_epoch FROM activity_logs ORDER BY event_sequence');
  const [states] = await connection.query('SELECT sequence,last_hash FROM audit_chain_state WHERE id=1');
  return verify(rows, states[0]);
}
async function run() {
  if (!process.argv.includes('--approved-local-fixtures')) throw new Error('Explicit approval is required');
  const index = process.argv.indexOf('--data');
  const data = path.resolve(process.argv[index + 1]);
  const [[identity]] = await db.query('SELECT @@port AS port, @@datadir AS data_directory');
  assert.equal(Number(identity.port), 3308);
  assert.equal(path.resolve(identity.data_directory).toLowerCase().replace(/[\\/]+$/, ''), data.toLowerCase().replace(/[\\/]+$/, ''));
  const [admins] = await db.query("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.role_name='Super Admin' AND u.is_active=TRUE ORDER BY u.id LIMIT 1");
  const actor = admins[0].id;
  const before = await snapshot(db);
  assert.equal(before.valid, true);
  const stamp = Date.now().toString(36);
  await Promise.all(Array.from({ length: 10 }, (_, index) => transaction(db, async connection => {
    const [created] = await connection.query('INSERT INTO labs (lab_name,lab_code,created_by) VALUES (?, ?, ?)', ['Synthetic audit concurrency fixture', 'AUDIT-' + stamp + '-' + index, actor]);
    await audit(connection, actor, 'synthetic_concurrency_fixture', 'lab', created.insertId);
  })));
  const after = await snapshot(db);
  assert.equal(after.valid, true);
  assert.equal(after.sequence, before.sequence + 10);
  const rollbackCode = 'ROLLBACK-' + stamp;
  await assert.rejects(transaction(db, async connection => {
    await connection.query('INSERT INTO labs (lab_name,lab_code,created_by) VALUES (?, ?, ?)', ['Synthetic rollback fixture', rollbackCode, actor]);
    await audit(connection, actor, 'must_rollback', 'lab', 0);
    throw new Error('Injected failure after audit insertion');
  }));
  const [rolledBack] = await db.query('SELECT id FROM labs WHERE lab_code=?', [rollbackCode]);
  assert.equal(rolledBack.length, 0);
  const noChange = await snapshot(db);
  assert.equal(noChange.hash, after.hash);
  assert.equal(noChange.sequence, after.sequence);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT sequence FROM audit_chain_state WHERE id=1 FOR UPDATE');
    await connection.query("UPDATE activity_logs SET activity=CONCAT(activity, ' injected rollback-only mutation') WHERE event_sequence=1");
    assert.equal((await snapshot(connection)).valid, false);
  } finally { await connection.rollback(); connection.release(); }
  const final = await snapshot(db);
  assert.equal(final.valid, true);
  assert.equal(final.hash, after.hash);
  fs.writeFileSync(path.join(data, 'audit-checkpoint.json'), JSON.stringify({ sequence: final.sequence, hash: final.hash, recorded_at: new Date().toISOString() }, null, 2));
  const result = { passed: true, backfilledEvents: before.sequence, concurrentAppends: 10, rollbackAtomicity: true, tamperDetectedAndRolledBack: true, finalSequence: final.sequence, finalHash: final.hash };
  fs.writeFileSync(path.join(data, 'audit-integration.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
run().catch(error => { console.error(error.sql ? 'Audit integration failed; SQL details suppressed' : error.message); process.exitCode = 1; }).finally(() => db.end());

