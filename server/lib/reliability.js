const { today } = require('./validation');
const DAY = 86400000;
const WEIGHTS = { Critical: 15, High: 10, Medium: 5, Low: 2 };
function reliability({ purchaseDate, incidents, now = Date.now() }) {
  if (!Number.isFinite(now)) throw new Error('Invalid evaluation time');
  const warnings = [];
  const purchase = typeof purchaseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ? Date.parse(purchaseDate + 'T00:00:00Z') : NaN;
  const calendarNow = Date.parse(today(undefined, now) + 'T00:00:00Z');
  const validPurchase = Number.isFinite(purchase) && purchase <= calendarNow && new Date(purchase).toISOString().slice(0, 10) === purchaseDate;
  if (!validPurchase) warnings.push('Purchase date is missing or invalid; age-based metrics are unavailable.');
  const ageDays = validPurchase ? Math.floor((calendarNow - purchase) / DAY) : null;
  const failures = incidents.filter(record => record.source_type === 'real' && record.incident_type === 'Failure' && record.maintenance_status === 'Closed' && record.verified_by && record.verified_at && record.resolution_summary?.trim());
  const valid = [];
  let incomplete = false;
  for (const record of failures) {
    const time = Number(record.failure_epoch_ms);
    if (record.failure_epoch_ms == null || !Number.isFinite(time) || time > now || (validPurchase && today(undefined, time) < purchaseDate)) {
      incomplete = true; warnings.push('A verified failure has an invalid date; reliability cannot be calculated safely.'); continue;
    }
    if (!Object.hasOwn(WEIGHTS, record.priority)) {
      incomplete = true; warnings.push('A verified failure has unknown priority; ARI is unavailable.'); continue;
    }
    valid.push({ ...record, time });
  }
  const recent = valid.filter(record => now - record.time <= 180 * DAY);
  const agePenalty = ageDays === null ? null : Math.min(35, ageDays / 1825 * 35);
  const breakdownPenalty = recent.reduce((sum, record) => sum + WEIGHTS[record.priority] * Math.exp(-0.02 * ((now - record.time) / DAY)), 0);
  const ari = agePenalty === null || incomplete ? null : Math.max(0, Math.min(100, 100 - agePenalty - breakdownPenalty));
  const mtbf = ageDays === null || incomplete || !failures.length ? null : ageDays / failures.length;
  return {
    evaluated_at: new Date(now).toISOString(), time_zone: process.env.APP_TIME_ZONE || 'Asia/Kolkata', age_days: ageDays, verified_failure_count: failures.length,
    failures_in_180_days: recent.length, last_failure_at: valid.length ? new Date(Math.max(...valid.map(record => record.time))).toISOString() : null,
    mtbf_calendar_days_per_failure: mtbf, ari, age_penalty: agePenalty, breakdown_penalty: breakdownPenalty,
    replacement_review_candidate: ari !== null && ari < 40, window_days: 180,
    method: 'ARI is an unvalidated rule-based health indicator. MTBF uses calendar age as a proxy; actual uptime and downtime are not recorded. Only real, verified Closed failure tickets count. Priority weights are a severity proxy.',
    warnings: [...new Set(warnings)],
  };
}
module.exports = { reliability, DAY };

