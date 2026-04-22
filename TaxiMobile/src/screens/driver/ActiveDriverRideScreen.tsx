import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRideStore } from '../../stores/rideStore';
import { ridesApi } from '../../api/rides';
import { socketService } from '../../services/socket';
import { Colors } from '../../constants';
import type { Ride, RideStatus } from '../../types/api';
import type { DriverStackScreenProps } from '../../navigation/types';

type Props = DriverStackScreenProps<'ActiveDriverRide'>;

interface RideCancelledEvent { rideId: string; cancelledBy: string; reason: string | null }

// What action button to show at each status
type ActionStep =
  | { label: string; action: () => Promise<void>; color: string }
  | null;

export default function ActiveDriverRideScreen({ navigation, route }: Props) {
  const { rideId } = route.params;
  const { activeRide, setActiveRide, clearAll } = useRideStore();

  const [ride, setRide] = useState<Ride | null>(activeRide);
  const [busy, setBusy] = useState(false);

  const updateRide = (patch: Partial<Ride>) =>
    setRide(r => (r ? { ...r, ...patch } : r));

  // ── Client cancels while driver is en-route ──────────────────────────────────
  useEffect(() => {
    const unsub = socketService.on<RideCancelledEvent>('ride_cancelled', (e) => {
      if (e.rideId !== rideId) { return; }
      clearAll();
      Alert.alert(
        'Ride Cancelled',
        e.reason ? `Client cancelled: ${e.reason}` : 'The client cancelled the ride.',
        [{ text: 'OK', onPress: () => navigation.replace('DriverHomeMain') }],
      );
    });
    return unsub;
  }, [rideId, navigation, clearAll]);

  // ── Lifecycle action helpers ──────────────────────────────────────────────────
  const doAction = async (apiCall: () => Promise<{ data: Ride }>) => {
    setBusy(true);
    try {
      const { data: updated } = await apiCall();
      setRide(updated);
      setActiveRide(updated);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Action failed. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setBusy(false);
    }
  };

  const handleEnRoute  = () => doAction(() => ridesApi.markEnRoute(rideId));
  const handleArrived  = () => doAction(() => ridesApi.markArrived(rideId));
  const handleStart    = () => doAction(() => ridesApi.startRide(rideId));

  const handleComplete = async () => {
    Alert.alert('Complete Ride', 'Confirm the ride is complete?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: async () => {
          setBusy(true);
          try {
            const { data: completed } = await ridesApi.completeRide(rideId);
            setActiveRide(completed);
            navigation.replace('RateClient', { rideId, rateTarget: 'client' });
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.message ?? 'Failed to complete ride.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (!ride) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>Ride not found.</Text>
        <TouchableOpacity onPress={() => navigation.replace('DriverHomeMain')}>
          <Text style={styles.linkText}>Go home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const status = ride.status as RideStatus;

  // Determine which action button to show
  let actionStep: ActionStep = null;
  if (status === 'accepted') {
    actionStep = { label: '🚗  Start Driving to Pickup', action: handleEnRoute, color: Colors.info };
  } else if (status === 'driving_to_pickup' && !ride.pickupArrivedAt) {
    actionStep = { label: '📍  I\'ve Arrived at Pickup', action: handleArrived, color: Colors.warning };
  } else if (status === 'driving_to_pickup' && ride.pickupArrivedAt) {
    actionStep = { label: '▶️  Start Ride', action: handleStart, color: Colors.success };
  } else if (status === 'in_progress') {
    actionStep = { label: '🏁  Complete Ride', action: handleComplete, color: Colors.primary };
  }

  const statusColors: Record<RideStatus, string> = {
    requested: Colors.warning,
    accepted: Colors.info,
    driving_to_pickup: Colors.info,
    in_progress: Colors.success,
    completed: Colors.textSecondary,
    cancelled: Colors.error,
  };

  const statusLabels: Record<RideStatus, string> = {
    requested: 'Requested',
    accepted: 'Accepted — heading to pickup',
    driving_to_pickup: ride.pickupArrivedAt ? 'Arrived at pickup' : 'Driving to pickup',
    in_progress: 'Ride in progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation
        initialRegion={{
          latitude: ride.pickupLat,
          longitude: ride.pickupLng,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }}>
        <Marker
          coordinate={{ latitude: ride.pickupLat, longitude: ride.pickupLng }}
          title="Pickup"
          pinColor={Colors.primary}
        />
        {ride.dropoffLat != null && ride.dropoffLng != null && (
          <Marker
            coordinate={{ latitude: ride.dropoffLat, longitude: ride.dropoffLng }}
            title="Dropoff"
            pinColor={Colors.info}
          />
        )}
      </MapView>

      {/* Info panel */}
      <SafeAreaView edges={['bottom']} style={styles.panelWrap}>
        <View style={styles.panel}>
          {/* Status badge */}
          <View style={[styles.badge, { backgroundColor: statusColors[status] + '22' }]}>
            <View style={[styles.badgeDot, { backgroundColor: statusColors[status] }]} />
            <Text style={[styles.badgeText, { color: statusColors[status] }]}>
              {statusLabels[status]}
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
            <InfoRow icon="📍" label="Pickup"
              value={ride.pickupAddress ?? `${ride.pickupLat.toFixed(5)}, ${ride.pickupLng.toFixed(5)}`} />
            {ride.dropoffLat != null && (
              <InfoRow icon="🏁" label="Dropoff"
                value={ride.dropoffAddress ?? `${ride.dropoffLat.toFixed(5)}, ${ride.dropoffLng!.toFixed(5)}`} />
            )}
          </ScrollView>

          {/* Action button */}
          {actionStep && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: actionStep.color }, busy && styles.actionBtnDisabled]}
              onPress={actionStep.action}
              disabled={busy}
              activeOpacity={0.85}>
              {busy
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.actionBtnText}>{actionStep.label}</Text>}
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.icon}>{icon}</Text>
      <View style={infoStyles.text}>
        <Text style={infoStyles.label}>{label}</Text>
        <Text style={infoStyles.value} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  icon: { fontSize: 18, marginRight: 10, marginTop: 2 },
  text: { flex: 1 },
  label: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 14, color: Colors.text, fontWeight: '500', marginTop: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 16, color: Colors.textSecondary, marginBottom: 12 },
  linkText: { fontSize: 15, color: Colors.primary, fontWeight: '700' },

  panelWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  panel: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.background,
    borderRadius: 20,
    padding: 20,
    maxHeight: 340,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 14,
  },
  badgeDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  badgeText: { fontSize: 13, fontWeight: '700' },

  scroll: { maxHeight: 120 },

  actionBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
});
