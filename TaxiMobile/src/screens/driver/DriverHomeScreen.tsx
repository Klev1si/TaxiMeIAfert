import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import MapView, { PROVIDER_GOOGLE, UserLocationChangeEvent } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { useDriverStore } from '../../stores/driverStore';
import { useRideStore } from '../../stores/rideStore';
import { ridesApi } from '../../api/rides';
import { driverTariffApi, type ActiveDriverTariff } from '../../api/driver-tariff';
import { driverMessagesApi, type CompanyMessage } from '../../api/company-messages';
import DriverCompanyChatScreen from './DriverCompanyChatScreen';
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

  // ── Company chat ──────────────────────────────────────────────────────────
  const [chatOpen,    setChatOpen]    = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch unread count on mount and whenever the chat closes.
  useEffect(() => {
    if (chatOpen) return;
    driverMessagesApi.getUnreadCount()
      .then(({ data }) => setUnreadCount(data.count))
      .catch(() => {});
  }, [chatOpen]);

  // Live unread badge: any incoming company_message bumps the counter while
  // the chat screen is closed. (Chat screen handles its own incoming events.)
  useEffect(() => {
    const unsub = socketService.on<CompanyMessage>('company_message', msg => {
      if (msg.fromRole === 'company') {
        setUnreadCount(n => n + 1);
      }
    });
    return unsub;
  }, []);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Backup GPS source: Geolocation.watchPosition ───────────────────────────
  // We can't rely solely on MapView.onUserLocationChange — on some devices that
  // callback never fires until the user moves. Without lat/lng, the dispatch
  // interval can't send GPS to the server, so the driver is invisible to riders.
  // This watcher uses high-accuracy GPS to keep lat/lng up to date.
  useEffect(() => {
    if (permissionDenied) return;
    const id = Geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
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
        // Push to server immediately if online — don't wait up to 8s for the interval
        if (isOnline) {
          socketService.sendGpsUpdate(latitude, longitude);
        }
      },
      () => { /* silent */ },
      { enableHighAccuracy: true, distanceFilter: 5, maximumAge: 10000, timeout: 20000 },
    );
    return () => { Geolocation.clearWatch(id); };
  }, [permissionDenied, locationReady, setLocation, isOnline]);

  // Active tariff banner — shows the driver which tariff their next ride
  // will use. Refresh on screen focus + every 15 min in case of night-window
  // crossover.
  const [activeTariff, setActiveTariff] = useState<ActiveDriverTariff | null>(null);
  useEffect(() => {
    const load = () => driverTariffApi.getActive()
      .then(({ data }) => setActiveTariff(data ?? null))
      .catch(() => { /* non-fatal */ });
    load();
    const id = setInterval(load, 15 * 60 * 1000);
    return () => clearInterval(id);
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
    // Fast path — we already have GPS
    if (latRef.current !== null && lngRef.current !== null) {
      mapRef.current?.animateToRegion(
        { latitude: latRef.current, longitude: lngRef.current, latitudeDelta: 0.015, longitudeDelta: 0.015 },
        500,
      );
      return;
    }
    // Slow path — actively fetch position. Try GPS first, then fall back to network.
    const tryHighAccuracy = () => Geolocation.getCurrentPosition(
      (pos) => applyFix(pos.coords.latitude, pos.coords.longitude),
      () => tryLowAccuracy(),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
    const tryLowAccuracy = () => Geolocation.getCurrentPosition(
      (pos) => applyFix(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        const isProviderMissing = err.code === 2;
        const title = isProviderMissing ? 'Turn on Location' : 'Location unavailable';
        const message = isProviderMissing
          ? 'Your phone\'s Location is turned off. Drivers MUST have Location enabled — riders can\'t find you without it.\n\nOpen Settings and turn Location ON.'
          : `Could not get GPS. Code ${err.code}: ${err.message ?? 'unknown'}.\n\nMake sure your device's Location is turned ON in settings.`;
        Alert.alert(title, message, [
          { text: 'OK', style: 'cancel' },
          ...(Platform.OS === 'android' && isProviderMissing ? [{
            text: 'Open Settings',
            onPress: () => Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings()),
          }] : []),
        ]);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
    const applyFix = (lat: number, lng: number) => {
      latRef.current = lat;
      lngRef.current = lng;
      setLocation(lat, lng);
      setLocationReady(true);
      mapRef.current?.animateToRegion(
        { latitude: lat, longitude: lng, latitudeDelta: 0.015, longitudeDelta: 0.015 },
        500,
      );
      if (isOnline) socketService.sendGpsUpdate(lat, lng);
    };
    tryHighAccuracy();
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
        {/* Active tariff banner — tells the driver which tariff will be used
            for the next ride. Solo drivers see their personal rate; company
            drivers see whichever of their company's tariffs matches their
            vehicle type and the current time of day. */}
        {activeTariff && (
          <View style={styles.tariffBanner}>
            <Text style={styles.tariffBannerLabel}>
              {activeTariff.source === 'personal' ? '🧑‍✈️ Your tariff'
                : activeTariff.source === 'company'  ? '🏢 Company tariff'
                : '🌐 Platform tariff'}
            </Text>
            <Text style={styles.tariffBannerName} numberOfLines={1}>
              {activeTariff.name}
              {activeTariff.isNightTariff ? ' · 🌙' : ''}
            </Text>
            <Text style={styles.tariffBannerRates}>
              Base ${activeTariff.baseFare.toFixed(2)} · ${activeTariff.perKmRate.toFixed(2)}/km · ${activeTariff.perMinuteRate.toFixed(2)}/min
            </Text>
          </View>
        )}
      </SafeAreaView>

      {/* Recenter — always visible so the driver can tap to jump to current GPS */}
      <TouchableOpacity
        style={styles.recenterBtn}
        onPress={handleRecenter}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('driver.home.recenterLabel')}>
        <Text style={styles.recenterIcon}>📍</Text>
      </TouchableOpacity>

      {/* Bell — company chat. Hidden for solo drivers (no company to chat with). */}
      <TouchableOpacity
        style={styles.bellBtn}
        onPress={() => setChatOpen(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Messages from company">
        <Text style={styles.bellIcon}>🔔</Text>
        {unreadCount > 0 && (
          <View style={styles.bellBadge}>
            <Text style={styles.bellBadgeText}>
              {unreadCount > 99 ? '99+' : String(unreadCount)}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <DriverCompanyChatScreen
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
      />

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

  // Active tariff banner — sits under the online toggle card
  tariffBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  tariffBannerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tariffBannerName: {
    fontSize: 15,
    fontWeight: '800',
    color: c.text,
    marginTop: 2,
  },
  tariffBannerRates: {
    fontSize: 11,
    color: c.textSecondary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

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

  // Bell — sits above the recenter button on the right edge
  bellBtn: {
    position: 'absolute',
    right: 16,
    bottom: 174,
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
  bellIcon: { fontSize: 20 },
  bellBadge: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 18, height: 18, paddingHorizontal: 5,
    borderRadius: 9, backgroundColor: c.error,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: c.background,
  },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

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
