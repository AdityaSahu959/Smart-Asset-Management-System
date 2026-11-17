const fs = require('node:fs');
const path = require('node:path');
const mysql = require('../server/node_modules/mysql2/promise');
async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'local.config.json'), 'utf8'));
  const credentials = JSON.parse(fs.readFileSync(path.join(config.dataDir, 'local-credentials.json'), 'utf8'));
  let db;
  try { db = await mysql.createConnection({ host: '127.0.0.1', port: 3308, user: 'root', password: credentials.rootPassword, database: 'asset_management_system', connectTimeout: 1500 }); }
  catch (error) { if (error.code === 'ECONNREFUSED') return; throw error; }
  try {
    const [[identity]] = await db.query('SELECT @@datadir AS directory, @@port AS port');
    if (path.resolve(identity.directory).toLowerCase().replace(/[\\/]+$/, '') !== path.resolve(config.dataDir).toLowerCase().replace(/[\\/]+$/, '') || Number(identity.port) !== 3308) throw new Error('Wrong database instance');
    await db.query('SHUTDOWN');
  } finally { try { await db.end(); } catch { /* Server closed the connection during shutdown. */ } }
}
main().catch(() => { console.error('Database shutdown failed or instance identity differed. No data was deleted.'); process.exitCode = 1; });
