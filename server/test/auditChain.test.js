const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GENESIS, payload, hash, verify } = require('../lib/auditChain');
function fixture() {
  let previous = GENESIS;
  const rows = [1, 2, 3].map(sequence => {
    const row = { user_id: 7, activity: JSON.stringify({ action: 'change', entity_id: sequence }), event_sequence: sequence, event_epoch: 1700000000 + sequence };
    row.canonical_payload = payload(row.user_id, row.activity, sequence, row.event_epoch);
    row.prev_hash = previous;
    row.current_hash = hash(previous, row.canonical_payload);
    previous = row.current_hash;
    return row;
  });
  return { rows, state: { sequence: 3, last_hash: previous } };
}
test('canonical audit serialization and valid genesis chain verify', () => {
  const { rows, state } = fixture();
  assert.equal(verify(rows, state).valid, true);
  assert.equal(payload(7, 'x', 1, 0), '{"version":1,"sequence":1,"user_id":7,"activity":"x","created_at":"1970-01-01T00:00:00.000Z"}');
});
for (const field of ['user_id', 'activity', 'event_epoch', 'event_sequence', 'prev_hash', 'current_hash', 'canonical_payload']) {
  test('audit verifier detects mutation of ' + field, () => {
    const { rows, state } = fixture();
    rows[1][field] = typeof rows[1][field] === 'number' ? rows[1][field] + 1 : rows[1][field] + 'modified';
    assert.equal(verify(rows, state).valid, false);
  });
}
test('audit verifier detects deletion, reordering and truncation', () => {
  for (const transform of [rows => [rows[0], rows[2]], rows => [rows[1], rows[0], rows[2]], rows => rows.slice(0, 2)]) {
    const { rows, state } = fixture();
    assert.equal(verify(transform(rows), state).valid, false);
  }
});
test('trusted checkpoint detects an incompatible chain head', () => {
  const { rows, state } = fixture();
  assert.equal(verify(rows, state, { sequence: 2, hash: GENESIS }).valid, false);
  assert.equal(verify(rows, state, { sequence: 4, hash: GENESIS }).valid, false);
});
test('canonical payload defines null handling and rejects invalid hashes/sequences', () => {
  assert.equal(JSON.parse(payload(null, 'historical', 1, null)).created_at, null);
  assert.throws(() => payload(1, 'x', Number.MAX_SAFE_INTEGER + 1, 0));
  assert.throws(() => hash('fallback', 'x'));
});

