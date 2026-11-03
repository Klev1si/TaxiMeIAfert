/**
 * CompanyContractScreen — the company's "Contract" tab.
 *
 * The platform agrees a contract with each company:
 *  - subscription → the existing plans screen (CompanySubscriptionScreen)
 *  - commission   → rate, this month's rides / gross / commission, balance
 *  - unassigned   → "your contract is being set up" (plans are hidden)
 */
import React, { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';
import {
  companyBillingApi,
  type BillingStatementPeriod,
  type CommissionStatement,
} from '../../api/company-billing';
import CompanySubscriptionScreen from './CompanySubscriptionScreen';

const eur = (n: number) => `€${n.toFixed(2)}`;

export default function CompanyContractScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [st, setSt]               = useState<CommissionStatement | null>(null);
  const [period, setPeriod]       = useState<BillingStatementPeriod>('month');
  const [error, setError]         = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p: BillingStatementPeriod, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const { data } = await companyBillingApi.getMine(p);
      setSt(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Reload whenever the tab is focused — the admin may have changed the deal.
  useFocusEffect(useCallback(() => { void load(period); }, [load, period]));

  if (!st) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          {error
            ? <Text style={styles.muted}>{t('contract.loadError')}</Text>
            : <ActivityIndicator color={colors.primary} />}
        </View>
      </SafeAreaView>
    );
  }

  if (st.billingModel === 'subscription') return <CompanySubscriptionScreen />;

  const refresh = <RefreshControl refreshing={refreshing} onRefresh={() => void load(period, true)} />;

  if (st.billingModel === 'unassigned') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={refresh}>
          <Text style={styles.title}>{t('contract.title')}</Text>
          <View style={[styles.card, styles.infoCard]}>
            <Text style={styles.cardEmoji}>🤝</Text>
            <Text style={styles.cardTitle}>{t('contract.pendingTitle')}</Text>
            <Text style={styles.body}>{t('contract.pendingBody')}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const pct = st.commissionPct ?? 0;
  const { balance, commission: owed, paid } = st.allTime;
  const balanceText = balance > 0.004
    ? t('contract.balanceToPay', { amount: eur(balance) })
    : balance < -0.004
      ? t('contract.balanceCredit', { amount: eur(-balance) })
      : t('contract.balanceSettled');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={refresh}>
        <Text style={styles.title}>{t('contract.title')}</Text>
        <Text style={styles.subtitle}>{t('contract.commissionIntro', { pct })}</Text>

        <View style={styles.tabs}>
          {(['month', 'all'] as BillingStatementPeriod[]).map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => setPeriod(p)}
              style={[styles.tab, period === p && styles.tabActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: period === p }}>
              <Text style={[styles.tabText, period === p && styles.tabTextActive]}>
                {p === 'month' ? t('contract.thisMonth') : t('contract.allTime')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t('contract.rides')}</Text>
            <Text style={styles.statValue}>{st.period.rides}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t('contract.gross')}</Text>
            <Text style={styles.statValue}>{eur(st.period.grossFare)}</Text>
          </View>
        </View>
        <View style={[styles.stat, styles.statWide]}>
          <Text style={styles.statLabel}>{t('contract.commission', { pct })}</Text>
          <Text style={styles.statValue}>{eur(st.period.commission)}</Text>
        </View>

        <View style={[styles.card, balance > 0.004 ? styles.warnCard : styles.okCard]}>
          <Text style={styles.cardTitle}>{balanceText}</Text>
          <Text style={styles.muted}>{t('contract.totals', { owed: eur(owed), paid: eur(paid) })}</Text>
        </View>

        {st.payments.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('contract.payments')}</Text>
            {st.payments.map((p) => (
              <View key={p.id} style={styles.paymentRow}>
                <Text style={styles.paymentNote} numberOfLines={1}>
                  {new Date(p.createdAt).toLocaleDateString()}{p.note ? ` — ${p.note}` : ''}
                </Text>
                <Text style={styles.paymentAmount}>{eur(p.amount)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:     { flex: 1, backgroundColor: c.background },
    center:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    scroll:   { padding: Sizes.screenPadding, paddingBottom: 40 },
    title:    { fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 6 },
    subtitle: { fontSize: 14, color: c.textSecondary, marginBottom: 16, lineHeight: 20 },
    body:     { fontSize: 14, color: c.text, lineHeight: 20, textAlign: 'center' },
    muted:    { fontSize: 13, color: c.textSecondary, marginTop: 4 },

    tabs:          { flexDirection: 'row', gap: 8, marginBottom: 14 },
    tab:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    tabActive:     { backgroundColor: c.primary, borderColor: c.primary },
    tabText:       { fontSize: 13, fontWeight: '600', color: c.text },
    tabTextActive: { color: c.textOnPrimary },

    statsRow:  { flexDirection: 'row', gap: 10, marginBottom: 10 },
    stat:      { flex: 1, backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border },
    statWide:  { flex: 0, marginBottom: 14 },
    statLabel: { fontSize: 12, color: c.textSecondary },
    statValue: { fontSize: 22, fontWeight: '800', color: c.text, marginTop: 4 },

    card:      { backgroundColor: c.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 14 },
    infoCard:  { backgroundColor: c.infoLight, borderColor: c.info, alignItems: 'center', marginTop: 10 },
    warnCard:  { backgroundColor: c.warningLight, borderColor: c.warning },
    okCard:    { backgroundColor: c.successLight, borderColor: c.success },
    cardEmoji: { fontSize: 32, marginBottom: 6 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 4 },

    paymentRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 10 },
    paymentNote:   { flex: 1, fontSize: 13, color: c.textSecondary },
    paymentAmount: { fontSize: 13, fontWeight: '700', color: c.text },
  });
}
