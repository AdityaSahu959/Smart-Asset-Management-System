
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const mapped = {
    ER_DUP_ENTRY: [409, 'A record with that unique value already exists'],
    ER_ROW_IS_REFERENCED_2: [409, 'This record is still referenced by other records'],
    ER_NO_REFERENCED_ROW_2: [400, 'A referenced record does not exist'],
    ECONNREFUSED: [503, 'Database is unavailable'],
    ER_BAD_DB_ERROR: [503, 'Database setup is incomplete'],
  }[error.code];
  const status = mapped?.[0] || (error.type === 'entity.parse.failed' ? 400 : error.status || 500);
  const message = mapped?.[1] || (error.type === 'entity.parse.failed' ? 'Invalid JSON body' : status < 500 ? error.message : 'Internal server error');
  res.status(status).json({ message });
}
module.exports = { HttpError, errorHandler };

