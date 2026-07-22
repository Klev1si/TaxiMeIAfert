/**
 * WalletScreen — driver earnings + wallet ledger, unified.
 *
 * Replaces the old separate "Earnings" and "Wallet" tabs. Source of truth is
 * the driver_ledger table on the backend, so totals here always match every
 * other view (admin payouts page, driver detail panel, etc.).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { walletApi, LedgerEntry, WalletData } from '../../api/wallet';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';

// ── Period filter helpers ─────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'all';

function periodStart(p: Period): Date | null {
  const now = new Date();
  switch (p) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week': {
      // Sunday as the start of the week — matches most regions' calendars
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay());
      return d;
    }
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'all':
      return null;
  }
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ── Entry row ────────────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: LedgerEntry }) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const isCredit = entry.type === 'credit';
  // Tiny method tag so the driver can tell at a glance which credits the
  // platform owes them vs which they already collected in cash.
  const methodIcon = entry.paymentMethod === 'cash' ? '💵'
    : entry.paymentMethod === 'card' ? '💳'
    : isCredit ? '⏳' : '';

  // Show the 3-way breakdown for credit entries where we have gross fare.
  const hasBreakdown =
    isCredit &&
    entry.grossFare != null &&
    (entry.platformFee != null || (entry.companyShare != null && entry.companyShare > 0));

  return (
    <View style={styles.row}>
      <View style={[styles.dot, isCredit ? styles.dotCredit : styles.dotPayout]} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>
          {isCredit
            ? `${methodIcon}  ${entry.commissionPct != null
                ? t('driver.wallet.rideEarnings', { pct: entry.commissionPct })
                : t('driver.wallet.rideEarningsPlain')}`
            : `${t('driver.wallet.payout')}${entry.note ? ` — ${entry.note}` : ''}`}
        </Text>
        <Text style={styles.rowDate}>{fmtDate(entry.createdAt)}</Text>

        {hasBreakdown && (
          <View style={styles.breakdownBlock}>
            <View style={styles.breakdownLine}>
              <Text style={styles.breakdownLineLabel}>{t('driver.wallet.grossFare')}</Text>
              <Text style={styles.breakdownLineValue}>
                {fmtMoney(entry.grossFare ?? 0)}
              </Text>
            </View>
            {entry.platformFee != null && entry.platformFee > 0 && (
              <View style={styles.breakdownLine}>
                <Text style={styles.breakdownLineLabel}>− 🌐 {t('driver.wallet.platformFee')}</Text>
                <Text style={[styles.breakdownLineValue, { color: colors.textSecondary }]}>
                  −{fmtMoney(entry.platformFee)}
                </Text>
              </View>
            )}
            {entry.companyShare != null && entry.companyShare > 0 && (
              <View style={styles.breakdownLine}>
                <Text style={styles.breakdownLineLabel}>− 🏢 {t('driver.wallet.companyShare')}</Text>
                <Text style={[styles.breakdownLineValue, { color: colors.textSecondary }]}>
                  −{fmtMoney(entry.companyShare)}
                </Text>
              </View>
            )}
            <View style={styles.breakdownLine}>
              <Text style={[styles.breakdownLineLabel, { fontWeight: '700' }]}>
                {t('driver.wallet.yourEarning')}
              </Text>
              <Text style={[styles.breakdownLineValue, { fontWeight: '700', color: colors.success }]}>
                {fmtMoney(entry.amount)}
              </Text>
            </View>
          </View>
        )}
      </View>
      <Text style={[styles.rowAmount, isCredit ? styles.amtCredit : styles.amtPayout]}>
        {isCredit ? '+' : '−'}{fmtMoney(entry.amount)}
      </Text>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function WalletScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [wallet,     setWallet]     = useState<WalletData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [period,     setPeriod]     = useState<Period>('all');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await walletApi.getMyWallet();
      setWallet(data);
    } catch {
      setError(t('driver.wallet.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Period filtering (client-side over the ledger) ────────────────────────
  const filtered = useMemo(() => {
    if (!wallet) return { entries: [] as LedgerEntry[], credits: 0, payouts: 0, rides: 0 };
    const since = periodStart(period);
    const entries = since
      ? wallet.entries.filter(e => new Date(e.createdAt) >= since)
      : wallet.entries;
    let credits = 0, payouts = 0, rides = 0;
    for (const e of entries) {
      if (e.type === 'credit') { credits += e.amount; rides++; }
      else                     { payouts += e.amount; }
    }
    return {
      entries,
      credits: Math.round(credits * 100) / 100,
      payouts: Math.round(payouts * 100) / 100,
      rides,
    };
  }, [wallet, period]);

  if (loading && !wallet) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (error && !wallet) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </SafeAreaView>
    );
  }

  const PERIODS: { value: Period; label: string }[] = [
    { value: 'today', label: t('driver.earnings.periodToday') },
    { value: 'week',  label: t('driver.earnings.periodWeek') },
    { value: 'month', label: t('driver.earnings.periodMonth') },
    { value: 'all',   label: t('driver.earnings.periodAll') },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={filtered.entries}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
        }
        ListHeaderComponent={
          <View>
            {/* Period selector */}
            <View style={styles.periodRow}>
              {PERIODS.map(p => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.pill, period === p.value && styles.pillActive]}
                  onPress={() => setPeriod(p.value)}
                  activeOpacity={0.75}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: period === p.value }}>
                  <Text style={[styles.pillText, period === p.value && styles.pillTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Balance card ─────────────────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>
                {period === 'all'
                  ? 'Owed by platform'
                  : `Earned ${PERIODS.find(p => p.value === period)?.label.toLowerCase()}`}
              </Text>
              <Text style={styles.balanceAmount}>
                {fmtMoney(period === 'all' ? (wallet?.balance ?? 0) : filtered.credits)}
              </Text>

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>
                    {period === 'all' ? '💵 Cash collected' : 'Rides'}
                  </Text>
                  <Text style={[styles.statValue, { color: '#fff' }]}>
                    {period === 'all'
                      ? fmtMoney(wallet?.cashCollected ?? 0)
                      : String(filtered.rides)}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>
                    {period === 'all' ? t('driver.wallet.totalEarned') : 'Payouts'}
                  </Text>
                  <Text style={[styles.statValue, period === 'all' ? styles.amtCredit : styles.amtPayout]}>
                    {fmtMoney(period === 'all' ? (wallet?.totalCredits ?? 0) : filtered.payouts)}
                  </Text>
                </View>
              </View>
            </View>

            {/* ── Section header ───────────────────────────────────────── */}
            {filtered.entries.length > 0 && (
              <Text style={styles.sectionHeader}>{t('driver.wallet.historyTitle')}</Text>
            )}
          </View>
        }
        renderItem={({ item }) => <EntryRow entry={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💵</Text>
            <Text style={styles.emptyText}>{t('driver.wallet.emptyTitle')}</Text>
            <Text style={styles.emptySubtext}>
              {t('driver.wallet.emptyHint')}
            </Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background },

  list: { paddingBottom: 32 },

  // Period selector pills
  periodRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  pill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: c.surfaceAlt ?? c.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.border,
  },
  pillActive: { backgroundColor: c.primary, borderColor: c.primary },
  pillText:   { fontSize: 12, fontWeight: '700', color: c.text },
  pillTextActive: { color: '#fff' },

  // Balance card
  card: {
    margin: 16,
    backgroundColor: c.primary,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  cardLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'capitalize',
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 20,
    fontVariant: ['tabular-nums'],
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
    paddingTop: 16,
  },
  stat:      { flex: 1, alignItems: 'center' },
  divider:   { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 8 },
  statLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },

  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },

  // Entry row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  dotCredit: { backgroundColor: c.success },
  dotPayout: { backgroundColor: c.warning },
  rowText:   { flex: 1 },
  rowLabel:  { fontSize: 14, color: c.text, fontWeight: '500' },
  rowDate:   { fontSize: 12, color: c.textSecondary, marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: '700' },

  // Per-ride 3-way breakdown (driver / company / platform)
  breakdownBlock: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: c.border,
    gap: 2,
  },
  breakdownLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownLineLabel: { fontSize: 12, color: c.textSecondary },
  breakdownLineValue: { fontSize: 12, color: c.text, fontVariant: ['tabular-nums'] },

  amtCredit: { color: '#fff' },
  amtPayout: { color: '#FBBF24' },

  separator: { height: 1, backgroundColor: c.border },

  empty:        { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon:    { fontSize: 48, marginBottom: 12 },
  emptyText:    { fontSize: 16, fontWeight: '600', color: c.textSecondary, marginBottom: 6 },
  emptySubtext: { fontSize: 13, color: c.textSecondary, textAlign: 'center' },

  errorText: { color: c.error, textAlign: 'center', padding: 24 },
}); }
