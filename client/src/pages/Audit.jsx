import { useCallback, useEffect, useState } from 'react';
import { formatTimestamp } from '../lib/dates';
import MainLayout from '../layouts/MainLayout';
import api from '../lib/api';
import { canManage } from '../lib/permissions';
export default function Audit() {
  const allowed = canManage();
  const [result, setResult] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const verify = useCallback((signal) => Promise.all([api.get('/audit/verify', { signal }), api.get('/audit', { signal })]).then(([verification, history]) => {
    setResult(verification.data); setEvents(history.data); setError('');
  }).catch(error => { if (error.code !== 'ERR_CANCELED') setError(error.response?.data?.message || 'Audit verification unavailable'); }), []);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController(); verify(controller.signal);
    return () => controller.abort();
  }, [allowed, verify]);
  function exportCheckpoint() {
    const blob = new Blob([JSON.stringify({ sequence: result.sequence, hash: result.hash, recorded_at: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'smart-assets-audit-checkpoint.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <MainLayout><section className="bg-white p-8 rounded-xl space-y-5">
    <h1 className="text-3xl font-bold">Audit integrity</h1>
    {!allowed ? <p>Manager access is required.</p> : <>
      <p>The chain detects protected-record changes against its saved head. Keep exported checkpoints separately. A privileged actor who rewrites the database and all checkpoints can bypass a database-only chain.</p>
      <p>Records backfilled during setup are protected from that checkpoint onward; this does not prove their earlier integrity.</p>
      {error && <p role="alert">{error}</p>}
      {result && <div className="border rounded p-4 space-y-2">
        <p className="font-semibold">{result.valid ? 'Verification passed' : 'Verification failed — investigate before relying on the log'}</p>
        <p>{result.checked} event(s) checked</p><p className="break-all text-sm">Head: {result.hash}</p>
        {result.problems.map((problem, index) => <p key={index}>{problem.reason}</p>)}
        {result.valid && <button className="border rounded px-4 py-2" onClick={exportCheckpoint}>Export checkpoint</button>}
      </div>}
      <button disabled={busy} className="bg-blue-800 text-white p-3 rounded" onClick={async () => { setBusy(true); try { await verify(); } finally { setBusy(false); } }}>{busy ? 'Verifying…' : 'Verify again'}</button>
      <h2 className="text-xl font-bold">Latest 100 activity records</h2>
      {events.map(event => <article className="border rounded p-3" key={event.id}><p>Event {event.event_sequence} · Actor {event.user_id} · {formatTimestamp(event.created_at)} (Asia/Kolkata)</p><p className="break-words">{event.activity}</p></article>)}
    </>}
  </section></MainLayout>;
}

