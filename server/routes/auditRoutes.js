const express = require('express');
const { allow } = require('../middleware/auth');
const { transaction } = require('../lib/records');
const { verify } = require('../lib/auditChain');
module.exports = db => {
  const router = express.Router();
  router.use(allow('Super Admin', 'Admin'));
  router.get('/verify', async (req, res) => {
    const result = await transaction(db, async connection => {
      const [rows] = await connection.query('SELECT user_id,activity,event_sequence,prev_hash,current_hash,canonical_payload,UNIX_TIMESTAMP(created_at) AS event_epoch FROM activity_logs ORDER BY event_sequence');
      const [states] = await connection.query('SELECT sequence,last_hash FROM audit_chain_state WHERE id=1');
      return verify(rows, states[0]);
    });
    res.json(result);
  });
  router.get('/', async (req, res) => {
    const [rows] = await db.query('SELECT id,user_id,activity,event_sequence,created_at FROM activity_logs ORDER BY event_sequence DESC LIMIT 100');
    res.json(rows);
  });
  return router;
};
