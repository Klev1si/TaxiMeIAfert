import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import MapView, {
  Marker,
  Region,
  MapPressEvent,
} from 'react-native-maps';
import { MAP_PROVIDER } from '../../utils/mapProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRideStore } from '../../stores/rideStore';
import { ridesApi } from '../../api/rides';
import type { FareEstimate, VehicleType } from '../../api/rides';
import { socketService } from '../../services/socket';
import {
  reverseGeocode,
  searchPlaces,
  nearbyByCategory,
  NEARBY_CATEGORIES,
  type PlaceResult,
} from '../../services/geocoding';
import SearchingForDriver from '../../components/SearchingForDriver';
import { useColors, useTheme } from '../../stores/themeStore';
import { DARK_MAP_STYLE } from '../../constants/mapStyles';
import { useTranslation } from '../../i18n';
import type { ColorPalette } from '../../constants/colors';
import type { WsRideAccepted, WsRideCancelled } from '../../types/api';
import type { ClientStackScreenProps } from '../../navigation/types';
import { toAlertString } from '../../utils/errorMessage';

type Props = ClientStackScreenProps<'RideRequest'>;

const DELTA = 0.015;

/** Map a Nominatim category string ("amenity/cafe") to an emoji. */
function iconForCategory(category?: string): string {
  if (!category) return '📍';
  if (category.includes('cafe'))        return '☕';
  if (category.includes('restaurant') || category.includes('food')) return '🍽';
  if (category.includes('fast_food'))   return '🍔';
  if (category.includes('bar') || category.includes('pub')) return '🍺';
  if (category.includes('supermarket') || category.includes('grocery') || category.includes('shop'))
                                        return '🛒';
  if (category.includes('pharmacy'))    return '💊';
  if (category.includes('hospital') || category.includes('clinic')) return '🏥';
  if (category.includes('atm') || category.includes('bank')) return '🏧';
  if (category.includes('hotel') || category.includes('hostel')) return '🏨';
  if (category.includes('fuel') || category.includes('gas'))     return '⛽';
  if (category.startsWith('highway'))   return '🛣';
  if (category.startsWith('place'))     return '📌';
  return '📍';
}

