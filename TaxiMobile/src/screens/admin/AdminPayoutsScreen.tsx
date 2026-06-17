import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  adminApi,
  type AdminDriverBalance,
  type AdminDriverWallet,
  type AdminLedgerEntry,
} from '../../api/admin';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { toAlertString } from '../../utils/errorMessage';
import type { AdminProfileStackScreenProps } from '../../navigation/types';
import { useTranslation } from '../../i18n';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Balance Card ──────────────────────────────────────────────────────────────

function BalanceCard({
  driver,
  onPress,
}: {
  driver: AdminDriverBalance;
  onPress: () => void;
}) {
  const colors = useColors();
  const balCard = useMemo(() => getBalCardStyles(colors), [colors]);
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      style={balCard.wrap}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${driver.firstName} ${driver.lastName}, balance ${fmt(driver.balance)}`}>
      <View style={balCard.left}>
        <Text style={balCard.name}>{driver.firstName} {driver.lastName}</Text>
        <Text style={balCard.plate}>🚗 {driver.vehiclePlate}</Text>
        <View style={balCard.statsRow}>
          <Text style={balCard.stat}>
            <Text style={balCard.statLabel}>{t('admin.payouts.creditsLabel')} </Text>
            <Text style={[balCard.statVal, { color: colors.success }]}>{fmt(driver.totalCredits)}</Text>
          </Text>
          <Text style={balCard.statSep}>·</Text>
          <Text style={balCard.stat}>
            <Text style={balCard.statLabel}>{t('admin.payouts.paidOut')} </Text>
            <Text style={balCard.statVal}>{fmt(driver.totalPayouts)}</Text>
          </Text>
        </View>
      </View>
      <View style={balCard.right}>
        <Text style={balCard.balanceLabel}>{t('admin.payouts.balanceLabel')}</Text>
        <Text style={[balCard.balance, driver.balance > 0 && balCard.balancePositive]}>
          {fmt(driver.balance)}
        </Text>
        <Text style={balCard.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

function getBalCardStyles(c: ColorPalette) { return StyleSheet.create({
  wrap: {
    backgroundColor: c.surface, borderRadius: 14,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: c.border,
    flexDirection: 'row', alignItems: 'center',
  },
  left:   { flex: 1, marginRight: 12 },
  name:   { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 2 },
  plate:  { fontSize: 12, color: c.textSecondary, marginBottom: 8 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stat:   {},
  statLabel: { fontSize: 11, color: c.textSecondary },
  statVal:   { fontSize: 12, fontWeight: '600', color: c.text },
  statSep:   { fontSize: 11, color: c.textSecondary },
  right:         { alignItems: 'flex-end', gap: 2 },
  balanceLabel:  { fontSize: 11, color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  balance:       { fontSize: 20, fontWeight: '800', color: c.text },
  balancePositive: { color: c.success },
  chevron:       { fontSize: 20, color: c.textSecondary },
}); }

// ── Ledger Row ────────────────────────────────────────────────────────────────

function LedgerRow({ entry }: { entry: AdminLedgerEntry }) {
  const colors = useColors();
  const ledger = useMemo(() => getLedgerStyles(colors), [colors]);
  const { t } = useTranslation();
  const isCredit = entry.type === 'credit';
  return (
    <View style={ledger.row}>
      <View style={[ledger.dot, isCredit ? ledger.dotCredit : ledger.dotPayout]} />
      <View style={ledger.info}>
        <Text style={ledger.label}>
          {isCredit
            ? (entry.commissionPct != null
                ? t('driver.wallet.rideEarnings', { pct: entry.commissionPct })
                : 'Ride earnings')
            : `${t('driver.wallet.payout')}${entry.note ? ` — ${entry.note}` : ''}`}
        </Text>
        {entry.rideId && (
          <Text style={ledger.sub} numberOfLines={1}>Ride #{entry.rideId.slice(-8)}</Text>
        )}
        <Text style={ledger.date}>{fmtDate(entry.createdAt)} · {fmtTime(entry.createdAt)}</Text>
      </View>
      <Text style={[ledger.amount, isCredit ? ledger.amountCredit : ledger.amountPayout]}>
        {isCredit ? '+' : '−'}{fmt(entry.amount)}
      </Text>
    </View>
  );
}

function getLedgerStyles(c: ColorPalette) { return StyleSheet.create({
  row:          { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, gap: 10 },
  dot:          { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  dotCredit:    { backgroundColor: c.success },
  dotPayout:    { backgroundColor: c.primary },
  info:         { flex: 1 },
  label:        { fontSize: 14, color: c.text, fontWeight: '500', marginBottom: 2 },
  sub:          { fontSize: 11, color: c.textSecondary, marginBottom: 1 },
  date:         { fontSize: 11, color: c.textSecondary },
  amount:       { fontSize: 15, fontWeight: '700', marginTop: 1 },
  amountCredit: { color: c.success },
  amountPayout: { color: c.text },
}); }

// ── Payout Modal ──────────────────────────────────────────────────────────────

function PayoutModal({
  visible,
  driverId,
  driverName,
  balance,
  onClose,
  onPaid,
}: {
  visible:    boolean;
  driverId:   string;
  driverName: string;
  balance:    number;
  onClose:    () => void;
  onPaid:     (entry: AdminLedgerEntry) => void;
}) {
  const colors = useColors();
  const pm = useMemo(() => getPmStyles(colors), [colors]);
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setAmount(''); setNote(''); setErr(null); }
  }, [visible]);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0)       { setErr('Enter a valid amount greater than $0.'); return; }
    if (amt > balance)                 { setErr(`Amount exceeds available balance (${fmt(balance)}).`); return; }

    setErr(null);
    setSaving(true);
    try {
      const res = await adminApi.createPayout(driverId, amt, note.trim() || undefined);
      onPaid(res.data);
      onClose();
    } catch (e: any) {
      setErr(toAlertString(e?.response?.data?.message, 'Could not record payout.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={pm.safe}>
          <View style={pm.header}>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel">
              <Text style={pm.cancel}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={pm.title}>{t('admin.payouts.recordPayoutTitle')}</Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={`Save payout for ${driverName}`}
              accessibilityState={{ disabled: saving }}>
              {saving
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={pm.save}>{t('common.save')}</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={pm.body} keyboardShouldPersistTaps="handled">
            {/* Driver info */}
            <View style={pm.driverRow}>
              <Text style={pm.driverName}>{driverName}</Text>
              <View style={pm.availRow}>
                <Text style={pm.availLabel}>Available balance: </Text>
                <Text style={pm.availAmount}>{fmt(balance)}</Text>
              </View>
            </View>

            {err && (
              <View style={pm.errBox}>
                <Text style={pm.errText}>{err}</Text>
              </View>
            )}

            {/* Amount */}
            <Text style={pm.label}>Amount ($)</Text>
            <TextInput
              style={pm.input}
              value={amount}
              onChangeText={v => { setAmount(v); setErr(null); }}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Payout amount in dollars"
            />

            {/* Quick-fill buttons */}
            <View style={pm.quickRow}>
              {[25, 50, 100].map(pct => {
                const val = Math.round(balance * pct) / 100;
                return (
                  <TouchableOpacity
                    key={pct}
                    style={pm.quickBtn}
                    onPress={() => setAmount(val.toFixed(2))}
                    accessibilityRole="button"
                    accessibilityLabel={`Set amount to ${pct}% of balance, ${fmt(val)}`}>
                    <Text style={pm.quickBtnText}>{pct}% · {fmt(val)}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[pm.quickBtn, pm.quickBtnFull]}
                onPress={() => setAmount(balance.toFixed(2))}
                accessibilityRole="button"
                accessibilityLabel={`Set amount to full balance, ${fmt(balance)}`}>
                <Text style={pm.quickBtnText}>Full · {fmt(balance)}</Text>
              </TouchableOpacity>
            </View>

            {/* Note */}
            <Text style={pm.label}>Note (optional)</Text>
            <TextInput
              style={[pm.input, pm.inputMulti]}
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Bank transfer, cash handover…"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
              accessibilityLabel="Payout note (optional)"
            />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function getPmStyles(c: ColorPalette) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  title:  { fontSize: 17, fontWeight: '700', color: c.text },
  cancel: { fontSize: 16, color: c.textSecondary },
  save:   { fontSize: 16, fontWeight: '700', color: c.primary },
  body:   { padding: 16 },

  driverRow: {
    backgroundColor: c.surface, borderRadius: 12,
    padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: c.border,
  },
  driverName: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 6 },
  availRow:   { flexDirection: 'row', alignItems: 'center' },
  availLabel: { fontSize: 13, color: c.textSecondary },
  availAmount:{ fontSize: 15, fontWeight: '800', color: c.success },

  errBox:  { backgroundColor: c.errorLight, borderRadius: 10, padding: 12, marginBottom: 12 },
  errText: { fontSize: 13, color: c.error, lineHeight: 18 },

  label: { fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: c.surface, borderRadius: 10,
    borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 22, fontWeight: '700', color: c.text,
    marginBottom: 8,
  },
  inputMulti: { fontSize: 15, fontWeight: '400', minHeight: 80, textAlignVertical: 'top' },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  quickBtn: {
    borderRadius: 8, borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: c.surface,
  },
  quickBtnFull: { borderColor: c.primary, backgroundColor: c.primary + '18' },
  quickBtnText: { fontSize: 12, fontWeight: '600', color: c.text },
}); }

// ── Wallet Detail Modal ───────────────────────────────────────────────────────

function WalletDetailModal({
  driver,
  visible,
  onClose,
}: {
  driver:   AdminDriverBalance | null;
  visible:  boolean;
  onClose:  () => void;
}) {
  const colors = useColors();
  const wd = useMemo(() => getWdStyles(colors), [colors]);
  const { t } = useTranslation();
  const insets                              = useSafeAreaInsets();
  const [wallet,       setWallet]           = useState<AdminDriverWallet | null>(null);
  const [loading,      setLoading]          = useState(false);
  const [payoutModal,  setPayoutModal]      = useState(false);

  useEffect(() => {
    if (visible && driver) {
      setLoading(true);
      setWallet(null);
      adminApi.getDriverWallet(driver.driverId)
        .then(res => setWallet(res.data))
        .catch(() => Alert.alert(t('common.error'), t('admin.payouts.loadError')))
        .finally(() => setLoading(false));
    }
  }, [visible, driver]);

  const handlePaid = (entry: AdminLedgerEntry) => {
    if (!wallet) return;
    const newBalance = Math.round((wallet.balance - entry.amount) * 100) / 100;
    setWallet(prev => prev ? {
      ...prev,
      balance:      newBalance,
      totalPayouts: Math.round((prev.totalPayouts + entry.amount) * 100) / 100,
      entries:      [entry, ...prev.entries],
    } : prev);
  };

  const driverName = driver ? `${driver.firstName} ${driver.lastName}` : '';
  const balance    = wallet?.balance ?? driver?.balance ?? 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={wd.safe}>
        {/* Header */}
        <View style={wd.header}>
          <TouchableOpacity
            style={wd.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close wallet detail">
            <Text style={wd.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={wd.title} numberOfLines={1}>{driverName}</Text>
          {wallet && wallet.balance > 0 && (
            <TouchableOpacity
              style={wd.payoutBtn}
              onPress={() => setPayoutModal(true)}
              accessibilityRole="button"
              accessibilityLabel={`Record payout for ${driverName}`}>
              <Text style={wd.payoutBtnText}>{t('admin.payouts.payoutBtn')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading || !wallet ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* Balance summary */}
            <View style={wd.summaryCard}>
              <View style={wd.summaryItem}>
                <Text style={wd.summaryLabel}>{t('admin.payouts.totalEarned')}</Text>
                <Text style={[wd.summaryValue, { color: colors.success }]}>
                  {fmt(wallet.totalCredits)}
                </Text>
              </View>
              <View style={wd.summaryDivider} />
              <View style={wd.summaryItem}>
                <Text style={wd.summaryLabel}>{t('admin.payouts.paidOut')}</Text>
                <Text style={wd.summaryValue}>{fmt(wallet.totalPayouts)}</Text>
              </View>
              <View style={wd.summaryDivider} />
              <View style={wd.summaryItem}>
                <Text style={wd.summaryLabel}>{t('admin.payouts.balanceLabel')}</Text>
                <Text style={[wd.summaryValue, wd.summaryBalance]}>
                  {fmt(wallet.balance)}
                </Text>
              </View>
            </View>

            {/* Ledger */}
            <Text style={wd.sectionLabel}>{t('admin.payouts.historyTitle')}</Text>
            <ScrollView
              style={wd.scroll}
              contentContainerStyle={wd.scrollContent}
              showsVerticalScrollIndicator={false}>
              {wallet.entries.length === 0 ? (
                <View style={wd.empty}>
                  <Text style={wd.emptyText}>{t('driver.wallet.emptyTitle')}</Text>
                </View>
              ) : (
                wallet.entries.map((entry, i) => (
                  <View key={entry.id}>
                    <LedgerRow entry={entry} />
                    {i < wallet.entries.length - 1 && (
                      <View style={{ height: 1, backgroundColor: colors.border }} />
                    )}
                  </View>
                ))
              )}
              <View style={{ height: Math.max(insets.bottom, 24) }} />
            </ScrollView>
          </>
        )}
      </SafeAreaView>

      {driver && (
        <PayoutModal
          visible={payoutModal}
          driverId={driver.driverId}
          driverName={driverName}
          balance={balance}
          onClose={() => setPayoutModal(false)}
          onPaid={handlePaid}
        />
      )}
    </Modal>
  );
}

function getWdStyles(c: ColorPalette) { return StyleSheet.create({
  safe:   { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: c.surface,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  closeBtn:  { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  closeText: { fontSize: 16, color: c.textSecondary },
  title:     { flex: 1, fontSize: 17, fontWeight: '700', color: c.text },
  payoutBtn: {
    backgroundColor: c.primary, borderRadius: 18,
    paddingHorizontal: 16, paddingVertical: 7,
  },
  payoutBtnText: { fontSize: 13, fontWeight: '700', color: c.white },

  summaryCard: {
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderRadius: 16, margin: 16,
    padding: 16,
    borderWidth: 1, borderColor: c.border,
  },
  summaryItem:    { flex: 1, alignItems: 'center' },
  summaryLabel:   { fontSize: 11, color: c.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue:   { fontSize: 16, fontWeight: '800', color: c.text },
  summaryBalance: { color: c.success },
  summaryDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: c.textSecondary,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 4, marginHorizontal: 16,
  },
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  empty:         { paddingVertical: 40, alignItems: 'center' },
  emptyText:     { fontSize: 14, color: c.textSecondary, fontStyle: 'italic' },
}); }

// ── Main Screen ───────────────────────────────────────────────────────────────

type Props = AdminProfileStackScreenProps<'AdminPayouts'>;

export default function AdminPayoutsScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [drivers,     setDrivers]     = useState<AdminDriverBalance[]>([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [showAll,     setShowAll]     = useState(false);
  const [selected,    setSelected]    = useState<AdminDriverBalance | null>(null);
  const [detailOpen,  setDetailOpen]  = useState(false);

  const LIMIT = 20;

  const load = useCallback(async (reset = false, isRefresh = false) => {
    const p = reset ? 1 : page;
    if (isRefresh)    setRefreshing(true);
    else if (reset)   setLoading(true);
    else              setLoadingMore(true);

    try {
      const res = await adminApi.getWalletBalances(p, LIMIT, showAll);
      const { drivers: newDrivers, total: newTotal } = res.data;
      setDrivers(reset ? newDrivers : prev => [...prev, ...newDrivers]);
      setTotal(newTotal);
      setPage(reset ? 2 : p + 1);
    } catch {
      Alert.alert(t('common.error'), t('admin.payouts.loadError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [page, showAll]);

  // Reload when showAll toggle changes
  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll]);

  const openDetail = (driver: AdminDriverBalance) => {
    setSelected(driver);
    setDetailOpen(true);
  };

  const hasMore = drivers.length < total;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backText}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('admin.payouts.title')}</Text>
      </View>

      {/* Summary + toggle */}
      <View style={styles.toolbar}>
        <Text style={styles.count}>
          {loading ? '—' : `${total} driver${total !== 1 ? 's' : ''}`}
          {!showAll ? ' with balance' : ' total'}
        </Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{t('admin.payouts.showAllLabel')}</Text>
          <Switch
            value={showAll}
            onValueChange={setShowAll}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.white}
            accessibilityRole="switch"
            accessibilityLabel={`Show all drivers: ${showAll ? 'on' : 'off'}`}
          />
        </View>
      </View>

      {/* Info note */}
      {!showAll && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 Showing only drivers with an <Text style={{ fontWeight: '700' }}>outstanding balance</Text>.
            Toggle "Show all" to see every driver's wallet.
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={d => d.driverId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <BalanceCard driver={item} onPress={() => openDetail(item)} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true, true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          onEndReached={() => { if (!loadingMore && hasMore) load(); }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
              : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>{showAll ? '👛' : '✅'}</Text>
              <Text style={styles.emptyTitle}>
                {showAll ? t('admin.payouts.emptyAllTitle') : t('admin.payouts.emptyPendingTitle')}
              </Text>
              <Text style={styles.emptyText}>
                {showAll ? t('admin.payouts.emptyAllMsg') : t('admin.payouts.emptyPendingMsg')}
              </Text>
            </View>
          }
        />
      )}

      {/* Wallet detail modal */}
      <WalletDetailModal
        driver={selected}
        visible={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Sizes.screenPadding, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  backBtn:  { marginRight: 8 },
  backText: { fontSize: 16, color: c.primary, fontWeight: '600' },
  title:    { flex: 1, fontSize: 20, fontWeight: '800', color: c.text },

  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Sizes.screenPadding, paddingVertical: 10,
    backgroundColor: c.surface,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  count:       { fontSize: 13, color: c.textSecondary },
  toggleRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleLabel: { fontSize: 13, color: c.text },

  infoBox: {
    backgroundColor: c.infoLight ?? '#eff6ff',
    paddingHorizontal: Sizes.screenPadding, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  infoText: { fontSize: 12, color: c.info ?? '#1d4ed8', lineHeight: 17 },

  list:  { padding: Sizes.screenPadding, paddingBottom: 32 },

  empty:     { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 14 },
  emptyTitle:{ fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20 },
}); }
