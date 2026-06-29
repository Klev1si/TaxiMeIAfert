/**
 * OnboardingTour
 *
 * 3 swipe-screens shown on first launch. Premium "phone-in-phone" style
 * with a dark navy background and a stylized iPhone mockup containing
 * a simplified preview of the actual app screen each slide describes.
 *
 * Tracks completion in AsyncStorage so it never appears again unless the
 * app is reinstalled. Users can replay it via Profile → "How to use".
 *
 * Includes an inline SQ/EN language toggle so reviewers (and users) can
 * preview the app in their preferred language without leaving the tour.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions, Modal, StyleSheet, Text,
  TouchableOpacity, View, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation, useI18nStore, type Lang } from '../i18n';

const STORAGE_KEY = 'onboarding_seen_v2';

const { width: SCREEN_W } = Dimensions.get('window');
const SLIDE_PADDING = 24;

// ── Design tokens (independent of theme) ─────────────────────────────────────
// The tour intentionally locks to its own palette so it looks the same in
// light and dark mode — like Bolt's or Wolt's onboarding. The phone mockup
// inside always shows a light "screen" so previews stay legible.
const C = {
  bg:            '#324154',  // navy / slate
  cardEdge:      '#1f2937',  // phone bezel (slightly darker than bg)
  screenBg:      '#ffffff',  // phone screen background
  screenAlt:     '#f3f4f6',  // muted area on screen
  text:          '#0f172a',  // text on white
  textMuted:     '#64748b',  // muted body on white
  white:         '#ffffff',
  bodyOnDark:    '#cbd5e1',
  primary:       '#eab308',  // brand yellow
  primaryStrong: '#ca8a04',
  inactiveDot:   '#94a3b8',
  toggleBg:      'rgba(255,255,255,0.95)',
};

export async function shouldShowOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) !== '1';
  } catch {
    return false;
  }
}

async function markSeen(): Promise<void> {
  try { await AsyncStorage.setItem(STORAGE_KEY, '1'); } catch { /* best effort */ }
}

// Languages exposed in the toggle. We support 4 in the app overall; on the
// tour we surface only the 2 launch-market languages to keep the UI clean.
const TOGGLE_LANGS: Lang[] = ['sq', 'en'];
const LANG_LABELS: Record<Lang, string> = {
  sq: 'SQ', en: 'EN', fr: 'FR', es: 'ES', tr: 'TR',
};

// ── Phone mockup frame ───────────────────────────────────────────────────────

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <View style={frame.outer}>
      <View style={frame.bezel}>
        <View style={frame.notchWrap}>
          <View style={frame.notch} />
        </View>
        <View style={frame.screen}>
          <View style={frame.statusBar}>
            <Text style={frame.statusTime}>9:41</Text>
            <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
              <Text style={frame.statusIcon}>•••</Text>
              <Text style={frame.statusIcon}></Text>
              <Text style={frame.statusIcon}></Text>
            </View>
          </View>
          {children}
        </View>
      </View>
    </View>
  );
}

// ── Slide content mockups ───────────────────────────────────────────────────

function MapPreview() {
  return (
    <View style={previewStyles.mapWrap}>
      <View style={previewStyles.brandRow}>
        <Text style={previewStyles.brandLogo}>🚕</Text>
        <Text style={previewStyles.brandName}>TaxiMeIAfert</Text>
      </View>
      {/* Faux map grid */}
      <View style={previewStyles.mapBg}>
        {[...Array(6)].map((_, i) => (
          <View key={`h${i}`} style={[previewStyles.mapLineH, { top: 24 + i * 28 }]} />
        ))}
        {[...Array(5)].map((_, i) => (
          <View key={`v${i}`} style={[previewStyles.mapLineV, { left: 28 + i * 40 }]} />
        ))}
        <View style={previewStyles.locationPin}>
          <Text style={previewStyles.locationArrow}>📍</Text>
          <Text style={previewStyles.locationText}>Prishtinë</Text>
        </View>
      </View>
      {/* Bottom sheet preview */}
      <View style={previewStyles.bottomSheet}>
        <View style={previewStyles.bottomSheetHandle} />
        <Text style={previewStyles.fieldLabel}>Pickup location</Text>
        <View style={previewStyles.fieldInput}>
          <Text style={previewStyles.fieldText}>Prishtinë</Text>
        </View>
        <Text style={previewStyles.fieldLabelMuted}>Where to?</Text>
      </View>
    </View>
  );
}

