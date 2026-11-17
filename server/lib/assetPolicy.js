const { HttpError } = require('./errors');
const conditions = ['New', 'Good', 'Fair', 'Poor', 'Damaged'];
const statuses = ['Available', 'In Use', 'Under Maintenance', 'Retired'];
function choice(value, allowed, fallback, name) {
  const selected = value || fallback;
  if (!allowed.includes(selected)) throw new HttpError(400, name + ' must be one of: ' + allowed.join(', '));
  return selected;
}
module.exports = { conditions, statuses, choice };

