import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRideStore } from '../../stores/rideStore';
import { ridesApi } from '../../api/rides';
import { socketService } from '../../services/socket';
import { Colors } from '../../constants';
import type { Ride, RideStatus } from '../../types/api';
import type { ClientStackScreenProps } from '../../navigation/types';

type Props = ClientStackScreenProps<'ActiveRide'>;

// Events the server sends to the client during a ride
interface DriverEnRouteEvent { rideId: string; driverName: string }
interface DriverArrivedEvent  { rideId: string; driverName: string; vehiclePlate: string }
interface RideStartedEvent    { rideId: string }
interface RideCompletedEvent  { rideId: string; completedAt: string }
interface RideCancelledEvent  { rideId: string; cancelledBy: string; reason: string | null }

// Human-readable status labels shown in the card
const STATUS_LABEL: Record<RideStatus, string> = {
  requested:         'Finding driver…',
  accepted:          'Driver accepted',
  driving_to_pickup: 'Driver on the way',
  in_progress:       'Ride in progress',
  completed:         'Ride completed',
  cancelled:         'Ride cancelled',
};

const STATUS_COLOR: Record<RideStatus, string> = {
  requested:         Colors.warning,
  accepted:          Colors.info,
  driving_to_pickup: Colors.info,
  in_progress:       Colors.success,
  completed:         Colors.textSecondary,
  cancelled:         Colors.error,
};

