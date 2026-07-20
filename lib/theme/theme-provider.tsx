import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Colors,
  type ResolvedTheme,
  type ThemeColors,
  type ThemePreference,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getCacheItem, setCacheItem } from '@/lib/cache';
import { setRuntimeThemeColors } from '@/lib/theme/runtime-styles';

const THEME_PREFERENCE_KEY = 'ui.theme.preference.v1';

type AppThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  colors: ThemeColors;
  isHydrated: boolean;
  setPreference: (value: ThemePreference) => Promise<void>;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] =
    useState<ThemePreference>('system');
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    void getCacheItem(THEME_PREFERENCE_KEY).then((stored) => {
      if (!active) return;
      if (isThemePreference(stored)) setPreferenceState(stored);
      setIsHydrated(true);
    });

    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback(async (value: ThemePreference) => {
    setPreferenceState(value);
    await setCacheItem(THEME_PREFERENCE_KEY, value);
  }, []);

  const resolvedTheme: ResolvedTheme =
    preference === 'system'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : preference;

  // Update before children render so legacy named styles resolve from the same
  // palette as semantic-token consumers during this render.
  setRuntimeThemeColors(Colors[resolvedTheme]);

  const value = useMemo<AppThemeContextValue>(
    () => ({
      preference,
      resolvedTheme,
      colors: Colors[resolvedTheme],
      isHydrated,
      setPreference,
    }),
    [isHydrated, preference, resolvedTheme, setPreference],
  );

  return (
    <AppThemeContext.Provider value={value}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme(): AppThemeContextValue {
  const value = useContext(AppThemeContext);
  if (!value) {
    throw new Error('useAppTheme must be used inside AppThemeProvider');
  }
  return value;
}
