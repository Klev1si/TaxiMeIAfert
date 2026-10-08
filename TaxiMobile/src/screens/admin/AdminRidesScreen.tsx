import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { adminApi, type AdminRide, type AdminRideStatusFilter } from '../../api/admin';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import type { AdminProfileStackScreenProps } from '../../navigation/types';
import { useTranslation } from '../../i18n';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function statusColor(status: string, c: ColorPalette): string {
  switch (status) {
    case 'completed':   return c.success;
    case 'cancelled':   return c.error;
    case 'in_progress': return c.info;
    case 'requested':   return c.warning;
    default:            return c.primary;
  }
}

const STATUS_FILTERS: AdminRideStatusFilter[] = [
  'all', 'requested', 'accepted', 'driving_to_pickup', 'in_progress', 'completed', 'cancelled',
];

type TFn = (key: string, params?: Record<string, string | number>) => string;

function statusLabel(status: string, t: TFn): string {
  const key = `admin.rides.status_${status}`;
  const label = t(key);
  return label === key ? status.replace(/_/g, ' ') : label;
}

function cancelledByLabel(by: string | null | undefined, t: TFn): string {
  switch (by) {
    case 'client':      return t('admin.rides.byClient');
    case 'driver':      return t('admin.rides.byDriver');
    case 'super_admin':
    case 'company':     return t('admin.rides.byAdmin');
    default:            return t('admin.rides.bySystem');
  }
}

// ── Ride Card ─────────────────────────────────────────────────────────────────

