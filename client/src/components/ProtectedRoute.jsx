import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import api from '../lib/api';
export default function ProtectedRoute() {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const expire = () => setExpired(true);
    const storage = event => { if (event.key === 'token') expire(); };
    window.addEventListener('smart-assets:session-expired', expire);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('smart-assets:session-expired', expire);
      window.removeEventListener('storage', storage);
    };
  }, []);
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    let active = true;
    const controller = new AbortController();
    api.get('/auth/me', { signal: controller.signal }).then(({ data }) => {
      if (!active) return;
      localStorage.setItem('user', JSON.stringify(data.user));
      setSession(data.user);
    }).catch(error => {
      if (active && error.code !== 'ERR_CANCELED') setError(error.response?.data?.message || 'Cannot reach the API. Please retry.');
    });
    return () => { active = false; controller.abort(); };
  }, []);
  if (expired || !localStorage.getItem('token')) return <Navigate to="/" replace />;
  if (error) return <main className="p-8" role="alert">{error} <button onClick={() => window.location.reload()}>Retry</button></main>;
  if (!session) return <p className="p-8" role="status">Checking your session…</p>;
  return <Outlet />;
}

