import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/auth';
import {
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  setTokens,
  setStoredUser,
  clearSession,
} from '../utils/storage';
import { USER_ROLES } from '../utils/constants';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(getStoredUser());
  const [token, setToken] = useState(getAccessToken());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Refresh user data from /api/auth/me
  const refreshUser = useCallback(async () => {
    try {
      const userData = await authApi.getMe();
      setUser(userData);
      setStoredUser(userData);
      return userData;
    } catch (err) {
      console.warn('Failed to fetch user profile:', err);
      return null;
    }
  }, []);

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = getAccessToken();
      if (storedToken) {
        setToken(storedToken);
        await refreshUser();
      }
      setLoading(false);
    };

    initAuth();

    // Listen for auth expired event dispatched by client.js interceptor
    const handleExpired = () => {
      clearSession();
      setUser(null);
      setToken(null);
    };
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, [refreshUser]);

  const login = async (email, password) => {
    setError(null);
    try {
      const tokenPair = await authApi.login(email, password);
      setTokens(tokenPair.access_token, tokenPair.refresh_token);
      setToken(tokenPair.access_token);

      const profile = await authApi.getMe();
      setUser(profile);
      setStoredUser(profile);
      return { success: true, user: profile };
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Login failed';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const register = async ({ email, password, full_name, role }) => {
    setError(null);
    try {
      const tokenPair = await authApi.register({ email, password, full_name, role });
      setTokens(tokenPair.access_token, tokenPair.refresh_token);
      setToken(tokenPair.access_token);

      const profile = await authApi.getMe();
      setUser(profile);
      setStoredUser(profile);
      return { success: true, user: profile };
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Registration failed';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const loginGoogle = async (credential) => {
    setError(null);
    try {
      const data = await authApi.loginGoogle(credential);
      setTokens(data.access_token, data.refresh_token);
      setToken(data.access_token);

      const profile = data.user || (await authApi.getMe());
      setUser(profile);
      setStoredUser(profile);
      return { success: true, user: profile };
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Google login failed';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const logout = () => {
    clearSession();
    setUser(null);
    setToken(null);
    setError(null);
  };

  const isProsumer = user?.role === USER_ROLES.PROSUMER;
  const isConsumer = user?.role === USER_ROLES.CONSUMER;
  const isAdmin = user?.role === USER_ROLES.ADMIN;
  const isAuthenticated = !!token && !!user;

  const value = {
    user,
    token,
    loading,
    error,
    login,
    loginGoogle,
    register,
    logout,
    refreshUser,
    isAuthenticated,
    isProsumer,
    isConsumer,
    isAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
