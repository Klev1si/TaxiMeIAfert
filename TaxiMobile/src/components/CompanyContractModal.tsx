/**
 * Super-admin bottom sheet: choose a company's contract with the platform
 * (subscription or a percentage of ride revenue), follow what a commission
 * company owes, and record payments received.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useColors } from '../stores/themeStore';
import type { ColorPalette } from '../constants/colors';
import { useTranslation } from '../i18n';
import { toAlertString } from '../utils/errorMessage';
import {
  companyBillingApi,
  type CommissionStatement,
  type CompanyBillingModel,
} from '../api/company-billing';

const eur = (n: number) => `€${n.toFixed(2)}`;

interface Props {
  companyId:   string | null;
  companyName: string;
  onClose:     () => void;
  /** Called after the contract changed so the list can show the new badge. */
  onSaved:     (model: CompanyBillingModel, commissionPct: number | null) => void;
}

export default function CompanyContractModal({ companyId, companyName, onClose, onSaved }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [st, setSt]             = useState<CommissionStatement | null>(null);
  const [model, setModel]       = useState<CompanyBillingModel>('unassigned');
  const [pct, setPct]           = useState('');
  const [saving, setSaving]     = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote]     = useState('');
  const [paying, setPaying]       = useState(false);

  const apply = (s: CommissionStatement) => {
    setSt(s);
    setModel(s.billingModel);
    setPct(s.commissionPct != null ? String(s.commissionPct) : '');
  };

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    companyBillingApi.adminGet(companyId)
      .then(({ data }) => { if (!cancelled) apply(data); })
      .catch(() => {
        if (cancelled) return;
        Alert.alert(t('common.error'), t('contract.loadError'));
        onClose();
      });
    return () => { cancelled = true; setSt(null); setPayAmount(''); setPayNote(''); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const pctNum   = Number(pct.replace(',', '.'));
  const pctValid = model !== 'commission' || (pct.trim() !== '' && pctNum > 0 && pctNum <= 50);
  const dirty    = !!st && (model !== st.billingModel || (model === 'commission' && pctNum !== st.commissionPct));

  const doSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const { data } = await companyBillingApi.adminSet(companyId, model, model === 'commission' ? pctNum : undefined);
      apply(data);
      onSaved(data.billingModel, data.commissionPct);
      Alert.alert(t('contract.saved'));
    } catch (err: any) {
      Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('contract.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (!pctValid || !dirty) return;
    const msg = model === 'commission'
      ? t('contract.confirmCommission', { pct: pctNum, name: companyName })
      : model === 'subscription'
        ? t('contract.confirmSubscription', { name: companyName })
        : t('contract.confirmNone', { name: companyName });
    Alert.alert(t('contract.title'), msg, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.ok'), onPress: () => void doSave() },
    ]);
  };

  const recordPayment = () => {
    const amount = Number(payAmount.replace(',', '.'));
    if (!companyId || !(amount > 0)) return;
    Alert.alert(t('contract.recordPayment'), t('contract.confirmPayment', { amount: eur(amount), name: companyName }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('contract.record'),
        onPress: async () => {
          setPaying(true);
          try {
            const { data } = await companyBillingApi.adminRecordPayment(companyId, amount, payNote.trim() || undefined);
            apply(data);
            setPayAmount(''); setPayNote('');
            Alert.alert(t('contract.paymentRecorded'));
          } catch (err: any) {
            Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('contract.saveError')));
          } finally {
            setPaying(false);
          }
        },
      },
    ]);
  };

  const option = (value: CompanyBillingModel, title: string, hint: string) => (
    <TouchableOpacity
      key={value}
      style={[styles.option, model === value && styles.optionActive]}
      onPress={() => setModel(value)}
      accessibilityRole="radio"
      accessibilityState={{ checked: model === value }}>
      <View style={[styles.radio, model === value && styles.radioActive]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionHint}>{hint}</Text>
      </View>
    </TouchableOpacity>
  );

  const showsMoney = !!st && (st.billingModel === 'commission' || st.allTime.commission > 0 || st.allTime.paid > 0);

  return (
    <Modal visible={!!companyId} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{t('contract.title')} — {companyName}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          {!st ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
          ) : (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {option('subscription', t('contract.typeSubscription'), t('contract.typeSubscriptionHint'))}
              {option('commission', t('contract.typeCommission'), t('contract.typeCommissionHint'))}
              {option('unassigned', t('contract.typeNone'), t('contract.typeNoneHint'))}

              {model === 'commission' && (
                <View style={styles.field}>
                  <Text style={styles.label}>{t('contract.pctLabel')}</Text>
                  <TextInput
                    style={styles.input}
                    value={pct}
                    onChangeText={setPct}
                    keyboardType="decimal-pad"
                    placeholder="5"
                    placeholderTextColor={colors.textDisabled}
                  />
                  <Text style={pctValid ? styles.hint : styles.error}>
                    {pctValid ? t('contract.pctHint') : t('contract.pctInvalid')}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, (!dirty || !pctValid || saving) && styles.btnDisabled]}
                onPress={save}
                disabled={!dirty || !pctValid || saving}
                accessibilityRole="button">
                {saving
                  ? <ActivityIndicator color={colors.textOnPrimary} />
                  : <Text style={styles.primaryBtnText}>{t('contract.save')}</Text>}
              </TouchableOpacity>

              {showsMoney && (
                <View style={styles.money}>
                  <View style={styles.statsRow}>
                    <View style={styles.stat}>
                      <Text style={styles.statLabel}>{t('contract.thisMonth')}</Text>
                      <Text style={styles.statValue}>{st.period.rides} · {eur(st.period.grossFare)}</Text>
                      <Text style={styles.statSub}>{t('contract.commission', { pct: st.commissionPct ?? 0 })}: {eur(st.period.commission)}</Text>
                    </View>
                    <View style={[styles.stat, st.allTime.balance > 0 ? styles.statWarn : styles.statOk]}>
                      <Text style={styles.statLabel}>{t('contract.balance', { amount: '' }).trim()}</Text>
                      <Text style={styles.statValue}>{eur(st.allTime.balance)}</Text>
                      <Text style={styles.statSub}>{t('contract.owedPaid', { owed: eur(st.allTime.commission), paid: eur(st.allTime.paid) })}</Text>
                    </View>
                  </View>

                  <Text style={styles.label}>{t('contract.recordPayment')}</Text>
                  <View style={styles.payRow}>
                    <TextInput
                      style={[styles.input, styles.amountInput]}
                      value={payAmount}
                      onChangeText={setPayAmount}
                      keyboardType="decimal-pad"
                      placeholder={t('contract.amount')}
                      placeholderTextColor={colors.textDisabled}
                    />
                    <TouchableOpacity
                      style={[styles.payBtn, (!(Number(payAmount.replace(',', '.')) > 0) || paying) && styles.btnDisabled]}
                      onPress={recordPayment}
                      disabled={!(Number(payAmount.replace(',', '.')) > 0) || paying}
                      accessibilityRole="button">
                      {paying ? <ActivityIndicator color={colors.white} /> : <Text style={styles.payBtnText}>{t('contract.record')}</Text>}
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={payNote}
                    onChangeText={setPayNote}
                    maxLength={300}
                    placeholder={t('contract.note')}
                    placeholderTextColor={colors.textDisabled}
                  />

                  {st.payments.length > 0 && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.label}>{t('contract.payments')}</Text>
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
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
    sheet:    { backgroundColor: c.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '90%' },
    header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: c.border, gap: 12 },
    title:    { flex: 1, fontSize: 17, fontWeight: '800', color: c.text },
    close:    { fontSize: 18, color: c.textSecondary, padding: 4 },
    body:     { padding: 16, paddingBottom: 40 },

    option:       { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, marginBottom: 8 },
    optionActive: { borderColor: c.primary, backgroundColor: c.primaryLight + '55' },
    radio:        { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c.border, marginTop: 2 },
    radioActive:  { borderColor: c.primaryDark, backgroundColor: c.primary },
    optionTitle:  { fontSize: 15, fontWeight: '700', color: c.text },
    optionHint:   { fontSize: 12, color: c.textSecondary, marginTop: 2 },

    field: { marginTop: 6, marginBottom: 6 },
    label: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 6, marginTop: 6 },
    input: { borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: c.text, backgroundColor: c.surface },
    hint:  { fontSize: 12, color: c.textSecondary, marginTop: 4 },
    error: { fontSize: 12, color: c.error, marginTop: 4 },

    primaryBtn:     { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
    primaryBtnText: { color: c.textOnPrimary, fontWeight: '800', fontSize: 15 },
    btnDisabled:    { opacity: 0.45 },

    money:     { marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.border },
    statsRow:  { flexDirection: 'row', gap: 10, marginBottom: 6 },
    stat:      { flex: 1, borderRadius: 12, padding: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    statWarn:  { backgroundColor: c.warningLight, borderColor: c.warning },
    statOk:    { backgroundColor: c.successLight, borderColor: c.success },
    statLabel: { fontSize: 12, color: c.textSecondary },
    statValue: { fontSize: 16, fontWeight: '800', color: c.text, marginTop: 2 },
    statSub:   { fontSize: 11, color: c.textSecondary, marginTop: 2 },

    payRow:      { flexDirection: 'row', gap: 8, marginBottom: 8 },
    amountInput: { flex: 1 },
    payBtn:      { backgroundColor: c.success, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
    payBtnText:  { color: c.white, fontWeight: '800' },

    paymentRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 10 },
    paymentNote:   { flex: 1, fontSize: 13, color: c.textSecondary },
    paymentAmount: { fontSize: 13, fontWeight: '700', color: c.text },
  });
}
