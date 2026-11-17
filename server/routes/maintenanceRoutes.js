const express = require('express');
const { allow } = require('../middleware/auth');
module.exports = (db, ai) => {
  const router = express.Router();
  const c = require('../controllers/maintenanceController')(db, ai);
  router.get('/', c.getAllMaintenance);
  router.get('/:id/recommendations', c.getRecommendations);
  router.post('/:id/triage', allow('Super Admin', 'Admin', 'Technician'), c.retryTriage);
  router.post('/:id/index', allow('Super Admin', 'Admin'), c.retryIndex);
  router.get('/:assetId', c.getMaintenanceByAsset);
  router.post('/add', allow('Super Admin', 'Admin', 'Technician'), c.addMaintenance);
  router.put('/:id/assign', allow('Super Admin', 'Admin'), c.assignTechnician);
  router.put('/:id/status', allow('Super Admin', 'Admin', 'Technician'), c.updateStatus);
  router.delete('/delete/:id', allow('Super Admin', 'Admin'), c.deleteMaintenance);
  return router;
};
