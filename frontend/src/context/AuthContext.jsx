import { createContext, useState, useContext, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setUser(parsed);
      // Fetch latest profile & hotel details from backend DB to overwrite stale localStorage cache
      api.get('/profile').then(res => {
        if (res.data && res.data.user) {
          api.get('/auth/subscription-status').then(subRes => {
            const freshUser = {
              ...parsed,
              name: res.data.user.name || parsed.name,
              email: res.data.user.email || parsed.email,
              hotel_name: res.data.user.hotel_name || parsed.hotel_name,
              hotel_location: res.data.user.hotel_location || parsed.hotel_location,
              hotel_phone: res.data.user.hotel_phone || parsed.hotel_phone,
              upi_id: res.data.user.upi_id || parsed.upi_id,
              gst_percentage: res.data.user.gst_percentage ?? parsed.gst_percentage,
              fssai_number: res.data.user.fssai_number || parsed.fssai_number,
              licenseWarning: subRes.data.warning,
              offlineDays: subRes.data.offlineDays
            };
            localStorage.setItem('user', JSON.stringify(freshUser));
            setUser(freshUser);
          }).catch(() => {
            const freshUser = {
              ...parsed,
              name: res.data.user.name || parsed.name,
              email: res.data.user.email || parsed.email,
              hotel_name: res.data.user.hotel_name || parsed.hotel_name,
              hotel_location: res.data.user.hotel_location || parsed.hotel_location,
              hotel_phone: res.data.user.hotel_phone || parsed.hotel_phone,
              upi_id: res.data.user.upi_id || parsed.upi_id,
              gst_percentage: res.data.user.gst_percentage ?? parsed.gst_percentage,
              fssai_number: res.data.user.fssai_number || parsed.fssai_number,
            };
            localStorage.setItem('user', JSON.stringify(freshUser));
            setUser(freshUser);
          });
        }
      }).catch(() => {});
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateUser = (newData) => {
    const updated = { ...user, ...newData };
    localStorage.setItem('user', JSON.stringify(updated));
    setUser(updated);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
