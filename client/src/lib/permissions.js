export function currentUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}
export function canManage() { return ['Super Admin', 'Admin'].includes(currentUser()?.role_name); }
export function canMaintain() { return ['Super Admin', 'Admin', 'Technician'].includes(currentUser()?.role_name); }

