import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const adminApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true, // 发送 httpOnly cookie
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor
adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default adminApi;
