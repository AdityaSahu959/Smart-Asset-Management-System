const v = require('../lib/validation');
const { conditions, statuses, choice } = require('../lib/assetPolicy');
const { HttpError } = require('../lib/errors');
const { transaction, audit, requireRow, parseExtra } = require('../lib/records');
function fields(body) {
  return [v.text(body.asset_name, 'asset_name', 100, true), v.text(body.brand, 'brand', 100),
    v.text(body.model, 'model', 100), v.text(body.processor, 'processor', 100),
    v.text(body.ram, 'ram', 50), v.text(body.storage, 'storage', 100),
    choice(body.asset_condition, conditions, 'Good', 'asset_condition'), choice(body.asset_status, statuses, 'Available', 'asset_status'),
    v.extra(body.extra_details)];
}
module.exports = db => ({
  createAsset: async (req, res) => {
    const body = req.body || {};
    const labId = v.id(body.lab_id, 'lab_id');
    const values = fields(body);
    const code = v.text(body.asset_code, 'asset_code', 100);
    const serial = v.text(body.serial_number, 'serial_number', 100);
    const purchaseDate = v.date(body.purchase_date, 'purchase_date');
    const warranty = v.date(body.warranty_expiry, 'warranty_expiry');
    const category = body.category_id == null || body.category_id === '' ? null : v.id(body.category_id, 'category_id');
    const assigned = v.text(body.assigned_to, 'assigned_to', 100);
    if (purchaseDate && purchaseDate > v.today()) throw new HttpError(400, 'purchase_date cannot be in the future');
    if (purchaseDate && warranty && warranty < purchaseDate) throw new HttpError(400, 'warranty_expiry cannot precede purchase_date');
    const id = await transaction(db, async connection => {
      await requireRow(connection, 'labs', labId);
      if (category !== null) await requireRow(connection, 'categories', category);
      const [result] = await connection.query('INSERT INTO assets (asset_name, brand, model, processor, ram, storage, asset_condition, asset_status, extra_details, lab_id, asset_code, serial_number, purchase_date, warranty_expiry, category_id, assigned_to, retired_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(?,UTC_TIMESTAMP(),NULL))', [...values, labId, code, serial, purchaseDate, warranty, category, assigned, values[7] === 'Retired']);
      await audit(connection, req.user.id, 'create', 'asset', result.insertId);
      return result.insertId;
    });
    res.status(201).json({ id, message: 'Asset created' });
  },
  getAssetsByLab: async (req, res) => {
    const labId = v.id(req.params.labId, 'labId');
    await requireRow(db, 'labs', labId);
    const [rows] = await db.query('SELECT * FROM assets WHERE lab_id = ? ORDER BY id DESC', [labId]);
    res.json(rows.map(parseExtra));
  },
  getSingleAsset: async (req, res) => {
    const record = await requireRow(db, 'assets', v.id(req.params.id));
    const category = record.category_id ? await requireRow(db, 'categories', record.category_id) : null;
    res.json(parseExtra({ ...record, category_name: category?.category_name || null }));
  },
  updateAsset: async (req, res) => {
    const id = v.id(req.params.id);
    const body = req.body || {};
    const values = fields(body);
    await transaction(db, async connection => {
      const current = await requireRow(connection, 'assets', id, true);
      if ((current.retired_at || current.asset_status === 'Retired') && values[7] !== 'Retired') throw new HttpError(409, 'Retired assets cannot be reactivated through editing');
      const category = body.category_id === undefined ? current.category_id ?? null : body.category_id == null || body.category_id === '' ? null : v.id(body.category_id, 'category_id');
      if (category !== null) await requireRow(connection, 'categories', category);
      const purchase = body.purchase_date === undefined ? current.purchase_date : v.date(body.purchase_date, 'purchase_date');
      const warranty = body.warranty_expiry === undefined ? current.warranty_expiry : v.date(body.warranty_expiry, 'warranty_expiry');
      const assigned = body.assigned_to === undefined ? current.assigned_to : v.text(body.assigned_to, 'assigned_to', 100);
      if (purchase && purchase > v.today()) throw new HttpError(400, 'purchase_date cannot be in the future');
      if (purchase && warranty && warranty < purchase) throw new HttpError(400, 'warranty_expiry cannot precede purchase_date');
      await connection.query('UPDATE assets SET asset_name=?, brand=?, model=?, processor=?, ram=?, storage=?, asset_condition=?, asset_status=?, extra_details=?, category_id=?, purchase_date=?, warranty_expiry=?, assigned_to=?, retired_at=IF(?,COALESCE(retired_at,UTC_TIMESTAMP()),retired_at) WHERE id=?', [...values, category, purchase, warranty, assigned, values[7] === 'Retired', id]);
      await audit(connection, req.user.id, 'update', 'asset', id);
    });
    res.json({ message: 'Asset updated' });
  },
  retireAsset: async (req, res) => {
    const id = v.id(req.params.id);
    await transaction(db, async connection => {
      const current = await requireRow(connection, 'assets', id, true);
      if (current.retired_at) return;
      await connection.query("UPDATE assets SET asset_status='Retired', retired_at=UTC_TIMESTAMP() WHERE id=?", [id]);
      await audit(connection, req.user.id, 'retire', 'asset', id);
    });
    res.json({ message: 'Asset retired; history retained' });
  },
  deleteAsset: async (req, res) => {
    const id = v.id(req.params.id);
    await transaction(db, async connection => {
      await requireRow(connection, 'assets', id, true);
      const [history] = await connection.query('SELECT id FROM maintenance WHERE asset_id = ? LIMIT 1', [id]);
      if (history.length) throw new HttpError(409, 'Assets with maintenance history cannot be deleted');
      await connection.query('DELETE FROM assets WHERE id = ?', [id]);
      await audit(connection, req.user.id, 'delete', 'asset', id);
    });
    res.json({ message: 'Asset deleted' });
  },
});
