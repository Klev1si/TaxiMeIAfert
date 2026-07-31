/**
 * SearchingForDriver — animated "radar" shown while a client waits for a
 * driver to accept the ride. Concentric rings ripple outward from a taxi
 * icon that gently breathes, evoking "scanning for nearby drivers".
 *
 * Pure React Native Animated (native driver) — no extra dependencies.
 * Self-contained: reads the theme via useColors(), so it can be dropped in
 * anywhere with just `<SearchingForDriver />`.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useColors } from '../stores/themeStore';
import type { ColorPalette } from '../constants/colors';

const RING_COUNT = 3;
const RING_DURATION = 2400; // ms for one ring to ripple fully outward
const PULSE_DURATION = 900; // ms for half a "breath" of the center icon

interface Props {
  /** Diameter of the radar in px. Default 132. */
  size?: number;
}

export default function SearchingForDriver({ size = 132 }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  // One Animated.Value per ring (0 → 1 ripple progress) plus the icon pulse.
  // useRef so the values survive re-renders without being recreated.
  const rings = useRef(
    Array.from({ length: RING_COUNT }, () => new Animated.Value(0)),
  ).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Every ring runs the same loop, started at staggered offsets so the
    // ripples stay evenly spaced in time instead of firing on top of each other.
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const loops = rings.map((v) =>
      Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: RING_DURATION,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ),
    );
    loops.forEach((loop, i) => {
      const t = setTimeout(() => loop.start(), (RING_DURATION / RING_COUNT) * i);
      timers.push(t);
    });

    // Center icon "breathing" in and out.
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: PULSE_DURATION,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: PULSE_DURATION,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoop.start();

    return () => {
      timers.forEach(clearTimeout);
      loops.forEach((l) => l.stop());
      pulseLoop.stop();
    };
  }, [rings, pulse]);

  const coreSize = size * 0.42;
  const iconScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityLabel="Searching for a nearby driver">
      {rings.map((v, i) => {
        const scale = v.interpolate({
          inputRange: [0, 1],
          outputRange: [0.35, 1],
        });
        const opacity = v.interpolate({
          inputRange: [0, 1],
          outputRange: [0.5, 0],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.ring,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                opacity,
                transform: [{ scale }],
              },
            ]}
          />
        );
      })}

      <Animated.View
        style={[
          styles.core,
          {
            width: coreSize,
            height: coreSize,
            borderRadius: coreSize / 2,
            transform: [{ scale: iconScale }],
          },
        ]}>
        <Icon name="local-taxi" size={coreSize * 0.55} color={colors.textOnPrimary} />
      </Animated.View>
    </View>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: { alignItems: 'center', justifyContent: 'center' },
    ring: {
      position: 'absolute',
      borderWidth: 2,
      borderColor: c.primary,
      backgroundColor: c.primary + '22', // faint #RRGGBBAA fill behind the border
    },
    core: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
      // Soft glow so the taxi reads as the active center of the radar.
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 12,
      elevation: 8,
    },
  });
}
