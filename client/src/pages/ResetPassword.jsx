import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
export default function ResetPassword() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { window.history.replaceState(null, '', window.location.pathname); }, []);
  async function submit(event) {
    event.preventDefault(); setBusy(true);
    try {
      const { data } = await api.post('/auth/reset-password', { token, new_password: password, confirm_password: confirmation });
      setMessage(data.message); setDone(true); localStorage.removeItem('token'); localStorage.removeItem('user');
    } catch (error) { setMessage(error.response?.data?.message || 'Recovery failed'); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen flex items-center justify-center bg-gray-200">
    <section className="bg-white p-10 rounded-3xl shadow-xl max-w-lg space-y-5">
      <h1 className="text-2xl font-bold">Set a new password</h1>
      {message && <p role="status">{message}</p>}
      {!token ? <p>This recovery link is missing its token. Request a new link.</p> : !done && <form onSubmit={submit} className="space-y-4">
        <label>New password<input className="border p-3 w-full rounded" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label>Confirm password<input className="border p-3 w-full rounded" type="password" autoComplete="new-password" required minLength={12} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        <button disabled={busy} className="bg-blue-800 text-white p-3 rounded">{busy ? 'Updating…' : 'Update password'}</button>
      </form>}
      <Link className="text-blue-700 underline" to="/">Back to login</Link>
    </section>
  </main>;
}

