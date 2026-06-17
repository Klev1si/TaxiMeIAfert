/**
 * OnboardingTour
 *
 * 4 swipe-screens shown on first launch. Tracks completion in AsyncStorage
 * so it never appears again for the same install. Skip / Next / Get Started.
 *
 * Rendered as a full-screen modal from App.tsx after auth is initialized.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Dimensions, Modal, Pressable, StyleSheet, Text,
  TouchableOpacity, View, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '../stores/themeStore';
import { useTranslation } from '../i18n';
import type { ColorPalette } from '../constants/colors';

const STORAGE_KEY = 'onboarding_seen_v1';

const { width: SCREEN_W } = Dimensions.get('window');

interface Slide {
  emoji: string;
  titleKey: string;
  bodyKey: string;
}

const SLIDES: Slide[] = [
  { emoji: '🚕', titleKey: 'onboarding.slide1Title', bodyKey: 'onboarding.slide1Body' },
  { emoji: '📍', titleKey: 'onboarding.slide2Title', bodyKey: 'onboarding.slide2Body' },
  { emoji: '🛡️', titleKey: 'onboarding.slide3Title', bodyKey: 'onboarding.slide3Body' },
  { emoji: '💰', titleKey: 'onboarding.slide4Title', bodyKey: 'onboarding.slide4Body' },
];

export async function shouldShowOnboarding(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    return v !== '1';
  } catch {
    return false;
  }
}

async function markSeen(): Promise<void> {
  try { await AsyncStorage.setItem(STORAGE_KEY, '1'); } catch { /* best effort */ }
}

interface Props {
  visible: boolean;
  onDone: () => void;
}

export default function OnboardingTour({ visible, onDone }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!visible) setIndex(0);
  }, [visible]);

  const finish = async () => {
    await markSeen();
    onDone();
  };

  const onNext = () => {
    if (index < SLIDES.length - 1) {
      const next = index + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next);
    } else {
      void finish();
    }
  };

  const onSkip = () => void finish();

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={[styles.slide, { width: SCREEN_W }]}>
      <Text style={styles.emoji}>{item.emoji}</Text>
      <Text style={styles.title}>{t(item.titleKey)}</Text>
      <Text style={styles.body}>{t(item.bodyKey)}</Text>
    </View>
  );

  const isLast = index === SLIDES.length - 1;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onSkip}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <View style={{ width: 60 }} />
          {!isLast && (
            <TouchableOpacity onPress={onSkip} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.skip}>{t('common.skip')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderSlide}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e => {
            const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
            setIndex(i);
          }}
        />

        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.cta} onPress={onNext} activeOpacity={0.85}>
          <Text style={styles.ctaText}>
            {isLast ? t('onboarding.getStarted') : t('common.next')}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

function getStyles(c: ColorPalette) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  topBar: {
    height: 48,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skip: { fontSize: 15, color: c.textSecondary, fontWeight: '600' },

  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  emoji: { fontSize: 88, marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '800', color: c.text, textAlign: 'center', marginBottom: 14 },
  body:  { fontSize: 15, color: c.textSecondary, textAlign: 'center', lineHeight: 22 },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  dot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: c.border },
  dotActive: { backgroundColor: c.primary, width: 24 },

  cta: {
    marginHorizontal: 24, marginBottom: 24,
    height: 56, borderRadius: 16,
    backgroundColor: c.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { color: c.textOnPrimary, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
}); }
