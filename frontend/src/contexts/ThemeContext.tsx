/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useSettings } from './SettingsContext';
import { useAuth } from './AuthContext';
import type { ThemePreference } from '../types/settings';

type EffectiveTheme = 'dark' | 'light';

interface ThemeContextValue {
  themePreference: ThemePreference;
  effectiveTheme: EffectiveTheme;
  setThemePreference: (preference: ThemePreference) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = 'theme-preference';

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return 'system';
}

// Get system preference
function getSystemPreference(): EffectiveTheme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

// Compute effective theme from preference
function computeEffectiveTheme(preference: ThemePreference): EffectiveTheme {
  if (preference === 'system') {
    return getSystemPreference();
  }
  return preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const { user } = useAuth();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(readStoredPreference);

  // Track whether the user has explicitly changed theme in THIS provider instance
  // so we don't overwrite their choice when server settings load
  const hasUserChangedTheme = useRef(false);

  // Sync with localStorage changes from other ThemeProvider instances (same window)
  // We use a custom event since 'storage' only fires for other windows
  useEffect(() => {
    const handleThemeSync = (e: Event) => {
      const newPref = (e as CustomEvent<ThemePreference>).detail;
      if (newPref !== themePreference) {
        setThemePreferenceState(newPref);
      }
    };
    window.addEventListener('theme-preference-changed', handleThemeSync);
    return () => window.removeEventListener('theme-preference-changed', handleThemeSync);
  }, [themePreference]);

  // Compute effective theme
  const effectiveTheme = useMemo(() => {
    return computeEffectiveTheme(themePreference);
  }, [themePreference]);

  // Apply theme to document + sync to localStorage + notify other providers
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    // Notify other ThemeProvider instances in the same window
    window.dispatchEvent(new CustomEvent('theme-preference-changed', { detail: themePreference }));
  }, [effectiveTheme, themePreference]);

  // Listen for system preference changes when preference is 'system'
  useEffect(() => {
    if (themePreference !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const newTheme = mediaQuery.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themePreference]);

  // When server settings load with a non-default theme, adopt it
  // (only if the user hasn't explicitly changed theme locally)
  useEffect(() => {
    const serverPref = settings.themePreference;
    if (!serverPref || serverPref === 'system') return;
    if (hasUserChangedTheme.current) return;
    if (themePreference !== 'system') return;
    // Intentional: syncing server preference to local state on initial load
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemePreferenceState(serverPref);
  }, [settings.themePreference]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync theme to server when it changes and user is logged in
  const prevThemeRef = useRef(themePreference);
  useEffect(() => {
    if (prevThemeRef.current === themePreference) return;
    prevThemeRef.current = themePreference;
    if (!user || user.id === -1) return; // not logged in or guest
    // Fire-and-forget sync to server
    updateSettings({ themePreference }).catch(() => {
      // Silently ignore - localStorage is the source of truth
    });
  }, [themePreference, user, updateSettings]);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    hasUserChangedTheme.current = true;
    setThemePreferenceState(preference);
  }, []);

  const cycleTheme = useCallback(() => {
    // Cycle: system -> dark -> light -> system
    const nextPreference: ThemePreference =
      themePreference === 'system' ? 'dark' :
      themePreference === 'dark' ? 'light' : 'system';
    setThemePreference(nextPreference);
  }, [themePreference, setThemePreference]);

  return (
    <ThemeContext.Provider value={{ themePreference, effectiveTheme, setThemePreference, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
