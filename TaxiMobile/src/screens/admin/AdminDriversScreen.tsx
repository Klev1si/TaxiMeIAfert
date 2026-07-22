import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { adminApi, type AdminDriver } from '../../api/admin';
import { toAlertString } from '../../utils/errorMessage';
import type { AdminDriverStackScreenProps } from '../../navigation/types';
import { useTranslation } from '../../i18n';

type Filter = 'all' | 'pending' | 'approved';

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All',      value: 'all'      },
  { label: 'Pending',  value: 'pending'  },
  { label: 'Approved', value: 'approved' },
];

// ── Reject reason modal ───────────────────────────────────────────────────────

function RejectModal({
  visible,
  driverName,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  driverName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  const modal = useMemo(() => getModalStyles(colors), [colors]);
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={modal.overlay}>
        <View style={modal.box}>
          <Text style={modal.title}>{t('admin.drivers.rejectTitle')}</Text>
          <Text style={modal.sub}>
            {t('admin.drivers.rejectMsg', { name: driverName })}
          </Text>
          <TextInput
            style={modal.input}
            value={reason}
            onChangeText={setReason}
            placeholder={t('admin.drivers.rejectReasonPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={3}
            accessibilityLabel="Rejection reason, optional"
          />
          <View style={modal.btnRow}>
            <TouchableOpacity
              style={modal.btnCancel}
              onPress={() => { setReason(''); onCancel(); }}
              accessibilityRole="button"
              accessibilityLabel="Cancel">
              <Text style={modal.btnCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={modal.btnReject}
              onPress={() => { onConfirm(reason); setReason(''); }}
              accessibilityRole="button"
              accessibilityLabel={`Reject driver ${driverName}`}>
              <Text style={modal.btnRejectText}>{t('admin.drivers.rejectBtn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getModalStyles(c: ColorPalette) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    box: {
      backgroundColor: c.surface, borderRadius: 16, padding: 20, width: '100%',
    },
    title: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8 },
    sub:   { fontSize: 13, color: c.textSecondary, lineHeight: 18, marginBottom: 14 },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10,
      padding: 10, fontSize: 14, color: c.text,
      minHeight: 70, textAlignVertical: 'top', marginBottom: 16,
    },
    btnRow:     { flexDirection: 'row', gap: 10 },
    btnCancel:  { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
    btnReject:  { flex: 1, padding: 12, borderRadius: 10, backgroundColor: c.error, alignItems: 'center' },
    btnCancelText: { fontSize: 14, color: c.text, fontWeight: '600' },
    btnRejectText: { fontSize: 14, color: c.white, fontWeight: '700' },
  });
}

// ── Driver Card ───────────────────────────────────────────────────────────────

function DriverCard({
  driver,
  onApprove,
  onReject,
  onViewDocs,
  actionLoading,
}: {
  driver: AdminDriver;
  onApprove: (id: string) => void;
  onReject: (driver: AdminDriver) => void;
  onViewDocs: (driver: AdminDriver) => void;
  actionLoading: string | null;
}) {
  const colors = useColors();
  const card = useMemo(() => getCardStyles(colors), [colors]);
  const { t } = useTranslation();
  const busy = actionLoading === driver.id;

  return (
    <View style={card.wrap}>
      {/* Status badge */}
      <View style={[card.badge, driver.isApproved ? card.badgeApproved : card.badgePending]}>
        <Text style={[card.badgeText, driver.isApproved ? card.badgeTextApproved : card.badgeTextPending]}>
          {driver.isApproved ? t('admin.drivers.filterApproved') : t('admin.drivers.filterPending')}
        </Text>
      </View>

      {/* Name + online indicator */}
      <View style={card.nameRow}>
        <Text style={card.name}>{driver.firstName} {driver.lastName}</Text>
        {driver.isOnline && (
          <View style={card.onlineDot}>
            <Text style={card.onlineText}>● Online</Text>
          </View>
        )}
      </View>

      {driver.phone ? (
        <Text style={card.meta}>📞 {driver.phone}</Text>
      ) : (
        <Text style={[card.meta, card.metaDim]}>📞 No phone on file</Text>
      )}
      <Text style={card.meta}>
        🚗 {driver.vehicleYear} {driver.vehicleMake} {driver.vehicleModel}
        {driver.vehicleColor ? ` · ${driver.vehicleColor}` : ''}
      </Text>
      <Text style={card.meta}>🔖 {driver.vehiclePlate}  ·  🪪 {driver.licenseNumber}</Text>
      <Text style={card.meta}>
        ⭐ {driver.rating.toFixed(1)}  ·  {driver.totalRides} rides
        {driver.acceptanceRate != null ? `  ·  ${driver.acceptanceRate}% accept` : ''}
      </Text>
      <Text style={card.meta}>📅 Joined {new Date(driver.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>

      {/* View documents button */}
      <TouchableOpacity
        style={card.docsBtn}
        onPress={() => onViewDocs(driver)}
        accessibilityRole="button"
        accessibilityLabel={`View documents for ${driver.firstName} ${driver.lastName}`}>
        <Text style={card.docsBtnText}>📄 View Documents</Text>
      </TouchableOpacity>

      {/* Actions — only for pending */}
      {!driver.isApproved && (
        <View style={card.actions}>
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <TouchableOpacity
                style={card.approveBtn}
                onPress={() => onApprove(driver.id)}
                accessibilityRole="button"
                accessibilityLabel={`Approve driver ${driver.firstName} ${driver.lastName}`}>
                <Text style={card.approveBtnText}>{t('admin.drivers.approveBtn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={card.rejectBtn}
                onPress={() => onReject(driver)}
                accessibilityRole="button"
                accessibilityLabel={`Reject driver ${driver.firstName} ${driver.lastName}`}>
                <Text style={card.rejectBtnText}>{t('admin.drivers.rejectBtn')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function getCardStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.surface, borderRadius: 14,
      padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: c.border,
    },
    badge: {
      alignSelf: 'flex-start', borderRadius: 6,
      paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8,
    },
    badgeApproved:     { backgroundColor: c.success + '22' },
    badgePending:      { backgroundColor: (c.warning ?? '#f59e0b') + '22' },
    badgeText:         { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    badgeTextApproved: { color: c.success },
    badgeTextPending:  { color: c.warning ?? '#f59e0b' },

    nameRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    name:       { fontSize: 16, fontWeight: '700', color: c.text, flex: 1 },
    onlineDot:  { backgroundColor: c.successLight ?? '#dcfce7', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
    onlineText: { fontSize: 11, fontWeight: '700', color: c.success },
    meta:       { fontSize: 13, color: c.textSecondary, marginBottom: 2 },
    metaDim:    { opacity: 0.5 },

    docsBtn: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: 10,
      padding: 9,
      alignItems: 'center',
    },
    docsBtnText: { fontSize: 13, fontWeight: '600', color: c.primary },

    actions:      { flexDirection: 'row', gap: 10, marginTop: 10 },
    approveBtn:   { flex: 1, backgroundColor: c.success, borderRadius: 10, padding: 10, alignItems: 'center' },
    rejectBtn:    { flex: 1, borderWidth: 1, borderColor: c.error, borderRadius: 10, padding: 10, alignItems: 'center' },
    approveBtnText: { color: c.white, fontWeight: '700', fontSize: 14 },
    rejectBtnText:  { color: c.error, fontWeight: '700', fontSize: 14 },
  });
}

// ── Main Screen ───────────────────────────────────────────────────────────────

type Props = AdminDriverStackScreenProps<'AdminDriversMain'>;

export default function AdminDriversScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [drivers, setDrivers]       = useState<AdminDriver[]>([]);
  const [total, setTotal]           = useState(0);
  const [filter, setFilter]         = useState<Filter>('pending');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget]   = useState<AdminDriver | null>(null);

  const LIMIT = 20;

  const load = useCallback(async (reset = false, isRefresh = false) => {
    const p = reset ? 1 : page;
    if (isRefresh) setRefreshing(true);
    else if (reset) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await adminApi.getDrivers(filter, p, LIMIT, search || undefined);
      if (reset) {
        setDrivers(res.data.drivers);
        setPage(2);
      } else {
        setDrivers(prev => [...prev, ...res.data.drivers]);
        setPage(p + 1);
      }
      setTotal(res.data.total);
    } catch {
      Alert.alert(t('common.error'), t('admin.drivers.loadError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [filter, search, page]);

  // Reload when filter changes
  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleSearch = () => load(true);

  const handleApprove = async (driverId: string) => {
    setActionLoading(driverId);
    try {
      await adminApi.approveDriver(driverId);
      setDrivers(prev =>
        prev.map(d => d.id === driverId ? { ...d, isApproved: true } : d),
      );
    } catch (err: any) {
      Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('admin.drivers.approveError')));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectTarget) return;
    const id = rejectTarget.id;
    setRejectTarget(null);
    setActionLoading(id);
    try {
      await adminApi.rejectDriver(id, reason || undefined);
      setDrivers(prev => prev.filter(d => d.id !== id));
    } catch (err: any) {
      Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('admin.drivers.rejectError')));
    } finally {
      setActionLoading(null);
    }
  };

  const hasMore = drivers.length < total;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('admin.drivers.title')}</Text>
        <Text style={styles.count}>{total} total</Text>
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.pillRow} contentContainerStyle={styles.pillRowContent}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.pill, filter === f.value && styles.pillActive]}
            onPress={() => setFilter(f.value)}
            accessibilityRole="radio"
            accessibilityLabel={`Filter: ${f.label}`}
            accessibilityState={{ checked: filter === f.value }}>
            <Text style={[styles.pillText, filter === f.value && styles.pillTextActive]}>
              {f.value === 'all' ? t('admin.drivers.filterAll') : f.value === 'pending' ? t('admin.drivers.filterPending') : t('admin.drivers.filterApproved')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t('admin.drivers.searchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
          accessibilityLabel="Search drivers by name or plate"
        />
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={handleSearch}
          accessibilityRole="button"
          accessibilityLabel="Search">
          <Text style={styles.searchBtnText}>{t('common.search')}</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={d => d.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <DriverCard
              driver={item}
              onApprove={handleApprove}
              onReject={d => setRejectTarget(d)}
              onViewDocs={d => navigation.navigate('AdminDriverDocuments', {
                driverId:   d.id,
                driverName: `${d.firstName} ${d.lastName}`,
              })}
              actionLoading={actionLoading}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={styles.emptyText}>{t('admin.drivers.emptyMsg')}</Text>
            </View>
          }
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => load()}
                accessibilityRole="button"
                accessibilityLabel="Load more drivers">
                {loadingMore
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={styles.loadMoreText}>{t('common.loadMore')}</Text>}
              </TouchableOpacity>
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true, true)} />
          }
        />
      )}

      {/* Reject modal */}
      <RejectModal
        visible={!!rejectTarget}
        driverName={rejectTarget ? `${rejectTarget.firstName} ${rejectTarget.lastName}` : ''}
        onConfirm={handleRejectConfirm}
        onCancel={() => setRejectTarget(null)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:  { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: Sizes.screenPadding, paddingTop: 16, paddingBottom: 8,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    title: { fontSize: 20, fontWeight: '700', color: c.text },
    count: { fontSize: 13, color: c.textSecondary },

    pillRow: { maxHeight: 48, backgroundColor: c.surface },
    pillRowContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
    pill: {
      borderRadius: 16, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 5, backgroundColor: c.surface,
    },
    pillActive:    { backgroundColor: c.primary, borderColor: c.primary },
    pillText:      { fontSize: 13, color: c.textSecondary },
    pillTextActive: { color: c.white, fontWeight: '600' },

    searchRow: {
      flexDirection: 'row', gap: 8,
      paddingHorizontal: 12, paddingVertical: 8,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    searchInput: {
      flex: 1, backgroundColor: c.background,
      borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 8,
      fontSize: 14, color: c.text,
    },
    searchBtn: {
      backgroundColor: c.primary, borderRadius: 10,
      paddingHorizontal: 16, justifyContent: 'center',
    },
    searchBtnText: { color: c.white, fontWeight: '700', fontSize: 14 },

    list:       { padding: 12 },
    empty:      { alignItems: 'center', marginTop: 60 },
    emptyIcon:  { fontSize: 48, marginBottom: 12 },
    emptyText:  { fontSize: 16, color: c.textSecondary },
    loadMoreBtn: {
      alignSelf: 'center', marginVertical: 10,
      paddingHorizontal: 28, paddingVertical: 10,
      borderRadius: 20, borderWidth: 1.5, borderColor: c.primary,
      backgroundColor: c.surface,
    },
    loadMoreText: { color: c.primary, fontWeight: '700', fontSize: 14 },
  });
}
