import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types/index.js';
import { api, setAccessToken, setOnUnauthenticated } from '../api/client.js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshSession = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setAccessToken(data.accessToken);
        setUser(data.user);
        return true;
      } else {
        setAccessToken(null);
        setUser(null);
        return false;
      }
    } catch (err) {
      setAccessToken(null);
      setUser(null);
      return false;
    }
  };

  useEffect(() => {
    setOnUnauthenticated(() => {
      setUser(null);
    });

    // Silent refresh on app load
    refreshSession().finally(() => {
      setLoading(false);
    });
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
