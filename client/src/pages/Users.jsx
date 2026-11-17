import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { currentUser } from '../lib/permissions';
import MainLayout from '../layouts/MainLayout';
export default function Users() {
  const allowed = currentUser()?.role_name === 'Super Admin';
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback((signal) => Promise.all([api.get('/users', { signal }), api.get('/users/roles', { signal })]).then(([users, roles]) => {
    setUsers(users.data); setRoles(roles.data);
  }).catch(error => { if (error.code !== 'ERR_CANCELED') setError(error.response?.data?.message || 'Cannot load users'); }), []);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController(); refresh(controller.signal);
    return () => controller.abort();
  }, [allowed, refresh]);
  async function save(user) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api.put('/users/' + user.id, drafts[user.id] || { role_id: user.role_id, is_active: Boolean(user.is_active) });
      setNotice('Access updated. The user must sign in again.'); await refresh();
    } catch (error) { setError(error.response?.data?.message || 'Update failed'); }
    finally { setBusy(false); }
  }
  return <MainLayout><section className="bg-white p-8 rounded-xl space-y-5">
    <h1 className="text-3xl font-bold">User access</h1>
    {!allowed ? <p>Only a Super Admin can manage access.</p> : <>
      <p>New registrations receive Viewer access. Promote verified group members here. The last active Super Admin cannot be removed.</p>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {users.map(user => {
        const values = drafts[user.id] || { role_id: user.role_id, is_active: Boolean(user.is_active) };
        return <div className="border p-4 rounded grid md:grid-cols-4 gap-4 items-center" key={user.id}>
          <div><strong>{user.full_name}</strong><p>{user.email}</p></div>
          <select aria-label={'Role for ' + user.full_name} value={values.role_id} onChange={event => setDrafts({ ...drafts, [user.id]: { ...values, role_id: Number(event.target.value) } })}>{roles.map(role => <option key={role.id} value={role.id}>{role.role_name}</option>)}</select>
          <label><input type="checkbox" checked={values.is_active} onChange={event => setDrafts({ ...drafts, [user.id]: { ...values, is_active: event.target.checked } })} /> Active</label>
          <button disabled={busy} className="bg-blue-800 text-white p-2 rounded disabled:opacity-50" onClick={() => save(user)}>Save access</button>
        </div>;
      })}
    </>}
  </section></MainLayout>;
}

