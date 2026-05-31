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

// Handle 401 Unauthorized errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
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
