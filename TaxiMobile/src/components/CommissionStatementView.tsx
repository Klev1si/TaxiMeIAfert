/**
 * Commission contract statement — shared by the company's Contract tab and a
 * solo driver's Subscription screen: rate, rides, gross fares, commission,
 * (for drivers) what was withheld from card rides, balance and payments.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../stores/themeStore';
import type { ColorPalette } from '../constants/colors';
import { useTranslation } from '../i18n';
import type { BillingStatementPeriod, CommissionStatement } from '../api/company-billing';

const eur = (n: number) => `€${n.toFixed(2)}`;

interface Props {
  st:       CommissionStatement;
  period:   BillingStatementPeriod;
  onPeriod: (p: BillingStatementPeriod) => void;
}

export default function CommissionStatementView({ st, period, onPeriod }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const pct = st.commissionPct ?? 0;
  const isDriver = st.subject === 'driver';
  const { balance, commission: owed, paid, withheld } = st.allTime;
  const balanceText = balance > 0.004
    ? t('contract.balanceToPay', { amount: eur(balance) })
    : balance < -0.004
      ? t('contract.balanceCredit', { amount: eur(-balance) })
      : t('contract.balanceSettled');

  return (
    <View>
      <Text style={styles.title}>{t('contract.title')}</Text>
      <Text style={styles.subtitle}>
        {isDriver ? t('contract.driverIntro', { pct }) : t('contract.commissionIntro', { pct })}
      </Text>

      <View style={styles.tabs}>
        {(['month', 'all'] as BillingStatementPeriod[]).map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => onPeriod(p)}
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
        {withheld > 0 && <Text style={styles.muted}>{t('contract.withheld', { amount: eur(withheld) })}</Text>}
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
    </View>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    title:    { fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 6 },
    subtitle: { fontSize: 14, color: c.textSecondary, marginBottom: 16, lineHeight: 20 },
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
    warnCard:  { backgroundColor: c.warningLight, borderColor: c.warning },
    okCard:    { backgroundColor: c.successLight, borderColor: c.success },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 4 },

    paymentRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 10 },
    paymentNote:   { flex: 1, fontSize: 13, color: c.textSecondary },
    paymentAmount: { fontSize: 13, fontWeight: '700', color: c.text },
  });
}
