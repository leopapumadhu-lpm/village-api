import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

export const useAuth = () => {
  const store = useAuthStore();

  useEffect(() => {
    store.initAuth();
  }, []);

  return {
    token: store.token,
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    loading: store.loading,
    login: store.login,
    logout: store.logout,
    setUser: store.setUser,
  };
};
