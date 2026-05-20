/**
 * AppLoadingScreen
 *
 * Shown while the auth store is rehydrating tokens from AsyncStorage on first
 * launch. Prevents a white flash between when the native splash dismisses and
 * when the first real screen renders.
 *
 * Displays a branded yellow background with a pulsing taxi icon — identical
 * branding to the native Android splash screen so the transition is seamless.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useColors, useTheme, getColors } from '../stores/themeStore';
import type { ColorPalette } from '../constants/colors';

export default function AppLoadingScreen() {
  const colors  = useColors();
  const { isDark } = useTheme();
  const styles  = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const pulse   = useRef(new Animated.Value(1)).current;

  const splashBg    = isDark ? colors.background : colors.primary;
  const barStyle    = isDark ? 'light-content' : 'dark-content';

  useEffect(() => {
    StatusBar.setBackgroundColor(splashBg);
    StatusBar.setBarStyle(barStyle);

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.15,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();

    return () => {
      animation.stop();
      // Restore status bar — read live palette so dark mode is respected
      const c = getColors();
      StatusBar.setBackgroundColor(c.background);
    };
  }, [pulse]);

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={splashBg} barStyle={barStyle} />
      <Animated.View style={[styles.iconWrap, { transform: [{ scale: pulse }] }]}>
        {/* Taxi emoji as stand-in; replace with <Image> once PNG assets are ready */}
        <Text style={styles.icon}>🚕</Text>
      </Animated.View>
    </View>
  );
}

function getStyles(c: ColorPalette, isDark: boolean) { return StyleSheet.create({
  container: {
    flex: 1,
    // Dark mode: matches native dark splash (#111827).
    // Light mode: brand yellow — matches native light splash.
    backgroundColor: isDark ? c.background : c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 80,
  },
}); }
