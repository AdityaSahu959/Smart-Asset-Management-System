const express = require('express');
const { allow } = require('../middleware/auth');
module.exports = db => {
  const router = express.Router();
  const c = require('../controllers/assetController')(db);
  const manage = allow('Super Admin', 'Admin');
  router.get('/details/:id', c.getSingleAsset);
  router.get('/:labId', c.getAssetsByLab);
  router.post('/', manage, c.createAsset);
  router.put('/:id', manage, c.updateAsset);
  router.post('/:id/retire', manage, c.retireAsset);
  router.delete('/:id', manage, c.deleteAsset);
  return router;
};
