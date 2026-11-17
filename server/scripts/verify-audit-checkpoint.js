const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
const db = require('../config/db');
const { verify } = require('../lib/auditChain');
async function main() {
  if (process.env.DB_NAME !== 'asset_management_system') throw new Error('Unexpected database target');
  const index = process.argv.indexOf('--checkpoint');
  if (index < 0) throw new Error('--checkpoint is required');
  const checkpoint = JSON.parse(fs.readFileSync(process.argv[index + 1], 'utf8'));
  if (!Number.isSafeInteger(checkpoint.sequence) || checkpoint.sequence < 1 || !/^[a-f0-9]{64}$/.test(checkpoint.hash)) throw new Error('Invalid checkpoint');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT sequence FROM audit_chain_state WHERE id=1 FOR UPDATE');
    const [rows] = await connection.query('SELECT user_id,activity,event_sequence,prev_hash,current_hash,canonical_payload,UNIX_TIMESTAMP(created_at) AS event_epoch FROM activity_logs ORDER BY event_sequence');
    const [states] = await connection.query('SELECT sequence,last_hash FROM audit_chain_state WHERE id=1');
    const result = verify(rows, states[0], checkpoint);
    await connection.commit();
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } finally { connection.release(); }
}
main().catch(() => { console.error('Checkpoint verification failed; private details suppressed.'); process.exitCode = 1; }).finally(() => db.end());