function SearchingPreview() {
  return (
    <View style={previewStyles.searchWrap}>
      <View style={previewStyles.topBar}>
        <Text style={previewStyles.topBarBack}>←</Text>
        <Text style={previewStyles.topBarTitle}>Searching driver</Text>
        <View style={{ width: 12 }} />
      </View>
      <View style={previewStyles.driverCard}>
        <View style={previewStyles.driverCardTop}>
          <View style={previewStyles.driverAvatar}>
            <Text style={{ fontSize: 16 }}>👤</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={previewStyles.driverName}>Smail</Text>
              <Text style={{ color: C.primary, fontSize: 11 }}>★ 4.9</Text>
            </View>
            <Text style={previewStyles.driverSub}>Ford Mondeo</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={previewStyles.driverDistance}>1.2 km</Text>
            <Text style={previewStyles.driverEta}>5 min</Text>
          </View>
        </View>
        <View style={previewStyles.btnRow}>
          <View style={[previewStyles.btn, previewStyles.btnDecline]}>
            <Text style={previewStyles.btnDeclineText}>Decline</Text>
          </View>
          <View style={[previewStyles.btn, previewStyles.btnAccept]}>
            <Text style={previewStyles.btnAcceptText}>Accept</Text>
          </View>
        </View>
      </View>
      <View style={previewStyles.miniMap}>
        <View style={previewStyles.miniMapPulse} />
      </View>
    </View>
  );
}

function DriverInfoPreview() {
  return (
    <View style={previewStyles.infoWrap}>
      <View style={previewStyles.topBar}>
        <Text style={previewStyles.topBarBack}>←</Text>
        <Text style={previewStyles.topBarTitle}>Driver Information</Text>
        <View style={{ width: 12 }} />
      </View>
      <View style={previewStyles.avatarLarge}>
        <Text style={{ fontSize: 34 }}>🧑</Text>
      </View>
      <Text style={previewStyles.driverFullName}>Smail Raid</Text>
      <Text style={previewStyles.driverPlate}>Ford Mondeo · 56486 AV</Text>
      <View style={previewStyles.statsRow}>
        <View style={previewStyles.statBox}>
          <Text style={previewStyles.statIcon}>⭐</Text>
          <Text style={previewStyles.statValue}>4.9</Text>
          <Text style={previewStyles.statLabel}>Rating</Text>
        </View>
        <View style={previewStyles.statBox}>
          <Text style={previewStyles.statIcon}>🚗</Text>
          <Text style={previewStyles.statValue}>250</Text>
          <Text style={previewStyles.statLabel}>Rides</Text>
        </View>
        <View style={previewStyles.statBox}>
          <Text style={previewStyles.statIcon}>🕒</Text>
          <Text style={previewStyles.statValue}>2y</Text>
          <Text style={previewStyles.statLabel}>Member</Text>
        </View>
      </View>
    </View>
  );
}

// ── Slide model ──────────────────────────────────────────────────────────────

interface Slide {
  titleKey: string;
  bodyKey:  string;
  render:   () => React.ReactNode;
}

const SLIDES: Slide[] = [
  { titleKey: 'onboarding.slide1Title', bodyKey: 'onboarding.slide1Body', render: () => <MapPreview /> },
  { titleKey: 'onboarding.slide2Title', bodyKey: 'onboarding.slide2Body', render: () => <SearchingPreview /> },
  { titleKey: 'onboarding.slide3Title', bodyKey: 'onboarding.slide3Body', render: () => <DriverInfoPreview /> },
];

