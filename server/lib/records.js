const { append } = require('./auditChain');
const { HttpError } = require('./errors');
async function transaction(db, operation) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [states] = await connection.query('SELECT sequence,last_hash FROM audit_chain_state WHERE id=1 FOR UPDATE');
    if (!states[0]) throw new Error('Audit chain is not initialized');
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch { /* Preserve the original failure; release still runs. */ }
    throw error;
  } finally { connection.release(); }
}
async function audit(connection, userId, action, entity, entityId) {
  await append(connection, userId, JSON.stringify({ version: 1, action, entity, entity_id: entityId }));
}
async function requireRow(db, table, id, lock = false) {
  // Table names come only from controller constants, never from request input.
  if (!['labs', 'assets', 'maintenance', 'categories'].includes(table)) throw new Error('Invalid table');
  const [rows] = await db.query('SELECT * FROM ' + table + ' WHERE id = ?' + (lock ? ' FOR UPDATE' : ''), [id]);
  if (!rows[0]) throw new HttpError(404, table + ' record not found');
  return rows[0];
}
function parseExtra(row) {
  if (typeof row.extra_details === 'string') {
    const value = JSON.parse(row.extra_details);
    if (!Array.isArray(value)) throw new Error('Invalid stored extra_details');
    return { ...row, extra_details: value };
  }
  return { ...row, extra_details: row.extra_details || [] };
}
module.exports = { transaction, audit, requireRow, parseExtra };

