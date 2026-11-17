import { useEffect, useState } from 'react';
import { formatTimestamp } from '../lib/dates';
import api from '../lib/api';
export default function ReliabilityWidget({ assetId, revision }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api.get('/reliability/' + assetId, { signal: controller.signal }).then(({data}) => { setResult(data); setError(''); }).catch(error => {
      if (error.code !== 'ERR_CANCELED') setError(error.response?.data?.message || 'Reliability information unavailable');
    });
    return () => controller.abort();
  }, [assetId, revision]);
  return <section className="bg-white p-8 rounded-xl shadow-md mt-8 space-y-4">
    <h2 className="text-2xl font-bold">Asset health indicators</h2>
    <p className="text-gray-600">Rule-based indicators for review, not a prediction of future failure.</p>
    {error && <p role="alert">{error}</p>}
    {!result && !error && <p role="status">Loading reliability information…</p>}
    {result && <>
      <div className="grid md:grid-cols-3 gap-4">
        <div><h3 className="font-semibold">Asset Reliability Index</h3><p className="text-3xl">{result.ari === null ? 'Unavailable' : result.ari.toFixed(1) + ' / 100'}</p>{result.ari !== null && <progress aria-label="Asset Reliability Index" max={100} value={result.ari} className="w-full" />}</div>
        <div><h3 className="font-semibold">MTBF calendar proxy</h3><p className="text-2xl">{result.mtbf_calendar_days_per_failure === null ? 'N/A' : result.mtbf_calendar_days_per_failure.toFixed(1) + ' days/failure'}</p><p>{result.verified_failure_count} verified failure(s)</p></div>
        <div><h3 className="font-semibold">Last 180 days</h3><p className="text-2xl">{result.failures_in_180_days} verified failure(s)</p><p>Last failure: {result.last_failure_at ? formatTimestamp(result.last_failure_at) : 'None recorded'}</p></div>
      </div>
      {result.replacement_review_candidate && <p className="font-semibold text-amber-900">Review this asset for repair or replacement. This flag does not authorize disposal or purchase.</p>}
      {result.warnings.map(warning => <p key={warning} role="status">{warning}</p>)}
      <details><summary>Calculation and data limits</summary><p>{result.method}</p><p>Age penalty: {result.age_penalty?.toFixed(2) ?? 'N/A'} · Recent-failure penalty: {result.breakdown_penalty.toFixed(2)}</p><p>Age penalty caps at 35 over 1825 days. Failure weights: Critical 15, High 10, Medium 5, Low 2, decaying by exp(-0.02 × days). Replacement review threshold: ARI below 40. These are prototype rules requiring evaluation.</p><p>Calculated: {formatTimestamp(result.evaluated_at)} (Asia/Kolkata)</p></details>
    </>}
  </section>;
}

