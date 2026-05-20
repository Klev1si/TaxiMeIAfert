import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../api/client';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'all';

interface EarningsData {
  period: string;
  rides: number;
  totalFare: number;
  commissionPct: number;
  driverShare: number;
}

const PERIODS: { label: string; value: Period }[] = [
  { label: 'Today',     value: 'today' },
  { label: 'This week', value: 'week'  },
  { label: 'This month',value: 'month' },
  { label: 'All time',  value: 'all'   },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function EarningsScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [period,    setPeriod]    = useState<Period>('week');
  const [data,      setData]      = useState<EarningsData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<EarningsData>(`/rides/earnings?period=${period}`);
      setData(res.data);
    } catch {
      setError(t('driver.earnings.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const companyShare =
    data ? Math.round((data.totalFare - data.driverShare) * 100) / 100 : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)}
            colors={[colors.primary]} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Text style={styles.title}>{t('driver.earnings.title')}</Text>
        <Text style={styles.subtitle}>{t('driver.earnings.subtitle')}</Text>

        {/* Period selector */}
        <View style={styles.periodRow}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.value}
              style={[styles.pill, period === p.value && styles.pillActive]}
              onPress={() => setPeriod(p.value)}
              activeOpacity={0.75}
              accessibilityRole="radio"
              accessibilityLabel={`Period: ${p.value}`}
              accessibilityState={{ checked: period === p.value }}>
              <Text style={[styles.pillText, period === p.value && styles.pillTextActive]}>
                {p.value === 'today' ? t('driver.earnings.periodToday')
                  : p.value === 'week' ? t('driver.earnings.periodWeek')
                  : p.value === 'month' ? t('driver.earnings.periodMonth')
                  : t('driver.earnings.periodAll')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => load()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading earnings">
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : data ? (
          <>
            {/* Hero card */}
            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>{t('driver.earnings.yourEarnings')}</Text>
              <Text style={styles.heroAmount}>${data.driverShare.toFixed(2)}</Text>
              <Text style={styles.heroSub}>
                {data.rides !== 1
                  ? t('driver.earnings.fromRidesPlural', { n: data.rides })
                  : t('driver.earnings.fromRides', { n: data.rides })}
              </Text>
            </View>

            {/* Breakdown */}
            <Text style={styles.sectionLabel}>{t('driver.earnings.breakdownTitle')}</Text>
            <View style={styles.card}>
              <Row label={t('driver.earnings.totalFare')} value={`$${data.totalFare.toFixed(2)}`} />
              <Divider />
              <Row
                label={t('driver.earnings.yourShare', { pct: data.commissionPct })}
                value={`$${data.driverShare.toFixed(2)}`}
                valueColor={colors.success}
              />
              {data.commissionPct < 100 && (
                <>
                  <Divider />
                  <Row
                    label={t('driver.earnings.companyShare', { pct: (100 - data.commissionPct).toFixed(0) })}
                    value={`$${companyShare.toFixed(2)}`}
                    valueColor={colors.textSecondary}
                  />
                </>
              )}
              <Divider />
              <Row label={t('driver.earnings.completedRides')} value={String(data.rides)} />
            </View>

            {/* Commission info */}
            {data.commissionPct < 100 && (
              <View style={styles.noteBox}>
                <Text style={styles.noteText}>
                  💼 {t('driver.earnings.commissionNote', { pct: data.commissionPct })}
                </Text>
              </View>
            )}

            {data.rides === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  {t('driver.earnings.emptyMsg')}
                </Text>
              </View>
            )}
          </>
        ) : null}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Row({ label, value, valueColor }: {
  label: string; value: string; valueColor?: string;
}) {
  const colors = useColors();
  const rowStyles = useMemo(() => getRowStyles(colors), [colors]);
  return (
    <View style={rowStyles.wrap}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

function Divider() {
  const colors = useColors();
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />;
}

function getRowStyles(c: ColorPalette) { return StyleSheet.create({
  wrap:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  label: { fontSize: 14, color: c.textSecondary },
  value: { fontSize: 15, fontWeight: '700', color: c.text },
}); }

// ── Styles ───────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  safe:   { flex: 1, backgroundColor: c.background },
  scroll: { padding: Sizes.screenPadding },

  title:    { fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 4 },
  subtitle: { fontSize: 13, color: c.textSecondary, marginBottom: 20 },

  // Period pills
  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5, borderColor: c.border,
    backgroundColor: c.surface,
  },
  pillActive: { backgroundColor: c.primary, borderColor: c.primary },
  pillText:   { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  pillTextActive: { color: c.textOnPrimary },

  // Hero card
  heroCard: {
    backgroundColor: c.primary, borderRadius: 20,
    padding: 28, alignItems: 'center', marginBottom: 24,
  },
  heroLabel:  { fontSize: 14, fontWeight: '600', color: c.textOnPrimary, opacity: 0.7, marginBottom: 6 },
  heroAmount: { fontSize: 48, fontWeight: '900', color: c.textOnPrimary, letterSpacing: -1 },
  heroSub:    { fontSize: 13, color: c.textOnPrimary, opacity: 0.7, marginTop: 4 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: c.textSecondary,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 8, marginLeft: 4,
  },

  card: {
    backgroundColor: c.surface, borderRadius: 16,
    paddingHorizontal: 20, paddingVertical: 4,
    borderWidth: 1, borderColor: c.border, marginBottom: 20,
  },

  noteBox: {
    backgroundColor: c.infoLight, borderRadius: 12,
    padding: 14, marginBottom: 16, borderWidth: 1, borderColor: c.info,
  },
  noteText: { fontSize: 13, color: c.info, lineHeight: 18 },

  emptyBox: {
    backgroundColor: c.surfaceAlt, borderRadius: 12,
    padding: 16, alignItems: 'center',
  },
  emptyText: { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20 },

  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  errorText:  { fontSize: 15, color: c.error, textAlign: 'center', marginBottom: 16 },
  retryBtn:   { backgroundColor: c.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText:  { fontWeight: '700', color: c.textOnPrimary },

  bottomPad: { height: 32 },
}); }
