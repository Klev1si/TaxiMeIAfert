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
import CommissionStatementView from '../../components/CommissionStatementView';

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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={refresh}>
        <CommissionStatementView st={st} period={period} onPeriod={setPeriod} />
      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:      { flex: 1, backgroundColor: c.background },
    center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    scroll:    { padding: Sizes.screenPadding, paddingBottom: 40 },
    title:     { fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 6 },
    body:      { fontSize: 14, color: c.text, lineHeight: 20, textAlign: 'center' },
    muted:     { fontSize: 13, color: c.textSecondary, marginTop: 4 },
    card:      { backgroundColor: c.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 14 },
    infoCard:  { backgroundColor: c.infoLight, borderColor: c.info, alignItems: 'center', marginTop: 10 },
    cardEmoji: { fontSize: 32, marginBottom: 6 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 4 },
  });
}