// ── Main component ──────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onDone:  () => void;
  /** When true, don't mark the flag on dismiss (replay mode from Profile). */
  replay?: boolean;
}

export default function OnboardingTour({ visible, onDone, replay = false }: Props) {
  const { t } = useTranslation();
  const lang = useI18nStore(s => s.lang);
  const setLang = useI18nStore(s => s.setLang);
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!visible) setIndex(0);
  }, [visible]);

  const finish = async () => {
    if (!replay) await markSeen();
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

  const isLast = index === SLIDES.length - 1;

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={[styles.slide, { width: SCREEN_W }]}>
      <PhoneFrame>{item.render()}</PhoneFrame>
      <Text style={styles.title}>{t(item.titleKey)}</Text>
      <Text style={styles.body}>{t(item.bodyKey)}</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => void finish()} statusBarTranslucent>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Language toggle */}
        <View style={styles.topBar}>
          <View style={styles.langToggle}>
            {TOGGLE_LANGS.map(code => {
              const active = lang === code;
              return (
                <TouchableOpacity
                  key={code}
                  onPress={() => setLang(code)}
                  activeOpacity={0.8}
                  style={[styles.langChip, active && styles.langChipActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch language to ${LANG_LABELS[code]}`}>
                  <Text style={[styles.langChipText, active && styles.langChipTextActive]}>
                    {LANG_LABELS[code]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
          // Re-render slides when language changes so titles update
          extraData={lang}
        />

        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={styles.cta} onPress={onNext} activeOpacity={0.9}>
          <Text style={styles.ctaText}>
            {isLast ? t('onboarding.getStarted') : t('common.next')}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  topBar: { paddingHorizontal: 18, paddingTop: 4, alignItems: 'flex-end' },
  langToggle: {
    flexDirection: 'row',
    backgroundColor: C.toggleBg,
    borderRadius: 22,
    padding: 4,
  },
  langChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 18,
  },
  langChipActive: { backgroundColor: C.bg },
  langChipText:        { fontSize: 13, fontWeight: '700', color: C.bg, letterSpacing: 0.5 },
  langChipTextActive:  { color: C.white },

  slide: {
    alignItems: 'center',
    paddingHorizontal: SLIDE_PADDING,
    paddingTop: 12,
  },
  title: {
    fontSize: 26, fontWeight: '800', color: C.white,
    textAlign: 'center', marginTop: 22, marginBottom: 10,
    letterSpacing: -0.4,
  },
  body: {
    fontSize: 15, color: C.bodyOnDark, textAlign: 'center',
    lineHeight: 22, paddingHorizontal: 8,
  },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  dot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: C.inactiveDot },
  dotActive: { backgroundColor: C.white, width: 26 },

  cta: {
    marginHorizontal: 24, marginBottom: 18,
    height: 56, borderRadius: 28,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  ctaText: { color: C.bg, fontSize: 16, fontWeight: '800', letterSpacing: 0.4 },
});

// ── Phone frame styles ──────────────────────────────────────────────────────

const PHONE_W = Math.min(SCREEN_W * 0.7, 280);
const PHONE_H = PHONE_W * 2.05;
const BEZEL = 8;

const frame = StyleSheet.create({
  outer: { alignItems: 'center', marginTop: 12 },
  bezel: {
    width: PHONE_W, height: PHONE_H,
    backgroundColor: C.cardEdge,
    borderRadius: 38,
    padding: BEZEL,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  notchWrap: {
    position: 'absolute', top: 6, left: 0, right: 0,
    alignItems: 'center', zIndex: 2,
  },
  notch: {
    width: 90, height: 22,
    backgroundColor: '#000',
    borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
  },
  screen: {
    flex: 1,
    backgroundColor: C.screenBg,
    borderRadius: 30,
    overflow: 'hidden',
  },
  statusBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4, height: 28,
  },
  statusTime:  { fontSize: 11, fontWeight: '700', color: C.text },
  statusIcon:  { fontSize: 9, color: C.text, fontWeight: '700' },
});

// ── Preview content styles ──────────────────────────────────────────────────

const previewStyles = StyleSheet.create({
  // ── Map preview (slide 1) ──
  mapWrap: { flex: 1 },
  brandRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, paddingTop: 4 },
  brandLogo: { fontSize: 14 },
  brandName: { fontSize: 13, fontWeight: '800', color: C.text },
  mapBg: { flex: 1, backgroundColor: C.screenAlt, marginTop: 6, position: 'relative', overflow: 'hidden' },
  mapLineH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#e2e8f0' },
  mapLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#e2e8f0' },
  locationPin: {
    position: 'absolute', top: '40%', left: 0, right: 0,
    alignItems: 'center',
  },
  locationArrow: { fontSize: 18 },
  locationText: { fontSize: 11, fontWeight: '700', color: C.text, marginTop: 2 },
  bottomSheet: {
    backgroundColor: C.screenBg,
    paddingHorizontal: 14, paddingTop: 8, paddingBottom: 16,
    borderTopWidth: 1, borderTopColor: '#e2e8f0',
  },
  bottomSheetHandle: { alignSelf: 'center', width: 36, height: 3, borderRadius: 2, backgroundColor: '#cbd5e1', marginBottom: 8 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: C.text, marginBottom: 4 },
  fieldLabelMuted: { fontSize: 10, fontWeight: '600', color: C.textMuted, marginTop: 8 },
  fieldInput: {
    height: 30, borderRadius: 8, backgroundColor: C.screenAlt,
    paddingHorizontal: 10, justifyContent: 'center',
  },
  fieldText: { fontSize: 11, color: C.text, fontWeight: '600' },

  // ── Searching preview (slide 2) ──
  searchWrap: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  topBarBack: { fontSize: 16, color: C.text, fontWeight: '700' },
  topBarTitle: { fontSize: 12, fontWeight: '800', color: C.text },
  driverCard: {
    marginHorizontal: 12, marginTop: 4,
    backgroundColor: C.screenBg,
    borderRadius: 14, padding: 10,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  driverCardTop: { flexDirection: 'row', alignItems: 'center' },
  driverAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.screenAlt, alignItems: 'center', justifyContent: 'center',
  },
  driverName: { fontSize: 12, fontWeight: '800', color: C.text },
  driverSub:  { fontSize: 10, color: C.textMuted, marginTop: 1 },
  driverDistance: { fontSize: 11, fontWeight: '700', color: C.text },
  driverEta:      { fontSize: 10, color: C.textMuted },
  btnRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  btn:    { flex: 1, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnDecline:     { backgroundColor: C.screenAlt },
  btnAccept:      { backgroundColor: C.bg },
  btnDeclineText: { fontSize: 11, fontWeight: '700', color: C.textMuted },
  btnAcceptText:  { fontSize: 11, fontWeight: '700', color: C.white },
  miniMap: {
    flex: 1, marginTop: 10,
    backgroundColor: C.screenAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  miniMapPulse: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.bg + '33',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Driver info preview (slide 3) ──
  infoWrap: { flex: 1, alignItems: 'center' },
  avatarLarge: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: C.screenAlt, alignItems: 'center', justifyContent: 'center',
    marginTop: 10,
  },
  driverFullName: { fontSize: 14, fontWeight: '800', color: C.text, marginTop: 10 },
  driverPlate:    { fontSize: 11, color: C.textMuted, marginTop: 2 },
  statsRow: { flexDirection: 'row', marginTop: 14, gap: 10, paddingHorizontal: 14 },
  statBox: {
    flex: 1,
    borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
    paddingVertical: 10, alignItems: 'center',
  },
  statIcon:  { fontSize: 16, marginBottom: 4 },
  statValue: { fontSize: 13, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 9, color: C.textMuted, marginTop: 1 },
});
