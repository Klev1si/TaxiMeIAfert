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
import { adminApi, type AdminFraudEvent, type FraudEventType } from '../../api/admin';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import type { AdminProfileStackScreenProps } from '../../navigation/types';
import { useTranslation } from '../../i18n';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Type metadata ─────────────────────────────────────────────────────────────

function getTypeMeta(type: FraudEventType, c: ColorPalette) {
  const meta: Record<FraudEventType, { icon: string; label: string; color: string; bg: string }> = {
    concurrent_ride_attempt: {
      icon:  '⚠️',
      label: 'Concurrent Ride Attempt',
      color: c.warning,
      bg:    c.warningLight ?? '#fffbeb',
    },
    gps_spoof_detected: {
      icon:  '📍',
      label: 'GPS Spoof Detected',
      color: c.error,
      bg:    c.errorLight ?? '#fef2f2',
    },
    otp_lockout: {
      icon:  '🔒',
      label: 'OTP Lockout',
      color: '#7c3aed',
      bg:    c.surfaceAlt,
    },
    promo_abuse: {
      icon:  '🎟️',
      label: 'Promo Abuse',
      color: c.info ?? '#0891b2',
      bg:    c.infoLight ?? '#ecfeff',
    },
  };
  return meta[type] ?? { icon: '🚨', label: type, color: c.error, bg: c.errorLight ?? '#fef2f2' };
}

// ── Filter options ────────────────────────────────────────────────────────────

type TypeFilter = '' | FraudEventType;

const TYPE_FILTERS: { label: string; value: TypeFilter }[] = [
  { label: 'All',          value: ''                       },
  { label: '⚠️ Concurrent', value: 'concurrent_ride_attempt' },
  { label: '📍 GPS Spoof',  value: 'gps_spoof_detected'      },
  { label: '🔒 OTP Lock',   value: 'otp_lockout'             },
  { label: '🎟️ Promo',      value: 'promo_abuse'             },
];

