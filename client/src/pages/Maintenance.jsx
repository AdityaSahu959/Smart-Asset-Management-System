import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import MainLayout from '../layouts/MainLayout';
import { currentUser } from '../lib/permissions';
export default function Maintenance() {
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState('');
  const [assignedOnly, setAssignedOnly] = useState(false);
  const user = currentUser();
  useEffect(() => {
    const controller = new AbortController();
    api.get('/maintenance', { signal: controller.signal }).then(({data}) => setTickets(data)).catch(error => {
      if (error.code !== 'ERR_CANCELED') setError(error.response?.data?.message || 'Cannot load tickets');
    });
    return () => controller.abort();
  }, []);
  const visible = tickets.filter(ticket => !assignedOnly || ticket.technician_id === user?.id);
  return <MainLayout><section className="bg-white p-8 rounded-xl space-y-5">
    <h1 className="text-3xl font-bold">Maintenance tickets</h1>
    {error && <p role="alert">{error}</p>}
    <label><input type="checkbox" checked={assignedOnly} onChange={event => setAssignedOnly(event.target.checked)} /> Assigned to me</label>
    {!visible.length && <p>No matching tickets. Open an asset from Labs to view its history or report an issue.</p>}
    {visible.map(ticket => <article key={ticket.id} className="border rounded p-4">
      <Link className="text-blue-800 underline font-bold" to={'/asset/' + ticket.asset_id}>#{ticket.id} · {ticket.issue_description}</Link>
      <p>{ticket.maintenance_status} · {ticket.priority} · {ticket.assigned_technician || 'Unassigned'}{ticket.source_type === 'synthetic' ? ' · Synthetic test record' : ''}</p>
    </article>)}
  </section></MainLayout>;
}