export default function RideRequestScreen({ navigation, route }: Props) {
  const { pickupLat, pickupLng, pickupAddress: pickupAddressParam, dropoffLat, dropoffLng, dropoffAddress } = route.params;
  // Resolved pickup address — starts as the route param; if absent we
  // reverse-geocode on mount so the UI never shows raw coordinates.
  const [pickupAddress, setPickupAddress] = useState<string | undefined>(pickupAddressParam);

  useEffect(() => {
    if (pickupAddressParam) return;
    let cancelled = false;
    void (async () => {
      const addr = await reverseGeocode(pickupLat, pickupLng);
      if (!cancelled && addr) setPickupAddress(addr);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { setActiveRide, setIsSearching, isSearching, clearAll } = useRideStore();
  const colors = useColors();
  const { isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const mapRef = useRef<MapView>(null);

  const [dropoff, setDropoff] = useState<{ lat: number; lng: number; address?: string } | null>(
    dropoffLat != null && dropoffLng != null
      ? { lat: dropoffLat, lng: dropoffLng, address: dropoffAddress }
      : null,
  );

  /** Intermediate stops added by the passenger (max 5). */
  const [stops, setStops] = useState<Array<{ lat: number; lng: number; address?: string }>>([]);
  /**
   * Index of the stop currently being searched.
   * -1 = adding a brand-new stop; ≥0 = editing existing stop at that index.
   * null = no stop search active.
   */
  const [editingStopIdx, setEditingStopIdx] = useState<number | null>(null);
  const [stopSearchQuery,   setStopSearchQuery]   = useState('');
  const [stopSearchResults, setStopSearchResults] = useState<PlaceResult[]>([]);
  const [stopSearchLoading, setStopSearchLoading] = useState(false);
  const stopSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStopAddresses = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setStopSearchResults([]); return; }
    setStopSearchLoading(true);
    const results = await searchPlaces(q, pickupLat, pickupLng);
    setStopSearchResults(results);
    setStopSearchLoading(false);
  }, [pickupLat, pickupLng]);

  useEffect(() => {
    if (stopSearchTimeout.current) { clearTimeout(stopSearchTimeout.current); }
    if (!stopSearchQuery.trim()) { setStopSearchResults([]); return; }
    stopSearchTimeout.current = setTimeout(() => fetchStopAddresses(stopSearchQuery), 500);
    return () => { if (stopSearchTimeout.current) { clearTimeout(stopSearchTimeout.current); } };
  }, [stopSearchQuery, fetchStopAddresses]);

  /** Quick-tap category (Cafes, Markets, …) — fires an immediate nearby search. */
  const pickCategory = async (slug: string) => {
    setStopSearchLoading(true);
    const results = await nearbyByCategory(slug, pickupLat, pickupLng);
    setStopSearchResults(results);
    setStopSearchLoading(false);
  };

  const selectStopResult = (item: PlaceResult) => {
    setStops(prev => {
      if (editingStopIdx === -1) {
        return [...prev, { lat: item.lat, lng: item.lng, address: item.shortLabel }];
      }
      const updated = [...prev];
      updated[editingStopIdx!] = { lat: item.lat, lng: item.lng, address: item.shortLabel };
      return updated;
    });
    setEditingStopIdx(null);
    setStopSearchQuery('');
    setStopSearchResults([]);
    Keyboard.dismiss();
    mapRef.current?.animateToRegion({
      latitude: item.lat, longitude: item.lng,
      latitudeDelta: DELTA, longitudeDelta: DELTA,
    }, 400);
  };

  const removeStop = (idx: number) => {
    setStops(prev => prev.filter((_, i) => i !== idx));
    if (editingStopIdx === idx) {
      setEditingStopIdx(null);
      setStopSearchQuery('');
      setStopSearchResults([]);
    }
  };

  const [requesting, setRequesting] = useState(false);

  // ── Scheduling ───────────────────────────────────────────────────────────────
  /** null = immediate ride. A future Date = scheduled ride. */
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);

  /**
   * Android: 'date' → shows date-picker dialog, 'time' → shows time-picker dialog.
   * iOS:     shown inside a modal; same two-step flow.
   * null = picker is closed.
   */
  const [pickerStep, setPickerStep] = useState<'date' | 'time' | null>(null);

  /**
   * Staging area while the user is still picking (date first, then time).
   * Only committed to scheduledAt when both steps complete successfully.
   */
  const pickerTempRef = useRef<Date>(new Date());

  /** Minimum bookable time = 10 minutes from now */
  const minSchedule = () => new Date(Date.now() + 10 * 60 * 1000);

  /** Open the date-picker step, seeding it with the current scheduledAt or min-time */
  const openCustomPicker = () => {
    pickerTempRef.current = scheduledAt ?? minSchedule();
    setPickerStep('date');
  };

  /** Called by DateTimePicker on Android (and inside the iOS modal) */
  const handlePickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    // Android dismissal
    if (event.type === 'dismissed') {
      setPickerStep(null);
      return;
    }

    if (!selected) { return; }

    if (pickerStep === 'date') {
      // Preserve the time part from pickerTemp; update only the date
      const merged = new Date(pickerTempRef.current);
      merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      pickerTempRef.current = merged;
      // Move to time step
      setPickerStep('time');
    } else if (pickerStep === 'time') {
      // Preserve the date part; update only the time
      const merged = new Date(pickerTempRef.current);
      merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);

      if (merged < minSchedule()) {
        Alert.alert(
          t('client.rideRequest.tooSoonTitle'),
          t('client.rideRequest.tooSoonMsg'),
        );
        setPickerStep(null);
        return;
      }

      setScheduledAt(merged);
      setPickerStep(null);
    }
  };

  /** Preset chips — quick shortcuts */
  const SCHEDULE_CHIPS: Array<{ label: string; action: () => void }> = [
    { label: t('client.rideRequest.scheduleNow'),      action: () => setScheduledAt(null) },
    { label: t('client.rideRequest.schedule30'),       action: () => setScheduledAt(new Date(Date.now() + 30 * 60_000)) },
    { label: t('client.rideRequest.schedule1h'),       action: () => setScheduledAt(new Date(Date.now() + 60 * 60_000)) },
    { label: t('client.rideRequest.schedule2h'),       action: () => setScheduledAt(new Date(Date.now() + 120 * 60_000)) },
    { label: t('client.rideRequest.schedule4h'),       action: () => setScheduledAt(new Date(Date.now() + 240 * 60_000)) },
    {
      label: t('client.rideRequest.scheduleTomorrow'),
      action: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(8, 0, 0, 0);
        setScheduledAt(d);
      },
    },
    { label: t('client.rideRequest.scheduleCustom'), action: openCustomPicker },
  ];

  /**
   * Determine which chip (if any) matches the current scheduledAt so we can
   * highlight it. Returns 'Custom…' for any time that wasn't set via a chip.
   */
  const activeChipLabel = (() => {
    if (!scheduledAt) { return t('client.rideRequest.scheduleNow'); }
    const diffMin = (scheduledAt.getTime() - Date.now()) / 60_000;
    if (diffMin >= 25 && diffMin <= 35)   { return t('client.rideRequest.schedule30'); }
    if (diffMin >= 55 && diffMin <= 65)   { return t('client.rideRequest.schedule1h'); }
    if (diffMin >= 115 && diffMin <= 125) { return t('client.rideRequest.schedule2h'); }
    if (diffMin >= 235 && diffMin <= 245) { return t('client.rideRequest.schedule4h'); }
    const tomorrow8 = new Date();
    tomorrow8.setDate(tomorrow8.getDate() + 1);
    tomorrow8.setHours(8, 0, 0, 0);
    if (Math.abs(scheduledAt.getTime() - tomorrow8.getTime()) < 60_000) {
      return t('client.rideRequest.scheduleTomorrow');
    }
    return t('client.rideRequest.scheduleCustom');
  })();

  // ── Vehicle type ─────────────────────────────────────────────────────────────
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);

  const VEHICLE_TYPES: { value: VehicleType; label: string; icon: string }[] = [
    { value: 'economy', label: t('client.rideRequest.vehicleEconomy'), icon: '🚗' },
    { value: 'comfort', label: t('client.rideRequest.vehicleComfort'), icon: '🚙' },
    { value: 'xl',      label: t('client.rideRequest.vehicleXL'),      icon: '🚐' },
  ];

  // ── Fare estimate ────────────────────────────────────────────────────────────
  const [estimate,        setEstimate]        = useState<FareEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const estimateTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Promo code ───────────────────────────────────────────────────────────────
  const [promoInput,   setPromoInput]   = useState('');
  const [promoResult,  setPromoResult]  = useState<{
    valid: boolean;
    code: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    maxDiscountAmount: number | null;
    discountAmount: number | null;
    description: string | null;
  } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError,   setPromoError]   = useState('');

  const applyPromo = useCallback(async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoLoading(true);
    setPromoError('');
    setPromoResult(null);
    try {
      const fare = estimate?.estimatedFare;
      const { data } = await ridesApi.validatePromo({
        code,
        ...(fare != null ? { fare: String(fare) } : {}),
      });
      setPromoResult(data);
    } catch (err: any) {
      setPromoError(toAlertString(err?.response?.data?.message, 'Invalid or expired promo code.'));
    } finally {
      setPromoLoading(false);
    }
  }, [promoInput, estimate?.estimatedFare]);

  const removePromo = () => {
    setPromoInput('');
    setPromoResult(null);
    setPromoError('');
  };

  const fetchEstimate = useCallback(async (d: { lat: number; lng: number }) => {
    setEstimateLoading(true);
    try {
      const { data } = await ridesApi.getFareEstimate(
        pickupLat, pickupLng, d.lat, d.lng,
        vehicleType ?? undefined,
        stops.map(s => ({ lat: s.lat, lng: s.lng })),
      );
      setEstimate(data);
    } catch {
      setEstimate(null);
    } finally {
      setEstimateLoading(false);
    }
  }, [pickupLat, pickupLng, vehicleType, stops]);

  // Debounce: fetch estimate 600 ms after dropoff changes
  useEffect(() => {
    if (!dropoff) {
      setEstimate(null);
      return;
    }
    if (estimateTimeout.current) { clearTimeout(estimateTimeout.current); }
    estimateTimeout.current = setTimeout(() => fetchEstimate(dropoff), 600);
    return () => {
      if (estimateTimeout.current) { clearTimeout(estimateTimeout.current); }
    };
  }, [dropoff, fetchEstimate]);

  // ── Address search (Nominatim / OpenStreetMap) ───────────────────────────────
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAddresses = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    const results = await searchPlaces(q, pickupLat, pickupLng);
    setSearchResults(results);
    setSearchLoading(false);
  }, [pickupLat, pickupLng]);

  // Debounce search 500 ms after keystroke
  useEffect(() => {
    if (searchTimeout.current) { clearTimeout(searchTimeout.current); }
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(() => fetchAddresses(searchQuery), 500);
    return () => { if (searchTimeout.current) { clearTimeout(searchTimeout.current); } };
  }, [searchQuery, fetchAddresses]);

  /** Quick-tap category for the destination search. */
  const pickDropoffCategory = async (slug: string) => {
    setSearchLoading(true);
    const results = await nearbyByCategory(slug, pickupLat, pickupLng);
    setSearchResults(results);
    setSearchLoading(false);
  };

  const selectResult = (item: PlaceResult) => {
    setDropoff({ lat: item.lat, lng: item.lng, address: item.shortLabel });
    setSearchQuery('');
    setSearchResults([]);
    setSearchFocused(false);
    Keyboard.dismiss();
    // Snap map to the selected location
    mapRef.current?.animateToRegion({
      latitude: item.lat, longitude: item.lng,
      latitudeDelta: DELTA, longitudeDelta: DELTA,
    }, 500);
  };

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
        navigation.replace('ActiveRide', {
          rideId:       payload.rideId,
          driverName:   payload.driverName,
          vehicleMake:  payload.vehicleMake,
          vehicleModel: payload.vehicleModel,
          vehiclePlate: payload.vehiclePlate,
          vehicleColor: payload.vehicleColor,
        });
      },
    );

    const unsubCancelled = socketService.on<WsRideCancelled>(
      'ride_cancelled',
      (payload) => {
        setIsSearching(false);
        clearAll();
        Alert.alert(
          t('client.rideRequest.noDriversTitle'),
          payload.reason ?? t('client.rideRequest.noDriversTitle'),
          [{ text: t('common.ok'), onPress: () => navigation.goBack() }],
        );
      },
    );

    // Polling fallback — if the WS event is missed (socket reconnect, app
    // backgrounded, network blip), poll the active ride every 4 s and
    // navigate forward the moment we see the ride has been accepted by a
    // driver. Keeps the "Searching…" UI from being stuck forever.
    const poll = setInterval(async () => {
      try {
        const { data } = await ridesApi.getActiveRide();
        if (!data) return;
        // Anything past REQUESTED means a driver accepted (or beyond).
        const liveStatuses = ['accepted', 'driving_to_pickup', 'in_progress'];
        if (liveStatuses.includes(data.status)) {
          setIsSearching(false);
          navigation.replace('ActiveRide', {
            rideId:       data.id,
            driverName:   undefined, // ActiveRide will refetch full details
            vehicleMake:  undefined,
            vehicleModel: undefined,
            vehiclePlate: undefined,
            vehicleColor: undefined,
          });
        } else if (data.status === 'cancelled') {
          setIsSearching(false);
          clearAll();
          navigation.goBack();
        }
      } catch { /* network blip — try again next tick */ }
    }, 4000);

    return () => {
      unsubAccepted();
      unsubCancelled();
      clearInterval(poll);
    };
  }, [isSearching, navigation, setIsSearching, clearAll]);

  // ── Tap map to set dropoff ───────────────────────────────────────────────────
  const handleMapPress = (e: MapPressEvent) => {
    if (isSearching || requesting) { return; }
    const { latitude, longitude } = e.nativeEvent.coordinate;
    // Set the dropoff right away (UX feels instant), then resolve a street
    // name in the background and patch the address in. Falls back to coords
    // if Nominatim is slow / offline.
    setDropoff({ lat: latitude, lng: longitude });
    void (async () => {
      const addr = await reverseGeocode(latitude, longitude);
      if (addr) {
        setDropoff(prev => prev
          && prev.lat === latitude
          && prev.lng === longitude
          ? { ...prev, address: addr }
          : prev);
      }
    })();
  };

  // ── Request ride ─────────────────────────────────────────────────────────────
  const handleRequest = async () => {
    setRequesting(true);
    try {
      const { data: ride } = await ridesApi.requestRide({
        pickupLat,
        pickupLng,
        pickupAddress,
        dropoffLat:     dropoff?.lat,
        dropoffLng:     dropoff?.lng,
        dropoffAddress: dropoff?.address,
        scheduledAt:    scheduledAt ? scheduledAt.toISOString() : undefined,
        promoCode:      promoResult?.code,
        vehicleType:    vehicleType ?? undefined,
        stops:          stops.length > 0 ? stops.map(s => ({ lat: s.lat, lng: s.lng, address: s.address })) : undefined,
        // When the client started from a "Saved Driver" → Request Ride flow,
        // route.params.preferredDriverId routes the ride directly to that driver.
        preferredDriverId: route.params.preferredDriverId,
      });
      setActiveRide(ride);

      if (scheduledAt) {
        // Scheduled ride — show confirmation and go back to home
        const label = scheduledAt.toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
        Alert.alert(
          t('client.rideRequest.scheduledTitle'),
          `Your ride has been booked for ${label}.`,
          [{ text: t('common.ok'), onPress: () => navigation.goBack() }],
        );
      } else {
        setIsSearching(true);
      }
    } catch (err: any) {
      const apiMsg = err?.response?.data?.message;
      const fallback = err?.message ?? 'Failed to request ride. Try again.';
      Alert.alert(t('common.error'), toAlertString(apiMsg, fallback));
      // eslint-disable-next-line no-console
      console.warn('[requestRide] error', JSON.stringify(err?.response?.data ?? err?.message));
    } finally {
      setRequesting(false);
    }
  };

  // ── Cancel while searching ───────────────────────────────────────────────────
  const handleCancel = () => {
    Alert.alert(t('client.rideRequest.cancelTitle'), t('client.rideRequest.cancelMsg'), [
      { text: t('common.no'), style: 'cancel' },
      {
        text: t('client.rideRequest.yesCancel'),
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
        provider={MAP_PROVIDER}
        initialRegion={pickupRegion}
        onPress={handleMapPress}
        showsUserLocation
        customMapStyle={isDark ? DARK_MAP_STYLE : undefined}>

        {/* Pickup marker */}
        <Marker
          coordinate={{ latitude: pickupLat, longitude: pickupLng }}
          title="Pickup"
          description={pickupAddress ?? 'Your location'}
          pinColor={colors.primary}
        />

        {/* Dropoff marker */}
        {dropoff && (
          <Marker
            coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }}
            title="Dropoff"
            description="Tap to change"
            pinColor={colors.info}
          />
        )}

        {/* Intermediate stop markers */}
        {stops.map((stop, i) => (
          <Marker
            key={`stop-${i}`}
            coordinate={{ latitude: stop.lat, longitude: stop.lng }}
            title={`Stop ${i + 1}`}
            description={stop.address ?? ''}
            pinColor="#f59e0b"
          />
        ))}
      </MapView>

      {/* Top back button */}
      {!isSearching && (
        <SafeAreaView edges={['top']} style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Text style={styles.backText}>{t('client.rideRequest.backBtn')}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {/* Searching overlay */}
      {isSearching && (
        <View style={styles.searchingOverlay}>
          <View style={styles.searchingCard}>
            <View style={styles.spinner}>
              <SearchingForDriver />
            </View>
            <Text style={styles.searchingTitle}>{t('client.rideRequest.findingDriver')}</Text>
            <Text style={styles.searchingSubtitle}>
              {t('client.rideRequest.contactingDrivers')}
            </Text>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancel}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Cancel ride search">
              <Text style={styles.cancelBtnText}>{t('client.rideRequest.cancelRide')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bottom card */}
      {!isSearching && (
        <SafeAreaView edges={['bottom']} style={styles.bottomArea}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%' }}>
          <ScrollView
            style={styles.bottomCard}
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>

            {/* Pickup row */}
            <View style={styles.locationRow}>
              <View style={[styles.dot, styles.dotPickup]} />
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>{t('client.rideRequest.pickup')}</Text>
                <Text style={styles.locationValue} numberOfLines={1}>
                  {pickupAddress ?? `${pickupLat.toFixed(5)}, ${pickupLng.toFixed(5)}`}
                </Text>
              </View>
            </View>

            {/* ── Intermediate stops ──────────────────────────── */}
            {stops.map((stop, i) => (
              <View key={`stoprow-${i}`}>
                <View style={styles.locationDivider} />
                <View style={styles.locationRow}>
                  <View style={[styles.dot, styles.dotStop]}>
                    <Text style={styles.dotStopLabel}>{i + 1}</Text>
                  </View>
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationLabel}>{t('client.rideRequest.stop', { n: i + 1 })}</Text>
                    {editingStopIdx === i ? (
                      <TextInput
                        style={styles.searchInput}
                        value={stopSearchQuery}
                        onChangeText={setStopSearchQuery}
                        placeholder={t('client.rideRequest.searchStop')}
                        placeholderTextColor={colors.textDisabled}
                        returnKeyType="search"
                        autoCorrect={false}
                        autoFocus
                      />
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          setStopSearchQuery(stop.address ?? '');
                          setEditingStopIdx(i);
                        }}
                        activeOpacity={0.7}>
                        <Text style={styles.locationValue} numberOfLines={1}>
                          {stop.address ?? `${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => removeStop(i)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.clearDropoff}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Quick category chips for stop editor */}
                {editingStopIdx === i && !stopSearchQuery.trim() && stopSearchResults.length === 0 && (
                  <View style={styles.categoriesWrap}>
                    <View style={styles.categoriesRow}>
                      {NEARBY_CATEGORIES.map(c => (
                        <TouchableOpacity
                          key={c.slug}
                          style={styles.categoryChip}
                          onPress={() => pickCategory(c.slug)}
                          activeOpacity={0.7}>
                          <Text style={styles.categoryChipText}>{c.icon} {c.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                {/* Stop search results */}
                {editingStopIdx === i && stopSearchResults.length > 0 && (
                  <FlatList
                    data={stopSearchResults}
                    keyExtractor={(item, idx) => `${item.lat},${item.lng},${idx}`}
                    style={styles.resultsList}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.resultItem}
                        onPress={() => selectStopResult(item)}
                        activeOpacity={0.7}>
                        <Text style={styles.resultIcon}>{iconForCategory(item.category)}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.resultText} numberOfLines={1}>{item.shortLabel}</Text>
                          <Text style={styles.resultSubText} numberOfLines={1}>{item.displayName}</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                    ItemSeparatorComponent={() => <View style={styles.resultDivider} />}
                  />
                )}
                {editingStopIdx === i && stopSearchLoading && (
                  <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 4, marginLeft: 24 }} />
                )}
              </View>
            ))}

            {/* Add stop search (when adding a new stop) */}
            {editingStopIdx === -1 && (
              <>
                <View style={styles.locationDivider} />
                <View style={styles.locationRow}>
                  <View style={[styles.dot, styles.dotStop]}>
                    <Text style={styles.dotStopLabel}>{stops.length + 1}</Text>
                  </View>
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationLabel}>{t('client.rideRequest.newStop')}</Text>
                    <TextInput
                      style={styles.searchInput}
                      value={stopSearchQuery}
                      onChangeText={setStopSearchQuery}
                      placeholder={t('client.rideRequest.searchStop')}
                      placeholderTextColor={colors.textDisabled}
                      returnKeyType="search"
                      autoCorrect={false}
                      autoFocus
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => { setEditingStopIdx(null); setStopSearchQuery(''); setStopSearchResults([]); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.clearDropoff}>✕</Text>
                  </TouchableOpacity>
                </View>
                {!stopSearchQuery.trim() && stopSearchResults.length === 0 && (
                  <View style={styles.categoriesWrap}>
                    <View style={styles.categoriesRow}>
                      {NEARBY_CATEGORIES.map(c => (
                        <TouchableOpacity
                          key={c.slug}
                          style={styles.categoryChip}
                          onPress={() => pickCategory(c.slug)}
                          activeOpacity={0.7}>
                          <Text style={styles.categoryChipText}>{c.icon} {c.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                {stopSearchResults.length > 0 && (
                  <FlatList
                    data={stopSearchResults}
                    keyExtractor={(item, idx) => `${item.lat},${item.lng},${idx}`}
                    style={styles.resultsList}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.resultItem}
                        onPress={() => selectStopResult(item)}
                        activeOpacity={0.7}>
                        <Text style={styles.resultIcon}>{iconForCategory(item.category)}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.resultText} numberOfLines={1}>{item.shortLabel}</Text>
                          <Text style={styles.resultSubText} numberOfLines={1}>{item.displayName}</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                    ItemSeparatorComponent={() => <View style={styles.resultDivider} />}
                  />
                )}
                {stopSearchLoading && (
                  <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 4, marginLeft: 24 }} />
                )}
              </>
            )}

            <View style={styles.locationDivider} />

            {/* Dropoff row — search input */}
            <View style={styles.locationRow}>
              <View style={[styles.dot, styles.dotDropoff]} />
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>{t('client.rideRequest.dropoff')}</Text>
                {dropoff && !searchFocused ? (
                  // Show selected address — tap to re-search
                  <TouchableOpacity
                    onPress={() => {
                      setSearchQuery(dropoff.address ?? '');
                      setSearchFocused(true);
                    }}
                    activeOpacity={0.7}>
                    <Text style={styles.locationValue} numberOfLines={1}>
                      {dropoff.address ?? `${dropoff.lat.toFixed(5)}, ${dropoff.lng.toFixed(5)}`}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => {
                      // Small delay so tapping a result fires before blur clears it
                      setTimeout(() => setSearchFocused(false), 150);
                    }}
                    placeholder={t('client.rideRequest.searchDestination')}
                    placeholderTextColor={colors.textDisabled}
                    returnKeyType="search"
                    autoCorrect={false}
                  />
                )}
              </View>
              {dropoff && !searchFocused ? (
                <TouchableOpacity
                  onPress={() => { setDropoff(null); setSearchQuery(''); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.clearDropoff}>✕</Text>
                </TouchableOpacity>
              ) : searchLoading ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
              ) : null}
            </View>

            {/* Quick category chips — shown when input is focused with no query */}
            {searchFocused && !searchQuery.trim() && searchResults.length === 0 && !dropoff && (
              <View style={styles.categoriesWrap}>
                <Text style={styles.categoriesHint}>{t('client.rideRequest.searchNearby')}</Text>
                <View style={styles.categoriesRow}>
                  {NEARBY_CATEGORIES.map(c => (
                    <TouchableOpacity
                      key={c.slug}
                      style={styles.categoryChip}
                      onPress={() => pickDropoffCategory(c.slug)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Search nearby ${c.label}`}>
                      <Text style={styles.categoryChipText}>{c.icon} {c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Search results dropdown */}
            {searchFocused && searchResults.length > 0 && (
              <FlatList
                data={searchResults}
                keyExtractor={(item, idx) => `${item.lat},${item.lng},${idx}`}
                style={styles.resultsList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.resultItem}
                    onPress={() => selectResult(item)}
                    activeOpacity={0.7}>
                    <Text style={styles.resultIcon}>{iconForCategory(item.category)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultText} numberOfLines={1}>
                        {item.shortLabel}
                      </Text>
                      <Text style={styles.resultSubText} numberOfLines={1}>
                        {item.displayName}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={styles.resultDivider} />}
              />
            )}

            {/* Hint when search is empty and no dropoff set */}
            {!dropoff && !searchFocused && (
              <Text style={styles.mapHint}>
                🗺 {t('client.rideRequest.tapMapHint')}
              </Text>
            )}

            {/* Add stop button */}
            {dropoff && !searchFocused && editingStopIdx === null && stops.length < 5 && (
              <TouchableOpacity
                style={styles.addStopBtn}
                onPress={() => setEditingStopIdx(-1)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Add intermediate stop">
                <Text style={styles.addStopText}>➕  {t('client.rideRequest.addStop')}</Text>
              </TouchableOpacity>
            )}

            {/* ── Fare estimate card ─────────────────────────────── */}
            {dropoff && !searchFocused && (
              <View style={styles.estimateCard}>
                {estimateLoading ? (
                  <View style={styles.estimateRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.estimateLoading}>{t('client.rideRequest.calculatingFare')}</Text>
                  </View>
                ) : estimate ? (
                  <>
                    {/* Night tariff badge */}
                    {estimate.isNightTariff && (
                      <View style={styles.nightBadge}>
                        <Text style={styles.nightBadgeText}>
                          🌙 Night rates apply{estimate.tariffName ? ` · ${estimate.tariffName}` : ''}
                        </Text>
                      </View>
                    )}

                    {/* Surge pricing badge */}
                    {estimate.surgeActive && (
                      <View style={styles.surgeBadge}>
                        <Text style={styles.surgeBadgeText}>
                          ⚡ Surge ×{(estimate.surgeMultiplier ?? 1).toFixed(1)} — high demand
                        </Text>
                      </View>
                    )}

                    <View style={styles.estimateRow}>
                      <Text style={styles.estimateLabel}>📏 {t('client.rideRequest.distanceLabel')}</Text>
                      <Text style={styles.estimateValue}>{estimate.distanceKm} km</Text>
                    </View>
                    <View style={styles.estimateRow}>
                      <Text style={styles.estimateLabel}>⏱ {t('client.rideRequest.durationLabel')}</Text>
                      <Text style={styles.estimateValue}>{Math.round(estimate.durationMinutes)} min</Text>
                    </View>
                    {estimate.estimatedFare != null ? (
                      <View style={[styles.estimateRow, styles.estimateFareRow]}>
                        <Text style={styles.estimateFareLabel}>💰 {t('client.rideRequest.fareLabel')}</Text>
                        <Text style={styles.estimateFareValue}>${estimate.estimatedFare.toFixed(2)}</Text>
                      </View>
                    ) : (
                      <Text style={styles.estimateNote}>
                        {estimate.tariffName
                          ? `Tariff: ${estimate.tariffName} — fare calculated at trip end`
                          : 'Final fare calculated at trip end'}
                      </Text>
                    )}
                  </>
                ) : null}
              </View>
            )}

            {/* ── Vehicle type selector ────────────────────────── */}
            {!searchFocused && (
              <View style={styles.vehicleSection}>
                <Text style={styles.vehicleSectionTitle}>{t('client.rideRequest.vehicleType')}</Text>
                <View style={styles.vehicleRow}>
                  {/* "Any" option */}
                  <TouchableOpacity
                    style={[styles.vehicleChip, vehicleType === null && styles.vehicleChipActive]}
                    onPress={() => setVehicleType(null)}
                    accessibilityRole="radio"
                    accessibilityLabel="Any vehicle type"
                    accessibilityState={{ checked: vehicleType === null }}
                  >
                    <Text style={[styles.vehicleChipIcon]}>🚕</Text>
                    <Text style={[styles.vehicleChipLabel, vehicleType === null && styles.vehicleChipLabelActive]}>
                      {t('client.rideRequest.vehicleAny')}
                    </Text>
                  </TouchableOpacity>

                  {VEHICLE_TYPES.map(vt => (
                    <TouchableOpacity
                      key={vt.value}
                      style={[styles.vehicleChip, vehicleType === vt.value && styles.vehicleChipActive]}
                      onPress={() => setVehicleType(vt.value)}
                      accessibilityRole="radio"
                      accessibilityLabel={`${vt.label} vehicle type`}
                      accessibilityState={{ checked: vehicleType === vt.value }}
                    >
                      <Text style={styles.vehicleChipIcon}>{vt.icon}</Text>
                      <Text style={[styles.vehicleChipLabel, vehicleType === vt.value && styles.vehicleChipLabelActive]}>
                        {vt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* ── Promo code section ────────────────────────────── */}
            {dropoff && !searchFocused && (
              <View style={styles.promoSection}>
                {promoResult ? (
                  /* Applied code banner */
                  <View style={styles.promoApplied}>
                    <View style={styles.promoAppliedLeft}>
                      <Text style={styles.promoAppliedIcon}>🏷️</Text>
                      <View>
                        <Text style={styles.promoAppliedCode}>{promoResult.code}</Text>
                        <Text style={styles.promoAppliedDiscount}>
                          {promoResult.discountType === 'percent'
                            ? `${promoResult.discountValue}% off${promoResult.maxDiscountAmount != null ? ` (max $${promoResult.maxDiscountAmount})` : ''}`
                            : `$${promoResult.discountValue} off`
                          }
                          {promoResult.discountAmount != null
                            ? ` · Save $${promoResult.discountAmount.toFixed(2)}`
                            : ''}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={removePromo}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Remove promo code">
                      <Text style={styles.promoRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* Promo input row */
                  <View style={styles.promoRow}>
                    <TextInput
                      style={styles.promoInput}
                      value={promoInput}
                      onChangeText={t => { setPromoInput(t.toUpperCase()); setPromoError(''); }}
                      placeholder={t('client.rideRequest.promoPlaceholder')}
                      placeholderTextColor={colors.textDisabled}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={applyPromo}
                    />
                    <TouchableOpacity
                      style={[styles.promoApplyBtn, promoLoading && styles.promoApplyBtnDisabled]}
                      onPress={applyPromo}
                      disabled={promoLoading || !promoInput.trim()}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="Apply promo code"
                      accessibilityState={{ disabled: promoLoading || !promoInput.trim() }}>
                      {promoLoading
                        ? <ActivityIndicator size="small" color={colors.primary} />
                        : <Text style={styles.promoApplyText}>{t('common.apply')}</Text>
                      }
                    </TouchableOpacity>
                  </View>
                )}
                {!!promoError && (
                  <Text style={styles.promoError}>{promoError}</Text>
                )}
              </View>
            )}

            {/* ── Schedule section ──────────────────────────────── */}
            <View style={styles.scheduleSection}>
              <Text style={styles.scheduleLabel}>🕐 {t('client.rideRequest.whenLabel')}</Text>
              <View style={styles.chipRow}>
                {SCHEDULE_CHIPS.map(({ label, action }) => {
                  const active = label === activeChipLabel;
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[
                        styles.chip,
                        active && styles.chipActive,
                        label === 'Custom…' && styles.chipCustom,
                      ]}
                      onPress={action}
                      activeOpacity={0.75}
                      accessibilityRole="radio"
                      accessibilityLabel={`Schedule: ${label}`}
                      accessibilityState={{ checked: active }}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Selected time display */}
              {scheduledAt && (
                <TouchableOpacity
                  style={styles.scheduledTimeBadge}
                  onPress={openCustomPicker}
                  activeOpacity={0.75}>
                  <Text style={styles.scheduledTimeText}>
                    📅 {scheduledAt.toLocaleString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                  <Text style={styles.scheduledTimeEdit}>{t('client.rideRequest.editBtn')} ✏️</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Date/Time picker (Android: native dialog, iOS: modal) ── */}
            {pickerStep !== null && Platform.OS === 'android' && (
              <DateTimePicker
                value={pickerTempRef.current}
                mode={pickerStep}
                display="default"
                minimumDate={pickerStep === 'date' ? minSchedule() : undefined}
                onChange={handlePickerChange}
              />
            )}

            {/* Request button */}
            <TouchableOpacity
              style={[styles.requestBtn, requesting && styles.requestBtnDisabled]}
              onPress={handleRequest}
              disabled={requesting}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={scheduledAt ? 'Schedule ride' : 'Confirm and request ride'}
              accessibilityState={{ disabled: requesting }}>
              {requesting ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text style={styles.requestBtnText}>
                  {scheduledAt ? t('client.rideRequest.scheduleBtn') : t('client.rideRequest.confirmBtn')}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      )}

      {/* ── iOS date/time picker modal ─────────────────────────────────────── */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={pickerStep !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setPickerStep(null)}>
          <View style={styles.iosPickerOverlay}>
            <View style={styles.iosPickerCard}>
              {/* Header */}
              <View style={styles.iosPickerHeader}>
                <TouchableOpacity onPress={() => setPickerStep(null)}>
                  <Text style={styles.iosPickerCancel}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <Text style={styles.iosPickerTitle}>
                  {pickerStep === 'date' ? t('client.rideRequest.selectDate') : t('client.rideRequest.selectTime')}
                </Text>
                {pickerStep === 'time' ? (
                  <TouchableOpacity
                    onPress={() => {
                      // Confirm the staged time as-is
                      handlePickerChange(
                        { type: 'set', nativeEvent: { timestamp: pickerTempRef.current.getTime() } } as DateTimePickerEvent,
                        pickerTempRef.current,
                      );
                    }}>
                    <Text style={styles.iosPickerDone}>{t('common.done')}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: 50 }} />
                )}
              </View>

              {/* Picker */}
              {pickerStep !== null && (
                <DateTimePicker
                  value={pickerTempRef.current}
                  mode={pickerStep}
                  display="spinner"
                  minimumDate={pickerStep === 'date' ? minSchedule() : undefined}
                  onChange={handlePickerChange}
                  style={styles.iosPicker}
                />
              )}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function getStyles(c: ColorPalette) { return StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  backBtn: {
    margin: 16,
    alignSelf: 'flex-start',
    backgroundColor: c.background,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  backText: { fontSize: 14, fontWeight: '600', color: c.primary },

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
    backgroundColor: c.background,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
  },
  spinner: { marginBottom: 20 },
  searchingTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: c.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  searchingSubtitle: {
    fontSize: 14,
    color: c.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  // Solid red fill (not a thin outline) so the button is clearly visible on
  // both the light and dark cards — a transparent outlined button disappeared
  // against the white background.
  cancelBtn: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: c.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Bottom card
  bottomArea: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '80%' },
  bottomCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: c.background,
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
  dotPickup: { backgroundColor: c.primary },
  dotDropoff: { backgroundColor: c.info },
  dotStop: {
    backgroundColor: c.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotStopLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 10,
  },
  locationInfo: { flex: 1 },
  locationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: c.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  locationValue: { fontSize: 14, color: c.text, fontWeight: '500', marginTop: 2 },
  locationValuePlaceholder: { color: c.textDisabled, fontStyle: 'italic' },
  clearDropoff: { fontSize: 16, color: c.textSecondary, paddingLeft: 8 },
  locationDivider: {
    height: 1,
    backgroundColor: c.border,
    marginVertical: 4,
    marginLeft: 24,
  },

  // Search input (inline, no border box — blends into the row)
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: c.text,
    fontWeight: '500',
    marginTop: 2,
    padding: 0,           // remove default Android padding
    height: 26,
  },

  // Nominatim results dropdown
  resultsList: {
    maxHeight: 200,
    marginTop: 6,
    marginLeft: 24,
    backgroundColor: c.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  resultIcon: { fontSize: 16, marginTop: 1 },
  resultText: { fontSize: 13, color: c.text, lineHeight: 18, fontWeight: '600' },
  resultSubText: { fontSize: 11, color: c.textSecondary, lineHeight: 14, marginTop: 1 },
  resultDivider: { height: 1, backgroundColor: c.border, marginHorizontal: 12 },

  // Category quick-picks shown when search input is empty
  categoriesWrap: {
    marginTop: 8,
    marginLeft: 24,
    paddingVertical: 4,
  },
  categoriesHint: {
    fontSize: 11,
    color: c.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: c.surfaceAlt ?? c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  categoryChipText: { fontSize: 12, color: c.text, fontWeight: '600' },

  // Add stop button
  addStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginTop: 4,
    marginLeft: 24,
  },
  addStopText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.warning,
  },

  // Tap-map hint
  mapHint: {
    fontSize: 12,
    color: c.textDisabled,
    marginTop: 8,
    marginLeft: 24,
    fontStyle: 'italic',
  },

  // Fare estimate card
  estimateCard: {
    marginTop: 14,
    backgroundColor: c.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: c.border,
    gap: 6,
  },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  estimateLoading: {
    marginLeft: 8,
    fontSize: 13,
    color: c.textSecondary,
  },
  estimateLabel: {
    fontSize: 13,
    color: c.textSecondary,
  },
  estimateValue: {
    fontSize: 13,
    fontWeight: '600',
    color: c.text,
  },
  estimateFareRow: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  estimateFareLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: c.text,
  },
  estimateFareValue: {
    fontSize: 18,
    fontWeight: '800',
    color: c.primary,
  },
  estimateNote: {
    fontSize: 12,
    color: c.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },

  // Night tariff badge
  nightBadge: {
    backgroundColor: '#1e1b4b',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  nightBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#c7d2fe',
  },

  // Surge pricing badge
  surgeBadge: {
    backgroundColor: '#7c2d12',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  surgeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fed7aa',
  },

  // Vehicle type selector
  vehicleSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 12,
  },
  vehicleSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  vehicleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  vehicleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.surface,
    gap: 4,
  },
  vehicleChipActive: {
    borderColor: c.primary,
    backgroundColor: c.primary + '15',
  },
  vehicleChipIcon: {
    fontSize: 16,
  },
  vehicleChipLabel: {
    fontSize: 13,
    color: c.textSecondary,
    fontWeight: '500',
  },
  vehicleChipLabelActive: {
    color: c.primary,
    fontWeight: '700',
  },

  // Promo code
  promoSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 10,
  },
  promoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  promoInput: {
    flex: 1,
    height: 38,
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  promoApplyBtn: {
    height: 38,
    paddingHorizontal: 14,
    backgroundColor: c.primary + '18',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  promoApplyBtnDisabled: { opacity: 0.5 },
  promoApplyText: {
    fontSize: 13,
    fontWeight: '700',
    color: c.primary,
  },
  promoApplied: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.successLight ?? '#f0fdf4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: c.success,
  },
  promoAppliedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  promoAppliedIcon: { fontSize: 18 },
  promoAppliedCode: {
    fontSize: 13,
    fontWeight: '800',
    color: c.success,
    letterSpacing: 1,
  },
  promoAppliedDiscount: {
    fontSize: 12,
    color: c.success,
    fontWeight: '500',
    marginTop: 1,
  },
  promoRemove: {
    fontSize: 16,
    color: c.success,
    paddingLeft: 8,
  },
  promoError: {
    fontSize: 12,
    color: c.error,
    marginTop: 4,
    marginLeft: 2,
  },

  // Schedule chips
  scheduleSection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 12,
  },
  scheduleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: c.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  chipActive: {
    borderColor: c.primary,
    backgroundColor: c.primary + '18',
  },
  chipCustom: {
    borderStyle: 'dashed',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
  },
  chipTextActive: {
    color: c.primary,
  },
  // Selected time badge (tappable to re-edit)
  scheduledTimeBadge: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.primary + '12',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: c.primary + '40',
  },
  scheduledTimeText: {
    fontSize: 13,
    fontWeight: '700',
    color: c.primary,
  },
  scheduledTimeEdit: {
    fontSize: 12,
    color: c.primary,
    opacity: 0.7,
  },
  // iOS modal picker
  iosPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  iosPickerCard: {
    backgroundColor: c.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  iosPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  iosPickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
  },
  iosPickerCancel: {
    fontSize: 15,
    color: c.textSecondary,
    width: 50,
  },
  iosPickerDone: {
    fontSize: 15,
    fontWeight: '700',
    color: c.primary,
    textAlign: 'right',
    width: 50,
  },
  iosPicker: {
    height: 200,
  },

  requestBtn: {
    height: 52,
    backgroundColor: c.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  requestBtnDisabled: { opacity: 0.6 },
  requestBtnText: { fontSize: 16, fontWeight: '700', color: c.textOnPrimary },
}); }
