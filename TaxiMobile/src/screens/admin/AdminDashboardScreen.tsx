import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { adminApi, type AdminStats, type Analytics, type TopDriver } from '../../api/admin';
import { useTranslation } from '../../i18n';

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent, colors }: { label: string; value: number; accent?: string; colors: ColorPalette }) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <View style={[styles.statCard, accent ? { borderLeftColor: accent, borderLeftWidth: 3 } : {}]}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Mini bar chart (text-based sparkline) ─────────────────────────────────────

function SparkBar({ value, max, color, colors }: { value: number; max: number; color: string; colors: ColorPalette }) {
  const spark = useMemo(() => getSparkStyles(colors), [colors]);
  const pct = max > 0 ? value / max : 0;
  return (
    <View style={spark.track}>
      <View style={[spark.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

function getSparkStyles(c: ColorPalette) {
  return StyleSheet.create({
    track: { height: 6, backgroundColor: c.border, borderRadius: 3, flex: 1 },
    fill:  { height: 6, borderRadius: 3 },
  });
}

// ── Analytics section ─────────────────────────────────────────────────────────

function AnalyticsSection({ data, colors }: { data: Analytics; colors: ColorPalette }) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const maxTotal = Math.max(...data.ridesPerDay.map(d => d.total), 1);

  return (
    <>
      {/* Rides per day */}
      <Text style={styles.sectionLabel}>{t('admin.dashboard.ridesPerDay')}</Text>
      <View style={styles.chartCard}>
        {data.ridesPerDay.length === 0 ? (
          <Text style={styles.emptyHint}>{t('admin.dashboard.noRideData')}</Text>
        ) : (
          data.ridesPerDay.map(day => (
            <View key={day.date} style={styles.chartRow}>
              <Text style={styles.chartDate}>{day.date.slice(5)}</Text>
              <SparkBar value={day.total} max={maxTotal} color={colors.primary} colors={colors} />
              <Text style={styles.chartCount}>{day.total}</Text>
            </View>
          ))
        )}
      </View>

      {/* Top drivers */}
      {data.topDrivers.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{t('admin.dashboard.topDrivers')}</Text>
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, styles.tableHeadText, { flex: 2 }]}>{t('admin.dashboard.colDriver')}</Text>
              <Text style={[styles.tableCell, styles.tableHeadText]}>{t('admin.dashboard.colPlate')}</Text>
              <Text style={[styles.tableCell, styles.tableHeadText]}>{t('admin.dashboard.colRides')}</Text>
              <Text style={[styles.tableCell, styles.tableHeadText]}>⭐</Text>
            </View>
            {data.topDrivers.map((d, i) => (
              <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{d.name}</Text>
                <Text style={styles.tableCell}>{d.plate}</Text>
                <Text style={styles.tableCell}>{d.rides}</Text>
                <Text style={styles.tableCell}>{d.rating.toFixed(1)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminDashboardScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [stats, setStats]         = useState<AdminStats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [days, setDays]           = useState<7 | 30>(7);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [sRes, aRes] = await Promise.all([
        adminApi.getStats(),
        adminApi.getAnalytics(days),
      ]);
      setStats(sRes.data);
      setAnalytics(aRes.data);
    } catch {
      Alert.alert(t('common.error'), t('admin.dashboard.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>

        <Text style={styles.title}>{t('admin.dashboard.title')}</Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* Stats grid */}
            {stats && (
              <>
                <Text style={styles.sectionLabel}>{t('admin.dashboard.overviewLabel')}</Text>
                <View style={styles.statsGrid}>
                  <StatCard label={t('admin.dashboard.statTotalRides')}      value={stats.totalRides}      accent={colors.primary} colors={colors} />
                  <StatCard label={t('admin.dashboard.statCompleted')}        value={stats.completedRides}  accent={colors.success} colors={colors} />
                  <StatCard label={t('admin.dashboard.statCancelled')}        value={stats.cancelledRides}  accent={colors.error}   colors={colors} />
                  <StatCard label={t('admin.dashboard.statActiveDrivers')}    value={stats.activeDrivers}   accent={colors.info ?? '#3b82f6'} colors={colors} />
                  <StatCard label={t('admin.dashboard.statPendingDrivers')}   value={stats.pendingDrivers}  accent={colors.warning ?? '#f59e0b'} colors={colors} />
                  <StatCard label={t('admin.dashboard.statClients')}          value={stats.totalClients}    colors={colors} />
                  <StatCard label={t('admin.dashboard.statCompanies')}        value={stats.totalCompanies}  colors={colors} />
                </View>
              </>
            )}

            {/* Analytics period toggle */}
            <View style={styles.periodRow}>
              {([7, 30] as const).map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.periodPill, days === d && styles.periodPillActive]}
                  onPress={() => setDays(d)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Analytics period: last ${d} days`}
                  accessibilityState={{ checked: days === d }}>
                  <Text style={[styles.periodText, days === d && styles.periodTextActive]}>
                    {t('admin.dashboard.lastNDays', { n: d })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {analytics && <AnalyticsSection data={analytics} colors={colors} />}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: c.background },
    scroll: { padding: Sizes.screenPadding, paddingBottom: 40 },

    title: { fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 20 },

    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textSecondary,
      letterSpacing: 0.8, textTransform: 'uppercase',
      marginBottom: 10, marginLeft: 2,
    },

    // Stats grid
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 24,
    },
    statCard: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      width: '47%',
      borderWidth: 1,
      borderColor: c.border,
    },
    statValue: { fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 2 },
    statLabel: { fontSize: 12, color: c.textSecondary },

    // Period toggle
    periodRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    periodPill: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 16,
      paddingVertical: 6,
      backgroundColor: c.surface,
    },
    periodPillActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    periodText:       { fontSize: 13, color: c.textSecondary },
    periodTextActive: { color: c.white, fontWeight: '600' },

    // Chart
    chartCard: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      gap: 10,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 20,
    },
    chartRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    chartDate: { fontSize: 11, color: c.textSecondary, width: 36 },
    chartCount: { fontSize: 12, color: c.text, fontWeight: '600', width: 28, textAlign: 'right' },

    emptyHint: { fontSize: 13, color: c.textSecondary, textAlign: 'center', paddingVertical: 8 },

    // Table
    tableCard: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
      marginBottom: 20,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: c.primary + '18',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    tableRow:    { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10 },
    tableRowAlt: { backgroundColor: c.background },
    tableCell:   { flex: 1, fontSize: 12, color: c.text },
    tableHeadText: { fontWeight: '700', color: c.primary, fontSize: 11, textTransform: 'uppercase' },
  });
}
