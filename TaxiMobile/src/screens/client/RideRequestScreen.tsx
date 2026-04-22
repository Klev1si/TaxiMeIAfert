import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import MapView, {
  Marker,
  Region,
  PROVIDER_GOOGLE,
  MapPressEvent,
} from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRideStore } from '../../stores/rideStore';
import { ridesApi } from '../../api/rides';
import { socketService } from '../../services/socket';
import { Colors } from '../../constants';
import type { WsRideAccepted, WsRideCancelled } from '../../types/api';
import type { ClientStackScreenProps } from '../../navigation/types';

type Props = ClientStackScreenProps<'RideRequest'>;

const DELTA = 0.015;

export default function RideRequestScreen({ navigation, route }: Props) {
  const { pickupLat, pickupLng, pickupAddress } = route.params;

  const { setActiveRide, setIsSearching, isSearching, clearAll } = useRideStore();

  const mapRef = useRef<MapView>(null);

  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const [requesting, setRequesting] = useState(false);

  const pickupRegion: Region = {
    latitude: pickupLat,
    longitude: pickupLng,
    latitudeDelta: DELTA,
    longitudeDelta: DELTA,
  };

  // ── Center map on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      mapRef.current?.animateToRegion(pickupRegion, 600);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── WebSocket listeners while searching ─────────────────────────────────────
  useEffect(() => {
    if (!isSearching) { return; }

    const unsubAccepted = socketService.on<WsRideAccepted>(
      'ride_accepted',
      (payload) => {
        setIsSearching(false);
        navigation.replace('ActiveRide', { rideId: payload.rideId });
      },
    );

    const unsubCancelled = socketService.on<WsRideCancelled>(
      'ride_cancelled',
      (payload) => {
        setIsSearching(false);
        clearAll();
        Alert.alert(
          'No drivers available',
          payload.reason ?? 'All nearby drivers are unavailable. Please try again.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      },
    );

    return () => {
      unsubAccepted();
      unsubCancelled();
    };
  }, [isSearching, navigation, setIsSearching, clearAll]);

  // ── Tap map to set dropoff ───────────────────────────────────────────────────
  const handleMapPress = (e: MapPressEvent) => {
    if (isSearching || requesting) { return; }
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setDropoff({ lat: latitude, lng: longitude });
  };

  // ── Request ride ─────────────────────────────────────────────────────────────
  const handleRequest = async () => {
    setRequesting(true);
    try {
      const { data: ride } = await ridesApi.requestRide({
        pickupLat,
        pickupLng,
        pickupAddress,
        dropoffLat: dropoff?.lat,
        dropoffLng: dropoff?.lng,
      });
      setActiveRide(ride);
      setIsSearching(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Failed to request ride. Try again.';
      Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setRequesting(false);
    }
  };

  // ── Cancel while searching ───────────────────────────────────────────────────
  const handleCancel = () => {
    Alert.alert('Cancel Ride', 'Are you sure you want to cancel?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, cancel',
        style: 'destructive',
        onPress: async () => {
          const rideId = useRideStore.getState().activeRide?.id;
          if (rideId) {
            try {
              await ridesApi.cancelRide(rideId, { reason: 'Cancelled by client' });
            } catch {
              // best-effort
            }
          }
          setIsSearching(false);
          clearAll();
          navigation.goBack();
        },
      },
    ]);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={pickupRegion}
        onPress={handleMapPress}
        showsUserLocation>

        {/* Pickup marker */}
        <Marker
          coordinate={{ latitude: pickupLat, longitude: pickupLng }}
          title="Pickup"
          description={pickupAddress ?? 'Your location'}
          pinColor={Colors.primary}
        />

        {/* Dropoff marker */}
        {dropoff && (
          <Marker
            coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }}
            title="Dropoff"
            description="Tap to change"
            pinColor={Colors.info}
          />
        )}
      </MapView>

      {/* Top back button */}
      {!isSearching && (
        <SafeAreaView edges={['top']} style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {/* Searching overlay */}
      {isSearching && (
        <View style={styles.searchingOverlay}>
          <View style={styles.searchingCard}>
            <ActivityIndicator size="large" color={Colors.primary} style={styles.spinner} />
            <Text style={styles.searchingTitle}>Finding your driver…</Text>
            <Text style={styles.searchingSubtitle}>
              We're contacting nearby drivers. This usually takes under a minute.
            </Text>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancel}
              activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel Ride</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bottom card */}
      {!isSearching && (
        <SafeAreaView edges={['bottom']} style={styles.bottomArea}>
          <View style={styles.bottomCard}>

            {/* Pickup row */}
            <View style={styles.locationRow}>
              <View style={[styles.dot, styles.dotPickup]} />
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>Pickup</Text>
                <Text style={styles.locationValue} numberOfLines={1}>
                  {pickupAddress ?? `${pickupLat.toFixed(5)}, ${pickupLng.toFixed(5)}`}
                </Text>
              </View>
            </View>

            <View style={styles.locationDivider} />

            {/* Dropoff row */}
            <View style={styles.locationRow}>
              <View style={[styles.dot, styles.dotDropoff]} />
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>Dropoff</Text>
                <Text
                  style={[
                    styles.locationValue,
                    !dropoff && styles.locationValuePlaceholder,
                  ]}
                  numberOfLines={1}>
                  {dropoff
                    ? `${dropoff.lat.toFixed(5)}, ${dropoff.lng.toFixed(5)}`
                    : 'Tap the map to set (optional)'}
                </Text>
              </View>
              {dropoff && (
                <TouchableOpacity onPress={() => setDropoff(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.clearDropoff}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Request button */}
            <TouchableOpacity
              style={[styles.requestBtn, requesting && styles.requestBtnDisabled]}
              onPress={handleRequest}
              disabled={requesting}
              activeOpacity={0.85}>
              {requesting ? (
                <ActivityIndicator color={Colors.textOnPrimary} />
              ) : (
                <Text style={styles.requestBtnText}>Confirm & Request Ride</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  backBtn: {
    margin: 16,
    alignSelf: 'flex-start',
    backgroundColor: Colors.background,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  backText: { fontSize: 14, fontWeight: '600', color: Colors.primary },

  // Searching overlay
  searchingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 40,
  },
  searchingCard: {
    width: '90%',
    backgroundColor: Colors.background,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
  },
  spinner: { marginBottom: 20 },
  searchingTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  searchingSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  cancelBtn: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: Colors.error },

  // Bottom card
  bottomArea: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  bottomCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.background,
    borderRadius: 20,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  dotPickup: { backgroundColor: Colors.primary },
  dotDropoff: { backgroundColor: Colors.info },
  locationInfo: { flex: 1 },
  locationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  locationValue: { fontSize: 14, color: Colors.text, fontWeight: '500', marginTop: 2 },
  locationValuePlaceholder: { color: Colors.textDisabled, fontStyle: 'italic' },
  clearDropoff: { fontSize: 16, color: Colors.textSecondary, paddingLeft: 8 },
  locationDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
    marginLeft: 24,
  },

  requestBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  requestBtnDisabled: { opacity: 0.6 },
  requestBtnText: { fontSize: 16, fontWeight: '700', color: Colors.textOnPrimary },
});
