/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useSettings } from './SettingsContext';
import type { ThemePreference } from '../types/settings';

type EffectiveTheme = 'dark' | 'light';

interface ThemeContextValue {
  themePreference: ThemePreference;
  effectiveTheme: EffectiveTheme;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
  cycleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

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
  const themePreference = settings.themePreference ?? 'system';

  // Compute effective theme
  const effectiveTheme = useMemo(() => {
    return computeEffectiveTheme(themePreference);
  }, [themePreference]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    // Sync to localStorage for FOUC prevention
    localStorage.setItem('theme-preference', themePreference);
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

  const setThemePreference = useCallback(async (preference: ThemePreference) => {
    await updateSettings({ themePreference: preference });
  }, [updateSettings]);

  const cycleTheme = useCallback(async () => {
    // Cycle: system -> dark -> light -> system
    const nextPreference: ThemePreference =
      themePreference === 'system' ? 'dark' :
      themePreference === 'dark' ? 'light' : 'system';
    await setThemePreference(nextPreference);
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
