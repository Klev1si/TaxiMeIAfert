/**
 * SnackbarHost — global bottom-toast renderer.
 *
 * Subscribes to useSnackbarStore. When a toast is pushed, slides it up from
 * the bottom, auto-dismisses after `durationMs`, and is tappable for the
 * "View" action. Replaces the old Alert.alert dialogs used for foreground
 * FCM messages.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSnackbarStore } from '../stores/snackbarStore';
import { useColors } from '../stores/themeStore';

const DEFAULT_DURATION = 5000;

export default function SnackbarHost() {
  const current = useSnackbarStore(s => s.current);
  const dismiss = useSnackbarStore(s => s.dismiss);
  const colors  = useColors();
  const styles  = useMemo(() => getStyles(colors), [colors]);

  const slideY  = useRef(new Animated.Value(120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!current) {
      // Slide back down
      Animated.parallel([
        Animated.timing(slideY,  { toValue: 120, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,   duration: 200, useNativeDriver: true }),
      ]).start();
      return;
    }

    // Slide up
    Animated.parallel([
      Animated.timing(slideY,  { toValue: 0, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

    // Auto-dismiss after duration
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => {
      dismiss();
    }, current.durationMs ?? DEFAULT_DURATION);

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [current, slideY, opacity, dismiss]);

  if (!current) return null;

  const handleTap = () => {
    if (current.onPress) current.onPress();
    dismiss();
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.wrap} pointerEvents="box-none">
      <TouchableWithoutFeedback onPress={handleTap}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity,
              transform: [{ translateY: slideY }],
            },
          ]}>
          <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
          <Text style={styles.body}  numberOfLines={2}>{current.body}</Text>
        </Animated.View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

function getStyles(c: { background: string; text: string; textSecondary: string; primary: string; border: string; shadow?: string }) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 12,
      paddingBottom: 12,
    },
    card: {
      backgroundColor: '#111827',
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
      ...(Platform.OS === 'android' ? {} : { backdropFilter: 'blur(8px)' as any }),
    },
    title: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 2,
    },
    body: {
      color: '#d1d5db',
      fontSize: 13,
    },
  });
}
