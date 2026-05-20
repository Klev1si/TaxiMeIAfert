/**
 * ErrorBoundary — catches JavaScript errors anywhere in the React tree below it.
 *
 * React error boundaries must be class components (hooks cannot implement
 * componentDidCatch / getDerivedStateFromError). This component:
 *
 *  • Catches render / lifecycle errors in child components
 *  • Logs the error + stack trace to the console (extend with Sentry / Crashlytics here)
 *  • Shows a polished, user-friendly fallback screen instead of a blank crash
 *  • Offers a "Try again" button that resets local state so the subtree re-mounts
 *  • Offers a secondary "Reload app" button that calls `RNRestart` if installed,
 *    or falls back to resetting the JS bundle via `DevSettings` in dev mode
 *
 * Usage (wrap the root or any sub-tree):
 *   <ErrorBoundary>
 *     <RootNavigator />
 *   </ErrorBoundary>
 *
 * Pass an optional `onError` prop for custom error reporting:
 *   <ErrorBoundary onError={(error, info) => Sentry.captureException(error)}>
 */

import React, { Component, ReactNode, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  NativeModules,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sizes } from '../constants';
import { useColors } from '../stores/themeStore';
import type { ColorPalette } from '../constants/colors';
import { crash } from '../services/crashlytics';
import { useTranslation } from '../i18n';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode;
  /** Called every time an error is caught — use to report to Sentry / Crashlytics. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
  /** Custom fallback UI. Receives `reset` callback to clear the error. */
  fallback?: (reset: () => void, error: Error) => ReactNode;
}

interface State {
  hasError: boolean;
  error:    Error | null;
  /** Toggle detailed stack trace visibility */
  showDetails: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Attempt a full JS bundle reload.
 * Works in development via `DevSettings.reload()`.
 * In production, install `react-native-restart` and it will call `RNRestart.Restart()`.
 */
function reloadApp() {
  try {
    // Production: react-native-restart (optional dependency)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RNRestart = require('react-native-restart').default;
    RNRestart.Restart();
    return;
  } catch {
    // Library not installed — fall through
  }

  try {
    // Development: DevSettings.reload()
    const { DevSettings } = NativeModules;
    if (DevSettings?.reload) {
      DevSettings.reload();
      return;
    }
  } catch {
    // no-op
  }

  // Last resort on Android — ActivityManager restart
  if (Platform.OS === 'android') {
    try {
      NativeModules.DevSettings?.reload?.();
    } catch {
      // no-op
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  // Called during rendering when a descendant throws.
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, showDetails: false };
  }

  // Called after rendering — use for side-effects like logging.
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);

    // Report to Firebase Crashlytics as a non-fatal JS error
    crash.log(`React error boundary caught: ${error.message}`);
    crash.setAttribute('componentStack', info.componentStack?.slice(0, 500) ?? '');
    crash.recordError(error, 'ErrorBoundary');

    // Forward to custom reporter (Sentry, Crashlytics, etc.)
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  toggleDetails = () => {
    this.setState(s => ({ showDetails: !s.showDetails }));
  };

  render() {
    const { hasError, error, showDetails } = this.state;
    const { children, fallback } = this.props;

    if (!hasError) return <>{children}</>;

    // Custom fallback
    if (fallback && error) {
      return <>{fallback(this.reset, error)}</>;
    }

    // Default fallback UI
    return <ErrorFallback error={error} onReset={this.reset} showDetails={showDetails} onToggleDetails={this.toggleDetails} />;
  }
}

// ── Default Fallback UI ───────────────────────────────────────────────────────

function ErrorFallback({
  error,
  onReset,
  showDetails,
  onToggleDetails,
}: {
  error:            Error | null;
  onReset:          () => void;
  showDetails:      boolean;
  onToggleDetails:  () => void;
}) {
  const { t }  = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">

        {/* Icon */}
        <View style={styles.iconWrap}>
          <Text style={styles.iconText}>⚠️</Text>
        </View>

        {/* Heading */}
        <Text style={styles.title}>{t('components.errorBoundary.title')}</Text>
        <Text style={styles.subtitle}>{t('components.errorBoundary.subtitle')}</Text>

        {/* Primary CTA */}
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={onReset}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('components.errorBoundary.retryBtn')}>
          <Text style={styles.btnPrimaryText}>{t('components.errorBoundary.retryBtn')}</Text>
        </TouchableOpacity>

        {/* Secondary CTA */}
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={reloadApp}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('components.errorBoundary.reloadBtn')}>
          <Text style={styles.btnSecondaryText}>{t('components.errorBoundary.reloadBtn')}</Text>
        </TouchableOpacity>

        {/* Collapsible error details */}
        <TouchableOpacity
          style={styles.detailsToggle}
          onPress={onToggleDetails}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={showDetails ? t('components.errorBoundary.hideDetails') : t('components.errorBoundary.showDetails')}>
          <Text style={styles.detailsToggleText}>
            {showDetails ? t('components.errorBoundary.hideDetails') : t('components.errorBoundary.showDetails')}
          </Text>
        </TouchableOpacity>

        {showDetails && error && (
          <View style={styles.detailsBox}>
            <Text style={styles.detailsName}>{error.name}: {error.message}</Text>
            {!!error.stack && (
              <Text style={styles.detailsStack} selectable>
                {error.stack}
              </Text>
            )}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: c.background,
  },
  container: {
    flexGrow: 1,
    padding: Sizes.screenPadding,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },

  // Icon
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: c.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconText: { fontSize: 48 },

  // Text
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: c.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: c.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
    marginBottom: 36,
  },
  bold: {
    fontWeight: '700',
    color: c.text,
  },

  // Buttons
  btnPrimary: {
    width: '100%',
    maxWidth: 320,
    height: 52,
    borderRadius: 14,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: c.textOnPrimary,
  },
  btnSecondary: {
    width: '100%',
    maxWidth: 320,
    height: 52,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  btnSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: c.textSecondary,
  },

  // Details toggle
  detailsToggle: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  detailsToggleText: {
    fontSize: 13,
    color: c.info,
    fontWeight: '600',
  },

  // Details box
  detailsBox: {
    width: '100%',
    backgroundColor: c.surfaceAlt,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  detailsName: {
    fontSize: 13,
    fontWeight: '700',
    color: c.error,
    marginBottom: 8,
  },
  detailsStack: {
    fontSize: 11,
    color: c.textSecondary,
    lineHeight: 17,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
}); }

export default ErrorBoundary;
