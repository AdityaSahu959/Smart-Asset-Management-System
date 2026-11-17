const express = require('express');
const v = require('../lib/validation');
const { requireRow } = require('../lib/records');
const { reliability } = require('../lib/reliability');
module.exports = db => {
  const router = express.Router();
  router.get('/:id', async (req, res) => {
    const id = v.id(req.params.id);
    const asset = await requireRow(db, 'assets', id);
    const [incidents] = await db.query('SELECT id,source_type,incident_type,maintenance_status,verified_by,verified_at,resolution_summary,priority,UNIX_TIMESTAMP(maintenance_date)*1000 AS failure_epoch_ms FROM maintenance WHERE asset_id=?', [id]);
    const result = reliability({ purchaseDate: asset.purchase_date, incidents });
    if (asset.retired_at || asset.asset_status === 'Retired') result.replacement_review_candidate = false;
    res.json({ asset_id: id, ...result });
  });
  return router;
};

