import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

/**
 * Custom hook for authentication
 * Provides access to auth state and methods with performance optimizations
 */
export const useAuth = () => {
  const store = useAuthStore();
  const initCalled = useRef(false);

  // Initialize auth only once
  useEffect(() => {
    if (!initCalled.current && typeof store.initAuth === 'function') {
      initCalled.current = true;
      store.initAuth();
    }
  }, [store]);

  // Memoized login function to prevent unnecessary re-renders
  const login = useCallback(async (email, password, rememberMe = false) => {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }
    
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    
    try {
      await store.login(email, password, rememberMe);
      return { success: true };
    } catch (error) {
      console.error('Login error:', error.message);
      throw error;
    }
  }, [store]);

  // Memoized logout function
  const logout = useCallback(async () => {
    try {
      await store.logout();
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error.message);
      throw error;
    }
  }, [store]);

  // Memoized update profile function
  const updateProfile = useCallback(async (profileData) => {
    if (!store.token) {
      throw new Error('Not authenticated');
    }
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/b2b/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${store.token}`
        },
        body: JSON.stringify(profileData)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update profile');
      }
      
      const data = await response.json();
      store.setUser(data.data);
      return { success: true, user: data.data };
    } catch (error) {
      console.error('Profile update error:', error.message);
      throw error;
    }
  }, [store]);

  // Memoized change password function
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    if (!store.token) {
      throw new Error('Not authenticated');
    }
    
    if (!currentPassword || !newPassword) {
      throw new Error('Current password and new password are required');
    }
    
    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters');
    }
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/b2b/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${store.token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to change password');
      }
      
      return { success: true };
    } catch (error) {
      console.error('Password change error:', error.message);
      throw error;
    }
  }, [store.token]);

  // Memoized refresh token function
  const refreshToken = useCallback(async () => {
    if (!store.refreshToken) {
      throw new Error('No refresh token available');
    }
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: store.refreshToken })
      });
      
      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }
      
      const data = await response.json();
      store.setToken(data.data.accessToken);
      return { success: true, token: data.data.accessToken };
    } catch (error) {
      console.error('Token refresh error:', error.message);
      // If refresh fails, logout
      await store.logout();
      throw error;
    }
  }, [store]);

  // Memoized check role function
  const hasRole = useCallback((role) => {
    if (!store.user) return false;
    
    if (Array.isArray(role)) {
      return role.includes(store.user.role);
    }
    
    return store.user.role === role;
  }, [store.user]);

  // Memoized check permission function
  const hasPermission = useCallback((permission) => {
    if (!store.user) return false;
    
    // Define role-based permissions
    const permissions = {
      admin: ['*'], // Admin has all permissions
      owner: ['view_dashboard', 'manage_api_keys', 'view_analytics', 'manage_webhooks', 'manage_teams'],
      member: ['view_dashboard', 'view_api_keys', 'view_analytics'],
      viewer: ['view_dashboard']
    };
    
    const userPermissions = permissions[store.user.role] || permissions.viewer;
    
    if (userPermissions.includes('*')) return true;
    return userPermissions.includes(permission);
  }, [store.user]);

  // Memoized auth state to prevent unnecessary re-renders
  const authState = useMemo(() => ({
    token: store.token,
    user: store.user,
    refreshToken: store.refreshToken,
    isAuthenticated: store.isAuthenticated,
    loading: store.loading,
    error: store.error,
    role: store.user?.role,
    businessName: store.user?.businessName,
    email: store.user?.email,
    planType: store.user?.planType,
  }), [store.token, store.user, store.refreshToken, store.isAuthenticated, store.loading, store.error]);

  // Return memoized object to prevent unnecessary re-renders of consumers
  return useMemo(() => ({
    ...authState,
    login,
    logout,
    updateProfile,
    changePassword,
    refreshToken,
    hasRole,
    hasPermission,
    setUser: store.setUser,
    clearError: store.clearError,
  }), [
    authState,
    login,
    logout,
    updateProfile,
    changePassword,
    refreshToken,
    hasRole,
    hasPermission,
    store.setUser,
    store.clearError
  ]);
};

/**
 * Hook for protected routes
 * Redirects to login if not authenticated
 */
export const useRequireAuth = (redirectTo = '/login') => {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate(redirectTo);
    }
  }, [isAuthenticated, loading, navigate, redirectTo]);
  
  return { isAuthenticated, loading };
};

/**
 * Hook for role-based access control
 * Redirects if user doesn't have required role
 */
export const useRequireRole = (allowedRoles, redirectTo = '/dashboard') => {
  const { user, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        navigate('/login');
      } else if (user && !allowedRoles.includes(user.role)) {
        navigate(redirectTo);
      }
    }
  }, [isAuthenticated, loading, user, allowedRoles, navigate, redirectTo]);
  
  return { 
    user, 
    isAuthenticated, 
    loading, 
    hasAccess: isAuthenticated && user && allowedRoles.includes(user.role) 
  };
};

/**
 * Hook for session management
 * Handles automatic token refresh and session persistence
 */
export const useSessionManagement = () => {
  const { refreshToken, logout } = useAuth();
  const intervalRef = useRef(null);
  const refreshAttempts = useRef(0);
  const MAX_REFRESH_ATTEMPTS = 3;
  
  useEffect(() => {
    // Refresh token every 10 minutes (assuming 15min expiry)
    intervalRef.current = setInterval(async () => {
      try {
        await refreshToken();
        refreshAttempts.current = 0; // Reset attempts on success
        console.log('Token refreshed successfully');
      } catch (error) {
        console.error('Failed to refresh token:', error);
        refreshAttempts.current++;
        
        // If multiple refresh attempts fail, force logout
        if (refreshAttempts.current >= MAX_REFRESH_ATTEMPTS) {
          console.warn('Multiple refresh failures, logging out');
          await logout();
        }
      }
    }, 10 * 60 * 1000); // 10 minutes
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refreshToken, logout]);
  
  // Handle visibility change - refresh token when tab becomes active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshToken().catch(console.error);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshToken]);
  
  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('Connection restored');
      refreshToken().catch(console.error);
    };
    
    const handleOffline = () => {
      console.warn('Connection lost');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshToken]);
  
  // Handle beforeunload - clear sensitive data
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Clear sensitive data from memory (optional)
      sessionStorage.removeItem('temp_data');
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
  
  return { refreshToken, logout };
};

/**
 * Hook for login form handling
 * Manages form state, validation, and submission
 */
export const useLoginForm = () => {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  
  const handleSubmit = useCallback(async (e) => {
    if (e) e.preventDefault();
    
    // Validate form
    if (!email.trim()) {
      setError('Email is required');
      return { success: false, error: 'Email is required' };
    }
    
    if (!password) {
      setError('Password is required');
      return { success: false, error: 'Password is required' };
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await login(email, password, rememberMe);
      return result;
    } catch (err) {
      const errorMessage = err.message || 'Login failed. Please try again.';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [email, password, rememberMe, login]);
  
  const resetForm = useCallback(() => {
    setEmail('');
    setPassword('');
    setRememberMe(false);
    setError(null);
  }, []);
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  return {
    // Form state
    email,
    setEmail,
    password,
    setPassword,
    rememberMe,
    setRememberMe,
    loading,
    error,
    // Form actions
    handleSubmit,
    resetForm,
    clearError
  };
};

/**
 * Hook for registration form handling
 */
export const useRegisterForm = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    businessName: '',
    phone: '',
    gstNumber: '',
    password: '',
    confirmPassword: ''
  });
  
  const updateField = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (error) setError(null);
  }, [error]);
  
  const handleSubmit = useCallback(async (e) => {
    if (e) e.preventDefault();
    
    // Validate form
    if (!formData.email.trim()) {
      setError('Email is required');
      return { success: false, error: 'Email is required' };
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Invalid email format');
      return { success: false, error: 'Invalid email format' };
    }
    
    if (!formData.businessName.trim()) {
      setError('Business name is required');
      return { success: false, error: 'Business name is required' };
    }
    
    if (!formData.password) {
      setError('Password is required');
      return { success: false, error: 'Password is required' };
    }
    
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return { success: false, error: 'Password must be at least 8 characters' };
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return { success: false, error: 'Passwords do not match' };
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          businessName: formData.businessName,
          phone: formData.phone,
          gstNumber: formData.gstNumber,
          password: formData.password
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }
      
      setSuccess(true);
      return { success: true, data: data.data };
    } catch (err) {
      const errorMessage = err.message || 'Registration failed. Please try again.';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [formData]);
  
  const resetForm = useCallback(() => {
    setFormData({
      email: '',
      businessName: '',
      phone: '',
      gstNumber: '',
      password: '',
      confirmPassword: ''
    });
    setError(null);
    setSuccess(false);
  }, []);
  
  return {
    formData,
    updateField,
    loading,
    error,
    success,
    handleSubmit,
    resetForm
  };
};

/**
 * Hook for password reset
 */
export const usePasswordReset = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const requestReset = useCallback(async (email) => {
    if (!email) {
      setError('Email is required');
      return { success: false, error: 'Email is required' };
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Password reset request failed');
      }
      
      setSuccess(true);
      return { success: true };
    } catch (err) {
      const errorMessage = err.message || 'Failed to send reset email';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);
  
  const resetPassword = useCallback(async (token, newPassword) => {
    if (!token) {
      setError('Reset token is required');
      return { success: false, error: 'Reset token is required' };
    }
    
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return { success: false, error: 'Password must be at least 8 characters' };
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, newPassword })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Password reset failed');
      }
      
      setSuccess(true);
      return { success: true };
    } catch (err) {
      const errorMessage = err.message || 'Failed to reset password';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);
  
  return {
    requestReset,
    resetPassword,
    loading,
    error,
    success,
    clearError: () => setError(null),
    clearSuccess: () => setSuccess(false)
  };
};

// Export types for TypeScript support (if using TypeScript)
export const AuthTypes = {
  ROLE_ADMIN: 'admin',
  ROLE_OWNER: 'owner',
  ROLE_MEMBER: 'member',
  ROLE_VIEWER: 'viewer',
  
  PERMISSIONS: {
    VIEW_DASHBOARD: 'view_dashboard',
    MANAGE_API_KEYS: 'manage_api_keys',
    VIEW_ANALYTICS: 'view_analytics',
    MANAGE_WEBHOOKS: 'manage_webhooks',
    MANAGE_TEAMS: 'manage_teams'
  }
};

export default useAuth;
