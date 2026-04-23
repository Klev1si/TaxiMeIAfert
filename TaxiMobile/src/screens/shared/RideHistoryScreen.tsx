import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ridesApi } from '../../api/rides';
import { Colors, Sizes } from '../../constants';
import type { Ride, RideStatus } from '../../types/api';

const STATUS_LABEL: Record<RideStatus, string> = {
  requested:         'Requested',
  accepted:          'Accepted',
  driving_to_pickup: 'Driver en route',
  in_progress:       'In progress',
  completed:         'Completed',
  cancelled:         'Cancelled',
};

const STATUS_COLOR: Record<RideStatus, string> = {
  requested:         Colors.warning,
  accepted:          Colors.info,
  driving_to_pickup: Colors.info,
  in_progress:       Colors.success,
  completed:         Colors.textSecondary,
  cancelled:         Colors.error,
};

export default function RideHistoryScreen() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

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

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRides(1, true);
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (!hasMore || loadingMore) { return; }
    setLoadingMore(true);
    await fetchRides(page + 1, false);
    setLoadingMore(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.screenTitle}>Ride History</Text>
      <FlatList
        data={rides}
        keyExtractor={r => r.id}
        contentContainerStyle={rides.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🚕</Text>
            <Text style={styles.emptyTitle}>No rides yet</Text>
            <Text style={styles.emptySub}>Your completed and cancelled rides will appear here.</Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={Colors.primary} style={styles.loadMoreIndicator} />
          ) : null
        }
        renderItem={({ item }) => <RideCard ride={item} />}
      />
    </SafeAreaView>
  );
}

function RideCard({ ride }: { ride: Ride }) {
  const status = ride.status as RideStatus;
  const date = new Date(ride.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const time = new Date(ride.createdAt).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[status] + '22' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLOR[status] }]}>
            {STATUS_LABEL[status]}
          </Text>
        </View>
        <Text style={styles.dateText}>{date} · {time}</Text>
      </View>

      {/* Locations */}
      <View style={styles.locationRow}>
        <View style={[styles.dot, { backgroundColor: Colors.primary }]} />
        <Text style={styles.locationText} numberOfLines={1}>
          {ride.pickupAddress ?? `${ride.pickupLat.toFixed(4)}, ${ride.pickupLng.toFixed(4)}`}
        </Text>
      </View>
      {ride.dropoffLat != null && (
        <View style={styles.locationRow}>
          <View style={[styles.dot, { backgroundColor: Colors.info }]} />
          <Text style={styles.locationText} numberOfLines={1}>
            {ride.dropoffAddress ?? `${ride.dropoffLat.toFixed(4)}, ${ride.dropoffLng!.toFixed(4)}`}
          </Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.footerText}>
          {ride.paymentStatus === 'paid' ? '💵 Cash paid' : ride.paymentStatus === 'pending' ? '⏳ Payment pending' : ''}
        </Text>
        {ride.driverRating != null && (
          <Text style={styles.footerText}>⭐ {ride.driverRating.toFixed(1)}</Text>
        )}
        {ride.cancelReason != null && (
          <Text style={styles.cancelReason} numberOfLines={1}>
            Reason: {ride.cancelReason}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },

  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    paddingHorizontal: Sizes.screenPadding,
    paddingTop: 16,
    paddingBottom: 8,
  },

  listContent: { padding: Sizes.screenPadding, paddingTop: 8 },
  emptyContainer: { flex: 1 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },

  loadMoreIndicator: { marginVertical: 16 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  dateText: { fontSize: 12, color: Colors.textSecondary },

  locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  locationText: { flex: 1, fontSize: 13, color: Colors.text, fontWeight: '500' },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  cancelReason: { flex: 1, fontSize: 12, color: Colors.error, fontStyle: 'italic' },
});
