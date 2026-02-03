/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useApi } from './ApiContext';
import type { SavedShareUnified } from '../types/models';
import { useAuth } from './AuthContext';

interface SavedSharesContextValue {
  savedShares: SavedShareUnified[];
  loading: boolean;
  saveLoadoutShare: (token: string) => Promise<void>;
  saveFolderShare: (token: string) => Promise<void>;
  removeSavedShare: (id: number) => Promise<void>;
  refreshSavedShares: () => Promise<void>;
}

const SavedSharesContext = createContext<SavedSharesContextValue | null>(null);

export function SavedSharesProvider({ children }: { children: ReactNode }) {
  const { api } = useApi();
  const { user } = useAuth();
  const [savedShares, setSavedShares] = useState<SavedShareUnified[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSavedShares = useCallback(async () => {
    if (!user) {
      setSavedShares([]);
      return;
    }
    setLoading(true);
    try {
      const shares = await api.getSavedSharesUnified();
      setSavedShares(shares);
    } catch (err) {
      console.error('Failed to fetch saved shares:', err);
      setSavedShares([]);
    } finally {
      setLoading(false);
    }
  }, [user, api]);

  useEffect(() => {
    fetchSavedShares();
  }, [fetchSavedShares]);

  const saveLoadoutShare = useCallback(async (token: string): Promise<void> => {
    const saved = await api.saveShare(token);
    // Convert old SavedShare format to unified format
    const unified: SavedShareUnified = {
      id: saved.id,
      shareToken: saved.shareToken,
      shareType: 'loadout',
      itemName: saved.loadoutName,
      ownerName: saved.ownerName,
      savedAt: saved.savedAt,
      folderTree: null
    };
    setSavedShares(prev => [...prev, unified]);
  }, [api]);

  const saveFolderShare = useCallback(async (token: string): Promise<void> => {
    const saved = await api.saveFolderShare(token);
    setSavedShares(prev => [...prev, saved]);
  }, [api]);

  const removeSavedShare = useCallback(async (id: number): Promise<void> => {
    await api.removeSavedShare(id);
    setSavedShares(prev => prev.filter(s => s.id !== id));
  }, [api]);

  const refreshSavedShares = useCallback(async (): Promise<void> => {
    await fetchSavedShares();
  }, [fetchSavedShares]);

  return (
    <SavedSharesContext.Provider value={{ savedShares, loading, saveLoadoutShare, saveFolderShare, removeSavedShare, refreshSavedShares }}>
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
