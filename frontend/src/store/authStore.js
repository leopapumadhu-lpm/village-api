import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      loading: true,

      // Initialize from localStorage
      initAuth: () => {
        const stored = localStorage.getItem('authToken');
        if (stored) {
          set({ token: stored, isAuthenticated: true });
        }
        set({ loading: false });
      },

      // Login
      login: (token, user) => {
        localStorage.setItem('authToken', token);
        set({ token, user, isAuthenticated: true });
      },

      // Logout
      logout: () => {
        localStorage.removeItem('authToken');
        set({ token: null, user: null, isAuthenticated: false });
      },

      // Update user
      setUser: (user) => {
        set({ user });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
);
