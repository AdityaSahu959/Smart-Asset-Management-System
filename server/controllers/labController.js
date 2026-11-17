const v = require('../lib/validation');
const { HttpError } = require('../lib/errors');
const { transaction, audit, requireRow } = require('../lib/records');
function fields(body) {
  return [v.text(body.lab_name, 'lab_name', 100, true), v.text(body.lab_code, 'lab_code', 50),
    v.text(body.room_number, 'room_number', 50), v.text(body.department, 'department', 100),
    v.text(body.description, 'description', 5000), v.extra(body.extra_details)];
}
module.exports = db => ({
  createLab: async (req, res) => {
    const values = fields(req.body || {});
    const id = await transaction(db, async connection => {
      const [result] = await connection.query('INSERT INTO labs (lab_name, lab_code, room_number, department, description, extra_details, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', [...values, req.user.id]);
      await audit(connection, req.user.id, 'create', 'lab', result.insertId);
      return result.insertId;
    });
    res.status(201).json({ id, message: 'Lab created' });
  },
  getAllLabs: async (req, res) => {
    const [rows] = await db.query('SELECT labs.*, (SELECT COUNT(*) FROM assets WHERE assets.lab_id = labs.id) AS asset_count FROM labs ORDER BY labs.id DESC');
    res.json(rows);
  },
  getLabById: async (req, res) => res.json(await requireRow(db, 'labs', v.id(req.params.id))),
  updateLab: async (req, res) => {
    const id = v.id(req.params.id);
    const values = fields(req.body || {});
    await transaction(db, async connection => {
      await requireRow(connection, 'labs', id, true);
      await connection.query('UPDATE labs SET lab_name=?, lab_code=?, room_number=?, department=?, description=?, extra_details=? WHERE id=?', [...values, id]);
      await audit(connection, req.user.id, 'update', 'lab', id);
    });
    res.json({ message: 'Lab updated' });
  },
  deleteLab: async (req, res) => {
    const id = v.id(req.params.id);
    await transaction(db, async connection => {
      await requireRow(connection, 'labs', id, true);
      const [assets] = await connection.query('SELECT id FROM assets WHERE lab_id = ? LIMIT 1', [id]);
      if (assets.length) throw new HttpError(409, 'Move or retire the assets before deleting this lab');
      await connection.query('DELETE FROM labs WHERE id = ?', [id]);
      await audit(connection, req.user.id, 'delete', 'lab', id);
    });
    res.json({ message: 'Lab deleted' });
  },
});
