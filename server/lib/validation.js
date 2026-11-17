const { HttpError } = require('./errors');
function text(value, name, max = 100, required = false) {
  if (value == null || value === '') {
    if (required) throw new HttpError(400, name + ' is required');
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw new HttpError(400, name + ' must be text with at most ' + max + ' characters');
  }
  return value.trim() || null;
}
function id(value, name = 'id') {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
    throw new HttpError(400, name + ' must be a positive integer');
  }
  return Number(value);
}
function date(value, name) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, name + ' must be a valid YYYY-MM-DD date');
  }
  return value;
}
function email(value) {
  const result = text(value, 'email', 100, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, 'A valid email is required');
  return result;
}
function password(value) {
  if (typeof value !== 'string' || value.length < 12 || Buffer.byteLength(value, 'utf8') > 72) {
    throw new HttpError(400, 'Password must contain at least 12 characters and at most 72 UTF-8 bytes');
  }
  return value;
}
function extra(value) {
  if (value == null) return '[]';
  if (!Array.isArray(value) || value.length > 30) throw new HttpError(400, 'extra_details must be an array of at most 30 fields');
  return JSON.stringify(value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new HttpError(400, 'Invalid extra field');
    const key = item.label !== undefined ? 'label' : 'key';
    return { [key]: text(item[key], 'field name', 100, true), value: text(item.value, 'field value', 1000) || '' };
  }));
}
function today(timeZone = process.env.APP_TIME_ZONE || 'Asia/Kolkata', time = Date.now()) { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time)).map(part => [part.type, part.value])); return parts.year + '-' + parts.month + '-' + parts.day; }
module.exports = { text, id, date, email, password, extra, today };