export default function ActiveRideScreen({ navigation, route }: Props) {
  const { rideId } = route.params;
  const { activeRide, setActiveRide, clearAll } = useRideStore();

  // Use the store's ride if available; otherwise fetch from server
  const [ride, setRide] = useState<Ride | null>(activeRide);
  const [cancelling, setCancelling] = useState(false);

  // ── Load ride on mount if not in store ──────────────────────────────────────
  useEffect(() => {
    if (!ride) {
      ridesApi.cancelRide; // keep import — actual fetch below
      // no individual GET /rides/:id endpoint in this API version,
      // so rely on the store (always populated when navigating here)
    }
  }, [ride]);

  // ── WebSocket event handlers ─────────────────────────────────────────────────
  useEffect(() => {
    const update = (patch: Partial<Ride>) =>
      setRide(r => r ? { ...r, ...patch } : r);

    const unsubEnRoute = socketService.on<DriverEnRouteEvent>(
      'driver_en_route',
      (e) => { if (e.rideId === rideId) update({ status: 'driving_to_pickup' }); },
    );

    const unsubArrived = socketService.on<DriverArrivedEvent>(
      'driver_arrived',
      (e) => { if (e.rideId === rideId) update({ status: 'driving_to_pickup' }); },
    );

    const unsubStarted = socketService.on<RideStartedEvent>(
      'ride_started',
      (e) => { if (e.rideId === rideId) update({ status: 'in_progress' }); },
    );

    const unsubCompleted = socketService.on<RideCompletedEvent>(
      'ride_completed',
      (e) => {
        if (e.rideId !== rideId) { return; }
        update({ status: 'completed', completedAt: e.completedAt });
        // Navigate to PayCash screen
        navigation.replace('PayCash', { rideId });
      },
    );

    const unsubCancelled = socketService.on<RideCancelledEvent>(
      'ride_cancelled',
      (e) => {
        if (e.rideId !== rideId) { return; }
        update({ status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: e.cancelledBy });
        clearAll();
        Alert.alert(
          'Ride Cancelled',
          e.reason
            ? `Reason: ${e.reason}`
            : 'Your ride was cancelled by the driver.',
          [{ text: 'OK', onPress: () => navigation.replace('ClientHomeMain') }],
        );
      },
    );

    return () => {
      unsubEnRoute();
      unsubArrived();
      unsubStarted();
      unsubCompleted();
      unsubCancelled();
    };
  }, [rideId, navigation, clearAll]);

  // ── Cancel by client ─────────────────────────────────────────────────────────
  const handleCancel = () => {
    Alert.alert('Cancel Ride', 'Are you sure you want to cancel?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, cancel',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await ridesApi.cancelRide(rideId, { reason: 'Cancelled by client' });
            clearAll();
            navigation.replace('ClientHomeMain');
          } catch (err: any) {
            const msg = err?.response?.data?.message ?? 'Failed to cancel.';
            Alert.alert('Error', msg);
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  if (!ride) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>Ride not found.</Text>
        <TouchableOpacity onPress={() => navigation.replace('ClientHomeMain')}>
          <Text style={styles.linkText}>Go home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const status = ride.status as RideStatus;
  const canCancel = status === 'accepted' || status === 'driving_to_pickup';

  return (
    <View style={styles.container}>
      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation
        initialRegion={{
          latitude: ride.pickupLat,
          longitude: ride.pickupLng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}>
        {/* Pickup */}
        <Marker
          coordinate={{ latitude: ride.pickupLat, longitude: ride.pickupLng }}
          title="Pickup"
          pinColor={Colors.primary}
        />
        {/* Dropoff */}
        {ride.dropoffLat != null && ride.dropoffLng != null && (
          <Marker
            coordinate={{ latitude: ride.dropoffLat, longitude: ride.dropoffLng }}
            title="Dropoff"
            pinColor={Colors.info}
          />
        )}
      </MapView>

      {/* ── Info panel ──────────────────────────────────────────────────── */}
      <SafeAreaView edges={['bottom']} style={styles.panelWrap}>
        <View style={styles.panel}>
          {/* Status badge */}
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[status] + '22' }]}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] }]} />
            <Text style={[styles.statusText, { color: STATUS_COLOR[status] }]}>
              {STATUS_LABEL[status]}
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Driver info (from store ride populated after ride_accepted) */}
            {ride.driverId && (
              <InfoRow icon="🧑‍✈️" label="Driver" value={ride.driverId} />
            )}

            {/* Pickup */}
            <InfoRow
              icon="📍"
              label="Pickup"
              value={ride.pickupAddress ?? `${ride.pickupLat.toFixed(5)}, ${ride.pickupLng.toFixed(5)}`}
            />

            {/* Dropoff */}
            {ride.dropoffLat != null && (
              <InfoRow
                icon="🏁"
                label="Dropoff"
                value={
                  ride.dropoffAddress ??
                  `${ride.dropoffLat.toFixed(5)}, ${ride.dropoffLng!.toFixed(5)}`
                }
              />
            )}

            {/* Arrived notice */}
            {status === 'driving_to_pickup' && ride.pickupArrivedAt && (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>🚕 Driver has arrived at your pickup!</Text>
              </View>
            )}

            {/* In progress notice */}
            {status === 'in_progress' && (
              <View style={[styles.noticeBox, styles.noticeGreen]}>
                <Text style={styles.noticeText}>🛣️ You're on your way!</Text>
              </View>
            )}
          </ScrollView>

          {/* Cancel button — only while driver hasn't started the ride */}
          {canCancel && (
            <TouchableOpacity
              style={[styles.cancelBtn, cancelling && styles.cancelBtnDisabled]}
              onPress={handleCancel}
              disabled={cancelling}
              activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>
                {cancelling ? 'Cancelling…' : 'Cancel Ride'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Small helper component ────────────────────────────────────────────────────
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

  panelWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  panel: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.background,
    borderRadius: 20,
    padding: 20,
    maxHeight: 360,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 14, fontWeight: '700' },

  noticeBox: {
    backgroundColor: Colors.infoLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.info,
  },
  noticeGreen: {
    backgroundColor: Colors.successLight,
    borderColor: Colors.success,
  },
  noticeText: { fontSize: 14, color: Colors.text, fontWeight: '500' },

  cancelBtn: {
    height: 46,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  cancelBtnDisabled: { opacity: 0.5 },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: Colors.error },
});
