/**
 * CompanyFinancesScreen — per-driver money tracking and settlement.
 *
 * Top: summary card with company revenue + amounts owed both ways.
 * Below: one card per driver with cash-owed / card-owed + Settle button.
 *
 * Period selector filters the rides included in the totals. Settlements are
 * always all-time — they represent real money exchanges that shouldn't be
 * hidden by a period switch.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  companyFinancesApi,
  type CompanySummary,
  type DriverFinance,
  type FinancePeriod,
  type SettlementDirection,
} from '../../api/company-finances';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';

// label is the suffix of the i18n key company.finances.period<Label>
const PERIODS: { value: FinancePeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week',  label: 'Week'  },
  { value: 'month', label: 'Month' },
  { value: 'all',   label: 'All'   },
];

const money = (n: number) => `$${n.toFixed(2)}`;

export default function CompanyFinancesScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [period,     setPeriod]     = useState<FinancePeriod>('all');
  const [summary,    setSummary]    = useState<CompanySummary | null>(null);
  const [drivers,    setDrivers]    = useState<DriverFinance[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settleTarget, setSettleTarget] = useState<{
    driver: DriverFinance;
    direction: SettlementDirection;
  } | null>(null);
  const [commissionTarget, setCommissionTarget] = useState<DriverFinance | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [sumRes, drvRes] = await Promise.all([
        companyFinancesApi.getSummary(period),
        companyFinancesApi.getDrivers(period),
      ]);
      setSummary(sumRes.data);
      setDrivers(drvRes.data);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('company.finances.loadError');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, t]);

  useEffect(() => { load(); }, [load]);

  if (loading && !summary) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={drivers}
        keyExtractor={d => d.driverId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)}
            colors={[colors.primary]} tintColor={colors.primary} />
        }
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>{t('company.finances.title')}</Text>

            {/* Period selector */}
            <View style={styles.periodRow}>
              {PERIODS.map(p => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.pill, period === p.value && styles.pillActive]}
                  onPress={() => setPeriod(p.value)}
                  activeOpacity={0.75}>
                  <Text style={[styles.pillText, period === p.value && styles.pillTextActive]}>
                    {t(`company.finances.period${p.label}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Summary card */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{t('company.finances.yourRevenue')}</Text>
              <Text style={styles.summaryValue}>{money(summary?.totalRevenue ?? 0)}</Text>

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>💵 {t('company.finances.cashLabel')}</Text>
                  <Text style={styles.statValue}>{money(summary?.cashRevenue ?? 0)}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>💳 {t('company.finances.cardLabel')}</Text>
                  <Text style={styles.statValue}>{money(summary?.cardRevenue ?? 0)}</Text>
                </View>
              </View>
            </View>

            {/* Card payment breakdown — shows the split for transparency */}
            {summary && summary.cardGross > 0 && (
              <View style={styles.breakdownCard}>
                <Text style={styles.breakdownTitle}>
                  {t('company.finances.cardBreakdownTitle', { gross: money(summary.cardGross) })}
                </Text>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>
                    🌐 {t('company.finances.platformFeeLine', { pct: summary.platformCommissionPct })}
                  </Text>
                  <Text style={[styles.breakdownAmount, { color: colors.textSecondary }]}>
                    −{money(summary.platformFee)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>
                    🏢 {t('company.finances.youRemainderLine', { pct: summary.companyCommissionPct })}
                  </Text>
                  <Text style={[styles.breakdownAmount, { color: colors.primary }]}>
                    +{money(summary.cardRevenue)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>
                    🚗 {t('company.finances.driversRemainderLine', { pct: summary.driverCommissionPct })}
                  </Text>
                  <Text style={[styles.breakdownAmount, { color: colors.warning }]}>
                    +{money(summary.cardDriverShare)}
                  </Text>
                </View>
              </View>
            )}

            {/* Driver expenses card */}
            {summary && summary.driverExpenses > 0 && (
              <View style={styles.expensesCard}>
                <Text style={styles.breakdownTitle}>📋 {t('company.finances.driverExpensesTitle')}</Text>
                <Text style={styles.expensesAmount}>{money(summary.driverExpenses)}</Text>
                <Text style={styles.expensesHint}>
                  {t('company.finances.driverExpensesHint')}
                </Text>
              </View>
            )}

            {/* Outstanding cards */}
            <View style={styles.owedRow}>
              <View style={[styles.owedCard, { backgroundColor: colors.successLight ?? '#D1FAE5' }]}>
                <Text style={styles.owedLabel}>{t('company.finances.driversOweYou')}</Text>
                <Text style={[styles.owedValue, { color: colors.success ?? '#065F46' }]}>
                  {money(summary?.cashOwedByDrivers ?? 0)}
                </Text>
                <Text style={styles.owedHint}>{t('company.finances.cashToCollect')}</Text>
              </View>
              <View style={[styles.owedCard, { backgroundColor: colors.warningLight ?? '#FEF3C7' }]}>
                <Text style={styles.owedLabel}>{t('company.finances.youOweDrivers')}</Text>
                <Text style={[styles.owedValue, { color: colors.warning ?? '#92400E' }]}>
                  {money(summary?.cardOwedToDrivers ?? 0)}
                </Text>
                <Text style={styles.owedHint}>{t('company.finances.cardShareToPay')}</Text>
              </View>
            </View>

            {/* Section header */}
            {drivers.length > 0 && (
              <Text style={styles.sectionHeader}>{t('company.finances.perDriver')}</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.driverCard}>
            <View style={styles.driverHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{item.firstName} {item.lastName}</Text>
                <Text style={styles.driverPlate}>{item.vehiclePlate}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setCommissionTarget(item)}
                style={[
                  styles.commissionBadge,
                  item.hasCommissionOverride && styles.commissionBadgeOverride,
                ]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Edit commission for this driver">
                <Text style={styles.commissionBadgeText}>
                  ✏️ {item.effectiveCommissionPct}%
                </Text>
              </TouchableOpacity>
            </View>

            {/* 3-way breakdown */}
            <View style={styles.miniBreakdown}>
              <View style={styles.miniBreakdownCol}>
                <Text style={styles.miniBreakdownLabel}>🚗 {t('company.finances.driverCol')}</Text>
                <Text style={[styles.miniBreakdownValue, { color: colors.warning }]}>
                  {money(item.driverEarning)}
                </Text>
              </View>
              <View style={styles.miniBreakdownCol}>
                <Text style={styles.miniBreakdownLabel}>🏢 {t('company.finances.youCol')}</Text>
                <Text style={[styles.miniBreakdownValue, { color: colors.primary }]}>
                  {money(item.companyEarning)}
                </Text>
              </View>
              <View style={styles.miniBreakdownCol}>
                <Text style={styles.miniBreakdownLabel}>🌐 {t('company.finances.platformCol')}</Text>
                <Text style={[styles.miniBreakdownValue, { color: colors.textSecondary }]}>
                  {money(item.platformEarning)}
                </Text>
              </View>
            </View>

            <View style={styles.rowOwed}>
              <Text style={styles.rowLabel}>💵 {t('company.finances.cashCollected')}</Text>
              <Text style={styles.rowAmount}>{money(item.cashCollected)}</Text>
            </View>
            <View style={styles.rowOwed}>
              <Text style={styles.rowLabel}>↑ {t('company.finances.owesYou')}</Text>
              <Text style={[styles.rowAmount, { color: colors.success }]}>
                {money(item.cashOwedToCompany)}
              </Text>
            </View>
            <View style={styles.rowOwed}>
              <Text style={styles.rowLabel}>💳 {t('company.finances.cardTotal')}</Text>
              <Text style={styles.rowAmount}>{money(item.cardTotal)}</Text>
            </View>
            <View style={styles.rowOwed}>
              <Text style={styles.rowLabel}>↓ {t('company.finances.youOwe')}</Text>
              <Text style={[styles.rowAmount, { color: colors.warning }]}>
                {money(item.cardOwedToDriver)}
              </Text>
            </View>
            {item.expensesTotal > 0 && (
              <View style={styles.rowOwed}>
                <Text style={styles.rowLabel}>📋 {t('company.finances.expensesLogged')}</Text>
                <Text style={[styles.rowAmount, { color: colors.textSecondary }]}>
                  {money(item.expensesTotal)}
                </Text>
              </View>
            )}

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.success, opacity: item.cashOwedToCompany > 0 ? 1 : 0.4 }]}
                disabled={item.cashOwedToCompany <= 0}
                onPress={() => setSettleTarget({ driver: item, direction: 'cash_in' })}>
                <Text style={styles.btnText}>{t('company.finances.gotCashBtn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.warning, opacity: item.cardOwedToDriver > 0 ? 1 : 0.4 }]}
                disabled={item.cardOwedToDriver <= 0}
                onPress={() => setSettleTarget({ driver: item, direction: 'card_out' })}>
                <Text style={styles.btnText}>{t('company.finances.paidDriverBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyText}>{t('company.finances.emptyMsg')}</Text>
          </View>
        }
      />

      {settleTarget && (
        <SettleModal
          target={settleTarget}
          onClose={() => setSettleTarget(null)}
          onDone={() => { setSettleTarget(null); load(true); }}
        />
      )}

      {commissionTarget && summary && (
        <CommissionModal
          driver={commissionTarget}
          companyDefaultPct={summary.driverCommissionPct}
          onClose={() => setCommissionTarget(null)}
          onDone={() => { setCommissionTarget(null); load(true); }}
        />
      )}
    </SafeAreaView>
  );
}

// ── Commission modal ─────────────────────────────────────────────────────────
function CommissionModal({
  driver,
  companyDefaultPct,
  onClose,
  onDone,
}: {
  driver: DriverFinance;
  companyDefaultPct: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [pct,    setPct]    = useState(driver.effectiveCommissionPct.toString());
  const [saving, setSaving] = useState(false);

  const handleSave = async (clear = false) => {
    if (!clear) {
      const n = parseFloat(pct);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        Alert.alert(t('common.validation'), t('company.profile.commissionError'));
        return;
      }
    }
    setSaving(true);
    try {
      await companyFinancesApi.setCommission(driver.driverId, clear ? null : parseFloat(pct));
      onDone();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('company.profile.commissionSaveError');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t('company.finances.editCommissionTitle')}</Text>
            <Text style={styles.modalSub}>
              {driver.firstName} {driver.lastName} · {driver.vehiclePlate}
            </Text>
            <Text style={[styles.modalSub, { marginTop: 0, marginBottom: 8 }]}>
              {t('company.finances.companyDefault', { pct: companyDefaultPct })}
            </Text>

            <Text style={styles.fieldLabel}>{t('company.finances.driverShareLabel')}</Text>
            <TextInput
              style={styles.input}
              value={pct}
              onChangeText={setPct}
              keyboardType="decimal-pad"
              autoFocus
            />
            <Text style={[styles.modalSub, { marginTop: 0, marginBottom: 12 }]}>
              {t('company.finances.commissionHint')}
            </Text>

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.border }]}
                onPress={onClose}>
                <Text style={[styles.btnText, { color: colors.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.primary, opacity: saving ? 0.5 : 1 }]}
                onPress={() => handleSave(false)}
                disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>{t('common.save')}</Text>}
              </TouchableOpacity>
            </View>

            {driver.hasCommissionOverride && (
              <TouchableOpacity
                style={{ alignItems: 'center', marginTop: 12, padding: 6 }}
                onPress={() => handleSave(true)}
                disabled={saving}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  {t('company.finances.revertDefault', { pct: companyDefaultPct })}
                </Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Settle modal ─────────────────────────────────────────────────────────────
function SettleModal({
  target,
  onClose,
  onDone,
}: {
  target: { driver: DriverFinance; direction: SettlementDirection };
  onClose: () => void;
  onDone: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const presetAmount = target.direction === 'cash_in'
    ? target.driver.cashOwedToCompany
    : target.driver.cardOwedToDriver;

  const [amount, setAmount] = useState(presetAmount.toFixed(2));
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert(t('common.validation'), t('company.finances.amountInvalid'));
      return;
    }
    setSaving(true);
    try {
      await companyFinancesApi.settle(target.driver.driverId, {
        direction: target.direction,
        amount: n,
        note: note.trim() || undefined,
      });
      onDone();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('company.finances.settleError');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSaving(false);
    }
  };

  const title = target.direction === 'cash_in'
    ? t('company.finances.settleCashInTitle')
    : t('company.finances.settleCardOutTitle');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Text style={styles.modalSub}>
              {target.driver.firstName} {target.driver.lastName} · {target.driver.vehiclePlate}
            </Text>

            <Text style={styles.fieldLabel}>{t('company.finances.amountLabel')}</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              autoFocus
            />

            <Text style={styles.fieldLabel}>{t('company.finances.noteLabel')}</Text>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder={t('company.finances.notePlaceholder')}
              placeholderTextColor={colors.textDisabled}
            />

            <View style={styles.btnRow}>
              <TouchableOpacity style={[styles.btn, { backgroundColor: colors.border }]} onPress={onClose}>
                <Text style={[styles.btnText, { color: colors.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.primary, opacity: saving ? 0.5 : 1 }]}
                onPress={handleSave}
                disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>{t('common.confirm')}</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background },

    list: { padding: 16, paddingBottom: 32 },

    title: { fontSize: 24, fontWeight: '800', color: c.text, marginBottom: 12 },

    periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    pill: {
      flex: 1, paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: c.surfaceAlt ?? c.surface,
      alignItems: 'center',
      borderWidth: 1, borderColor: c.border,
    },
    pillActive: { backgroundColor: c.primary, borderColor: c.primary },
    pillText:   { fontSize: 12, fontWeight: '700', color: c.text },
    pillTextActive: { color: '#fff' },

    summaryCard: {
      backgroundColor: c.primary,
      borderRadius: 16,
      padding: 20,
      marginBottom: 12,
    },
    summaryLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
    summaryValue: { color: '#fff', fontSize: 32, fontWeight: '800', marginVertical: 4 },
    statsRow: {
      flexDirection: 'row',
      borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)',
      paddingTop: 12, marginTop: 8,
    },
    stat:      { flex: 1, alignItems: 'center' },
    divider:   { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 8 },
    statLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
    statValue: { color: '#fff', fontSize: 16, fontWeight: '700' },

    breakdownCard: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    breakdownTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    breakdownRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    breakdownLabel:  { fontSize: 13, color: c.text },
    breakdownAmount: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },

    expensesCard: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    expensesAmount: {
      fontSize: 22,
      fontWeight: '800',
      color: c.text,
      marginTop: 4,
      fontVariant: ['tabular-nums'],
    },
    expensesHint:   { fontSize: 11, color: c.textSecondary, marginTop: 2 },

    owedRow:  { flexDirection: 'row', gap: 10, marginBottom: 24 },
    owedCard: { flex: 1, borderRadius: 12, padding: 14 },
    owedLabel:{ fontSize: 12, fontWeight: '600', color: c.textSecondary },
    owedValue:{ fontSize: 22, fontWeight: '800', marginTop: 4 },
    owedHint: { fontSize: 11, color: c.textSecondary, marginTop: 2 },

    sectionHeader: {
      fontSize: 12, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.5,
      marginBottom: 8,
    },

    driverCard: {
      backgroundColor: c.surface,
      borderWidth: 1, borderColor: c.border,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    driverHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
    driverName:   { fontSize: 15, fontWeight: '700', color: c.text },
    driverPlate:  { fontSize: 12, color: c.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

    commissionBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: c.surfaceAlt ?? c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    commissionBadgeOverride: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    commissionBadgeText: { fontSize: 12, fontWeight: '700', color: c.text },

    miniBreakdown: {
      flexDirection: 'row',
      backgroundColor: c.surfaceAlt ?? c.surface,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 8,
      marginBottom: 10,
    },
    miniBreakdownCol:   { flex: 1, alignItems: 'center' },
    miniBreakdownLabel: { fontSize: 11, color: c.textSecondary, marginBottom: 2 },
    miniBreakdownValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },

    rowOwed:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    rowLabel:  { fontSize: 13, color: c.textSecondary },
    rowAmount: { fontSize: 13, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },

    btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    btn:    { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    btnText:{ color: '#fff', fontSize: 13, fontWeight: '700' },

    empty:    { alignItems: 'center', paddingTop: 60 },
    emptyIcon:{ fontSize: 48, marginBottom: 12 },
    emptyText:{ fontSize: 14, color: c.textSecondary, textAlign: 'center' },

    // Modal
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16 },
    modalSheet:    { backgroundColor: c.background, borderRadius: 16, padding: 20, width: '100%', maxWidth: 420 },
    modalTitle:    { fontSize: 17, fontWeight: '700', color: c.text },
    modalSub:      { fontSize: 13, color: c.textSecondary, marginTop: 4, marginBottom: 16 },
    fieldLabel:    { fontSize: 11, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 8 },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1, borderColor: c.border,
      borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
      fontSize: 15, color: c.text, marginBottom: 4,
    },
  });
}
