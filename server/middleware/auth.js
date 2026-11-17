const jwt = require('jsonwebtoken');
const { HttpError } = require('../lib/errors');
function authentication(db, secret) {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') || '');
    if (!match) throw new HttpError(401, 'Authentication required');
    let claims;
    try {
      claims = jwt.verify(match[1], secret, { algorithms: ['HS256'], issuer: 'smart-assets', audience: 'smart-assets-client' });
    } catch { throw new HttpError(401, 'Invalid or expired session'); }
    if (!Number.isSafeInteger(claims.id) || claims.id < 1) throw new HttpError(401, 'Invalid session');
    const [rows] = await db.query(
      'SELECT u.id, u.full_name, u.email, u.role_id, u.is_active, u.token_version, r.role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [claims.id]);
    if (!rows[0] || !rows[0].is_active || !Number.isSafeInteger(claims.token_version) || claims.token_version !== (rows[0].token_version || 0)) throw new HttpError(401, 'Account is unavailable');
    req.user = rows[0];
    next();
  };
}
function allow(...roles) {
  return (req, res, next) => {
    if (!req.user) throw new HttpError(401, 'Authentication required');
    if (!roles.includes(req.user.role_name)) throw new HttpError(403, 'Insufficient permission');
    next();
  };
}
module.exports = { authentication, allow };

