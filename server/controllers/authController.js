const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const v = require('../lib/validation');
const { HttpError } = require('../lib/errors');
const { transaction, audit } = require('../lib/records');
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

module.exports = function authController(db, secret, mailer = require('../lib/mailer')) {
  return {
    recoveryStatus: (req, res) => res.json({ available: mailer.configured() }),
    registerUser: async (req, res) => {
      const body = req.body || {};
      const fullName = v.text(body.full_name, 'full_name', 100, true);
      const email = v.email(body.email);
      const password = v.password(body.password);
      if (password !== body.confirm_password) throw new HttpError(400, 'Passwords do not match');
      const mobile = v.text(body.mobile, 'mobile', 20);
      if (mobile && !/^\+?[\d ()-]{7,20}$/.test(mobile)) throw new HttpError(400, 'Invalid mobile number');
      const dob = v.date(body.dob, 'dob');
      if (dob && dob > v.today()) throw new HttpError(400, 'dob cannot be in the future');
      const [roles] = await db.query('SELECT id FROM roles WHERE role_name = ?', ['Viewer']);
      if (!roles[0]) throw new HttpError(503, 'Default account role is not configured');
      const hash = await bcrypt.hash(password, 12);
      await transaction(db, async connection => {
        const [result] = await connection.query('INSERT INTO users (full_name, email, password, mobile, dob, role_id) VALUES (?, ?, ?, ?, ?, ?)',
          [fullName, email, hash, mobile, dob, roles[0].id]);
        await audit(connection, result.insertId, 'register', 'user', result.insertId);
      });
      res.status(201).json({ message: 'User registered with Viewer access' });
    },
    loginUser: async (req, res) => {
      const email = v.email(req.body?.email);
      const password = req.body?.password;
      if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 72) throw new HttpError(401, 'Invalid credentials');
      const [rows] = await db.query('SELECT u.id, u.full_name, u.email, u.password, u.role_id, u.is_active, u.token_version, r.role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?', [email]);
      const user = rows[0];
      const dummyHash = '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';
      const matches = await bcrypt.compare(password, user?.password || dummyHash);
      if (!user || !user.is_active || !matches) throw new HttpError(401, 'Invalid credentials');
      const profile = { id: user.id, full_name: user.full_name, email: user.email, role_id: user.role_id, role_name: user.role_name };
      const token = jwt.sign({ id: user.id, token_version: user.token_version || 0 }, secret, { algorithm: 'HS256', expiresIn: '1h', issuer: 'smart-assets', audience: 'smart-assets-client' });
      res.json({ message: 'Login successful', token, user: profile });
    },
    forgotPassword: async (req, res) => {
      if (!mailer.configured()) throw new HttpError(503, 'Self-service recovery is unavailable until verified email delivery is configured. Contact your administrator.');
      const email = v.email(req.body?.email);
      const [rows] = await db.query('SELECT id, email FROM users WHERE email=? AND is_active=TRUE', [email]);
      const token = crypto.randomBytes(32).toString('hex');
      if (rows[0]) {
        const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
        await transaction(db, async connection => {
          await connection.query('SELECT id FROM users WHERE id=? FOR UPDATE', [rows[0].id]);
          await connection.query('UPDATE password_reset_tokens SET consumed_at=UTC_TIMESTAMP() WHERE user_id=? AND consumed_at IS NULL', [rows[0].id]);
          await connection.query('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [rows[0].id, hashToken(token), expires]);
        });
      }
      res.status(202).json({ message: 'If an active account exists, a recovery message will be sent. Check your inbox or contact your administrator.' });
      // Delivery runs after the generic response. No tokens are returned or logged.
      // This is best-effort delivery, not a durable outbox; users can retry a lost request.
      if (rows[0]) {
        void Promise.resolve().then(() => mailer.sendPasswordReset({ email: rows[0].email, token })).catch(async () => {
          try { await db.query('UPDATE password_reset_tokens SET consumed_at=UTC_TIMESTAMP() WHERE token_hash=?', [hashToken(token)]); } catch { /* Token still expires within 15 minutes. */ }
        });
      }
    },
    resetPassword: async (req, res) => {
      const token = req.body?.token;
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(400, 'Invalid or expired recovery link');
      const password = v.password(req.body?.new_password);
      if (password !== req.body?.confirm_password) throw new HttpError(400, 'Passwords do not match');
      const hash = await bcrypt.hash(password, 12);
      await transaction(db, async connection => {
        const [tokens] = await connection.query('SELECT id, user_id FROM password_reset_tokens WHERE token_hash=? AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR UPDATE', [hashToken(token)]);
        if (!tokens[0]) throw new HttpError(400, 'Invalid or expired recovery link');
        const [users] = await connection.query('SELECT id, is_active FROM users WHERE id=? FOR UPDATE', [tokens[0].user_id]);
        if (!users[0]?.is_active) throw new HttpError(400, 'Invalid or expired recovery link');
        await connection.query('UPDATE users SET password=?, token_version=token_version+1 WHERE id=?', [hash, users[0].id]);
        await connection.query('UPDATE password_reset_tokens SET consumed_at=UTC_TIMESTAMP() WHERE user_id=? AND consumed_at IS NULL', [users[0].id]);
        await audit(connection, users[0].id, 'password_reset', 'user', users[0].id);
      });
      res.json({ message: 'Password updated. Sign in again; previous sessions are invalid.' });
    },
  };
};
