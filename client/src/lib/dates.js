export const APP_TIME_ZONE = import.meta.env.VITE_TIME_ZONE || 'Asia/Kolkata';
export function formatTimestamp(value) {
  if (!value) return 'Not recorded';
  const text = String(value);
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text) ? text.replace(' ', 'T') + 'Z' : text;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-IN', { timeZone: APP_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Unknown date';
}

