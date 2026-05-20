import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { walletApi, LedgerEntry, WalletData } from '../../api/wallet';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString([], {
    month: 'short', day: 'numeric', year: 'numeric',
  });
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
  return (
    <View style={styles.row}>
      <View style={[styles.dot, isCredit ? styles.dotCredit : styles.dotPayout]} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>
          {isCredit
            ? (entry.commissionPct != null
                ? t('driver.wallet.rideEarnings', { pct: entry.commissionPct })
                : 'Ride earnings')
            : `${t('driver.wallet.payout')}${entry.note ? ` — ${entry.note}` : ''}`}
        </Text>
        <Text style={styles.rowDate}>{fmt(entry.createdAt)}</Text>
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={wallet?.entries ?? []}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
        }
        ListHeaderComponent={
          <View>
            {/* ── Balance card ─────────────────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>{t('driver.wallet.balanceLabel')}</Text>
              <Text style={styles.balanceAmount}>
                {fmtMoney(wallet?.balance ?? 0)}
              </Text>

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>{t('driver.wallet.totalEarned')}</Text>
                  <Text style={[styles.statValue, styles.amtCredit]}>
                    {fmtMoney(wallet?.totalCredits ?? 0)}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>{t('driver.wallet.paidOut')}</Text>
                  <Text style={[styles.statValue, styles.amtPayout]}>
                    {fmtMoney(wallet?.totalPayouts ?? 0)}
                  </Text>
                </View>
              </View>
            </View>

            {/* ── Section header ───────────────────────────────────────── */}
            {(wallet?.entries.length ?? 0) > 0 && (
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
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 20,
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
  statValue: { fontSize: 18, fontWeight: '700' },

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
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  dotCredit: { backgroundColor: c.success },
  dotPayout: { backgroundColor: c.warning },
  rowText:   { flex: 1 },
  rowLabel:  { fontSize: 14, color: c.text, fontWeight: '500' },
  rowDate:   { fontSize: 12, color: c.textSecondary, marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: '700' },

  amtCredit: { color: c.success },
  amtPayout: { color: c.warning },

  separator: { height: 1, backgroundColor: c.border },

  // Empty state
  empty:        { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon:    { fontSize: 48, marginBottom: 12 },
  emptyText:    { fontSize: 16, fontWeight: '600', color: c.textSecondary, marginBottom: 6 },
  emptySubtext: { fontSize: 13, color: c.textSecondary, textAlign: 'center' },

  errorText: { color: c.error, textAlign: 'center', padding: 24 },
}); }
