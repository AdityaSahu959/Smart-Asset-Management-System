const express = require('express');
const { allow } = require('../middleware/auth');
module.exports = db => {
  const router = express.Router();
  const c = require('../controllers/labController')(db);
  const manage = allow('Super Admin', 'Admin');
  router.get('/', c.getAllLabs);
  router.get('/:id', c.getLabById);
  router.post('/', manage, c.createLab);
  router.put('/:id', manage, c.updateLab);
  router.delete('/:id', manage, c.deleteLab);
  return router;
};
