import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  Switch,
  Alert,
} from 'react-native';
import MapView, { PROVIDER_GOOGLE, UserLocationChangeEvent } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { useDriverStore } from '../../stores/driverStore';
import { useRideStore } from '../../stores/rideStore';
import { socketService } from '../../services/socket';
import { Colors } from '../../constants';
import type { WsRideRequest } from '../../types/api';
import type { DriverStackScreenProps } from '../../navigation/types';

type Props = DriverStackScreenProps<'DriverHomeMain'>;

const GPS_INTERVAL_MS = 8_000; // send GPS every 8 s while online

export default function DriverHomeScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const { isOnline, setOnline, setLocation } = useDriverStore();
  const { setIncomingRequest } = useRideStore();

  const mapRef = useRef<MapView>(null);
  const gpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latRef = useRef<number | null>(null);
  const lngRef = useRef<number | null>(null);

  const [locationReady, setLocationReady] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [toggling, setToggling] = useState(false);

  // ── Request location permission ──────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
        title: 'Location Permission',
        message: 'TaxiApp needs your location to accept ride requests.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }).then(result => {
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          setPermissionDenied(true);
        }
      });
    }
  }, []);

  // ── Listen for incoming ride requests ────────────────────────────────────────
  useEffect(() => {
    const unsub = socketService.on<WsRideRequest>('ride_request', (payload) => {
      setIncomingRequest(payload);
      navigation.navigate('IncomingRequest', { rideId: payload.rideId });
    });
    return unsub;
  }, [navigation, setIncomingRequest]);

  // ── GPS location update from map ─────────────────────────────────────────────
  const handleUserLocationChange = useCallback(
    (event: UserLocationChangeEvent) => {
      const coordinate = event.nativeEvent.coordinate;
      if (!coordinate) { return; }
      const { latitude, longitude } = coordinate;
      latRef.current = latitude;
      lngRef.current = longitude;
      setLocation(latitude, longitude);

      if (!locationReady) {
        setLocationReady(true);
        mapRef.current?.animateToRegion(
          { latitude, longitude, latitudeDelta: 0.015, longitudeDelta: 0.015 },
          700,
        );
      }
    },
    [locationReady, setLocation],
  );

  // ── Start / stop GPS broadcasting ────────────────────────────────────────────
  const startGps = useCallback(() => {
    if (gpsIntervalRef.current) { return; }
    // Send immediately, then on interval
    if (latRef.current !== null && lngRef.current !== null) {
      socketService.sendGpsUpdate(latRef.current, lngRef.current);
    }
    gpsIntervalRef.current = setInterval(() => {
      if (latRef.current !== null && lngRef.current !== null) {
        socketService.sendGpsUpdate(latRef.current, lngRef.current);
      }
    }, GPS_INTERVAL_MS);
  }, []);

  const stopGps = useCallback(() => {
    if (gpsIntervalRef.current) {
      clearInterval(gpsIntervalRef.current);
      gpsIntervalRef.current = null;
    }
    socketService.goOffline();
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { stopGps(); }, [stopGps]);

  // ── Online toggle ────────────────────────────────────────────────────────────
  const handleToggleOnline = async (value: boolean) => {
    if (!locationReady && value) {
      Alert.alert('Location unavailable', 'Waiting for GPS. Please try again in a moment.');
      return;
    }
    setToggling(true);
    try {
      if (value) {
        startGps();
        setOnline(true);
      } else {
        stopGps();
        setOnline(false);
      }
    } finally {
      setToggling(false);
    }
  };

  // ── Recenter map ─────────────────────────────────────────────────────────────
  const handleRecenter = () => {
    if (latRef.current !== null && lngRef.current !== null) {
      mapRef.current?.animateToRegion(
        { latitude: latRef.current, longitude: lngRef.current, latitudeDelta: 0.015, longitudeDelta: 0.015 },
        500,
      );
    }
  };

  if (permissionDenied) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.permTitle}>Location Required</Text>
        <Text style={styles.permSub}>Enable location access in device settings to use driver mode.</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation
        showsMyLocationButton={false}
        onUserLocationChange={handleUserLocationChange}
        initialRegion={{ latitude: 40.7128, longitude: -74.006, latitudeDelta: 0.1, longitudeDelta: 0.1 }}
      />

      {/* Top status bar */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <View style={styles.topCard}>
          <View>
            <Text style={styles.greeting}>Hi, {user?.phone ?? 'Driver'}</Text>
            <Text style={[styles.statusLabel, { color: isOnline ? Colors.success : Colors.textSecondary }]}>
              {isOnline ? '● Online — accepting rides' : '○ Offline'}
            </Text>
          </View>
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnline}
            disabled={toggling}
            trackColor={{ false: Colors.border, true: Colors.success + '80' }}
            thumbColor={isOnline ? Colors.success : Colors.textDisabled}
          />
        </View>
      </SafeAreaView>

      {/* Recenter */}
      {locationReady && (
        <TouchableOpacity style={styles.recenterBtn} onPress={handleRecenter} activeOpacity={0.8}>
          <Text style={styles.recenterIcon}>◎</Text>
        </TouchableOpacity>
      )}

      {/* Bottom hint */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <View style={styles.hintCard}>
          {isOnline ? (
            <Text style={styles.hintText}>🟢 Waiting for ride requests…</Text>
          ) : (
            <Text style={styles.hintText}>Toggle the switch above to start accepting rides.</Text>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: Colors.background },
  permTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 10, textAlign: 'center' },
  permSub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: Colors.background,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  greeting: { fontSize: 14, fontWeight: '600', color: Colors.text },
  statusLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  recenterBtn: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  recenterIcon: { fontSize: 22, color: Colors.primary },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  hintCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  hintText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
});
