const express = require('express');
const { allow } = require('../middleware/auth');
module.exports = db => {
  const router = express.Router();
  const c = require('../controllers/userController')(db);
  router.get('/technicians', allow('Super Admin', 'Admin', 'Technician'), async (req, res) => {
    const [rows] = await db.query('SELECT u.id,u.full_name FROM users u JOIN roles r ON r.id=u.role_id WHERE r.role_name=? AND u.is_active=TRUE ORDER BY u.full_name', ['Technician']);
    res.json(rows);
  });
  router.use(allow('Super Admin'));
  router.get('/', c.list);
  router.get('/roles', c.roles);
  router.put('/:id', c.update);
  return router;
};

