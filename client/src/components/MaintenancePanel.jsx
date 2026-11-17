import { useCallback, useEffect, useState } from 'react';
import { formatTimestamp } from '../lib/dates';
import AITicketInsights from './AITicketInsights';
import api from '../lib/api';
import { currentUser, canManage, canMaintain } from '../lib/permissions';

const transitions = {
  Open: ['Assigned', 'Rejected'], Assigned: ['In Progress', 'Open'],
  'In Progress': ['Resolved', 'Assigned'], Resolved: ['Closed', 'In Progress'],
  Closed: ['In Progress'], Rejected: ['Open'],
};
export default function MaintenancePanel({ assetId, retired, onChanged }) {
  const user = currentUser();
  const manager = canManage();
  const [tickets, setTickets] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [form, setForm] = useState({ issue_description: '', priority: 'Medium', incident_type: 'Failure', remarks: '', source_type: 'real' });
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = useCallback((signal) => api.get('/maintenance/' + assetId, { signal }).then(({data}) => setTickets(data)).catch(error => {
    if (error.code !== 'ERR_CANCELED') setError(error.response?.data?.message || 'Cannot load maintenance history');
  }), [assetId]);
  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    if (manager) api.get('/users/technicians', { signal: controller.signal }).then(({data}) => setTechnicians(data)).catch(error => {
      if (error.code !== 'ERR_CANCELED') setError('Cannot load technician accounts');
    });
    return () => controller.abort();
  }, [refresh, manager]);
  const draft = (id, key, value) => setDrafts(previous => ({ ...previous, [id]: { ...previous[id], [key]: value } }));
  async function action(operation) {
    setBusy(true); setError(''); setNotice('');
    try { const response = await operation(); setNotice(response.data.message); await refresh(); onChanged?.(); }
    catch (error) { setError(error.response?.data?.message || 'Operation failed. Please retry.'); }
    finally { setBusy(false); }
  }
  const inputClass = 'border p-3 rounded-lg w-full';
  return <section className="bg-white p-8 rounded-xl shadow-md mt-10 space-y-6">
    <h2 className="text-3xl font-bold">Maintenance workspace</h2>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {notice && <p role="status" className="text-green-800">{notice}</p>}
    {canMaintain() && !retired && <form className="space-y-3" onSubmit={event => {
      event.preventDefault();
      action(async () => {
        const response = await api.post('/maintenance/add', { ...form, asset_id: assetId });
        setForm({ issue_description: '', priority: 'Medium', incident_type: 'Failure', remarks: '', source_type: 'real' });
        return response;
      });
    }}>
      <label className="block">Describe the fault
        <textarea className={inputClass} required maxLength={5000} value={form.issue_description} onChange={event => setForm({ ...form, issue_description: event.target.value })} />
      </label>
      <div className="grid md:grid-cols-2 gap-4">
        <label>Priority<select className={inputClass} value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}>{['Low','Medium','High','Critical'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Record type<select className={inputClass} value={form.incident_type} onChange={event => setForm({ ...form, incident_type: event.target.value })}>{['Failure','Preventive'].map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      <label className="block">Additional remarks<input className={inputClass} maxLength={5000} value={form.remarks} onChange={event => setForm({ ...form, remarks: event.target.value })} /></label>
      {manager && <label className="block"><input type="checkbox" checked={form.source_type === "synthetic"} onChange={event => setForm({ ...form, source_type: event.target.checked ? "synthetic" : "real" })} /> Synthetic demo/test ticket — exclude from repair recommendations and health metrics</label>}
      <button disabled={busy} className="bg-orange-700 text-white px-5 py-3 rounded-lg disabled:opacity-50">{busy ? 'Saving…' : 'Report issue'}</button>
      <p className="text-sm text-gray-600">New tickets start Open. A manager assigns a technician. Reporting remains available when AI is offline.</p>
    </form>}
    {retired && <p>This asset is retired. Its maintenance history remains available.</p>}
    <h3 className="text-2xl font-bold">Maintenance history</h3>
    {!tickets.length && <p>No maintenance records yet.</p>}
    {tickets.map(item => {
      const values = drafts[item.id] || {};
      const next = (transitions[item.maintenance_status] || []).filter(value => manager || (item.technician_id === user?.id && ['In Progress', 'Resolved'].includes(value)));
      return <article key={item.id} className="border rounded-lg p-5 space-y-3">
        <h4 className="font-bold">#{item.id} · {item.issue_description}</h4>
        <p>{item.maintenance_status} · {item.priority} · {item.incident_type}{item.source_type === 'synthetic' ? ' · Synthetic test record' : ''}</p>
        <p>Technician: {item.assigned_technician || item.technician_name || 'Unassigned'}</p>
        <AITicketInsights ticket={item} manager={manager} canRetry={canMaintain() && (manager || item.reporter_id === user?.id || item.technician_id === user?.id)} onUpdated={refresh} />
        {item.remarks && <p>Remarks: {item.remarks}</p>}
        {item.resolution_summary && <p>Resolution: {item.resolution_summary}</p>}
        {item.verified_at && <p>Verified on {formatTimestamp(item.verified_at)} (Asia/Kolkata)</p>}
        {manager && ['Open', 'Assigned'].includes(item.maintenance_status) && <div className="flex gap-3">
          <select aria-label={'Technician for ticket ' + item.id} className={inputClass} value={values.technician_id ?? item.technician_id ?? ''} onChange={event => draft(item.id, 'technician_id', event.target.value)}>
            <option value="">Choose an active technician</option>{technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.full_name}</option>)}
          </select>
          <button disabled={busy || !(values.technician_id || item.technician_id)} className="border rounded px-4" onClick={() => action(() => api.put('/maintenance/' + item.id + '/assign', { technician_id: values.technician_id || item.technician_id }))}>Assign</button>
        </div>}
        {next.length > 0 && <div className="space-y-3">
          <select aria-label={'Next status for ticket ' + item.id} className={inputClass} value={values.status || ''} onChange={event => draft(item.id, 'status', event.target.value)}>
            <option value="">Choose next status</option>{next.filter(status => status !== 'Assigned' || item.technician_id).map(status => <option key={status}>{status}</option>)}
          </select>
          <textarea aria-label={'Resolution for ticket ' + item.id} placeholder="Diagnosis, repair performed and verification evidence" className={inputClass} maxLength={10000} value={values.resolution ?? item.resolution_summary ?? ''} onChange={event => draft(item.id, 'resolution', event.target.value)} />
          <button disabled={busy || !values.status} className="bg-blue-800 text-white px-4 py-2 rounded disabled:opacity-50" onClick={() => action(() => api.put('/maintenance/' + item.id + '/status', { maintenance_status: values.status, resolution_summary: values.resolution ?? item.resolution_summary }))}>Update status</button>
        </div>}
      </article>;
    })}
  </section>;
}

