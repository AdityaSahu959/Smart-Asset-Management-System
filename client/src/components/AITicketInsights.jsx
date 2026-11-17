import { useState } from 'react';
import { formatTimestamp } from '../lib/dates';
import { Link } from 'react-router-dom';
import api from '../lib/api';
export default function AITicketInsights({ ticket, canRetry, manager, onUpdated }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function perform(operation) {
    setBusy(true); setError('');
    try { const {data} = await operation(); await onUpdated?.(); return data; }
    catch (error) { setError(error.response?.data?.message || 'AI is unavailable. Continue with manual diagnosis.'); }
    finally { setBusy(false); }
  }
  return <section className="bg-slate-50 border rounded p-4 space-y-3">
    <h5 className="font-semibold">AI assistance</h5>
    <p>{ticket.manual_triage_flag ? 'Manual triage required' : 'Suggestion available for technician review'}</p>
    {ticket.predicted_category && <p>Suggested category: {ticket.predicted_category} · Model score: {(Number(ticket.ai_confidence) * 100).toFixed(1)}%</p>}
    {ticket.ai_priority_suggestion && <p>Suggested priority: {ticket.ai_priority_suggestion}. The recorded priority remains {ticket.priority}.</p>}
    {Boolean(ticket.safety_escalation_flag) && <p role="alert" className="font-semibold text-red-800">Safety-related language detected. Escalate to authorized staff and follow local safety procedures.</p>}
    <p className="text-sm text-gray-600">Scores are not calibrated probabilities. Suggestions and historical repairs require human review.</p>
    {error && <p role="alert">{error}</p>}
    <div className="flex flex-wrap gap-3">
      {canRetry && <button disabled={busy} className="border rounded px-3 py-2 disabled:opacity-50" onClick={() => perform(() => api.post('/maintenance/' + ticket.id + '/triage'))}>Retry AI triage</button>}
      <button disabled={busy} className="border rounded px-3 py-2 disabled:opacity-50" onClick={async () => {
        const data = await perform(() => api.get('/maintenance/' + ticket.id + '/recommendations'));
        if (data) setResult(data);
      }}>Find verified past repairs</button>
      {manager && ticket.maintenance_status === 'Closed' && ticket.source_type === 'real' && ticket.resolution_index_status !== 'indexed' && <button disabled={busy} className="border rounded px-3 py-2 disabled:opacity-50" onClick={() => perform(() => api.post('/maintenance/' + ticket.id + '/index'))}>Retry resolution indexing</button>}
    </div>
    {busy && <p role="status">Checking AI assistance…</p>}
    {result && <div className="space-y-3">
      <p>{result.message}</p>
      {result.matches.map(match => <article key={match.ticket_id} className="bg-white border rounded p-3">
        <p className="font-semibold">Verified repair #{match.ticket_id} · Similarity {(match.similarity * 100).toFixed(1)}%</p>
        <p>Past issue: {match.issue_description}</p><p>Recorded resolution: {match.resolution_summary}</p>
        {match.asset_id && <Link className="text-blue-800 underline" to={'/asset/' + match.asset_id}>Open repair history</Link>}
      </article>)}
    </div>}
    {ticket.ai_model_version && <details className="text-sm"><summary>Model information</summary><p className="break-all">{ticket.ai_model_version}</p><p>Last triaged: {formatTimestamp(ticket.ai_triaged_at)}</p><p>Taxonomy: {ticket.ai_taxonomy_version}</p></details>}
  </section>;
}

