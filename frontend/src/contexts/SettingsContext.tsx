/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useApi } from './ApiContext';
import type { UserSettings } from '../types/settings';
import { defaultSettings } from '../types/settings';
import { useAuth } from './AuthContext';

interface SettingsContextValue {
  settings: UserSettings;
  loading: boolean;
  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
  favouriteActionsSet: Set<number>;
  toggleFavourite: (actionId: number) => Promise<void>;
  unlockedChaptersSet: Set<number>;
  unlockChapter: (chapter: number, explorationName: string) => Promise<{ success: boolean; message: string }>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { api } = useApi();
  const [settingsState, setSettingsState] = useState<{
    settings: UserSettings;
    loadedForUserId: number | null;
  }>({
    settings: defaultSettings,
    loadedForUserId: null
  });
  const { user } = useAuth();

  // Ref to track latest settings for use in callbacks (avoids stale closure issues)
  const settingsRef = useRef(settingsState.settings);
  useEffect(() => {
    settingsRef.current = settingsState.settings;
  }, [settingsState.settings]);

  // Derive loading state - we're loading if we have a user but haven't loaded their settings yet
  const loading = user ? user.id !== settingsState.loadedForUserId : false;
  const settings = settingsState.settings;

  useEffect(() => {
    if (!user) {
      // Reset to defaults when logged out - intentional synchronous state reset
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSettingsState(prev =>
        prev.loadedForUserId === null ? prev : { settings: defaultSettings, loadedForUserId: null }
      );
      return;
    }

    let cancelled = false;

    api.getSettings()
      .then(data => {
        if (!cancelled) {
          setSettingsState({ settings: data, loadedForUserId: user.id });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettingsState({ settings: defaultSettings, loadedForUserId: user.id });
        }
      });

    return () => { cancelled = true; };
  }, [user, api]);

  const updateSettings = useCallback(async (partial: Partial<UserSettings>) => {
    // Get current settings from ref (always up to date)
    const currentSettings = settingsRef.current;
    const newSettings = { ...currentSettings, ...partial };

    // Optimistic update
    setSettingsState(prev => ({ ...prev, settings: newSettings }));

    try {
      await api.updateSettings(newSettings);
    } catch (err) {
      // Revert on error
      setSettingsState(prev => ({ ...prev, settings: currentSettings }));
      throw err;
    }
  }, [api]);

  const favouriteActionsSet = useMemo(() =>
    new Set(settingsState.settings.favouriteActions ?? []),
    [settingsState.settings.favouriteActions]
  );

  const unlockedChaptersSet = useMemo(() =>
    new Set(settingsState.settings.unlockedChapters ?? [0]),
    [settingsState.settings.unlockedChapters]
  );

  const toggleFavourite = useCallback(async (actionId: number) => {
    // Get current settings from ref (always up to date)
    const currentSettings = settingsRef.current;
    const currentFavourites = currentSettings.favouriteActions ?? [];
    const currentSet = new Set(currentFavourites);
    const newFavourites = currentSet.has(actionId)
      ? currentFavourites.filter(id => id !== actionId)
      : [...currentFavourites, actionId];
    const newSettings = { ...currentSettings, favouriteActions: newFavourites };

    // Optimistic update
    setSettingsState(prev => ({ ...prev, settings: newSettings }));

    try {
      await api.updateSettings(newSettings);
    } catch (err) {
      // Revert on error
      setSettingsState(prev => ({ ...prev, settings: currentSettings }));
      throw err;
    }
  }, [api]);

  const unlockChapter = useCallback(async (chapter: number, explorationName: string) => {
    const result = await api.unlockChapter(chapter, explorationName);
    if (result.success && result.unlockedChapters) {
      const newUnlockedChapters = result.unlockedChapters;
      setSettingsState(prev => ({
        ...prev,
        settings: { ...prev.settings, unlockedChapters: newUnlockedChapters }
      }));
    }
    return { success: result.success, message: result.message };
  }, [api]);

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings, favouriteActionsSet, toggleFavourite, unlockedChaptersSet, unlockChapter }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
