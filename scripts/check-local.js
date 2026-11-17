const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'server', '.env.local'), quiet: true });
const mysql = require('../server/node_modules/mysql2/promise');
async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'local.config.json'), 'utf8'));
  if (process.env.DB_NAME !== 'asset_management_system') throw new Error('Unexpected database name');
  const db = await mysql.createConnection({ host: '127.0.0.1', port: 3308, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: 'asset_management_system', connectTimeout: 1500 });
  try {
    const [[identity]] = await db.query('SELECT @@datadir AS directory, @@port AS port, VERSION() AS version');
    if (path.resolve(identity.directory).toLowerCase().replace(/[\\/]+$/, '') !== path.resolve(config.dataDir).toLowerCase().replace(/[\\/]+$/, '') || Number(identity.port) !== 3308) throw new Error('Wrong database instance');
    const [migrations] = await db.query('SELECT version,checksum FROM schema_migrations ORDER BY version');
    for (const name of ['001_identity_and_maintenance.sql','002_audit_chain.sql','003_ai_metadata_and_embeddings.sql']) {
      const source = fs.readFileSync(path.join(__dirname, '..', 'server', 'migrations', name));
      const checksum = crypto.createHash('sha256').update(source).digest('hex');
      if (!migrations.some(row => row.version === name && row.checksum === checksum)) throw new Error('Reviewed migrations must be applied before starting');
    }
    console.log(JSON.stringify({ verified: true, version: identity.version, migrations: migrations.map(row => row.version) }));
  } finally { await db.end(); }
}
main().catch(() => { console.error('Local database is not ready or its identity/schema does not match. No setup SQL was executed.'); process.exitCode = 1; });
