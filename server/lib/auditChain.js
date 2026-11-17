const crypto = require('node:crypto');
const GENESIS = '0'.repeat(64);
function payload(userId, activity, sequence, epoch) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Invalid audit sequence');
  if (userId !== null && (!Number.isSafeInteger(userId) || userId < 1)) throw new Error('Invalid audit actor');
  if (typeof activity !== 'string') throw new Error('Invalid audit activity');
  if (epoch !== null && (!Number.isFinite(Number(epoch)) || Number(epoch) < 0)) throw new Error('Invalid audit timestamp');
  // Version 1 uses this exact key order, JSON encoding and UTC timestamp representation.
  return JSON.stringify({ version: 1, sequence, user_id: userId, activity, created_at: epoch === null ? null : new Date(Number(epoch) * 1000).toISOString() });
}
function hash(previous, canonical) {
  if (!/^[a-f0-9]{64}$/.test(previous)) throw new Error('Invalid previous hash');
  return crypto.createHash('sha256').update(previous + '\n' + canonical, 'utf8').digest('hex');
}
async function append(connection, userId, activity) {
  const [rows] = await connection.query('SELECT sequence,last_hash FROM audit_chain_state WHERE id=1 FOR UPDATE');
  if (!rows[0]) throw new Error('Audit chain is not initialized');
  const sequence = Number(rows[0].sequence) + 1;
  const epoch = Math.floor(Date.now() / 1000);
  const canonical = payload(userId, activity, sequence, epoch);
  const current = hash(rows[0].last_hash, canonical);
  await connection.query('INSERT INTO activity_logs (user_id,activity,created_at,event_sequence,prev_hash,current_hash,canonical_payload) VALUES (?, ?, FROM_UNIXTIME(?), ?, ?, ?, ?)',
    [userId, activity, epoch, sequence, rows[0].last_hash, current, canonical]);
  await connection.query('UPDATE audit_chain_state SET sequence=?,last_hash=? WHERE id=1', [sequence, current]);
  return { sequence, hash: current };
}
function verify(rows, state, checkpoint) {
  let previous = GENESIS;
  const problems = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const sequence = index + 1;
    try {
      if (Number(row.event_sequence) !== sequence) throw new Error('Sequence gap or reordering');
      const canonical = payload(row.user_id, row.activity, sequence, row.event_epoch);
      if (row.canonical_payload !== canonical) throw new Error('Protected event fields differ');
      if (row.prev_hash !== previous) throw new Error('Previous hash differs');
      if (row.current_hash !== hash(previous, canonical)) throw new Error('Event hash differs');
      previous = row.current_hash;
      if (checkpoint && Number(checkpoint.sequence) === sequence && checkpoint.hash !== previous) throw new Error('Trusted checkpoint differs');
    } catch (error) { problems.push({ sequence, reason: error.message }); break; }
  }
  if (!state || Number(state.sequence) !== rows.length || state.last_hash !== previous) problems.push({ reason: 'Stored chain head differs from event history' });
  if (checkpoint && Number(checkpoint.sequence) > rows.length) problems.push({ reason: 'History is shorter than trusted checkpoint' });
  return { valid: problems.length === 0, checked: rows.length, sequence: rows.length, hash: previous, problems };
}
async function backfill(connection) {
  await connection.beginTransaction();
  try {
    const [states] = await connection.query('SELECT sequence,last_hash FROM audit_chain_state WHERE id=1 FOR UPDATE');
    if (!states[0] || Number(states[0].sequence) !== 0) throw new Error('Audit backfill requires a fresh chain state');
    const [rows] = await connection.query('SELECT id,user_id,activity,event_sequence,UNIX_TIMESTAMP(created_at) AS event_epoch FROM activity_logs ORDER BY id FOR UPDATE');
    let previous = GENESIS;
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      if (row.event_sequence !== null) throw new Error('Refusing to overwrite protected audit metadata');
      const sequence = index + 1;
      const canonical = payload(row.user_id, row.activity, sequence, row.event_epoch);
      const current = hash(previous, canonical);
      await connection.query('UPDATE activity_logs SET event_sequence=?,prev_hash=?,current_hash=?,canonical_payload=? WHERE id=?', [sequence, previous, current, canonical, row.id]);
      previous = current;
    }
    await connection.query('UPDATE audit_chain_state SET sequence=?,last_hash=? WHERE id=1', [rows.length, previous]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
}
module.exports = { GENESIS, payload, hash, append, verify, backfill };

