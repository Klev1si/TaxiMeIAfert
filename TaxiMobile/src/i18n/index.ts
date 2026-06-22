/**
 * i18n — lightweight translation engine.
 *
 * Zero dependencies beyond what the app already uses (zustand + AsyncStorage).
 *
 * Usage in a component:
 *   const { t, lang, setLang } = useTranslation();
 *   <Text>{t('profile.account')}</Text>
 *   <Text>{t('profile.rating', { rating: '4.8' })}</Text>
 *
 * Usage in non-React code (Alerts, helpers):
 *   import { t } from '../i18n';
 *   Alert.alert(t('common.error'), t('profile.edit.saveError'));
 *
 * Adding a new language:
 *   1. Create src/i18n/translations/<code>.ts mirroring en.ts.
 *   2. Add it to the `translations` map below.
 *   3. Add an entry to `AVAILABLE_LANGUAGES`.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import en from './translations/en';
import es from './translations/es';
import fr from './translations/fr';
import sq from './translations/sq';
import tr from './translations/tr';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Lang = 'en' | 'es' | 'fr' | 'sq' | 'tr';

const translations: Record<Lang, unknown> = { en, es, fr, sq, tr };

const STORAGE_KEY = '@taxiapp/lang';

// Public list used by the language picker UI
export const AVAILABLE_LANGUAGES: Array<{
  code:  Lang;
  label: string;   // native name of the language
  flag:  string;   // emoji flag for visual hint
}> = [
  { code: 'sq', label: 'Shqip',    flag: '🇦🇱' },
  { code: 'en', label: 'English',  flag: '🇬🇧' },
  { code: 'tr', label: 'Türkçe',   flag: '🇹🇷' },
  { code: 'es', label: 'Español',  flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

// ── Device locale detection ───────────────────────────────────────────────────

/**
 * Read the OS locale via React Native's NativeModules — no native package needed.
 * Returns 'en' as a safe default if anything goes wrong.
 */
function detectDeviceLang(): Lang {
  let locale = 'en';
  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      locale =
        settings?.AppleLocale ??
        (Array.isArray(settings?.AppleLanguages) ? settings.AppleLanguages[0] : null) ??
        'en';
    } else {
      locale = NativeModules.I18nManager?.localeIdentifier ?? 'en';
    }
  } catch {
    /* fall back to 'en' */
  }

  // Normalise: 'en_US' / 'en-GB' → 'en'
  const code = String(locale).toLowerCase().split(/[-_]/)[0];
  return (code in translations ? code : 'en') as Lang;
}

// ── Zustand store ─────────────────────────────────────────────────────────────

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useI18nStore = create<I18nState>((set) => ({
  lang: 'sq',   // default language — overwritten by initI18n() right after app mounts
  setLang: (lang) => {
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => { /* no-op */ });
    set({ lang });
  },
}));

/**
 * Called once from App.tsx on mount. Picks the user's previously-saved
 * language if any, otherwise the device locale, otherwise English.
 */
export async function initI18n(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && stored in translations) {
      useI18nStore.setState({ lang: stored as Lang });
      return;
    }
  } catch {
    /* AsyncStorage unavailable — fall through to device detection */
  }
  useI18nStore.setState({ lang: detectDeviceLang() });
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

/** Resolve a dotted path against a translation tree, returning a string or undefined. */
function lookup(obj: unknown, path: string): string | undefined {
  const result = path.split('.').reduce<any>(
    (acc, key) => (acc == null ? undefined : acc[key]),
    obj,
  );
  return typeof result === 'string' ? result : undefined;
}

/** Replace `{name}` placeholders with values from `params`. */
function interpolate(
  str: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] !== undefined ? String(params[key]) : `{${key}}`,
  );
}

// ── Public translate function ─────────────────────────────────────────────────

/**
 * Look up `key` for the given language, falling back to English, then to the
 * key itself (so missing translations are visible in development).
 */
export function translate(
  lang: Lang,
  key: string,
  params?: Record<string, string | number>,
): string {
  const str =
    lookup(translations[lang], key) ??
    lookup(translations.sq, key) ??
    lookup(translations.en, key) ??
    key;
  return interpolate(str, params);
}

// ── React hook ────────────────────────────────────────────────────────────────

/**
 * useTranslation — components re-render automatically when the language changes.
 */
export function useTranslation() {
  const lang    = useI18nStore(s => s.lang);
  const setLang = useI18nStore(s => s.setLang);

  const t = (key: string, params?: Record<string, string | number>) =>
    translate(lang, key, params);

  return { t, lang, setLang };
}

// ── Static t (for non-React contexts: services, Alerts) ───────────────────────

/**
 * Synchronous translate — reads the current language from the store.
 * Does NOT subscribe to changes (the value is captured at call time),
 * so it's perfect for one-shot use like `Alert.alert(t('common.error'))`.
 */
export function t(
  key: string,
  params?: Record<string, string | number>,
): string {
  return translate(useI18nStore.getState().lang, key, params);
}
