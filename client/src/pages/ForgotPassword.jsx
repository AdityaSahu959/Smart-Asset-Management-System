import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
export default function ForgotPassword() {
  const [available, setAvailable] = useState(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api.get('/auth/recovery-status', { signal: controller.signal }).then(({data}) => setAvailable(data.available)).catch(error => {
      if (error.code !== 'ERR_CANCELED') setMessage('Cannot reach recovery service. Please retry.');
    });
    return () => controller.abort();
  }, []);
  async function submit(event) {
    event.preventDefault(); setBusy(true);
    try { const { data } = await api.post('/auth/forgot-password', { email }); setMessage(data.message); }
    catch (error) { setMessage(error.response?.data?.message || 'Recovery request failed'); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen flex items-center justify-center bg-gray-200">
    <section className="bg-white p-10 rounded-3xl shadow-xl max-w-lg space-y-5">
      <h1 className="text-2xl font-bold">Account recovery</h1>
      {message && <p role="status">{message}</p>}
      {available === null && !message && <p>Checking recovery service…</p>}
      {available === false && <p>Email recovery is not configured on this installation. Contact your project administrator.</p>}
      {available && <form onSubmit={submit} className="space-y-4">
        <label>Registered email<input className="border p-3 w-full rounded" type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        <button disabled={busy} className="bg-blue-800 text-white p-3 rounded">{busy ? 'Requesting…' : 'Request recovery link'}</button>
      </form>}
      <Link className="text-blue-700 underline" to="/">Back to login</Link>
    </section>
  </main>;
}
