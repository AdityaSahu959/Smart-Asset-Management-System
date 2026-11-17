import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import MainLayout from '../layouts/MainLayout';
import { canManage } from '../lib/permissions';
export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ category_name: '', description: '' });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback((signal) => api.get('/categories', { signal }).then(({data}) => setCategories(data)).catch(error => {
    if (error.code !== 'ERR_CANCELED') setError(error.response?.data?.message || 'Cannot load categories');
  }), []);
  useEffect(() => { const controller = new AbortController(); refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (editing) await api.put('/categories/' + editing, form); else await api.post('/categories', form);
      setEditing(null); setForm({ category_name: '', description: '' }); await refresh();
    } catch (error) { setError(error.response?.data?.message || 'Cannot save category'); }
    finally { setBusy(false); }
  }
  return <MainLayout><section className="bg-white p-8 rounded-xl space-y-5">
    <h1 className="text-3xl font-bold">Asset categories</h1>
    {error && <p role="alert">{error}</p>}
    {canManage() && <form onSubmit={submit} className="space-y-3">
      <label className="block">Category name<input className="border rounded p-3 w-full" required maxLength={100} value={form.category_name} onChange={event => setForm({ ...form, category_name: event.target.value })} /></label>
      <label className="block">Description<textarea className="border rounded p-3 w-full" maxLength={5000} value={form.description || ''} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
      <button disabled={busy} className="bg-blue-800 text-white px-4 py-2 rounded">{busy ? 'Saving…' : editing ? 'Update category' : 'Create category'}</button>
      {editing && <button type="button" className="border rounded px-4 py-2 ml-3" onClick={() => { setEditing(null); setForm({ category_name: '', description: '' }); }}>Cancel</button>}
    </form>}
    {!categories.length && <p>No categories yet.</p>}
    {categories.map(category => <article className="border rounded p-4" key={category.id}>
      <h2 className="font-bold">{category.category_name}</h2><p>{category.description}</p>
      {canManage() && <button className="border rounded px-3 py-1 mt-2" onClick={() => { setEditing(category.id); setForm({ category_name: category.category_name, description: category.description || '' }); }}>Edit category</button>}
    </article>)}
  </section></MainLayout>;
}

