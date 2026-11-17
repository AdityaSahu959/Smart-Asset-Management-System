import { LayoutDashboard, Building2, Users, Wrench, LogOut, ShieldCheck, Tags } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { currentUser } from '../lib/permissions';
export default function Sidebar() {
  const user = currentUser();
  const links = [
    ['/dashboard', 'Dashboard', LayoutDashboard],
    ['/labs', 'Labs, assets & QR', Building2],
    ['/categories', 'Categories', Tags],
    ['/maintenance', 'Maintenance', Wrench],
    ...(['Super Admin', 'Admin'].includes(user?.role_name) ? [['/audit', 'Audit integrity', ShieldCheck]] : []),
    ...(user?.role_name === 'Super Admin' ? [['/users', 'User access', Users]] : []),
  ];
  function logout() { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.assign('/'); }
  return <aside className="w-full md:w-[260px] shrink-0 md:min-h-screen bg-blue-950 text-white p-6">
    <h1 className="text-2xl font-bold">Smart Asset Management</h1>
    <p className="text-blue-200 mt-3 mb-8">{user?.full_name}<br />{user?.role_name}</p>
    <nav className="space-y-3">{links.map(([route, label, Icon]) => <NavLink key={route} to={route} className={({isActive}) => 'flex gap-3 items-center p-3 rounded-lg ' + (isActive ? 'bg-blue-700' : 'hover:bg-blue-900')}><Icon size={20} />{label}</NavLink>)}</nav>
    <button onClick={logout} className="mt-12 flex items-center gap-3 bg-red-700 p-3 rounded-lg w-full"><LogOut size={20} />Logout</button>
  </aside>;
}