function RideCard({ ride, t }: { ride: AdminRide; t: TFn }) {
  const colors = useColors();
  const card = useMemo(() => getCardStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const color = statusColor(ride.status, colors);

  return (
    <TouchableOpacity
      style={card.wrap}
      activeOpacity={0.75}
      onPress={() => setExpanded(v => !v)}
      accessibilityRole="button"
      accessibilityLabel={`${statusLabel(ride.status, t)}, ${ride.clientName ?? ''}, ${fmtDateTime(ride.createdAt)}`}>
      {/* Top row: status + test badge + time */}
      <View style={card.topRow}>
        <View style={card.badges}>
          <View style={[card.badge, { backgroundColor: color + '22' }]}>
            <Text style={[card.badgeText, { color }]}>{statusLabel(ride.status, t)}</Text>
          </View>
          {ride.isTest && (
            <View style={[card.badge, card.testBadge]}>
              <Text style={[card.badgeText, card.testText]}>{t('admin.rides.testBadge')}</Text>
            </View>
          )}
        </View>
        <Text style={card.time}>{fmtDateTime(ride.createdAt)}</Text>
      </View>

      {/* Client */}
      <Text style={card.client} numberOfLines={1}>
        {ride.clientName ?? '—'}
        {ride.clientPhone ? <Text style={card.phone}>  {ride.clientPhone}</Text> : null}
      </Text>

      {/* Route */}
      <Text style={card.route} numberOfLines={expanded ? undefined : 1}>
        📍 {ride.pickupAddress ?? `${ride.pickupLat.toFixed(4)}, ${ride.pickupLng.toFixed(4)}`}
      </Text>
      <Text style={card.route} numberOfLines={expanded ? undefined : 1}>
        🏁 {ride.dropoffAddress ?? t('admin.rides.noDropoff')}
      </Text>

      {ride.scheduledAt && (
        <Text style={card.meta}>🗓 {t('admin.rides.scheduledFor', { time: fmtDateTime(ride.scheduledAt) })}</Text>
      )}

      {ride.totalFare != null && (
        <Text style={card.fare}>
          ${Number(ride.totalFare).toFixed(2)}
          <Text style={card.meta}>  · {ride.paymentStatus}</Text>
        </Text>
      )}

      {ride.status === 'cancelled' && (
        <Text style={card.cancel} numberOfLines={expanded ? undefined : 2}>
          {t('admin.rides.cancelledBy', { who: cancelledByLabel(ride.cancelledBy, t) })}
          {ride.cancelReason ? ` — ${ride.cancelReason}` : ''}
        </Text>
      )}

      {/* Where the booking came from — always visible when known */}
      {(ride.requestIp || ride.requestDevice) && (
        <Text style={card.origin} numberOfLines={expanded ? undefined : 1}>
          🌐 {t('admin.rides.bookedFrom')}: {ride.requestIp ?? '?'}
          {ride.requestDevice ? ` · ${ride.requestDevice}` : ''}
        </Text>
      )}

      {expanded && (
        <View style={card.details}>
          <Text style={card.detailLine}>{t('admin.rides.rideId')}: {ride.id}</Text>
          <Text style={card.detailLine}>{t('admin.rides.coords')}: {ride.pickupLat.toFixed(5)}, {ride.pickupLng.toFixed(5)}</Text>
          {ride.promoCode && (
            <Text style={card.detailLine}>🏷️ {ride.promoCode}{ride.discountAmount != null ? ` −$${Number(ride.discountAmount).toFixed(2)}` : ''}</Text>
          )}
          {ride.driverRating != null && <Text style={card.detailLine}>⭐ {ride.driverRating}</Text>}
        </View>
      )}
    </TouchableOpacity>
  );
}

function getCardStyles(c: ColorPalette) { return StyleSheet.create({
  wrap: {
    backgroundColor: c.surface, borderRadius: 12,
    padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.border, gap: 3,
  },
  topRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  badges:    { flexDirection: 'row', gap: 6, alignItems: 'center' },
  badge:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  testBadge: { backgroundColor: c.textSecondary + '33' },
  testText:  { color: c.textSecondary },
  time:      { fontSize: 11, color: c.textSecondary },
  client:    { fontSize: 14, fontWeight: '600', color: c.text },
  phone:     { fontSize: 12, fontWeight: '400', color: c.textSecondary },
  route:     { fontSize: 13, color: c.text },
  fare:      { fontSize: 13, fontWeight: '700', color: c.text, marginTop: 2 },
  meta:      { fontSize: 12, fontWeight: '400', color: c.textSecondary },
  cancel:    { fontSize: 12, color: c.error, marginTop: 2 },
  origin:    { fontSize: 11, color: c.textSecondary, marginTop: 2 },
  details:   { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border, gap: 3 },
  detailLine:{ fontSize: 11, color: c.textSecondary },
}); }

// ── Main Screen ───────────────────────────────────────────────────────────────

type Props = AdminProfileStackScreenProps<'AdminRides'>;

const LIMIT = 30;

export default function AdminRidesScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [rides,       setRides]       = useState<AdminRide[]>([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [status,      setStatus]      = useState<AdminRideStatusFilter>('all');

  const load = useCallback(async (reset = false, isRefresh = false) => {
    const p = reset ? 1 : page;
    if (isRefresh)  setRefreshing(true);
    else if (reset) setLoading(true);
    else            setLoadingMore(true);

    try {
      const res = await adminApi.getRides(status, p, LIMIT);
      const { rides: newRides, total: newTotal } = res.data;
      setRides(reset ? newRides : prev => [...prev, ...newRides]);
      setTotal(newTotal);
      setPage(reset ? 2 : p + 1);
    } catch {
      Alert.alert(t('common.error'), t('admin.rides.loadError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [page, status, t]);

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const hasMore = rides.length < total;

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
        <Text style={styles.title}>{t('admin.rides.title')}</Text>
        <Text style={styles.count}>{loading ? '—' : total}</Text>
      </View>

      {/* Status filter pills */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.pillRow} contentContainerStyle={styles.pillContent}>
        {STATUS_FILTERS.map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.pill, status === s && styles.pillActive]}
            onPress={() => setStatus(s)}
            accessibilityRole="radio"
            accessibilityState={{ checked: status === s }}>
            <Text style={[styles.pillText, status === s && styles.pillTextActive]}>
              {s === 'all' ? t('admin.rides.filterAll') : statusLabel(s, t)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={rides}
          keyExtractor={r => r.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <RideCard ride={item} t={t} />}
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
              <Text style={styles.emptyIcon}>🚕</Text>
              <Text style={styles.emptyTitle}>{t('admin.rides.emptyMsg')}</Text>
            </View>
          }
        />
      )}
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
  count:    { fontSize: 13, color: c.textSecondary, fontWeight: '600' },

  pillRow:    { maxHeight: 48, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  pillContent:{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  pill:       {
    borderRadius: 16, borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 12, paddingVertical: 5, backgroundColor: c.surface,
  },
  pillActive:     { backgroundColor: c.primary, borderColor: c.primary },
  pillText:       { fontSize: 12, color: c.textSecondary, fontWeight: '500' },
  pillTextActive: { color: c.white, fontWeight: '700' },

  list:       { padding: Sizes.screenPadding, paddingBottom: 32 },
  empty:      { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 48, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8 },
}); }
