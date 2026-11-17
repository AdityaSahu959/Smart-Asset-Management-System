const express = require('express');
const { allow } = require('../middleware/auth');
module.exports = db => {
  const router = express.Router(); const c = require('../controllers/categoryController')(db);
  router.get('/', c.list);
  router.post('/', allow('Super Admin', 'Admin'), c.create);
  router.put('/:id', allow('Super Admin', 'Admin'), c.update);
  return router;
};

