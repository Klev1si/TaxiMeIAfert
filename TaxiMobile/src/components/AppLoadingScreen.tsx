/**
 * AppLoadingScreen — branded splash with a cinematic entry animation.
 *
 * Sequence (~2 seconds, total):
 *   1. Taxi drives in from the left edge with a headlight halo (900 ms).
 *   2. After arriving at center, the taxi bobs gently as if on a road.
 *   3. The "TaxiMeIAfert" wordmark reveals letter-by-letter (12 × 60 ms).
 *   4. The tagline "Tani më afër" fades in from below (500 ms).
 *   5. Three loading dots pulse at the bottom while the auth store
 *      rehydrates tokens in the background.
 *
 * If the auth init finishes before the animation completes, the parent
 * RootNavigator still keeps this screen on-screen for a minimum duration
 * so the animation is never cut short on returning users.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  StatusBar,
  Easing,
  Dimensions,
} from 'react-native';
import { useColors, useTheme, getColors } from '../stores/themeStore';
import type { ColorPalette } from '../constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const APP_NAME = 'TaxiMeIAfert';
/** Albanian: "Now nearer". Subtitle under the wordmark. */
const TAGLINE = 'Tani më afër';

export default function AppLoadingScreen() {
  const colors  = useColors();
  const { isDark } = useTheme();
  const styles  = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // ── Animated values ────────────────────────────────────────────────────────
  // Taxi starts off-screen-left (negative X), drives in.
  const taxiX        = useRef(new Animated.Value(-SCREEN_WIDTH)).current;
  // Vertical bobbing while idle (like driving over a road).
  const taxiBob      = useRef(new Animated.Value(0)).current;
  // Headlight halo fades in just before the taxi arrives.
  const headlight    = useRef(new Animated.Value(0)).current;
  // Each letter has its own animated value for stagger.
  const letterAnims  = useRef(APP_NAME.split('').map(() => new Animated.Value(0))).current;
  // Tagline fades + slides up.
  const tagOpacity   = useRef(new Animated.Value(0)).current;
  const tagOffsetY   = useRef(new Animated.Value(12)).current;
  // Loading dots — three values for staggered pulse.
  const dots         = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  // Road dashes scroll left while the taxi is "moving in".
  const roadShift    = useRef(new Animated.Value(0)).current;

  // Theme-derived colours
  const splashBg    = isDark ? colors.background : colors.primary;
  const wordColor   = isDark ? colors.primary : '#1a1a1a';
  const tagColor    = isDark ? colors.textSecondary : 'rgba(0,0,0,0.7)';
  const dashColor   = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
  const barStyle    = isDark ? 'light-content' : 'dark-content';

  useEffect(() => {
    StatusBar.setBackgroundColor(splashBg);
    StatusBar.setBarStyle(barStyle);

    // 1. Scrolling road dashes — loops while the taxi drives in
    const roadLoop = Animated.loop(
      Animated.timing(roadShift, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    roadLoop.start();

    // 2. Headlight fades in slightly before the taxi arrives
    const headlightIn = Animated.timing(headlight, {
      toValue: 1,
      duration: 500,
      delay: 200,
      useNativeDriver: true,
    });

    // 3. Drive-in: off-screen left → centre (ease out so it decelerates)
    const driveIn = Animated.timing(taxiX, {
      toValue: 0,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    // 4. After drive-in: gentle bobbing forever
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(taxiBob, { toValue: -4, duration: 320, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(taxiBob, { toValue:  0, duration: 320, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );

    // 5. Letters of the wordmark stagger in with a tiny scale-pop
    const lettersIn = Animated.stagger(
      55,
      letterAnims.map(v => Animated.spring(v, {
        toValue: 1,
        damping: 14,
        stiffness: 140,
        useNativeDriver: true,
      })),
    );

    // 6. Tagline fades + slides up
    const taglineIn = Animated.parallel([
      Animated.timing(tagOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(tagOffsetY, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);

    // 7. Loading dots pulse forever after the splash settles
    const dotsLoop = Animated.loop(
      Animated.stagger(
        180,
        dots.map(d =>
          Animated.sequence([
            Animated.timing(d, { toValue: 1.0, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(d, { toValue: 0.3, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
        ),
      ),
    );

    // Compose the master sequence
    Animated.sequence([
      Animated.parallel([driveIn, headlightIn]),
      lettersIn,
      taglineIn,
    ]).start(() => {
      // Stop the road loop once the car has "parked" so the visual settles
      roadLoop.stop();
    });

    // Run forever, in parallel
    bob.start();
    dotsLoop.start();

    return () => {
      roadLoop.stop();
      bob.stop();
      dotsLoop.stop();
      // Restore status bar — read live palette so dark mode is respected
      const c = getColors();
      StatusBar.setBackgroundColor(c.background);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Road dashes that "scroll" left to give the impression of motion.
  // We render two strips and translate them through one cycle each.
  const dashWidth   = 40;
  const dashGap     = 30;
  const stripWidth  = SCREEN_WIDTH + dashWidth * 2;
  const roadTranslate = roadShift.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, -(dashWidth + dashGap) * 2],
  });

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={splashBg} barStyle={barStyle} />

      {/* Background road — animated dashes give a feeling of motion */}
      <Animated.View style={[
        styles.road,
        { transform: [{ translateX: roadTranslate }], width: stripWidth },
      ]} pointerEvents="none">
        {Array.from({ length: Math.ceil(stripWidth / (dashWidth + dashGap)) }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dash,
              {
                width: dashWidth,
                marginRight: dashGap,
                backgroundColor: dashColor,
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* The taxi — emoji with headlight halo */}
      <Animated.View
        style={[
          styles.taxiWrap,
          { transform: [{ translateX: taxiX }, { translateY: taxiBob }] },
        ]}
      >
        {/* Headlight halo glowing in front of the taxi */}
        <Animated.View
          style={[
            styles.headlight,
            { opacity: headlight, backgroundColor: isDark ? 'rgba(255, 244, 130, 0.35)' : 'rgba(255, 255, 220, 0.55)' },
          ]}
          pointerEvents="none"
        />
        <Text style={styles.taxiEmoji}>🚕</Text>
      </Animated.View>

      {/* Wordmark — letters pop in one by one */}
      <View style={styles.nameRow}>
        {APP_NAME.split('').map((letter, i) => (
          <Animated.Text
            key={`${letter}-${i}`}
            style={[
              styles.nameLetter,
              { color: wordColor },
              {
                opacity: letterAnims[i],
                transform: [
                  {
                    translateY: letterAnims[i].interpolate({
                      inputRange:  [0, 1],
                      outputRange: [18, 0],
                    }),
                  },
                  {
                    scale: letterAnims[i].interpolate({
                      inputRange:  [0, 1],
                      outputRange: [0.6, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            {letter}
          </Animated.Text>
        ))}
      </View>

      {/* Tagline */}
      <Animated.Text
        style={[
          styles.tagline,
          { color: tagColor, opacity: tagOpacity, transform: [{ translateY: tagOffsetY }] },
        ]}
      >
        {TAGLINE}
      </Animated.Text>

      {/* Three pulsing dots — subtle loading indicator at the bottom */}
      <View style={styles.dotsRow} pointerEvents="none">
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: wordColor, opacity: d, transform: [{ scale: d }] },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function getStyles(c: ColorPalette, isDark: boolean) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? c.background : c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Animated road strip behind the taxi
  road: {
    position: 'absolute',
    top: '52%',
    flexDirection: 'row',
    alignItems: 'center',
    height: 4,
  },
  dash: {
    height: 4,
    borderRadius: 2,
  },

  // Taxi
  taxiWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  taxiEmoji: {
    fontSize: 96,
  },
  headlight: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    // Sit slightly off-centre to the right of the taxi (the "front")
    right: -20,
    // Glow effect on iOS via shadow; Android uses elevation + the inner colour
    shadowColor: '#FFF59D',
    shadowOpacity: 0.9,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  },

  // Wordmark
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  nameLetter: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Tagline
  tagline: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },

  // Loading dots at bottom
  dotsRow: {
    position: 'absolute',
    bottom: 64,
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
}); }
