const v = require('../lib/validation');
const { HttpError } = require('../lib/errors');
const { transaction, audit } = require('../lib/records');
module.exports = db => ({
  list: async (req, res) => {
    const [rows] = await db.query('SELECT u.id,u.full_name,u.email,u.role_id,u.is_active,r.role_name FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.id');
    res.json(rows);
  },
  roles: async (req, res) => {
    const [rows] = await db.query('SELECT id,role_name FROM roles ORDER BY id');
    res.json(rows);
  },
  update: async (req, res) => {
    const id = v.id(req.params.id);
    const roleId = v.id(req.body?.role_id, 'role_id');
    if (typeof req.body?.is_active !== 'boolean') throw new HttpError(400, 'is_active must be boolean');
    const active = req.body.is_active;
    await transaction(db, async connection => {
      const [admins] = await connection.query("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.role_name='Super Admin' AND u.is_active=TRUE ORDER BY u.id FOR UPDATE");
      const [users] = await connection.query('SELECT id,role_id,is_active FROM users WHERE id=? FOR UPDATE', [id]);
      if (!users[0]) throw new HttpError(404, 'User not found');
      const [roles] = await connection.query('SELECT id,role_name FROM roles WHERE id=?', [roleId]);
      if (!roles[0]) throw new HttpError(400, 'Role not found');
      if (admins.some(admin => admin.id === id) && admins.length === 1 && (!active || roles[0].role_name !== 'Super Admin')) throw new HttpError(409, 'At least one active Super Admin must remain');
      await connection.query('UPDATE users SET role_id=?, is_active=?, token_version=token_version+1 WHERE id=?', [roleId, active, id]);
      await audit(connection, req.user.id, 'access_update', 'user', id);
    });
    res.json({ message: 'Access updated; previous sessions invalidated' });
  },
});

