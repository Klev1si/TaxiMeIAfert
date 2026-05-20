/**
 * OfflineBanner — animated top-of-screen indicator for network state.
 *
 * Shows:
 *  • A red "No internet connection" bar that slides down when offline.
 *  • Briefly switches to a green "Back online" bar for 2 s before hiding.
 *
 * Mount it once near the root of the component tree (see App.tsx).
 * It reads directly from useNetworkStore — no props needed.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { useColors } from '../stores/themeStore';
import type { ColorPalette } from '../constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStore } from '../stores/networkStore';
import { useTranslation } from '../i18n';

// How long (ms) to show the green "Back online" bar before hiding
const BACK_ONLINE_LINGER = 2_000;

// Banner height without safe area top inset
const BANNER_CONTENT_H = 34;

export default function OfflineBanner() {
  const { t }  = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const isOnline       = useNetworkStore(s => s.isOnline);
  const insets         = useSafeAreaInsets();
  const bannerH        = BANNER_CONTENT_H + insets.top;

  // Track previous online state so we know when we just recovered
  const prevOnline     = useRef(true);
  const [phase, setPhase] = useState<'hidden' | 'offline' | 'back-online'>('hidden');

  const slideAnim     = useRef(new Animated.Value(-bannerH)).current;
  const lingerTimeout  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Slide helpers ──────────────────────────────────────────────────────────
  const slideDown = () =>
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start();

  const slideUp = (onDone?: () => void) =>
    Animated.timing(slideAnim, {
      toValue: -bannerH,
      duration: 280,
      useNativeDriver: true,
    }).start(onDone ? ({ finished }) => { if (finished) onDone(); } : undefined);

  // ── React to online/offline changes ───────────────────────────────────────
  useEffect(() => {
    const wasOnline = prevOnline.current;
    prevOnline.current = isOnline;

    if (lingerTimeout.current) {
      clearTimeout(lingerTimeout.current);
      lingerTimeout.current = null;
    }

    if (!isOnline) {
      // Went offline — slide banner down (red)
      setPhase('offline');
      slideDown();
    } else if (!wasOnline) {
      // Just recovered — switch to green for a moment then hide
      setPhase('back-online');
      slideDown(); // make sure it's visible (might already be)
      lingerTimeout.current = setTimeout(() => {
        slideUp(() => setPhase('hidden'));
      }, BACK_ONLINE_LINGER);
    }

    return () => {
      if (lingerTimeout.current) clearTimeout(lingerTimeout.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  if (phase === 'hidden') return null;

  const isBackOnline = phase === 'back-online';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          height:          bannerH,
          paddingTop:      insets.top,
          backgroundColor: isBackOnline ? colors.success : colors.error,
          transform:       [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents="none"   // don't block touches on the content below
    >
      <View style={styles.content}>
        <Text style={styles.icon}>{isBackOnline ? '✓' : '⚡'}</Text>
        <Text style={styles.label}>
          {isBackOnline ? t('components.offlineBanner.backOnline') : t('components.offlineBanner.message')}
        </Text>
      </View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 20,          // Android
    shadowColor: '#000',    // iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    ...Platform.select({
      android: { elevation: 20 },
    }),
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  icon: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '700',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
}); }
