import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types/index.js';
import { api, setAccessToken, setOnUnauthenticated, resolveApiUrl, API_BASE_URL } from '../api/client.js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  initError: string | null;
  retryInit: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [initError, setInitError] = useState<string | null>(null);

  const refreshSession = async (): Promise<boolean> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const refreshEndpoint = resolveApiUrl('/api/auth/refresh');
      const res = await fetch(refreshEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        setAccessToken(data.accessToken);
        setUser(data.user);
        setInitError(null);
        return true;
      } else {
        setAccessToken(null);
        setUser(null);
        setInitError(null);
        return false;
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      setAccessToken(null);
      setUser(null);
      const targetHost = API_BASE_URL || 'http://localhost:5000 (port 5000)';
      if (err.name === 'AbortError') {
        setInitError(`Connection timed out while reaching backend service on port 5000 at ${targetHost}.`);
      } else if (err.message && err.message.toLowerCase().includes('failed to fetch')) {
        setInitError(`Unable to connect to backend service at ${targetHost}. Please ensure the backend server is active.`);
      } else {
        setInitError(err.message || 'Session initialization failed unexpectedly.');
      }
      return false;
    }
  };

  const retryInit = async (): Promise<void> => {
    setLoading(true);
    setInitError(null);
    try {
      await refreshSession();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setOnUnauthenticated(() => {
      setUser(null);
    });

    let didCancel = false;
    // Hard safety timeout: guaranteed release from loading state under any scenario
    const safetyTimer = setTimeout(() => {
      if (!didCancel) {
        setLoading(false);
      }
    }, 7000);

    // Silent refresh on app load
    refreshSession().finally(() => {
      if (!didCancel) {
        clearTimeout(safetyTimer);
        setLoading(false);
      }
    });

    return () => {
      didCancel = true;
      clearTimeout(safetyTimer);
    };
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    const data = await api.post('/api/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  const register = async (email: string, password: string, displayName: string): Promise<void> => {
    const data = await api.post('/api/auth/register', { email, password, displayName });
    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  const logout = async (): Promise<void> => {
    try {
      await api.post('/api/auth/logout');
    } catch (err) {
      console.warn('Logout request failed:', err);
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        initError,
        retryInit,
        login,
        register,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
