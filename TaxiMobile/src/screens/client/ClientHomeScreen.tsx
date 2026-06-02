import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import MapView, { Marker, Region, PROVIDER_GOOGLE, UserLocationChangeEvent } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { useRideStore } from '../../stores/rideStore';
import { ridesApi } from '../../api/rides';
import { savedLocationsApi, type SavedLocation } from '../../api/saved-locations';
import { useColors, useTheme } from '../../stores/themeStore';
import { DARK_MAP_STYLE } from '../../constants/mapStyles';
import { useTranslation } from '../../i18n';
import type { ColorPalette } from '../../constants/colors';
import type { NearestDriver } from '../../types/api';
import type { ClientStackScreenProps } from '../../navigation/types';


type Props = ClientStackScreenProps<'ClientHomeMain'>;

const DEFAULT_DELTA = 0.02;

export default function ClientHomeScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const { activeRide, nearestDrivers, setNearestDrivers, setActiveRide } = useRideStore();
  const colors = useColors();
  const { isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const mapRef       = useRef<MapView>(null);
  const mapRegionRef = useRef<Region | null>(null); // last visible map center, used as pickup fallback
  const [locationReady,    setLocationReady]    = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [userRegion,       setUserRegion]       = useState<Region | null>(null);
  const [loadingDrivers,   setLoadingDrivers]   = useState(false);
  const [savedLocations,   setSavedLocations]   = useState<SavedLocation[]>([]);

  // Reload saved locations every time this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      savedLocationsApi.list()
        .then(({ data }) => setSavedLocations(data.slice(0, 5)))
        .catch(() => {});
    }, []),
  );

  // ── Redirect if there is already an active ride (in-memory store) ───────────
  useEffect(() => {
    if (activeRide) {
      navigation.replace('ActiveRide', { rideId: activeRide.id });
    }
  }, [activeRide, navigation]);

  // ── On first mount: check server for an active ride (handles app-restart) ────
  useEffect(() => {
    if (activeRide) { return; }
    ridesApi.getActiveRide().then(({ data }) => {
      if (!data) { return; }
      setActiveRide(data);
      navigation.replace('ActiveRide', { rideId: data.id });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Request location permission + start watcher (same as driver flow) ──────
  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: t('client.home.locationPermTitle'),
          message: t('client.home.locationPermMsg'),
          buttonPositive: t('client.home.allow'),
          buttonNegative: t('client.home.deny'),
        },
      ).then(result => {
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          setPermissionDenied(true);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Primary path: MapView's onUserLocationChange (this works for drivers) ──
  const handleUserLocationChange = useCallback(
    (event: UserLocationChangeEvent) => {
      const coordinate = event.nativeEvent.coordinate;
      if (!coordinate) { return; }
      const { latitude, longitude } = coordinate;
      const region: Region = {
        latitude,
        longitude,
        latitudeDelta: DEFAULT_DELTA,
        longitudeDelta: DEFAULT_DELTA,
      };
      setUserRegion(region);
      if (!locationReady) {
        setLocationReady(true);
        mapRef.current?.animateToRegion(region, 700);
        fetchNearestDriversRef.current?.(latitude, longitude);
      }
    },
    [locationReady],
  );

  // ── Secondary path: Geolocation.watchPosition (extra safety net) ───────────
  useEffect(() => {
    if (permissionDenied) return;
    const id = Geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const region: Region = {
          latitude,
          longitude,
          latitudeDelta: DEFAULT_DELTA,
          longitudeDelta: DEFAULT_DELTA,
        };
        setUserRegion(region);
        if (!locationReady) {
          setLocationReady(true);
          mapRef.current?.animateToRegion(region, 700);
          fetchNearestDriversRef.current?.(latitude, longitude);
        }
      },
      () => { /* non-fatal — other paths may still fire */ },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000, distanceFilter: 10 },
    );
    return () => { Geolocation.clearWatch(id); };
  }, [permissionDenied, locationReady]);

  // ── Tertiary path: try getCurrentPosition once immediately ─────────────────
  useEffect(() => {
    if (permissionDenied) return;
    Geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const region: Region = {
          latitude,
          longitude,
          latitudeDelta: DEFAULT_DELTA,
          longitudeDelta: DEFAULT_DELTA,
        };
        setUserRegion(region);
        if (!locationReady) {
          setLocationReady(true);
          mapRef.current?.animateToRegion(region, 700);
          fetchNearestDriversRef.current?.(latitude, longitude);
        }
      },
      () => { /* non-fatal */ },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  }, [permissionDenied, locationReady]);

  // ── Final fallback: unblock UI after 4 s using the map's visible center ────
  // If no location source fired by now, let the user request a ride from the
  // map's current center (they can adjust the pickup on the next screen).
  useEffect(() => {
    if (permissionDenied) return;
    const t = setTimeout(() => {
      if (!locationReady) {
        setLocationReady(true); // unblock the "Where to?" UI even without GPS
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [permissionDenied, locationReady]);

  // Stable ref to fetchNearestDrivers so the callback above doesn't depend on it
  const fetchNearestDriversRef = useRef<((lat: number, lng: number) => void) | null>(null);

  // ── Fetch nearest drivers ────────────────────────────────────────────────────
  const fetchNearestDrivers = useCallback(async (lat: number, lng: number) => {
    setLoadingDrivers(true);
    try {
      const { data } = await ridesApi.getNearestDrivers(lat, lng, 5, 20);
      setNearestDrivers(data);
    } catch {
      // non-fatal
    } finally {
      setLoadingDrivers(false);
    }
  }, [setNearestDrivers]);

  // Keep the ref in sync so the MapView callback can use the latest version
  useEffect(() => {
    fetchNearestDriversRef.current = fetchNearestDrivers;
  }, [fetchNearestDrivers]);

  // Pickup priority: visible map center (= pin position) → GPS → alert
  // The center-pin pattern means the user explicitly chose this position by
  // dragging the map — it should win over a stale GPS fix.
  const pickupOrAlert = (): { lat: number; lng: number } | null => {
    if (mapRegionRef.current) return { lat: mapRegionRef.current.latitude, lng: mapRegionRef.current.longitude };
    if (userRegion) return { lat: userRegion.latitude, lng: userRegion.longitude };
    Alert.alert(t('client.home.locationUnavailableTitle'), t('client.home.locationUnavailableMsg'));
    return null;
  };

  const handleRequestRide = () => {
    const p = pickupOrAlert();
    if (!p) return;
    navigation.navigate('RideRequest', { pickupLat: p.lat, pickupLng: p.lng });
  };

  const handleSavedLocationChip = (loc: SavedLocation) => {
    const p = pickupOrAlert();
    if (!p) return;
    navigation.navigate('RideRequest', {
      pickupLat:      p.lat,
      pickupLng:      p.lng,
      dropoffLat:     loc.lat,
      dropoffLng:     loc.lng,
      dropoffAddress: loc.address ?? loc.label,
    });
  };

  const handleRefresh = () => {
    if (userRegion) {
      fetchNearestDrivers(userRegion.latitude, userRegion.longitude);
    }
  };

  if (permissionDenied) {
    return (
      <SafeAreaView style={styles.centeredFill}>
        <Text style={styles.permTitle}>{t('client.home.locationTitle')}</Text>
        <Text style={styles.permSubtitle}>{t('client.home.locationMsg')}</Text>
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
        customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
        showsUserLocation
        showsMyLocationButton={false}
        onUserLocationChange={handleUserLocationChange}
        onRegionChangeComplete={(region) => { mapRegionRef.current = region; }}
        initialRegion={
          userRegion ?? {
            latitude: 42.21015,    // Kosovo — same as driver default
            longitude: 20.73453,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          }
        }>
        {nearestDrivers.map((driver) => (
          <DriverMarker key={driver.driverId} driver={driver} />
        ))}
      </MapView>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <View style={styles.topCard}>
          <Text style={styles.greeting}>
            {t('client.home.hello', { phone: user?.phone ?? 'there' })} 👋
          </Text>
          <View style={styles.topRight}>
            {loadingDrivers ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <TouchableOpacity
                onPress={handleRefresh}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Refresh nearby drivers">
                <Text style={styles.refreshText}>↻</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.driverCount}>
              {nearestDrivers.length !== 1
                ? t('client.home.driversNearbyPlural', { count: nearestDrivers.length })
                : t('client.home.driversNearby', { count: nearestDrivers.length })}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Centre pin — drag the map to set your pickup location ──────── */}
      <View pointerEvents="none" style={styles.centerPinWrap}>
        <Text style={styles.centerPin}>📍</Text>
      </View>

      {/* ── Recenter button — always visible ───────────────────────────── */}
      <TouchableOpacity
        style={styles.recenterBtn}
        onPress={() => {
          if (userRegion) {
            mapRef.current?.animateToRegion(userRegion, 500);
            return;
          }
          // No GPS yet — try high-accuracy first, then network, then show real error
          const tryHigh = () => Geolocation.getCurrentPosition(
            (pos) => apply(pos.coords.latitude, pos.coords.longitude),
            () => tryLow(),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
          );
          const tryLow = () => Geolocation.getCurrentPosition(
            (pos) => apply(pos.coords.latitude, pos.coords.longitude),
            (err) => {
              // Code 2 = POSITION_UNAVAILABLE — device location services are OFF
              const isProviderMissing = err.code === 2;
              const title = isProviderMissing ? 'Turn on Location' : 'Location unavailable';
              const message = isProviderMissing
                ? 'Your phone\'s Location is turned off. Open Settings and turn Location ON to find drivers near you.\n\nYou can still drag the map to choose your pickup, then tap "Request Ride".'
                : `Could not get GPS. Code ${err.code}: ${err.message ?? 'unknown'}.\n\nYou can drag the map to set your pickup, then tap "Request Ride".`;
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
          const apply = (lat: number, lng: number) => {
            const region: Region = { latitude: lat, longitude: lng, latitudeDelta: DEFAULT_DELTA, longitudeDelta: DEFAULT_DELTA };
            setUserRegion(region);
            setLocationReady(true);
            mapRef.current?.animateToRegion(region, 500);
            fetchNearestDriversRef.current?.(lat, lng);
          };
          tryHigh();
        }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Re-center map to my location">
        <Text style={styles.recenterIcon}>📍</Text>
      </TouchableOpacity>

      {/* ── Bottom card ─────────────────────────────────────────────────── */}
      <SafeAreaView edges={['bottom']} style={styles.bottomArea}>
        <View style={styles.bottomCard}>
          {!locationReady ? (
            <View style={styles.locatingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.locatingText}>{t('client.home.gettingLocation')}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.whereToLabel}>{t('client.home.whereGoing')}</Text>

              {savedLocations.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.chipsRow}
                  contentContainerStyle={{ gap: 8 }}>
                  {savedLocations.map(loc => (
                    <TouchableOpacity
                      key={loc.id}
                      style={styles.chip}
                      onPress={() => handleSavedLocationChip(loc)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={`Go to ${loc.label}`}>
                      <Text style={styles.chipText}>
                        {loc.label.toLowerCase() === 'home'    ? '🏠' :
                         loc.label.toLowerCase() === 'work'    ? '💼' :
                         loc.label.toLowerCase() === 'gym'     ? '🏋️' :
                         loc.label.toLowerCase() === 'airport' ? '✈️' : '📍'}{' '}
                        {loc.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <TouchableOpacity
                style={styles.requestBtn}
                onPress={handleRequestRide}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Request a ride">
                <Text style={styles.requestBtnText}>🚕  {t('client.home.requestRideBtn')}</Text>
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
  const colors = useColors();
  const markerStyles = useMemo(() => StyleSheet.create({
    wrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.primary,
      elevation: 3,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
    },
    icon: { fontSize: 18 },
  }), [colors]);

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
function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1 },
    map: { ...StyleSheet.absoluteFillObject },

    centeredFill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      backgroundColor: c.background,
    },
    permTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
      textAlign: 'center',
      marginBottom: 12,
    },
    permSubtitle: {
      fontSize: 15,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },

    topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
    topCard: {
      marginHorizontal: 16,
      marginTop: 8,
      backgroundColor: c.background,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      elevation: 4,
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
    },
    greeting:    { fontSize: 14, fontWeight: '600', color: c.text },
    topRight:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
    refreshText: { fontSize: 20, color: c.primary, fontWeight: '700' },
    driverCount: { fontSize: 12, color: c.textSecondary, fontWeight: '500' },

    centerPinWrap: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      marginLeft: -16,   // half of pin width (32px) for visual centering
      marginTop:  -32,   // shift up so the pin's tip is at the map center
    },
    centerPin: {
      fontSize: 32,
      textShadowColor: 'rgba(0,0,0,0.3)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },

    recenterBtn: {
      position: 'absolute',
      right: 16,
      bottom: 200,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.background,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
    },
    recenterIcon: { fontSize: 22, color: c.primary },

    bottomArea: { position: 'absolute', bottom: 0, left: 0, right: 0 },
    bottomCard: {
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: c.background,
      borderRadius: 20,
      padding: 20,
      elevation: 8,
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
    },
    locatingRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center', paddingVertical: 8 },
    locatingText: { fontSize: 15, color: c.textSecondary },

    whereToLabel: { fontSize: 13, color: c.textSecondary, fontWeight: '600', marginBottom: 10 },
    chipsRow:     { marginBottom: 12 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: c.surfaceAlt,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    chipText:       { fontSize: 13, fontWeight: '700', color: c.text },
    requestBtn:     { height: 54, backgroundColor: c.primary, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    requestBtnText: { fontSize: 17, fontWeight: '700', color: c.textOnPrimary },
  });
}
