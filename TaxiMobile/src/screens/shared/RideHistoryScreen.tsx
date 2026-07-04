import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { ridesApi } from '../../api/rides';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import type { Ride, RideStatus } from '../../types/api';
import { useTranslation } from '../../i18n';

// ── Filter definitions ────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'completed' | 'cancelled' | 'in_progress' | 'scheduled';

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All',          value: 'all'         },
  { label: 'Completed',    value: 'completed'   },
  { label: 'Cancelled',    value: 'cancelled'   },
  { label: 'In Progress',  value: 'in_progress' },
  { label: 'Scheduled',    value: 'scheduled'   },
];

// STATUS_LABEL labels are rendered at runtime using t() inside RideCard

// ── Filter logic ──────────────────────────────────────────────────────────────

function matchesStatusFilter(ride: Ride, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'scheduled') {
    return ride.scheduledAt != null && ride.status === 'requested';
  }
  return ride.status === filter;
}

function matchesSearch(ride: Ride, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    (ride.pickupAddress  ?? '').toLowerCase().includes(q) ||
    (ride.dropoffAddress ?? '').toLowerCase().includes(q)
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function RideHistoryScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [rides, setRides]           = useState<Ride[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage]             = useState(1);
  const [hasMore, setHasMore]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // ── Filter / search state ─────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchInput, setSearchInput]   = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived filtered list ─────────────────────────────────────────────────
  const filteredRides = useMemo(() => {
    return rides.filter(
      r => matchesStatusFilter(r, statusFilter) && matchesSearch(r, searchQuery),
    );
  }, [rides, statusFilter, searchQuery]);

  const isFiltered = statusFilter !== 'all' || searchQuery.length > 0;

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchRides = useCallback(async (pageNum: number, replace = false) => {
    try {
      const { data } = await ridesApi.getRideHistory(pageNum, 20);
      setRides(prev => replace ? data : [...prev, ...data]);
      setHasMore(data.length === 20);
      setPage(pageNum);
    } catch {
      // silently fail — show empty state
    }
  }, []);

  useEffect(() => {
    fetchRides(1, true).finally(() => setLoading(false));
  }, [fetchRides]);

  useFocusEffect(
    useCallback(() => {
      fetchRides(1, true).catch(() => {});
    }, [fetchRides]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRides(1, true);
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await fetchRides(page + 1, false);
    setLoadingMore(false);
  };

  // ── Search with 300ms debounce ────────────────────────────────────────────

  const handleSearchChange = (text: string) => {
    setSearchInput(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchQuery(text.trim()), 300);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>{t('shared.rideHistory.title')}</Text>
        {isFiltered && (
          <TouchableOpacity
            onPress={() => { setStatusFilter('all'); handleClearSearch(); }}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters">
            <Text style={styles.clearAll}>{t('shared.rideHistory.clearFilters')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={searchInput}
            onChangeText={handleSearchChange}
            placeholder={t('shared.rideHistory.searchPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search rides by pickup or dropoff address"
          />
          {searchInput.length > 0 && (
            <TouchableOpacity
              onPress={handleClearSearch}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search">
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Status filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pillRow}
        contentContainerStyle={styles.pillRowContent}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.pill, statusFilter === f.value && styles.pillActive]}
            onPress={() => setStatusFilter(f.value)}
            accessibilityRole="radio"
            accessibilityLabel={`Filter: ${f.value}`}
            accessibilityState={{ checked: statusFilter === f.value }}>
            <Text style={[styles.pillText, statusFilter === f.value && styles.pillTextActive]}>
              {f.value === 'all' ? t('shared.rideHistory.statusAll')
                : f.value === 'completed' ? t('shared.rideHistory.statusCompleted')
                : f.value === 'cancelled' ? t('shared.rideHistory.statusCancelled')
                : f.value === 'in_progress' ? t('shared.rideHistory.statusInProgress')
                : t('shared.rideHistory.statusScheduled')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Results count — shown when filtering */}
      {isFiltered && (
        <Text style={styles.resultsCount}>
          {filteredRides.length !== 1
            ? t('shared.rideHistory.resultCountPlural', { n: filteredRides.length })
            : t('shared.rideHistory.resultCount', { n: filteredRides.length })}
          {hasMore && rides.length > 0 ? ` ${t('shared.rideHistory.scrollMore')}` : ''}
        </Text>
      )}

      {/* List */}
      <FlatList
        data={filteredRides}
        keyExtractor={r => r.id}
        contentContainerStyle={
          filteredRides.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{isFiltered ? '🔎' : '🚕'}</Text>
            <Text style={styles.emptyTitle}>
              {isFiltered ? t('shared.rideHistory.noMatchTitle') : t('shared.rideHistory.emptyTitle')}
            </Text>
            <Text style={styles.emptySub}>
              {isFiltered
                ? t('shared.rideHistory.noMatchHint')
                : t('shared.rideHistory.emptyHint')}
            </Text>
            {isFiltered && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => { setStatusFilter('all'); handleClearSearch(); }}>
                <Text style={styles.clearBtnText}>{t('shared.rideHistory.clearFilters')}</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.primary} style={styles.loadMoreIndicator} />
          ) : null
        }
        renderItem={({ item }) => (
          <RideCard
            ride={item}
            onCancelled={rideId =>
              setRides(prev =>
                prev.map(r =>
                  r.id === rideId ? { ...r, status: 'cancelled' as RideStatus } : r,
                ),
              )
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

// ── RideCard ──────────────────────────────────────────────────────────────────

function RideCard({ ride, onCancelled }: { ride: Ride; onCancelled: (id: string) => void }) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const STATUS_COLOR: Record<RideStatus, string> = {
    requested:         colors.warning,
    accepted:          colors.info,
    driving_to_pickup: colors.info,
    in_progress:       colors.success,
    completed:         colors.textSecondary,
    cancelled:         colors.error,
  };

  const navigation = useNavigation<any>();
  const [cancelling, setCancelling] = useState(false);

  const status = ride.status as RideStatus;
  const date = new Date(ride.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const time = new Date(ride.createdAt).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });

  const isScheduledPending = ride.scheduledAt != null && status === 'requested';
  // Any 'requested' ride (scheduled or on-demand) can be cancelled by the
  // rider before a driver accepts. This lets riders back out of a stuck
  // "searching for driver" state — including when the network flapped
  // during the initial request.
  const canCancel = status === 'requested';

  const handleInlineCancel = () => {
    const scheduledLine = ride.scheduledAt
      ? `\n\n📅 ${new Date(ride.scheduledAt).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })}`
      : '';
    Alert.alert(
      t('shared.rideHistory.cancelTitle'),
      `${t('shared.rideHistory.cancelMsg')}${scheduledLine}`,
      [
        { text: t('shared.rideHistory.keepBtn'), style: 'cancel' },
        {
          text: t('shared.rideHistory.cancelBookingBtn'),
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await ridesApi.cancelRide(ride.id, { reason: 'Cancelled by client' });
              onCancelled(ride.id);
            } catch {
              Alert.alert(t('common.error'), t('shared.rideHistory.cancelError'));
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

  return (
    <TouchableOpacity
      style={[styles.card, isScheduledPending && styles.cardScheduled]}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('RideDetail', { ride })}>

      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[status] + '22' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLOR[status] }]}>
            {status === 'requested' ? t('shared.rideHistory.statusRequested')
              : status === 'accepted' ? t('shared.rideHistory.statusAccepted')
              : status === 'driving_to_pickup' ? t('shared.rideHistory.statusEnRoute')
              : status === 'in_progress' ? t('shared.rideHistory.statusInProgress')
              : status === 'completed' ? t('shared.rideHistory.statusCompleted')
              : t('shared.rideHistory.statusCancelled')}
          </Text>
        </View>
        <Text style={styles.dateText}>{date} · {time}</Text>
      </View>

      {/* Locations */}
      <View style={styles.locationRow}>
        <View style={[styles.dot, { backgroundColor: colors.primary }]} />
        <Text style={styles.locationText} numberOfLines={1}>
          {ride.pickupAddress ?? `${ride.pickupLat.toFixed(4)}, ${ride.pickupLng.toFixed(4)}`}
        </Text>
      </View>
      {ride.dropoffLat != null && (
        <View style={styles.locationRow}>
          <View style={[styles.dot, { backgroundColor: colors.info }]} />
          <Text style={styles.locationText} numberOfLines={1}>
            {ride.dropoffAddress ?? `${ride.dropoffLat.toFixed(4)}, ${ride.dropoffLng!.toFixed(4)}`}
          </Text>
        </View>
      )}

      {/* Scheduled badge + inline cancel. For on-demand rides in 'requested'
          state (no scheduledAt) we skip the calendar badge but still show the
          cancel button, so riders can bail out of a stuck search. */}
      {canCancel && (
        <View style={styles.scheduledRow}>
          {isScheduledPending ? (
            <View style={styles.scheduledBadge}>
              <Text style={styles.scheduledBadgeText}>
                🗓 {new Date(ride.scheduledAt!).toLocaleString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </View>
          ) : (
            <View style={styles.scheduledBadge}>
              <Text style={styles.scheduledBadgeText}>
                🔎 {t('shared.rideHistory.statusRequested')}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.inlineCancelBtn, cancelling && { opacity: 0.5 }]}
            onPress={(e) => { e.stopPropagation?.(); handleInlineCancel(); }}
            disabled={cancelling}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {cancelling
              ? <ActivityIndicator size="small" color={colors.error} />
              : <Text style={styles.inlineCancelText}>✕ {t('shared.rideHistory.cancelBookingBtn')}</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Footer */}
      <View style={styles.cardFooter}>
        <View style={styles.footerLeft}>
          {ride.paymentStatus === 'paid' && (
            <Text style={styles.footerText}>
              {ride.paymentMethod === 'card' ? '💳 Paid by card' : `💵 ${t('shared.rideHistory.cashPaid')}`}
            </Text>
          )}
          {ride.paymentStatus === 'pending' && ride.status === 'completed' && (
            <Text style={styles.footerText}>⏳ {t('shared.rideHistory.paymentPending')}</Text>
          )}
          {ride.driverRating != null && (
            <Text style={styles.footerText}>⭐ {Number(ride.driverRating).toFixed(1)}</Text>
          )}
          {ride.totalFare != null && (
            <Text style={styles.footerText}>💰 ${Number(ride.totalFare).toFixed(2)}</Text>
          )}
          {ride.cancelReason != null && (
            <Text style={styles.cancelReason} numberOfLines={1}>
              {ride.cancelReason}
            </Text>
          )}
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:     { flex: 1, backgroundColor: c.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Sizes.screenPadding,
      paddingTop: 16,
      paddingBottom: 8,
    },
    screenTitle: { fontSize: 22, fontWeight: '800', color: c.text },
    clearAll:    { fontSize: 13, color: c.primary, fontWeight: '600' },

    // Search
    searchRow: {
      paddingHorizontal: Sizes.screenPadding,
      paddingBottom: 8,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      height: 42,
      gap: 8,
    },
    searchIcon:  { fontSize: 14 },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: c.text,
      paddingVertical: 0,
    },
    searchClear: { fontSize: 14, color: c.textSecondary, paddingLeft: 4 },

    // Filter pills
    pillRow: { maxHeight: 44, flexShrink: 0 },
    pillRowContent: {
      paddingHorizontal: Sizes.screenPadding,
      paddingVertical: 4,
      gap: 8,
      alignItems: 'center',
    },
    pill: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 5,
      backgroundColor: c.surface,
    },
    pillActive:     { backgroundColor: c.primary, borderColor: c.primary },
    pillText:       { fontSize: 13, color: c.textSecondary },
    pillTextActive: { color: c.white, fontWeight: '600' },

    // Results count
    resultsCount: {
      fontSize: 12,
      color: c.textSecondary,
      paddingHorizontal: Sizes.screenPadding,
      paddingTop: 6,
      paddingBottom: 2,
    },

    // List
    listContent:    { padding: Sizes.screenPadding, paddingTop: 8 },
    emptyContainer: { flex: 1 },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyIcon:  { fontSize: 56, marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: c.text, marginBottom: 8 },
    emptySub: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: 32,
      marginBottom: 20,
    },
    clearBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    clearBtnText: { color: c.white, fontWeight: '700', fontSize: 14 },

    loadMoreIndicator: { marginVertical: 16 },

    // Ride card
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardScheduled: { borderColor: c.primary + '55' },

    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    badge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    badgeText: { fontSize: 12, fontWeight: '700' },
    dateText:  { fontSize: 12, color: c.textSecondary },

    locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    dot:          { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
    locationText: { flex: 1, fontSize: 13, color: c.text, fontWeight: '500' },

    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    footerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    footerText:   { fontSize: 12, color: c.textSecondary, fontWeight: '600' },
    cancelReason: { fontSize: 12, color: c.error, fontStyle: 'italic' },
    chevron:      { fontSize: 20, color: c.textSecondary, lineHeight: 24, marginLeft: 4 },

    scheduledRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      marginBottom: 2,
      gap: 8,
    },
    scheduledBadge: {
      flex: 1,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: c.primary + '18',
      borderRadius: 8,
    },
    scheduledBadgeText: { fontSize: 12, fontWeight: '700', color: c.primary },
    inlineCancelBtn: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: c.error,
    },
    inlineCancelText: { fontSize: 12, fontWeight: '700', color: c.error },
  });
}
