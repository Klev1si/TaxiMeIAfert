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
import {
  companyApi,
  type AnalyticsDay,
  type AnalyticsResponse,
  type CompanyStats,
  type EarningsResponse,
} from '../../api/company';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';

type Period   = 'today' | 'week' | 'month' | 'all';
type ChartDays = 7 | 14 | 30;
type ChartMode = 'rides' | 'revenue';

const PERIODS: { label: string; value: Period }[] = [
  { label: 'Today',      value: 'today' },
  { label: 'This week',  value: 'week'  },
  { label: 'This month', value: 'month' },
  { label: 'All time',   value: 'all'   },
];

const CHART_DAYS: { label: string; value: ChartDays }[] = [
  { label: '7 days',  value: 7  },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Short date label for chart x-axis */
function shortDate(iso: string, totalDays: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (totalDays <= 7) {
    // Show day abbreviation: Mon, Tue …
    return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  }
  // Show month/day: Apr 1
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: {
  label: string; value: string; icon: string; color: string;
}) {
  const colors = useColors();
  const statStyles = useMemo(() => getStatStylesStyles(colors), [colors]);
  return (
    <View style={[statStyles.card, { borderLeftColor: color }]}>
      <Text style={statStyles.icon}>{icon}</Text>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  const miniStyles = useMemo(() => getMiniStylesStyles(colors), [colors]);
  return (
    <View style={miniStyles.row}>
      <Text style={miniStyles.label}>{label}</Text>
      <Text style={miniStyles.value}>{value}</Text>
    </View>
  );
}

// ── Analytics Chart ────────────────────────────────────────────────────────────

function AnalyticsChart({
  data,
  days,
  onChangeDays,
}: {
  data: AnalyticsResponse | null;
  days: ChartDays;
  onChangeDays: (d: ChartDays) => void;
}) {
  const colors = useColors();
  const chartStyles = useMemo(() => getChartStylesStyles(colors), [colors]);
  const { t } = useTranslation();
  const [mode, setMode] = useState<ChartMode>('rides');

  const values = useMemo(() => {
    if (!data) return [];
    return data.ridesPerDay.map(d => (mode === 'rides' ? d.count : d.revenue));
  }, [data, mode]);

  const maxVal = useMemo(() => Math.max(...values, 1), [values]);

  // For 30-day view we only label every ~5th day to avoid crowding
  const labelEvery = days <= 7 ? 1 : days <= 14 ? 2 : 5;

  if (!data) {
    return (
      <View style={chartStyles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const barColor = mode === 'rides' ? colors.primary : colors.success;

  return (
    <View style={chartStyles.container}>
      {/* Header row */}
      <View style={chartStyles.headerRow}>
        <View>
          <Text style={chartStyles.totalValue}>
            {mode === 'rides'
              ? data.totals.rides
              : `$${data.totals.revenue.toFixed(2)}`}
          </Text>
          <Text style={chartStyles.totalLabel}>
            {mode === 'rides' ? t('company.dashboard.totalRides') : t('company.dashboard.totalRevenue')} · {t('company.dashboard.last', { n: days })}
          </Text>
        </View>

        {/* Mode toggle */}
        <View style={chartStyles.modeToggle}>
          {(['rides', 'revenue'] as ChartMode[]).map(m => (
            <TouchableOpacity
              key={m}
              style={[chartStyles.modeBtn, mode === m && chartStyles.modeBtnActive]}
              onPress={() => setMode(m)}
              activeOpacity={0.75}
              accessibilityRole="radio"
              accessibilityLabel={m === 'rides' ? 'Rides' : 'Revenue'}
              accessibilityState={{ checked: mode === m }}>
              <Text style={[chartStyles.modeBtnText, mode === m && chartStyles.modeBtnTextActive]}>
                {m === 'rides' ? `🚖 ${t('company.dashboard.ridesMode')}` : `💰 ${t('company.dashboard.revenueMode')}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Bars */}
      <View style={chartStyles.barsArea}>
        {data.ridesPerDay.map((day, i) => {
          const val = mode === 'rides' ? day.count : day.revenue;
          const pct = maxVal > 0 ? val / maxVal : 0;
          const barH = Math.max(Math.round(pct * CHART_MAX_H), val > 0 ? 4 : 2);
          const showLabel = i % labelEvery === 0;

          return (
            <View key={day.date} style={chartStyles.barCol}>
              {/* Value label on top — only when bar is tall enough or >0 */}
              {val > 0 && days <= 14 && (
                <Text style={chartStyles.barTopLabel} numberOfLines={1}>
                  {mode === 'rides' ? String(val) : `$${val}`}
                </Text>
              )}
              {/* The bar itself */}
              <View style={chartStyles.barTrack}>
                <View
                  style={[
                    chartStyles.barFill,
                    { height: barH, backgroundColor: barColor },
                    val === 0 && chartStyles.barEmpty,
                  ]}
                />
              </View>
              {/* X-axis label */}
              {showLabel && (
                <Text style={chartStyles.barDateLabel} numberOfLines={1}>
                  {shortDate(day.date, days)}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Day range pills */}
      <View style={chartStyles.dayRow}>
        {CHART_DAYS.map(d => (
          <TouchableOpacity
            key={d.value}
            style={[chartStyles.dayPill, days === d.value && chartStyles.dayPillActive]}
            onPress={() => onChangeDays(d.value)}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityLabel={`Chart range: ${d.label}`}
            accessibilityState={{ checked: days === d.value }}>
            <Text style={[chartStyles.dayPillText, days === d.value && chartStyles.dayPillTextActive]}>
              {d.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const CHART_MAX_H = 90; // px — max bar height

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CompanyDashboardScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [stats,      setStats]      = useState<CompanyStats | null>(null);
  const [earnings,   setEarnings]   = useState<EarningsResponse | null>(null);
  const [analytics,  setAnalytics]  = useState<AnalyticsResponse | null>(null);
  const [period,     setPeriod]     = useState<Period>('week');
  const [chartDays,  setChartDays]  = useState<ChartDays>(7);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const loadAnalytics = useCallback(async (days: ChartDays) => {
    try {
      const res = await companyApi.getAnalytics(days);
      setAnalytics(res.data);
    } catch { /* non-critical — chart stays loading */ }
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [statsRes, earningsRes] = await Promise.all([
        companyApi.getStats(),
        companyApi.getEarnings(period),
      ]);
      setStats(statsRes.data);
      setEarnings(earningsRes.data);
    } catch {
      setError(t('company.dashboard.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  // Load main stats + initial analytics on mount
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAnalytics(chartDays); }, [loadAnalytics, chartDays]);

  const handleChartDaysChange = (days: ChartDays) => {
    setChartDays(days);
    setAnalytics(null); // clear so chart shows spinner while fetching
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}>

        <Text style={styles.title}>{t('company.dashboard.title')}</Text>
        <Text style={styles.subtitle}>{t('company.dashboard.subtitle')}</Text>

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
              accessibilityLabel="Retry loading dashboard">
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Stat cards ── */}
            <Text style={styles.sectionLabel}>{t('company.dashboard.overviewLabel')}</Text>
            <View style={styles.statsGrid}>
              <StatCard label={t('company.dashboard.statTotalRides')}     value={String(stats?.totalRides ?? 0)}     icon="🚖" color={colors.info} />
              <StatCard label={t('company.dashboard.statCompleted')}       value={String(stats?.completedRides ?? 0)} icon="✅" color={colors.success} />
              <StatCard label={t('company.dashboard.statCancelled')}       value={String(stats?.cancelledRides ?? 0)} icon="❌" color={colors.error} />
              <StatCard label={t('company.dashboard.statActiveDrivers')}  value={String(stats?.activeDrivers ?? 0)}  icon="🧑‍✈️" color={colors.primary} />
              <StatCard label={t('company.dashboard.statPendingDrivers')} value={String(stats?.pendingDrivers ?? 0)} icon="⏳" color={colors.warning} />
              <StatCard label={t('company.dashboard.statCommission')}      value={`${stats?.driverCommissionPct ?? '—'}%`} icon="💼" color={colors.textSecondary} />
            </View>

            {/* ── Analytics chart ── */}
            <Text style={styles.sectionLabel}>{t('company.dashboard.analyticsLabel')}</Text>
            <View style={styles.chartCard}>
              <AnalyticsChart
                data={analytics}
                days={chartDays}
                onChangeDays={handleChartDaysChange}
              />
            </View>

            {/* ── Earnings period selector ── */}
            <Text style={styles.sectionLabel}>{t('company.dashboard.earningsLabel')}</Text>
            <View style={styles.periodRow}>
              {PERIODS.map(p => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.pill, period === p.value && styles.pillActive]}
                  onPress={() => setPeriod(p.value)}
                  activeOpacity={0.75}
                  accessibilityRole="radio"
                  accessibilityLabel={`Earnings period: ${p.label}`}
                  accessibilityState={{ checked: period === p.value }}>
                  <Text style={[styles.pillText, period === p.value && styles.pillTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Earnings summary card ── */}
            {earnings && (
              <>
                <View style={styles.earningsHero}>
                  <View style={styles.earningsHeroLeft}>
                    <Text style={styles.earningsLabel}>{t('company.dashboard.companyShare')}</Text>
                    <Text style={styles.earningsAmount}>
                      ${earnings.summary.companyShare.toFixed(2)}
                    </Text>
                    <Text style={styles.earningsSub}>
                      {earnings.summary.rides !== 1
                        ? t('company.dashboard.fromRidesPlural', { n: earnings.summary.rides })
                        : t('company.dashboard.fromRides', { n: earnings.summary.rides })}
                    </Text>
                  </View>
                  <View style={styles.earningsHeroRight}>
                    <MiniStat label={t('company.dashboard.totalFare')}   value={`$${earnings.summary.totalFare.toFixed(2)}`} />
                    <MiniStat label={t('company.dashboard.driverShare')} value={`$${earnings.summary.driverShare.toFixed(2)}`} />
                    <MiniStat label={t('company.dashboard.commission')}  value={`${earnings.commissionPct}%`} />
                  </View>
                </View>

                {/* ── Per-driver breakdown ── */}
                {earnings.perDriver.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>{t('company.dashboard.perDriverLabel')}</Text>
                    <View style={styles.card}>
                      {earnings.perDriver.map((row, i) => (
                        <View key={row.driverId}>
                          {i > 0 && <View style={styles.divider} />}
                          <View style={styles.driverEarningsRow}>
                            <View style={styles.driverEarningsLeft}>
                              <Text style={styles.driverName}>
                                {row.firstName} {row.lastName}
                              </Text>
                              <Text style={styles.driverRideCount}>
                                {row.rides} ride{row.rides !== 1 ? 's' : ''}
                              </Text>
                            </View>
                            <View style={styles.driverEarningsRight}>
                              <Text style={styles.driverFare}>${row.totalFare.toFixed(2)}</Text>
                              <Text style={styles.driverShareText}>
                                Driver: ${row.driverShare.toFixed(2)} · Co: ${row.companyShare.toFixed(2)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {earnings.summary.rides === 0 && (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>
                      {t('company.dashboard.noFaresMsg')}
                    </Text>
                  </View>
                )}
              </>
            )}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── StyleSheets ───────────────────────────────────────────────────────────────

function getStatStylesStyles(c: ColorPalette) { return StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: c.border,
  },
  icon:  { fontSize: 20, marginBottom: 4 },
  value: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  label: { fontSize: 11, color: c.textSecondary, fontWeight: '600' },
}); }

function getMiniStylesStyles(c: ColorPalette) { return StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.75)' },
  value: { fontSize: 12, fontWeight: '700', color: '#fff' },
}); }

function getChartStylesStyles(c: ColorPalette) { return StyleSheet.create({
  container: { padding: 4 },

  loading: { height: 160, alignItems: 'center', justifyContent: 'center' },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 8,
  },
  totalValue: { fontSize: 26, fontWeight: '800', color: c.text },
  totalLabel: { fontSize: 12, color: c.textSecondary, marginTop: 2 },

  modeToggle: { flexDirection: 'row', gap: 6 },
  modeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  modeBtnActive:     { backgroundColor: c.primary, borderColor: c.primary },
  modeBtnText:       { fontSize: 11, fontWeight: '700', color: c.textSecondary },
  modeBtnTextActive: { color: c.textOnPrimary },

  // Bars area
  barsArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_MAX_H + 36, // bar height + label space
    gap: 2,
    marginBottom: 12,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: CHART_MAX_H + 36,
  },
  barTopLabel: {
    fontSize: 8,
    color: c.textSecondary,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
  },
  barTrack: {
    width: '100%',
    height: CHART_MAX_H,
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 3,
    minHeight: 2,
  },
  barEmpty: {
    backgroundColor: c.border,
    height: 2,
  },
  barDateLabel: {
    fontSize: 8,
    color: c.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },

  // Day range pills
  dayRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 4,
  },
  dayPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  dayPillActive:     { backgroundColor: c.primaryLight, borderColor: c.primary },
  dayPillText:       { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  dayPillTextActive: { color: c.primary },
}); }

function getStyles(c: ColorPalette) { return StyleSheet.create({
  safe:   { flex: 1, backgroundColor: c.background },
  scroll: { padding: Sizes.screenPadding },

  title:    { fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 4 },
  subtitle: { fontSize: 13, color: c.textSecondary, marginBottom: 20 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: c.textSecondary,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 10, marginLeft: 2,
  },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },

  chartCard: {
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 28,
  },

  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5, borderColor: c.border,
    backgroundColor: c.surface,
  },
  pillActive:     { backgroundColor: c.primary, borderColor: c.primary },
  pillText:       { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  pillTextActive: { color: c.textOnPrimary },

  earningsHero: {
    backgroundColor: c.primary, borderRadius: 20,
    padding: 20, flexDirection: 'row', marginBottom: 20,
    alignItems: 'center',
  },
  earningsHeroLeft:  { flex: 1 },
  earningsHeroRight: { flex: 1, paddingLeft: 16 },
  earningsLabel:  { fontSize: 12, color: c.textOnPrimary, opacity: 0.7, marginBottom: 4 },
  earningsAmount: { fontSize: 36, fontWeight: '900', color: c.textOnPrimary, letterSpacing: -1 },
  earningsSub:    { fontSize: 12, color: c.textOnPrimary, opacity: 0.7, marginTop: 4 },

  card: {
    backgroundColor: c.surface, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 4,
    borderWidth: 1, borderColor: c.border, marginBottom: 20,
  },
  divider: { height: 1, backgroundColor: c.border },
  driverEarningsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 12,
  },
  driverEarningsLeft:  { flex: 1 },
  driverEarningsRight: { alignItems: 'flex-end' },
  driverName:       { fontSize: 14, fontWeight: '700', color: c.text },
  driverRideCount:  { fontSize: 12, color: c.textSecondary, marginTop: 2 },
  driverFare:       { fontSize: 15, fontWeight: '800', color: c.text },
  driverShareText:  { fontSize: 11, color: c.textSecondary, marginTop: 2 },

  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  errorText:  { fontSize: 15, color: c.error, textAlign: 'center', marginBottom: 16 },
  retryBtn:   { backgroundColor: c.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText:  { fontWeight: '700', color: c.textOnPrimary },

  emptyBox: {
    backgroundColor: c.surfaceAlt, borderRadius: 12,
    padding: 16, alignItems: 'center', marginBottom: 20,
  },
  emptyText: { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20 },
}); }