// ── Event Card ────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: AdminFraudEvent }) {
  const colors = useColors();
  const card = useMemo(() => getCardStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const meta      = getTypeMeta(event.type, colors);
  const hasData   = event.metadata && Object.keys(event.metadata).length > 0;
  const hasIds    = event.userId || event.driverId || event.rideId;
  const expandable = hasData || hasIds;

  return (
    <TouchableOpacity
      style={[card.wrap, { borderLeftColor: meta.color, borderLeftWidth: 3 }]}
      activeOpacity={expandable ? 0.75 : 1}
      onPress={() => expandable && setExpanded(v => !v)}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label}, ${fmtDate(event.createdAt)}${expandable ? (expanded ? ', expanded' : ', tap to expand') : ''}`}>

      {/* Top row */}
      <View style={card.topRow}>
        <View style={[card.iconWrap, { backgroundColor: meta.bg }]}>
          <Text style={card.icon}>{meta.icon}</Text>
        </View>

        <View style={card.middle}>
          <Text style={[card.label, { color: meta.color }]}>{meta.label}</Text>
          <View style={card.pills}>
            {event.userId && (
              <View style={[card.pill, { backgroundColor: colors.successLight ?? '#f0fdf4' }]}>
                <Text style={[card.pillText, { color: colors.success }]}>client</Text>
              </View>
            )}
            {event.driverId && (
              <View style={[card.pill, { backgroundColor: colors.infoLight ?? '#eff6ff' }]}>
                <Text style={[card.pillText, { color: colors.info ?? '#2563eb' }]}>driver</Text>
              </View>
            )}
            {event.rideId && (
              <View style={[card.pill, { backgroundColor: colors.primary + '22' }]}>
                <Text style={[card.pillText, { color: colors.primaryDark }]}>ride</Text>
              </View>
            )}
          </View>
        </View>

        <View style={card.right}>
          <Text style={card.date}>{fmtDate(event.createdAt)}</Text>
          <Text style={card.time}>{fmtTime(event.createdAt)}</Text>
          {expandable && (
            <Text style={card.chevron}>{expanded ? '▲' : '▼'}</Text>
          )}
        </View>
      </View>

      {/* Expandable details */}
      {expanded && (
        <View style={card.details}>
          {event.userId && (
            <View style={card.detailLine}>
              <Text style={card.detailKey}>userId: </Text>
              <Text style={card.detailVal}>{event.userId.slice(-12)}…</Text>
            </View>
          )}
          {event.driverId && (
            <View style={card.detailLine}>
              <Text style={card.detailKey}>driverId: </Text>
              <Text style={card.detailVal}>{event.driverId.slice(-12)}…</Text>
            </View>
          )}
          {event.rideId && (
            <View style={card.detailLine}>
              <Text style={card.detailKey}>rideId: </Text>
              <Text style={card.detailVal}>{event.rideId.slice(-12)}…</Text>
            </View>
          )}
          {hasData && Object.entries(event.metadata!).map(([k, v]) => (
            <View key={k} style={card.detailLine}>
              <Text style={card.detailKey}>{k}: </Text>
              <Text style={card.detailVal} numberOfLines={2}>
                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

function getCardStyles(c: ColorPalette) { return StyleSheet.create({
  wrap: {
    backgroundColor: c.surface, borderRadius: 12,
    padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.border,
  },
  topRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  icon:    { fontSize: 18 },
  middle:  { flex: 1 },
  label:   { fontSize: 13, fontWeight: '700', marginBottom: 5 },
  pills:   { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  pill:    { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pillText:{ fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  right:   { alignItems: 'flex-end', gap: 1 },
  date:    { fontSize: 11, color: c.textSecondary },
  time:    { fontSize: 11, color: c.textSecondary },
  chevron: { fontSize: 10, color: c.textSecondary, marginTop: 4 },

  details:    { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border, gap: 4 },
  detailLine: { flexDirection: 'row', flexWrap: 'wrap' },
  detailKey:  { fontSize: 11, fontWeight: '700', color: c.textSecondary },
  detailVal:  { fontSize: 11, color: c.text, flex: 1 },
}); }

// ── Main Screen ───────────────────────────────────────────────────────────────

type Props = AdminProfileStackScreenProps<'AdminFraudEvents'>;

const LIMIT = 30;

export default function AdminFraudEventsScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [events,      setEvents]      = useState<AdminFraudEvent[]>([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [typeFilter,  setTypeFilter]  = useState<TypeFilter>('');

  const load = useCallback(async (reset = false, isRefresh = false) => {
    const p = reset ? 1 : page;
    if (isRefresh)  setRefreshing(true);
    else if (reset) setLoading(true);
    else            setLoadingMore(true);

    try {
      const res = await adminApi.getFraudEvents({
        page:  p,
        limit: LIMIT,
        type:  typeFilter as FraudEventType || undefined,
      });
      const { events: newEvents, total: newTotal } = res.data;
      setEvents(reset ? newEvents : prev => [...prev, ...newEvents]);
      setTotal(newTotal);
      setPage(reset ? 2 : p + 1);
    } catch {
      Alert.alert(t('common.error'), t('admin.fraudEvents.loadError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [page, typeFilter]);

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  const hasMore = events.length < total;

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
        <Text style={styles.title}>{t('admin.fraudEvents.title')}</Text>
        <Text style={styles.count}>{loading ? '—' : total}</Text>
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.pillRow} contentContainerStyle={styles.pillContent}>
        {TYPE_FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.pill, typeFilter === f.value && styles.pillActive]}
            onPress={() => setTypeFilter(f.value)}
            accessibilityRole="radio"
            accessibilityLabel={`Filter: ${f.label}`}
            accessibilityState={{ checked: typeFilter === f.value }}>
            <Text style={[styles.pillText, typeFilter === f.value && styles.pillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={e => e.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <EventCard event={item} />}
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
              <Text style={styles.emptyIcon}>🛡️</Text>
              <Text style={styles.emptyTitle}>{t('admin.fraudEvents.emptyMsg')}</Text>
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
  emptyText:  { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20 },
}); }
