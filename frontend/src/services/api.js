import axios from 'axios';

let apiBaseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
  const host = window.location.hostname;
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    apiBaseURL = `${window.location.protocol}//${window.location.host}/api`;
  }
}

const api = axios.create({
  baseURL: apiBaseURL,
});

// Add token to each request if it exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 Unauthorized and 403 Forbidden/Revoked errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      const data = error.response?.data;
      const type = data?.message || 'SERVICE_BLOCKED';
      const reason = data?.reason || 'Hardware Access Revoked by Super Admin. Contact Support: 9822401802';
      localStorage.setItem('revoked_type', type);
      localStorage.setItem('revoked_reason', reason);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      if (window.location.protocol === 'file:' || window.location.href.includes('#')) {
        window.location.hash = '#/login';
      } else {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
