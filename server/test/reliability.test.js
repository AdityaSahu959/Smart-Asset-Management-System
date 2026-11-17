const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reliability, DAY } = require('../lib/reliability');
const now = Date.parse('2026-01-01T00:00:00Z');
const incident = change => ({ source_type: 'real', incident_type: 'Failure', maintenance_status: 'Closed', verified_by: 1, verified_at: '2026-01-01', resolution_summary: 'Verified fix', priority: 'High', failure_epoch_ms: now, ...change });
test('new asset with no failures has ARI 100 and no fabricated MTBF', () => {
  const result = reliability({ purchaseDate: '2026-01-01', incidents: [], now });
  assert.equal(result.ari, 100); assert.equal(result.mtbf_calendar_days_per_failure, null);
});
test('age penalty caps at 35 after the defined 1825-day cycle', () => {
  const purchaseDate = new Date(now - 1825 * DAY).toISOString().slice(0, 10);
  const result = reliability({ purchaseDate, incidents: [], now });
  assert.equal(result.age_penalty, 35); assert.equal(result.ari, 65);
});
test('recent critical incident has the documented weight and MTBF proxy', () => {
  const result = reliability({ purchaseDate: '2025-01-01', incidents: [incident({ priority: 'Critical' })], now });
  assert.equal(result.breakdown_penalty, 15); assert.equal(result.mtbf_calendar_days_per_failure, 365);
  assert.equal(result.verified_failure_count, 1);
});
test('180-day window includes its boundary and excludes older incidents', () => {
  const result = reliability({ purchaseDate: '2024-01-01', incidents: [incident({ failure_epoch_ms: now - 180 * DAY }), incident({ failure_epoch_ms: now - 181 * DAY })], now });
  assert.equal(result.verified_failure_count, 2); assert.equal(result.failures_in_180_days, 1);
  assert.ok(Math.abs(result.breakdown_penalty - 10 * Math.exp(-3.6)) < 1e-10);
});
test('synthetic, preventive, reopened, unverified and rejected incidents are excluded', () => {
  const incidents = [incident({ source_type: 'synthetic' }), incident({ incident_type: 'Preventive' }), incident({ maintenance_status: 'In Progress' }), incident({ verified_by: null }), incident({ maintenance_status: 'Rejected' }), incident({ resolution_summary: '' })];
  const result = reliability({ purchaseDate: '2025-01-01', incidents, now });
  assert.equal(result.verified_failure_count, 0); assert.equal(result.breakdown_penalty, 0);
});
test('missing, future and malformed purchase dates never yield invented age metrics', () => {
  for (const purchaseDate of [null, '', '2027-01-01', 'bad']) {
    const result = reliability({ purchaseDate, incidents: [], now });
    assert.equal(result.ari, null); assert.equal(result.mtbf_calendar_days_per_failure, null);
  }
});
test('missing dates and unknown priorities surface incomplete-data warnings', () => {
  for (const change of [{ failure_epoch_ms: null }, { failure_epoch_ms: now + DAY }, { priority: 'Unknown' }]) {
    const result = reliability({ purchaseDate: '2025-01-01', incidents: [incident(change)], now });
    assert.equal(result.ari, null); assert.ok(result.warnings.length > 0);
  }
});
test('score clamps to zero and replacement is a human review flag', () => {
  const result = reliability({ purchaseDate: '2020-01-01', incidents: Array.from({ length: 10 }, () => incident({ priority: 'Critical' })), now });
  assert.equal(result.ari, 0); assert.equal(result.replacement_review_candidate, true);
});

