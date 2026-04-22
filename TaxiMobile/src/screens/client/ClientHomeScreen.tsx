import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Alert,
} from 'react-native';
import MapView, { Marker, Region, PROVIDER_GOOGLE, UserLocationChangeEvent } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { useRideStore } from '../../stores/rideStore';
import { ridesApi } from '../../api/rides';
import { Colors } from '../../constants';
import type { NearestDriver } from '../../types/api';
import type { ClientStackScreenProps } from '../../navigation/types';

type Props = ClientStackScreenProps<'ClientHomeMain'>;

const DEFAULT_DELTA = 0.02;

export default function ClientHomeScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const { activeRide, nearestDrivers, setNearestDrivers } = useRideStore();

  const mapRef = useRef<MapView>(null);
  const [locationReady, setLocationReady] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [userRegion, setUserRegion] = useState<Region | null>(null);
  const [loadingDrivers, setLoadingDrivers] = useState(false);

  // ── Redirect if there is already an active ride ─────────────────────────────
  useEffect(() => {
    if (activeRide) {
      navigation.replace('ActiveRide', { rideId: activeRide.id });
    }
  }, [activeRide, navigation]);

  // ── Request location permission ──────────────────────────────────────────────
  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'TaxiApp needs your location to find nearby drivers.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        );
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          setPermissionDenied(true);
        }
        // location will arrive via onUserLocationChange once granted
      } catch {
        setPermissionDenied(true);
      }
    }
    // iOS: location permission is requested automatically by the map
  };

  // ── Fetch nearest drivers ────────────────────────────────────────────────────
  const fetchNearestDrivers = useCallback(async (lat: number, lng: number) => {
    setLoadingDrivers(true);
    try {
      const { data } = await ridesApi.getNearestDrivers(lat, lng, 5, 20);
      setNearestDrivers(data);
    } catch {
      // non-fatal — map still works without driver markers
    } finally {
      setLoadingDrivers(false);
    }
  }, [setNearestDrivers]);

  // ── Called by MapView each time the device location updates ─────────────────
  const handleUserLocationChange = useCallback(
    (event: UserLocationChangeEvent) => {
      const coordinate = event.nativeEvent.coordinate;
      if (!coordinate) { return; }
      const { latitude, longitude } = coordinate;
      if (!locationReady) {
        const region: Region = {
          latitude,
          longitude,
          latitudeDelta: DEFAULT_DELTA,
          longitudeDelta: DEFAULT_DELTA,
        };
        setUserRegion(region);
        setLocationReady(true);
        mapRef.current?.animateToRegion(region, 800);
        fetchNearestDrivers(latitude, longitude);
      }
    },
    [locationReady, fetchNearestDrivers],
  );

  // ── Navigate to ride request screen ─────────────────────────────────────────
  const handleRequestRide = () => {
    if (!userRegion) {
      Alert.alert('Location unavailable', 'Waiting for your GPS location. Please try again in a moment.');
      return;
    }
    navigation.navigate('RideRequest', {
      pickupLat: userRegion.latitude,
      pickupLng: userRegion.longitude,
    });
  };

  // ── Refresh driver markers manually ─────────────────────────────────────────
  const handleRefresh = () => {
    if (userRegion) {
      fetchNearestDrivers(userRegion.latitude, userRegion.longitude);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (permissionDenied) {
    return (
      <SafeAreaView style={styles.centeredFill}>
        <Text style={styles.permTitle}>Location Access Required</Text>
        <Text style={styles.permSubtitle}>
          Please enable location permission in your device settings to use TaxiApp.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation
        showsMyLocationButton={false}
        onUserLocationChange={handleUserLocationChange}
        initialRegion={
          userRegion ?? {
            latitude: 40.7128,
            longitude: -74.006,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          }
        }>
        {/* Driver markers */}
        {nearestDrivers.map((driver) => (
          <DriverMarker key={driver.driverId} driver={driver} />
        ))}
      </MapView>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <View style={styles.topCard}>
          <Text style={styles.greeting}>
            Hello, {user?.phone ?? 'there'} 👋
          </Text>
          <View style={styles.topRight}>
            {loadingDrivers ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <TouchableOpacity onPress={handleRefresh} activeOpacity={0.7}>
                <Text style={styles.refreshText}>↻</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.driverCount}>
              {nearestDrivers.length} driver{nearestDrivers.length !== 1 ? 's' : ''} nearby
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Recenter button ─────────────────────────────────────────────── */}
      {locationReady && (
        <TouchableOpacity
          style={styles.recenterBtn}
          onPress={() => userRegion && mapRef.current?.animateToRegion(userRegion, 500)}
          activeOpacity={0.8}>
          <Text style={styles.recenterIcon}>◎</Text>
        </TouchableOpacity>
      )}

      {/* ── Bottom card ─────────────────────────────────────────────────── */}
      <SafeAreaView edges={['bottom']} style={styles.bottomArea}>
        <View style={styles.bottomCard}>
          {!locationReady ? (
            <View style={styles.locatingRow}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.locatingText}>Getting your location…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.whereToLabel}>Where are you going?</Text>
              <TouchableOpacity
                style={styles.requestBtn}
                onPress={handleRequestRide}
                activeOpacity={0.85}>
                <Text style={styles.requestBtnText}>🚕  Request a Ride</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Driver marker ──────────────────────────────────────────────────────────────
function DriverMarker({ driver }: { driver: NearestDriver }) {
  return (
    <Marker
      coordinate={{ latitude: driver.lat, longitude: driver.lng }}
      title={`${driver.firstName} ${driver.lastName}`}
      description={`${driver.vehicleMake} ${driver.vehicleModel} · ${driver.vehiclePlate}`}
      anchor={{ x: 0.5, y: 0.5 }}>
      <View style={markerStyles.wrap}>
        <Text style={markerStyles.icon}>🚕</Text>
      </View>
    </Marker>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  centeredFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: Colors.background,
  },
  permTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  permSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topCard: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: Colors.background,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  greeting: { fontSize: 14, fontWeight: '600', color: Colors.text },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refreshText: { fontSize: 20, color: Colors.primary, fontWeight: '700' },
  driverCount: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },

  recenterBtn: {
    position: 'absolute',
    right: 16,
    bottom: 200,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  recenterIcon: { fontSize: 22, color: Colors.primary },

  bottomArea: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  bottomCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.background,
    borderRadius: 20,
    padding: 20,
    elevation: 8,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  locatingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center', paddingVertical: 8 },
  locatingText: { fontSize: 15, color: Colors.textSecondary },

  whereToLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginBottom: 12,
  },
  requestBtn: {
    height: 54,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestBtnText: { fontSize: 17, fontWeight: '700', color: Colors.textOnPrimary },
});

const markerStyles = StyleSheet.create({
  wrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
    elevation: 3,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  icon: { fontSize: 18 },
});
