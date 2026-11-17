// Applies one reviewed migration to the new isolated local instance only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(name + ' is required');
  return process.argv[index + 1];
}
async function run() {
  const file = path.resolve(argument('--file'));
  const expected = argument('--sha256').toLowerCase();
  const source = fs.readFileSync(file, 'utf8');
  const checksum = crypto.createHash('sha256').update(source).digest('hex');
  if (checksum !== expected) throw new Error('Migration checksum mismatch');
  const sql = source.replace(/^\s*--[^\r\n]*/gm, '');
  const statements = sql.split(';').map(value => value.trim()).filter(Boolean);
  if (statements[0] !== 'USE asset_management_system') throw new Error('Unexpected target');
  if (statements.some(statement => /^(DROP|TRUNCATE|DELETE|REPLACE|GRANT|REVOKE)\b/i.test(statement)) || /\b(taskflow_db|testdb)\b/i.test(sql)) throw new Error('Unsafe migration statement');
  if (process.argv.includes('--review')) {
    console.log(JSON.stringify({ file: path.basename(file), checksum, statements: statements.length, target: 'asset_management_system', sqlExecuted: false }));
    return;
  }
  if (!process.argv.includes('--approved')) throw new Error('Explicit approval is required');
  const data = path.resolve(argument('--data'));
  const runtime = path.resolve(argument('--runtime'));
  const credentials = JSON.parse(fs.readFileSync(path.join(data, 'local-credentials.json'), 'utf8'));
  const connection = await mysql.createConnection({ host: '127.0.0.1', port: credentials.port, user: 'root', password: credentials.rootPassword, database: 'asset_management_system', multipleStatements: false });
  try {
    const [[identity]] = await connection.query('SELECT @@datadir AS data_directory, @@port AS port');
    if (path.resolve(identity.data_directory).toLowerCase().replace(/[\\/]+$/, '') !== data.toLowerCase().replace(/[\\/]+$/, '') || Number(identity.port) !== 3308) throw new Error('Wrong database instance');
    const [[ledger]] = await connection.query("SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema='asset_management_system' AND table_name='schema_migrations'");
    const version = path.basename(file);
    if (ledger.count) {
      const [applied] = await connection.query('SELECT checksum FROM schema_migrations WHERE version=?', [version]);
      if (applied.length) {
        if (applied[0].checksum !== checksum) throw new Error('Applied migration checksum differs');
        console.log('Migration already applied with matching checksum; nothing executed.');
        return;
      }
    }
    fs.mkdirSync(path.join(data, 'backups'), { recursive: true });
    const dump = path.join(data, 'backups', Date.now() + '_before_' + version);
    const client = path.join(data, 'dump-client.cnf');
    fs.writeFileSync(client, '[client]\nhost=127.0.0.1\nport=3308\nuser=root\npassword=' + credentials.rootPassword + '\n', { flag: 'wx', mode: 0o600 });
    try {
      const result = spawnSync(path.join(runtime, 'bin', 'mariadb-dump.exe'),
        ['--defaults-extra-file=' + client, '--single-transaction', '--routines', '--triggers', '--databases', 'asset_management_system', '--result-file=' + dump],
        { windowsHide: true, encoding: 'utf8' });
      if (result.status !== 0 || !fs.existsSync(dump) || fs.statSync(dump).size < 1000) throw new Error('Logical backup failed; migration not applied');
      const backup = fs.readFileSync(dump, 'utf8');
      if (!backup.includes('CREATE TABLE') || !backup.includes('asset_management_system')) throw new Error('Logical backup validation failed');
    } finally { fs.unlinkSync(client); }
    for (const statement of statements) await connection.query(statement);
    if (version === '002_audit_chain.sql') await require('../lib/auditChain').backfill(connection);
    await connection.query('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)', [version, checksum]);
    console.log('Migration applied and recorded. A private logical backup was checked before execution; restore has not been tested.');
  } finally { await connection.end(); }
}
run().catch(error => { console.error(error.sql ? 'Migration failed (' + (error.code || 'SQL_ERROR') + '); preserve partial state for inspection.' : error.message); process.exitCode = 1; });

