const mysql = require('mysql2/promise');
// Lazy pool: importing the app never opens a connection or runs bootstrap SQL.
const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, connectionLimit: 10, connectTimeout: 5000,
  multipleStatements: false, dateStrings: true, timezone: 'Z',
});
// Queue UTC session setup before queries. No schema/data changes happen on connection.
pool.on('connection', connection => {
  connection.query("SET SESSION time_zone = '+00:00'", error => { if (error) connection.destroy(); });
});
module.exports = pool;
