/**
 * AdminFinancesScreen — cross-platform view of who earned what.
 *
 * Two tabs: Drivers / Companies. Each shows the 3-way breakdown
 * (driver / company / platform) and what the platform owes drivers
 * from card payments (after the 10% platform fee).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  adminFinancesApi,
  type AdminCompanyFinance,
  type AdminDriverFinance,
  type FinancePeriod,
} from '../../api/admin-finances';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';

const PERIODS: { value: FinancePeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week',  label: 'Week'  },
  { value: 'month', label: 'Month' },
  { value: 'all',   label: 'All'   },
];

const money = (n: number) => `$${n.toFixed(2)}`;

type Tab = 'drivers' | 'companies';

export default function AdminFinancesScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const navigation = useNavigation();

  const [tab,       setTab]       = useState<Tab>('drivers');
  const [period,    setPeriod]    = useState<FinancePeriod>('all');
  const [drivers,   setDrivers]   = useState<AdminDriverFinance[]>([]);
  const [companies, setCompanies] = useState<AdminCompanyFinance[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [dRes, cRes] = await Promise.all([
        adminFinancesApi.getDrivers(period),
        adminFinancesApi.getCompanies(period),
      ]);
      setDrivers(dRes.data);
      setCompanies(cRes.data);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Could not load finances.';
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, t]);

  useEffect(() => { load(); }, [load]);

  // ── Totals (sum across the current tab's rows) ──────────────────────────
  const totals = useMemo(() => {
    const rows = tab === 'drivers' ? drivers : companies;
    const t = { driver: 0, company: 0, platform: 0, cardDue: 0 };
    for (const r of rows) {
      t.driver   += r.driverEarning;
      t.company  += r.companyEarning;
      t.platform += r.platformEarning;
      t.cardDue  += tab === 'drivers'
        ? (r as AdminDriverFinance).cardDueToDriver
        : (r as AdminCompanyFinance).cardDueToDrivers;
    }
    return {
      driver:   Math.round(t.driver   * 100) / 100,
      company:  Math.round(t.company  * 100) / 100,
      platform: Math.round(t.platform * 100) / 100,
      cardDue:  Math.round(t.cardDue  * 100) / 100,
    };
  }, [tab, drivers, companies]);

  if (loading && drivers.length === 0 && companies.length === 0) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}>
          <Text style={styles.backBtn}>‹ {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Platform Finances</Text>
        <View style={{ width: 60 }} />
      </View>
      <FlatList
        data={tab === 'drivers' ? drivers : companies}
        keyExtractor={(item: any) => item.driverId ?? item.companyId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)}
            colors={[colors.primary]} tintColor={colors.primary} />
        }
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>

            {/* Tab switch */}
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, tab === 'drivers' && styles.tabActive]}
                onPress={() => setTab('drivers')}>
                <Text style={[styles.tabText, tab === 'drivers' && styles.tabTextActive]}>
                  🚗 Drivers
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === 'companies' && styles.tabActive]}
                onPress={() => setTab('companies')}>
                <Text style={[styles.tabText, tab === 'companies' && styles.tabTextActive]}>
                  🏢 Companies
                </Text>
              </TouchableOpacity>
            </View>

            {/* Period selector */}
            <View style={styles.periodRow}>
              {PERIODS.map(p => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.pill, period === p.value && styles.pillActive]}
                  onPress={() => setPeriod(p.value)}
                  activeOpacity={0.75}>
                  <Text style={[styles.pillText, period === p.value && styles.pillTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Totals card */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>
                Platform earnings · {tab === 'drivers' ? drivers.length : companies.length}
                {' '}{tab === 'drivers' ? 'drivers' : 'companies'}
              </Text>
              <Text style={styles.summaryValue}>{money(totals.platform)}</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryColLabel}>🚗 Drivers</Text>
                  <Text style={styles.summaryColValue}>{money(totals.driver)}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryColLabel}>🏢 Companies</Text>
                  <Text style={styles.summaryColValue}>{money(totals.company)}</Text>
                </View>
              </View>
            </View>

            {/* "Owed to drivers from card" callout */}
            <View style={styles.owedCard}>
              <Text style={styles.owedCardLabel}>💳 Platform owes drivers (card share)</Text>
              <Text style={styles.owedCardValue}>{money(totals.cardDue)}</Text>
              <Text style={styles.owedCardHint}>
                Card revenue minus the 10% platform fee, owed to drivers
              </Text>
            </View>

            {/* Section header */}
            <Text style={styles.sectionHeader}>
              {tab === 'drivers' ? 'Per Driver' : 'Per Company'}
            </Text>
          </View>
        }
        renderItem={({ item }: any) => (
          tab === 'drivers'
            ? <DriverRow item={item as AdminDriverFinance} styles={styles} colors={colors} />
            : <CompanyRow item={item as AdminCompanyFinance} styles={styles} colors={colors} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyText}>No data for this period yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ── Driver row ───────────────────────────────────────────────────────────────
function DriverRow({
  item, styles, colors,
}: { item: AdminDriverFinance; styles: any; colors: ColorPalette }) {
  return (
    <View style={styles.rowCard}>
      <View style={styles.rowHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{item.firstName} {item.lastName}</Text>
          <Text style={styles.rowSub}>
            {item.companyName ? `🏢 ${item.companyName}` : '👤 Solo'}
            {' · '}{item.vehiclePlate}
          </Text>
        </View>
        <View style={styles.commissionBadge}>
          <Text style={styles.commissionBadgeText}>{item.effectiveCommissionPct}%</Text>
        </View>
      </View>

      <View style={styles.miniBreakdown}>
        <BreakCol label="🚗 Driver"   value={item.driverEarning}   color={colors.warning} styles={styles} />
        <BreakCol label="🏢 Company"  value={item.companyEarning}  color={colors.primary} styles={styles} />
        <BreakCol label="🌐 Platform" value={item.platformEarning} color={colors.textSecondary} styles={styles} />
      </View>

      <View style={styles.statsLine}>
        <Text style={styles.statsLineLabel}>💵 Cash</Text>
        <Text style={styles.statsLineValue}>{money(item.cashTotal)}</Text>
      </View>
      <View style={styles.statsLine}>
        <Text style={styles.statsLineLabel}>💳 Card</Text>
        <Text style={styles.statsLineValue}>{money(item.cardTotal)}</Text>
      </View>
      <View style={[styles.statsLine, styles.statsLineHi]}>
        <Text style={[styles.statsLineLabel, { fontWeight: '700', color: colors.text }]}>
          Platform owes driver (card)
        </Text>
        <Text style={[styles.statsLineValue, { color: colors.warning }]}>
          {money(item.cardDueToDriver)}
        </Text>
      </View>
    </View>
  );
}

function CompanyRow({
  item, styles, colors,
}: { item: AdminCompanyFinance; styles: any; colors: ColorPalette }) {
  return (
    <View style={styles.rowCard}>
      <View style={styles.rowHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>🏢 {item.companyName}</Text>
          <Text style={styles.rowSub}>{item.driverCount} driver{item.driverCount === 1 ? '' : 's'}</Text>
        </View>
      </View>

      <View style={styles.miniBreakdown}>
        <BreakCol label="🚗 Drivers"  value={item.driverEarning}   color={colors.warning} styles={styles} />
        <BreakCol label="🏢 Company"  value={item.companyEarning}  color={colors.primary} styles={styles} />
        <BreakCol label="🌐 Platform" value={item.platformEarning} color={colors.textSecondary} styles={styles} />
      </View>

      <View style={styles.statsLine}>
        <Text style={styles.statsLineLabel}>💵 Cash</Text>
        <Text style={styles.statsLineValue}>{money(item.cashTotal)}</Text>
      </View>
      <View style={styles.statsLine}>
        <Text style={styles.statsLineLabel}>💳 Card</Text>
        <Text style={styles.statsLineValue}>{money(item.cardTotal)}</Text>
      </View>
      <View style={[styles.statsLine, styles.statsLineHi]}>
        <Text style={[styles.statsLineLabel, { fontWeight: '700', color: colors.text }]}>
          Platform owes drivers (card)
        </Text>
        <Text style={[styles.statsLineValue, { color: colors.warning }]}>
          {money(item.cardDueToDrivers)}
        </Text>
      </View>
    </View>
  );
}

function BreakCol({
  label, value, color, styles,
}: { label: string; value: number; color: string; styles: any }) {
  return (
    <View style={styles.miniBreakdownCol}>
      <Text style={styles.miniBreakdownLabel}>{label}</Text>
      <Text style={[styles.miniBreakdownValue, { color }]}>{money(value)}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background },

    list: { padding: 16, paddingBottom: 32 },
    title: { fontSize: 24, fontWeight: '800', color: c.text, marginBottom: 12 },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    backBtn:     { fontSize: 16, color: c.primary, fontWeight: '600' },
    topBarTitle: { fontSize: 17, fontWeight: '800', color: c.text },

    tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    tab: {
      flex: 1, paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.surfaceAlt ?? c.surface,
      borderWidth: 1, borderColor: c.border,
      alignItems: 'center',
    },
    tabActive: { backgroundColor: c.primary, borderColor: c.primary },
    tabText:   { fontSize: 13, fontWeight: '700', color: c.text },
    tabTextActive: { color: '#fff' },

    periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    pill: {
      flex: 1, paddingVertical: 8, borderRadius: 20,
      backgroundColor: c.surfaceAlt ?? c.surface,
      alignItems: 'center', borderWidth: 1, borderColor: c.border,
    },
    pillActive: { backgroundColor: c.primary, borderColor: c.primary },
    pillText:   { fontSize: 12, fontWeight: '700', color: c.text },
    pillTextActive: { color: '#fff' },

    summaryCard: {
      backgroundColor: c.primary, borderRadius: 16, padding: 20, marginBottom: 12,
    },
    summaryLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
    summaryValue: { color: '#fff', fontSize: 32, fontWeight: '800', marginVertical: 4 },
    summaryRow: {
      flexDirection: 'row',
      borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)',
      paddingTop: 12, marginTop: 8,
    },
    summaryCol:     { flex: 1, alignItems: 'center' },
    summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 8 },
    summaryColLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
    summaryColValue: { color: '#fff', fontSize: 16, fontWeight: '700' },

    owedCard: {
      backgroundColor: c.warningLight ?? '#FEF3C7',
      borderRadius: 12, padding: 14, marginBottom: 20,
    },
    owedCardLabel: { fontSize: 12, fontWeight: '700', color: c.text, textTransform: 'uppercase', letterSpacing: 0.4 },
    owedCardValue: { fontSize: 22, fontWeight: '800', color: c.warning ?? '#92400E', marginTop: 4 },
    owedCardHint:  { fontSize: 11, color: c.textSecondary, marginTop: 2 },

    sectionHeader: {
      fontSize: 12, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.5,
      marginBottom: 8,
    },

    rowCard: {
      backgroundColor: c.surface,
      borderWidth: 1, borderColor: c.border,
      borderRadius: 12,
      padding: 14, marginBottom: 10,
    },
    rowHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    rowTitle:  { fontSize: 15, fontWeight: '700', color: c.text },
    rowSub:    { fontSize: 12, color: c.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

    commissionBadge: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
      backgroundColor: c.surfaceAlt ?? c.surface,
      borderWidth: 1, borderColor: c.border,
    },
    commissionBadgeText: { fontSize: 12, fontWeight: '700', color: c.text },

    miniBreakdown: {
      flexDirection: 'row',
      backgroundColor: c.surfaceAlt ?? c.surface,
      borderRadius: 10,
      paddingVertical: 10, paddingHorizontal: 8,
      marginBottom: 10,
    },
    miniBreakdownCol:   { flex: 1, alignItems: 'center' },
    miniBreakdownLabel: { fontSize: 11, color: c.textSecondary, marginBottom: 2 },
    miniBreakdownValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },

    statsLine: {
      flexDirection: 'row', justifyContent: 'space-between',
      paddingVertical: 3,
    },
    statsLineHi: {
      marginTop: 6, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8,
    },
    statsLineLabel: { fontSize: 13, color: c.textSecondary },
    statsLineValue: { fontSize: 13, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },

    empty:    { alignItems: 'center', paddingTop: 60 },
    emptyIcon:{ fontSize: 48, marginBottom: 12 },
    emptyText:{ fontSize: 14, color: c.textSecondary, textAlign: 'center' },
  });
}
