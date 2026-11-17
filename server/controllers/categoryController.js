const v = require('../lib/validation');
const { HttpError } = require('../lib/errors');
const { transaction, audit, requireRow } = require('../lib/records');
module.exports = db => ({
  list: async (req, res) => { const [rows] = await db.query('SELECT id,category_name,description FROM categories ORDER BY category_name'); res.json(rows); },
  create: async (req, res) => {
    const name = v.text(req.body?.category_name, 'category_name', 100, true);
    const description = v.text(req.body?.description, 'description', 5000);
    const id = await transaction(db, async connection => {
      const [existing] = await connection.query('SELECT id FROM categories WHERE category_name=?', [name]);
      if (existing.length) throw new HttpError(409, 'Category already exists');
      const [result] = await connection.query('INSERT INTO categories (category_name,description) VALUES (?, ?)', [name, description]);
      await audit(connection, req.user.id, 'create', 'category', result.insertId);
      return result.insertId;
    });
    res.status(201).json({ id, message: 'Category created' });
  },
  update: async (req, res) => {
    const id = v.id(req.params.id);
    const name = v.text(req.body?.category_name, 'category_name', 100, true);
    const description = v.text(req.body?.description, 'description', 5000);
    await transaction(db, async connection => {
      await requireRow(connection, 'categories', id, true);
      const [existing] = await connection.query('SELECT id FROM categories WHERE category_name=? AND id<>?', [name, id]);
      if (existing.length) throw new HttpError(409, 'Category already exists');
      await connection.query('UPDATE categories SET category_name=?,description=? WHERE id=?', [name, description, id]);
      await audit(connection, req.user.id, 'update', 'category', id);
    });
    res.json({ message: 'Category updated' });
  },
});

