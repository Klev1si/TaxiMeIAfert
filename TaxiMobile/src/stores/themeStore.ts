/**
 * Theme store — manages light / dark / system colour mode.
 *
 * Usage in a component:
 *   const colors = useColors();   // reactive colour palette
 *   const { mode, setMode, isDark } = useTheme();   // mode + toggle
 *
 * Call initTheme() once from App.tsx to rehydrate the persisted preference.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, type ColorSchemeName } from 'react-native';
import { lightColors, darkColors, type ColorPalette } from '../constants/colors';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = '@taxiapp/theme';

interface ThemeState {
  mode:         ThemeMode;
  systemScheme: ColorSchemeName | null;
  setMode:          (mode: ThemeMode) => void;
  initTheme:        () => Promise<void>;
  _setSystemScheme: (scheme: ColorSchemeName | null) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode:         'system',
  systemScheme: Appearance.getColorScheme() ?? null,

  setMode: (mode) => {
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
    set({ mode });
  },

  initTheme: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        set({ mode: stored as ThemeMode });
      }
    } catch { /* AsyncStorage unavailable — keep default */ }
  },

  _setSystemScheme: (scheme) => set({ systemScheme: scheme }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

export function resolveIsDark(
  mode: ThemeMode,
  systemScheme: ColorSchemeName | null,
): boolean {
  if (mode === 'light')  return false;
  if (mode === 'dark')   return true;
  return systemScheme === 'dark';
}

// ── Public hooks ──────────────────────────────────────────────────────────────

/**
 * Returns the current resolved colour palette. Components re-render
 * automatically when the theme changes.
 */
export function useColors(): ColorPalette {
  const mode         = useThemeStore(s => s.mode);
  const systemScheme = useThemeStore(s => s.systemScheme);
  return resolveIsDark(mode, systemScheme) ? darkColors : lightColors;
}

/**
 * Returns the current theme mode, a setter, and the resolved isDark boolean.
 */
export function useTheme() {
  const mode         = useThemeStore(s => s.mode);
  const setMode      = useThemeStore(s => s.setMode);
  const systemScheme = useThemeStore(s => s.systemScheme);
  const isDark       = resolveIsDark(mode, systemScheme);
  return { mode, setMode, isDark };
}

/**
 * Non-hook accessor — for services / non-React code that need colours once.
 * Does NOT subscribe to changes; use useColors() in components.
 */
export function getColors(): ColorPalette {
  const { mode, systemScheme } = useThemeStore.getState();
  return resolveIsDark(mode, systemScheme) ? darkColors : lightColors;
}
