/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api } from '../services/api';
import type { SavedShare } from '../types/models';
import { useAuth } from './AuthContext';

interface SavedSharesContextValue {
  savedShares: SavedShare[];
  loading: boolean;
  saveShare: (token: string) => Promise<SavedShare>;
  removeSavedShare: (id: number) => Promise<void>;
  refreshSavedShares: () => Promise<void>;
}

const SavedSharesContext = createContext<SavedSharesContextValue | null>(null);

export function SavedSharesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [savedShares, setSavedShares] = useState<SavedShare[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSavedShares = useCallback(async () => {
    if (!user) {
      setSavedShares([]);
      return;
    }
    setLoading(true);
    try {
      const shares = await api.getSavedShares();
      setSavedShares(shares);
    } catch (err) {
      console.error('Failed to fetch saved shares:', err);
      setSavedShares([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSavedShares();
  }, [fetchSavedShares]);

  const saveShare = useCallback(async (token: string): Promise<SavedShare> => {
    const saved = await api.saveShare(token);
    setSavedShares(prev => [...prev, saved]);
    return saved;
  }, []);

  const removeSavedShare = useCallback(async (id: number): Promise<void> => {
    await api.removeSavedShare(id);
    setSavedShares(prev => prev.filter(s => s.id !== id));
  }, []);

  const refreshSavedShares = useCallback(async (): Promise<void> => {
    await fetchSavedShares();
  }, [fetchSavedShares]);

  return (
    <SavedSharesContext.Provider value={{ savedShares, loading, saveShare, removeSavedShare, refreshSavedShares }}>
      {children}
    </SavedSharesContext.Provider>
  );
}

export function useSavedShares(): SavedSharesContextValue {
  const context = useContext(SavedSharesContext);
  if (!context) {
    throw new Error('useSavedShares must be used within a SavedSharesProvider');
  }
  return context;
}
