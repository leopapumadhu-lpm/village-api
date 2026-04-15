import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Helper function to safely parse JSON
const safeJsonParse = (value, defaultValue = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
};

// Helper function to check token expiration
const isTokenExpired = (token) => {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
};

// Helper function to decode token payload
const decodeToken = (token) => {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
};

export const useAuthStore = create(
  persist(
    (set, get) => ({
      // State
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      loading: true,
      error: null,
      tokenExpiry: null,

      // Initialize from storage and validate token
      initAuth: () => {
        const storedToken = localStorage.getItem('authToken');
        const storedRefreshToken = localStorage.getItem('refreshToken');
        const storedUser = localStorage.getItem('authUser');
        
        let isValid = false;
        let userData = null;
        
        if (storedToken && !isTokenExpired(storedToken)) {
          isValid = true;
          userData = storedUser ? safeJsonParse(storedUser) : decodeToken(storedToken);
          
          // Set up auto-refresh if token is near expiry
          const tokenPayload = decodeToken(storedToken);
          if (tokenPayload && tokenPayload.exp) {
            const timeUntilExpiry = tokenPayload.exp * 1000 - Date.now();
            if (timeUntilExpiry < 5 * 60 * 1000) { // Less than 5 minutes
              get().refreshTokenIfNeeded();
            }
          }
        } else if (storedToken && isTokenExpired(storedToken)) {
          // Token expired, try to refresh
          console.log('Token expired, attempting refresh...');
          get().refreshTokenIfNeeded();
        }
        
        set({ 
          token: isValid ? storedToken : null,
          refreshToken: storedRefreshToken || null,
          user: isValid ? userData : null,
          isAuthenticated: isValid,
          loading: false,
          error: isValid ? null : 'Session expired'
        });
      },

      // Login with email/password
      login: async (email, password, rememberMe = false) => {
        set({ loading: true, error: null });
        
        try {
          const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            throw new Error(data.error || 'Login failed');
          }
          
          const { accessToken, user } = data.data;
          
          // Store tokens
          if (rememberMe) {
            localStorage.setItem('authToken', accessToken);
            localStorage.setItem('authUser', JSON.stringify(user));
          } else {
            sessionStorage.setItem('authToken', accessToken);
            sessionStorage.setItem('authUser', JSON.stringify(user));
          }
          
          // Decode token to get expiry
          const tokenPayload = decodeToken(accessToken);
          
          set({
            token: accessToken,
            user,
            isAuthenticated: true,
            loading: false,
            error: null,
            tokenExpiry: tokenPayload?.exp ? tokenPayload.exp * 1000 : null
          });
          
          // Set up auto-refresh
          get().scheduleTokenRefresh();
          
          return { success: true, user };
        } catch (error) {
          set({ 
            loading: false, 
            error: error.message,
            isAuthenticated: false,
            token: null,
            user: null
          });
          throw error;
        }
      },

      // Logout
      logout: async () => {
        try {
          // Call logout endpoint if available
          const token = get().token;
          if (token) {
            await fetch(`${import.meta.env.VITE_API_URL}/auth/logout`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }).catch(() => {});
          }
        } finally {
          // Clear all storage
          localStorage.removeItem('authToken');
          localStorage.removeItem('authUser');
          localStorage.removeItem('refreshToken');
          sessionStorage.removeItem('authToken');
          sessionStorage.removeItem('authUser');
          
          // Clear refresh timer
          if (get().refreshTimer) {
            clearTimeout(get().refreshTimer);
          }
          
          set({
            token: null,
            refreshToken: null,
            user: null,
            isAuthenticated: false,
            loading: false,
            error: null,
            tokenExpiry: null,
          });
        }
      },

      // Set token manually
      setToken: (token) => {
        const tokenPayload = decodeToken(token);
        localStorage.setItem('authToken', token);
        set({ 
          token, 
          isAuthenticated: true,
          tokenExpiry: tokenPayload?.exp ? tokenPayload.exp * 1000 : null
        });
        get().scheduleTokenRefresh();
      },

      // Set user
      setUser: (user) => {
        localStorage.setItem('authUser', JSON.stringify(user));
        set({ user });
      },

      // Set error
      setError: (error) => {
        set({ error });
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },

      // Refresh token
      refreshTokenIfNeeded: async () => {
        const { token, refreshToken, isAuthenticated } = get();
        
        if (!isAuthenticated || !token) {
          return false;
        }
        
        // Check if token is expired or about to expire (within 5 minutes)
        if (token && !isTokenExpired(token)) {
          const tokenPayload = decodeToken(token);
          if (tokenPayload && tokenPayload.exp) {
            const timeUntilExpiry = tokenPayload.exp * 1000 - Date.now();
            if (timeUntilExpiry > 5 * 60 * 1000) {
              return true; // Token is still valid
            }
          }
        }
        
        try {
          const refreshTokenValue = refreshToken || localStorage.getItem('refreshToken');
          if (!refreshTokenValue) {
            throw new Error('No refresh token available');
          }
          
          const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshToken: refreshTokenValue }),
          });
          
          if (!response.ok) {
            throw new Error('Refresh failed');
          }
          
          const data = await response.json();
          const newToken = data.data.accessToken;
          
          // Update stored token
          localStorage.setItem('authToken', newToken);
          
          const tokenPayload = decodeToken(newToken);
          set({
            token: newToken,
            tokenExpiry: tokenPayload?.exp ? tokenPayload.exp * 1000 : null,
            error: null
          });
          
          // Schedule next refresh
          get().scheduleTokenRefresh();
          
          return true;
        } catch (error) {
          console.error('Token refresh failed:', error);
          // Only logout if we were previously authenticated
          if (get().isAuthenticated) {
            await get().logout();
          }
          return false;
        }
      },

      // Schedule automatic token refresh
      scheduleTokenRefresh: () => {
        const { token, refreshTimer } = get();
        
        // Clear existing timer
        if (refreshTimer) {
          clearTimeout(refreshTimer);
        }
        
        if (!token) return;
        
        const tokenPayload = decodeToken(token);
        if (!tokenPayload || !tokenPayload.exp) return;
        
        const timeUntilExpiry = tokenPayload.exp * 1000 - Date.now();
        const refreshTime = Math.max(0, timeUntilExpiry - 2 * 60 * 1000); // Refresh 2 minutes before expiry
        
        if (refreshTime > 0) {
          const timer = setTimeout(() => {
            get().refreshTokenIfNeeded();
          }, refreshTime);
          
          set({ refreshTimer: timer });
        }
      },

      // Check if user has specific role
      hasRole: (role) => {
        const { user } = get();
        if (!user) return false;
        if (Array.isArray(role)) {
          return role.includes(user.role);
        }
        return user.role === role;
      },

      // Check if user has permission
      hasPermission: (permission) => {
        const { user } = get();
        if (!user) return false;
        
        const permissions = {
          admin: ['*'],
          owner: ['view_dashboard', 'manage_api_keys', 'view_analytics', 'manage_webhooks', 'manage_teams'],
          member: ['view_dashboard', 'view_api_keys', 'view_analytics'],
          viewer: ['view_dashboard']
        };
        
        const userPermissions = permissions[user.role] || permissions.viewer;
        return userPermissions.includes('*') || userPermissions.includes(permission);
      },

      // Update user profile
      updateUser: async (profileData) => {
        const { token } = get();
        if (!token) throw new Error('Not authenticated');
        
        set({ loading: true, error: null });
        
        try {
          const response = await fetch(`${import.meta.env.VITE_API_URL}/b2b/profile`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(profileData),
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            throw new Error(data.error || 'Failed to update profile');
          }
          
          const updatedUser = { ...get().user, ...data.data };
          localStorage.setItem('authUser', JSON.stringify(updatedUser));
          set({ user: updatedUser, loading: false });
          
          return { success: true, user: updatedUser };
        } catch (error) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      // Change password
      changePassword: async (currentPassword, newPassword) => {
        const { token } = get();
        if (!token) throw new Error('Not authenticated');
        
        set({ loading: true, error: null });
        
        try {
          const response = await fetch(`${import.meta.env.VITE_API_URL}/b2b/change-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ currentPassword, newPassword }),
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            throw new Error(data.error || 'Failed to change password');
          }
          
          set({ loading: false });
          return { success: true };
        } catch (error) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      // Get auth headers for API calls
      getAuthHeaders: () => {
        const { token } = get();
        if (!token) return {};
        return { 'Authorization': `Bearer ${token}` };
      },

      // Check if token is valid
      isTokenValid: () => {
        const { token } = get();
        return !isTokenExpired(token);
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // Only persist these fields
        refreshToken: state.refreshToken,
        user: state.user,
      }),
      // Custom storage with sessionStorage support
      storage: {
        getItem: (name) => {
          const value = localStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
      // Version for migrations
      version: 1,
      // Migration function for schema changes
      migrate: (persistedState, version) => {
        if (version === 0) {
          // Migrate from v0 to v1
          return {
            ...persistedState,
            refreshToken: null,
          };
        }
        return persistedState;
      },
    }
  )
);

// Selector hooks for better performance
export const useAuthToken = () => useAuthStore((state) => state.token);
export const useAuthUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthLoading = () => useAuthStore((state) => state.loading);
export const useAuthError = () => useAuthStore((state) => state.error);
export const useHasRole = (role) => {
  const hasRoleFn = useAuthStore((state) => state.hasRole);
  return hasRoleFn(role);
};
export const useHasPermission = (permission) => {
  const hasPermissionFn = useAuthStore((state) => state.hasPermission);
  return hasPermissionFn(permission);
};

// Initialize auth on store creation
if (typeof window !== 'undefined') {
  // Small delay to ensure store is ready
  setTimeout(() => {
    const store = useAuthStore.getState();
    if (store.initAuth && !store.isAuthenticated && !store.loading) {
      store.initAuth();
    }
  }, 0);
}

export default useAuthStore;