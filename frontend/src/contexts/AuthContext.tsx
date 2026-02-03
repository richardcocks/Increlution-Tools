/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api } from '../services/api';
import type { UserInfo } from '../types/auth';

interface AuthContextValue {
  user: UserInfo | null;
  loading: boolean;
  loginWithDiscord: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  guestMode?: boolean;
}

export function AuthProvider({ children, guestMode }: AuthProviderProps) {
  const [user, setUser] = useState<UserInfo | null>(
    guestMode ? { id: -1, username: 'Guest' } : null
  );
  const [loading, setLoading] = useState(!guestMode);

  useEffect(() => {
    if (guestMode) return;
    api.getCurrentUser()
      .then(setUser)
      .finally(() => setLoading(false));
  }, [guestMode]);

  const loginWithDiscord = useCallback(() => {
    window.location.href = api.getDiscordLoginUrl();
  }, []);

  const logout = useCallback(async () => {
    if (guestMode) return;
    await api.logout();
    setUser(null);
  }, [guestMode]);

  const refreshUser = useCallback(async () => {
    if (guestMode) return;
    const currentUser = await api.getCurrentUser();
    setUser(currentUser);
  }, [guestMode]);

  return (
    <AuthContext.Provider value={{ user, loading, loginWithDiscord, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
