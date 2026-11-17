import axios from 'axios';
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api', timeout: 10000 });
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});
api.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && !['/auth/login', '/auth/register'].includes(error.config?.url)) {
    const current = localStorage.getItem('token');
    const rejectedAuthorization = error.config?.headers?.get?.('Authorization') || error.config?.headers?.Authorization;
    // A delayed rejection from an old request must never clear a newer login.
    if (current && rejectedAuthorization === 'Bearer ' + current) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('smart-assets:session-expired'));
    }
  }
  return Promise.reject(error);
});
export default api;

