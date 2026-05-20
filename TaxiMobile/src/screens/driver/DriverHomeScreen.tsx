import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  Switch,
} from 'react-native';
import MapView, { PROVIDER_GOOGLE, UserLocationChangeEvent } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { useDriverStore } from '../../stores/driverStore';
import { useRideStore } from '../../stores/rideStore';
import { ridesApi } from '../../api/rides';
import { socketService } from '../../services/socket';
import {
  startBackgroundGps,
  stopBackgroundGps,
  requestBackgroundLocation,
} from '../../services/backgroundGps';
import { useColors } from '../../stores/themeStore';
import { useTranslation } from '../../i18n';
import type { ColorPalette } from '../../constants/colors';
import type { WsRideRequest } from '../../types/api';
import type { DriverStackScreenProps } from '../../navigation/types';

type Props = DriverStackScreenProps<'DriverHomeMain'>;

const GPS_INTERVAL_MS = 8_000; // send GPS every 8 s while online

export default function DriverHomeScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
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
        title: t('driver.home.locationPermTitle'),
        message: t('driver.home.locationPermMsg'),
        buttonPositive: t('common.allow'),
        buttonNegative: t('common.deny'),
      }).then(result => {
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          setPermissionDenied(true);
        }
      });
    }
  }, []);

  // ── On first mount: check server for an active ride (handles app-restart) ────
  useEffect(() => {
    ridesApi.getActiveRide().then(({ data }) => {
      if (!data) { return; }
      const { status, id: rideId } = data;
      // accepted / driving_to_pickup / in_progress → resume active ride screen
      if (
        status === 'accepted' ||
        status === 'driving_to_pickup' ||
        status === 'in_progress'
      ) {
        navigation.navigate('ActiveDriverRide', { rideId });
      }
      // 'requested' means we were just matched — let the WS event handle it;
      // no action needed here as handleConnection on re-connect will replay.
    }).catch(() => { /* non-fatal */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // run once on mount only

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
  // The foreground service (backgroundGps) handles GPS even when the screen is
  // locked or the driver switches apps. The MapView interval below is kept as a
  // foreground fallback — it fires only when the app is in the foreground and
  // ensures the map marker updates in real time.
  const startGps = useCallback(() => {
    if (gpsIntervalRef.current) { return; }
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
    void stopBackgroundGps();
    socketService.goOffline();
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { stopGps(); }, [stopGps]);

  // ── Online toggle ────────────────────────────────────────────────────────────
  const handleToggleOnline = async (value: boolean) => {
    setToggling(true);
    try {
      if (value) {
        // Request background location permission on Android 10+.
        // Returns true  → "Allow all the time" granted → safe to start foreground service.
        // Returns false → "Allow only while using" or denied → skip background service
        //                 to avoid a SecurityException native crash on Android 14+.
        const bgGranted = await requestBackgroundLocation();
        socketService.goOnline();
        startGps();
        // Only start the foreground service when the OS will actually allow it.
        // Without ACCESS_BACKGROUND_LOCATION, Android 14+ throws SecurityException
        // before JS can catch it, which kills the app.
        if (bgGranted) {
          void startBackgroundGps();
        }
        setOnline(true);
      } else {
        stopGps();   // stopGps already calls stopBackgroundGps + goOffline
        setOnline(false);
      }
    } catch (err) {
      // Fallback: catch any remaining JS-layer errors so the app does not crash
      console.warn('[DriverHome] toggle error:', err);
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
        <Text style={styles.permTitle}>{t('driver.home.permTitle')}</Text>
        <Text style={styles.permSub}>{t('driver.home.permSub')}</Text>
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
        initialRegion={{ latitude: 42.21015, longitude: 20.73453, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
      />

      {/* Top status bar */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <View style={styles.topCard}>
          <View>
            <Text style={styles.greeting}>{t('driver.home.greeting', { phone: user?.phone ?? 'Driver' })}</Text>
            <Text style={[styles.statusLabel, { color: isOnline ? colors.success : colors.textSecondary }]}>
              {isOnline ? `● ${t('driver.home.statusOnline')}` : `○ ${t('driver.home.statusOffline')}`}
            </Text>
          </View>
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnline}
            disabled={toggling}
            trackColor={{ false: colors.border, true: colors.success + '80' }}
            thumbColor={isOnline ? colors.success : colors.textDisabled}
            accessibilityRole="switch"
            accessibilityLabel={isOnline ? t('driver.home.statusOnline') : t('driver.home.statusOffline')}
            accessibilityHint={t('driver.home.toggleHint')}
          />
        </View>
      </SafeAreaView>

      {/* Recenter */}
      {locationReady && (
        <TouchableOpacity
          style={styles.recenterBtn}
          onPress={handleRecenter}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('driver.home.recenterLabel')}>
          <Text style={styles.recenterIcon}>◎</Text>
        </TouchableOpacity>
      )}

      {/* Bottom hint */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <View style={styles.hintCard}>
          {isOnline ? (
            <Text style={styles.hintText}>🟢 {t('driver.home.hintOnline')}</Text>
          ) : (
            <Text style={styles.hintText}>{t('driver.home.hintOffline')}</Text>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function getStyles(c: ColorPalette) { return StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: c.background },
  permTitle: { fontSize: 20, fontWeight: '700', color: c.text, marginBottom: 10, textAlign: 'center' },
  permSub: { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20 },

  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: c.background,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  greeting: { fontSize: 14, fontWeight: '600', color: c.text },
  statusLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  recenterBtn: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.background,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  recenterIcon: { fontSize: 22, color: c.primary },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  hintCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: c.background,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  hintText: { fontSize: 14, color: c.textSecondary, fontWeight: '500' },
}); }
