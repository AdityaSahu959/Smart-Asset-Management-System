require('dotenv').config({ path: require('node:path').join(__dirname, '.env.local'), quiet: true });
require('dotenv').config({ path: require('node:path').join(__dirname, '.env'), quiet: true });
const { createApp } = require('./app');
async function start() {
  if (process.env.DB_NAME !== 'asset_management_system') throw new Error('DB_NAME must be asset_management_system');
  for (const name of ['DB_HOST', 'DB_USER']) if (!process.env[name]) throw new Error(name + ' is required');
  const db = require('./config/db');
  const app = createApp({ db });
  // Connection setup sets UTC; startup never executes schema/bootstrap SQL.
  const connection = await db.getConnection();
  connection.release();
  const server = app.listen(Number(process.env.PORT || 5000), '127.0.0.1', () => console.log('API listening on loopback'));
  const shutdown = () => server.close(() => db.end().then(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}
if (require.main === module) start().catch(() => { console.error('Startup failed: verify database connectivity and required environment configuration.'); process.exitCode = 1; });
module.exports = { start };
