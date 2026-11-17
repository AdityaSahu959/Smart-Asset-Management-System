// Development-only isolated database provisioning. No SQL runs without --approved.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const SAFE_HASH = '09914898247d68281cdf05fda975dff6e7550c8f2a01fbb150a33309fb250595';
const port = 3308;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function setup() {
  if (!process.argv.includes('--approved')) throw new Error('Explicit approval is required');
  const runtimeIndex = process.argv.indexOf('--runtime');
  const dataIndex = process.argv.indexOf('--data');
  if (runtimeIndex < 0 || dataIndex < 0) throw new Error('--runtime and --data are required');
  const runtime = path.resolve(process.argv[runtimeIndex + 1]);
  const data = path.resolve(process.argv[dataIndex + 1]);
  const localEnv = path.resolve(__dirname, '..', '.env.local');
  const localConfig = path.resolve(__dirname, '..', '..', 'scripts', 'local.config.json');
  const safeFile = path.resolve(__dirname, '..', '..', 'SQL File (1).safe.sql');
  if (fs.existsSync(data) || fs.existsSync(localEnv) || fs.existsSync(localConfig)) throw new Error('Refusing to overwrite a data directory or local configuration');
  const source = fs.readFileSync(safeFile, 'utf8');
  if (crypto.createHash('sha256').update(source).digest('hex') !== SAFE_HASH) throw new Error('Safe SQL changed: review and approval must be repeated');
  const sql = source.replace(/^\s*--[^\r\n]*/gm, '');
  const statements = sql.split(';').map(value => value.trim()).filter(Boolean);
  if (statements.length !== 10 || statements.some(statement => !/^(CREATE DATABASE IF NOT EXISTS asset_management_system\s*$|USE asset_management_system\s*$|CREATE TABLE (roles|users|labs|categories|assets|maintenance|activity_logs)\s*\(|INSERT INTO roles\s*\(role_name\))/.test(statement))) {
    throw new Error('Unexpected bootstrap statement');
  }
  const binary = path.join(runtime, 'bin', 'mariadbd.exe');
  const installer = path.join(runtime, 'bin', 'mariadb-install-db.exe');
  if (!fs.existsSync(binary) || !fs.existsSync(installer)) throw new Error('MariaDB runtime missing');
  const net = require('node:net');
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error('Port 3308 is already in use')));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
  fs.mkdirSync(path.dirname(data), { recursive: true });
  const initialized = spawnSync(installer, ['--datadir=' + data, '--port=' + port, '--skip-networking'], { windowsHide: true, encoding: 'utf8' });
  if (initialized.status !== 0) throw new Error('MariaDB initialization failed; preserve the new directory for inspection');
  const identity = spawnSync('whoami', [], { windowsHide: true, encoding: 'utf8' }).stdout.trim();
  const acl = spawnSync('icacls', [data, '/inheritance:r', '/grant:r', identity + ':(OI)(CI)F', 'SYSTEM:(OI)(CI)F'], { windowsHide: true, encoding: 'utf8' });
  if (acl.status !== 0) throw new Error('Cannot protect local credential directory');
  const rootPassword = crypto.randomBytes(32).toString('hex');
  const appPassword = crypto.randomBytes(32).toString('hex');
  const adminPassword = crypto.randomBytes(24).toString('base64url');
  const jwtSecret = crypto.randomBytes(48).toString('hex');
  const initFile = path.join(data, 'initial-account.sql');
  // SQL is written privately, not passed as a password-bearing command-line argument.
  fs.writeFileSync(initFile, "ALTER USER 'root'@'localhost' IDENTIFIED BY '" + rootPassword + "';\n", { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(data, 'local-credentials.json'), JSON.stringify({
    host: '127.0.0.1', port, database: 'asset_management_system',
    rootPassword, appPassword, adminEmail: 'admin@smartassets.local', adminPassword,
  }), { flag: 'wx', mode: 0o600 });
  const out = fs.openSync(path.join(data, 'server.stdout.log'), 'a');
  const err = fs.openSync(path.join(data, 'server.stderr.log'), 'a');
  const child = spawn(binary, ['--defaults-file=' + path.join(data, 'my.ini'), '--bind-address=127.0.0.1', '--port=' + port, '--skip-networking=0', '--init-file=' + initFile],
    { cwd: runtime, windowsHide: true, detached: true, stdio: ['ignore', out, err] });
  child.unref();
  fs.closeSync(out); fs.closeSync(err);
  fs.writeFileSync(path.join(data, 'server.pid.json'), JSON.stringify({ pid: child.pid, binary }));
  let connection;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      connection = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: rootPassword, connectTimeout: 1000, multipleStatements: false });
      break;
    } catch { await delay(500); }
  }
  if (!connection) throw new Error('New server did not become ready; inspect its local logs privately');
  fs.unlinkSync(initFile);
  try {
    const [[identity]] = await connection.query('SELECT VERSION() AS version, @@datadir AS data_directory, @@port AS port');
    const actual = path.resolve(identity.data_directory).toLowerCase().replace(/[\\/]+$/, '');
    if (actual !== data.toLowerCase().replace(/[\\/]+$/, '') || identity.port !== port) throw new Error('Database instance identity mismatch');
    const [databases] = await connection.query('SHOW DATABASES');
    if (databases.some(row => row.Database === 'asset_management_system')) throw new Error('Target already exists; refusing bootstrap');
    for (const statement of statements) await connection.query(statement);
    const [tables] = await connection.query('SHOW TABLES FROM asset_management_system');
    if (tables.length !== 7) throw new Error('Unexpected table count after bootstrap');
    const [columns] = await connection.query('SHOW COLUMNS FROM asset_management_system.users');
    if (!['mobile', 'dob'].every(name => columns.some(column => column.Field === name))) throw new Error('Missing user profile columns');
    const [roles] = await connection.query('SELECT id, role_name FROM asset_management_system.roles ORDER BY id');
    if (roles.length !== 4) throw new Error('Unexpected role count');
    await connection.query("CREATE USER 'smart_assets_app'@'127.0.0.1' IDENTIFIED BY ?", [appPassword]);
    await connection.query("GRANT SELECT, INSERT, UPDATE, DELETE ON asset_management_system.* TO 'smart_assets_app'@'127.0.0.1'");
    const adminRole = roles.find(role => role.role_name === 'Super Admin');
    await connection.query('INSERT INTO asset_management_system.users (full_name, email, password, role_id) VALUES (?, ?, ?, ?)',
      ['Local Project Administrator', 'admin@smartassets.local', await bcrypt.hash(adminPassword, 12), adminRole.id]);
    fs.writeFileSync(localEnv, [
      'DB_HOST=127.0.0.1', 'DB_PORT=' + port, 'DB_USER=smart_assets_app',
      'DB_PASSWORD=' + appPassword, 'DB_NAME=asset_management_system', 'PORT=5000',
      'JWT_SECRET=' + jwtSecret, 'CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173', '',
    ].join('\n'), { flag: 'wx', mode: 0o600 });
    fs.mkdirSync(path.dirname(localConfig), { recursive: true });
    fs.writeFileSync(localConfig, JSON.stringify({ runtimeDir: runtime, dataDir: data }, null, 2), { flag: 'wx' });
    fs.writeFileSync(path.join(data, 'verification.json'), JSON.stringify({ version: identity.version, port, tables: tables.map(row => Object.values(row)[0]), userColumns: columns.map(column => column.Field), roles: roles.map(role => role.role_name), originalAndBackupUntouched: true }, null, 2));
    console.log('Isolated local database initialized and verified: seven tables, four roles, restricted app account and local administrator. Credentials were saved privately; no existing .env was overwritten.');
  } finally { await connection.end(); }
}
setup().catch(error => { console.error(error.sql ? 'Database setup failed (' + (error.code || 'SQL_ERROR') + '); inspect privately.' : error.message); process.exitCode = 1; });

