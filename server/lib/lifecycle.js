const { HttpError } = require('./errors');
const transitions = {
  Open: ['Assigned', 'Rejected'], Assigned: ['In Progress', 'Open'],
  'In Progress': ['Resolved', 'Assigned'], Resolved: ['Closed', 'In Progress'],
  Closed: ['In Progress'], Rejected: ['Open'],
};
function transition(from, to, resolution) {
  if (!transitions[from]?.includes(to)) throw new HttpError(409, 'Illegal maintenance transition: ' + from + ' to ' + to);
  if (['Resolved', 'Closed'].includes(to) && !resolution?.trim()) throw new HttpError(400, 'A resolution summary is required');
}
module.exports = { transitions, transition };

