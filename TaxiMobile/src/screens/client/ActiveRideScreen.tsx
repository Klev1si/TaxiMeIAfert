import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { MAP_PROVIDER } from '../../utils/mapProvider';
import { useRideStore } from '../../stores/rideStore';
import { ridesApi, TRIP_SHARE_BASE_URL } from '../../api/rides';
import { socketService } from '../../services/socket';
import { useColors, useTheme } from '../../stores/themeStore';
import { DARK_MAP_STYLE } from '../../constants/mapStyles';
import { useTranslation } from '../../i18n';
import type { ColorPalette } from '../../constants/colors';
import CancelRideModal from '../../components/CancelRideModal';
import SosButton from '../../components/SosButton';
import Taximeter from '../../components/Taximeter';
import SearchingForDriver from '../../components/SearchingForDriver';
import type { Ride, RideStatus, WsDriverLocationUpdate, WsRideEstimate, WsRideMessage, WsStopReached } from '../../types/api';
import type { ClientStackScreenProps } from '../../navigation/types';
import Config from '../../config';
import { toAlertString } from '../../utils/errorMessage';
import { fetchRoute, haversineKm, type LatLng } from '../../services/directions';

type Props = ClientStackScreenProps<'ActiveRide'>;

// Events the server sends to the client during a ride
interface DriverEnRouteEvent { rideId: string; driverName: string }
interface DriverArrivedEvent  { rideId: string; driverName: string; vehiclePlate: string }
interface RideStartedEvent    { rideId: string }
interface RideCompletedEvent {
  rideId: string;
  completedAt: string;
  totalFare?:    number | null;
  distanceKm?:   number | null;
  baseFare?:     number | null;
  distanceFare?: number | null;
  timeFare?:     number | null;
  /** Discount applied at completion (promo code OR the automatic free in-city first ride). */
  discountAmount?: number | null;
  /** Promo code used, if any. null for the automatic first-ride discount. */
  promoCode?:      string | null;
  /** Included so the rate screen can show the ❤️ save toggle without a follow-up fetch. */
  driverId?:     string | null;
}
interface RideCancelledEvent  { rideId: string; cancelledBy: string; reason: string | null }

interface DriverLocation { lat: number; lng: number; etaMinutes: number | null }

interface ChatMessage {
  id: string;
  text: string;
  fromMe: boolean;
  ts: number;
}

// Human-readable status labels — built inside component using t()
function getStatusLabel(t: (key: string) => string): Record<RideStatus, string> {
  return {
    requested:         t('client.activeRide.statusFinding'),
    accepted:          t('client.activeRide.statusAccepted'),
    driving_to_pickup: t('client.activeRide.statusOnWay'),
    in_progress:       t('client.activeRide.statusInProgress'),
    completed:         t('client.activeRide.statusCompleted'),
    cancelled:         t('client.activeRide.statusCancelled'),
  };
}

// Monotonic ordering of ride statuses — used to reconcile the authoritative
// server state on mount without ever regressing a status the live socket has
// already advanced past.
const STATUS_RANK: Record<RideStatus, number> = {
  requested:         0,
  accepted:          1,
  driving_to_pickup: 2,
  in_progress:       3,
  completed:         4,
  cancelled:         4,
};

function getStatusColor(c: ColorPalette): Record<RideStatus, string> {
  return {
    requested:         c.warning,
    accepted:          c.info,
    driving_to_pickup: c.info,
    in_progress:       c.success,
    completed:         c.textSecondary,
    cancelled:         c.error,
  };
}

export default function ActiveRideScreen({ navigation, route }: Props) {
  const { rideId, driverName, vehicleMake, vehicleModel, vehiclePlate, vehicleColor } = route.params;
  const { activeRide, clearAll, setActiveRide } = useRideStore();
  const colors = useColors();
  const { isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const STATUS_COLOR = useMemo(() => getStatusColor(colors), [colors]);
  const STATUS_LABEL = useMemo(() => getStatusLabel(t), [t]);

  const mapRef = useRef<MapView>(null);

  // Use the store's ride if available; otherwise fetch from server.
  // We only ever navigate here AFTER a driver has accepted, but the store's
  // activeRide is still the snapshot cached at request time (status
  // 'requested'), which would wrongly render the "searching for driver" UI.
  // When we arrive with driver details (the normal accept path), coerce the
  // initial status to 'accepted' so the badge is correct on first paint; the
  // mount reconciliation below then syncs the full authoritative state.
  const [ride, setRide] = useState<Ride | null>(
    activeRide && activeRide.status === 'requested' && driverName
      ? { ...activeRide, status: 'accepted' }
      : activeRide,
  );
  // Always-fresh mirror of `ride` for use inside socket callbacks (whose
  // closures would otherwise capture a stale value).
  const rideRef = useRef<Ride | null>(ride);
  rideRef.current = ride;
  const [cancelling, setCancelling] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);

  // No-show: whether the client has waited long enough to report driver no-show
  // Re-evaluated every 30 s via a timer; threshold = 10 minutes after acceptedAt
  const NOSHOW_WAIT_MS = 10 * 60 * 1000;
  const [canReportNoShow, setCanReportNoShow] = useState(false);

  // ── Route polylines ──────────────────────────────────────────────────────────
  const [pickupToDropoffRoute, setPickupToDropoffRoute] = useState<LatLng[]>([]);
  const [driverToPickupRoute,  setDriverToPickupRoute]  = useState<LatLng[]>([]);
  // Track the origin of the last driver→pickup fetch to avoid redundant calls
  const lastDriverRouteFetchRef = useRef<LatLng | null>(null);

  // ── Live driver trail (GPS breadcrumbs recorded during IN_PROGRESS) ──────────
  const [driverTrail, setDriverTrail] = useState<LatLng[]>([]);

  // ── Chat state ───────────────────────────────────────────────────────────────
  const [chatOpen,    setChatOpen]    = useState(false);
  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [chatInput,   setChatInput]   = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const chatScrollRef = useRef<ScrollView>(null);

  // ── Reconcile with authoritative server state on mount ──────────────────────
  // The store's activeRide can be stale (it's cached at request time, so its
  // status is 'requested' even after a driver accepts). Fetch the live ride and
  // merge it so the status badge is correct even if the acceptance WS event was
  // missed or the app was reopened mid-ride. Never regress a status the live
  // socket has already advanced past.
  useEffect(() => {
    let cancelled = false;
    ridesApi.getActiveRide()
      .then(({ data }) => {
        if (cancelled || !data || data.id !== rideId) { return; }
        setRide(prev => {
          if (!prev) { return data as Ride; }
          const merged = { ...prev, ...data } as Ride;
          if (STATUS_RANK[data.status as RideStatus] < STATUS_RANK[prev.status as RideStatus]) {
            merged.status = prev.status;
          }
          return merged;
        });
      })
      .catch(() => { /* non-fatal — live socket events still drive updates */ });
    return () => { cancelled = true; };
  }, [rideId]);

  // ── Re-sync authoritative ride state on reconnect / app-foreground ──────────
  // socket.io does NOT replay events missed while the socket was down (very
  // common on Android under Doze). Without this, if the client misses
  // `ride_accepted`/`ride_completed` it stays stuck on "searching for driver"
  // until an app restart. On every reconnect and every foreground we re-fetch
  // the live ride and reconcile — advancing the status, or leaving the screen
  // if the ride already finished while we were disconnected.
  useEffect(() => {
    // Guard so AppState + onReconnect (which can both fire together) can't
    // trigger the terminal navigation twice.
    let navigated = false;

    const resync = () => {
      ridesApi.getActiveRide()
        .then(({ data }) => {
          if (data && data.id === rideId) {
            setRide(prev => {
              if (!prev) { return data as Ride; }
              const merged = { ...prev, ...data } as Ride;
              if (STATUS_RANK[data.status as RideStatus] < STATUS_RANK[prev.status as RideStatus]) {
                merged.status = prev.status;
              }
              return merged;
            });
            return;
          }
          // getActiveRide no longer returns this ride → it ended while we were
          // away (getActiveRide excludes completed/cancelled). Fetch the ride
          // by id to find out how it ended and move the client accordingly.
          if (navigated) { return; }
          ridesApi.getRideById(rideId)
            .then(({ data: r }) => {
              if (navigated || !r) { return; }
              if (r.status === 'completed') {
                navigated = true;
                setActiveRide(r);
                navigation.replace('PayCash', { rideId });
              } else if (r.status === 'cancelled') {
                navigated = true;
                clearAll();
                Alert.alert(
                  t('client.activeRide.rideCancelledTitle'),
                  t('client.activeRide.rideCancelledByDriver'),
                  [{ text: t('common.ok'), onPress: () => navigation.replace('ClientHomeMain') }],
                );
              }
            })
            .catch(() => { /* non-fatal */ });
        })
        .catch(() => { /* non-fatal */ });
    };

    const unsubReconnect = socketService.onReconnect(resync);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { resync(); }
    });

    return () => {
      unsubReconnect();
      appStateSub.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId]);

  // ── Pickup → Dropoff route (fetched once when ride loads) ───────────────────
  useEffect(() => {
    if (!ride || ride.dropoffLat == null || ride.dropoffLng == null) return;
    const origin: LatLng = { latitude: ride.pickupLat,  longitude: ride.pickupLng };
    const dest:   LatLng = { latitude: ride.dropoffLat, longitude: ride.dropoffLng };
    fetchRoute(origin, dest, Config.GOOGLE_MAPS_API_KEY).then(pts => {
      if (pts.length) setPickupToDropoffRoute(pts);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id]);

  // ── Driver → Pickup route (refreshed when driver moves significantly) ────────
  useEffect(() => {
    if (!ride || !driverLocation) return;
    const driverLatLng: LatLng = { latitude: driverLocation.lat, longitude: driverLocation.lng };
    const lastFetch = lastDriverRouteFetchRef.current;
    // Re-fetch only when driver has moved ≥ 200 m from the last fetch origin
    if (lastFetch && haversineKm(lastFetch, driverLatLng) < 0.2) return;
    lastDriverRouteFetchRef.current = driverLatLng;
    const pickup: LatLng = { latitude: ride.pickupLat, longitude: ride.pickupLng };
    fetchRoute(driverLatLng, pickup, Config.GOOGLE_MAPS_API_KEY).then(pts => {
      if (pts.length) setDriverToPickupRoute(pts);
    });
  }, [driverLocation, ride]);

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
        // Apply ALL fare fields from the WS payload so PayCash can render
        // the amount immediately on landing — no extra API call needed.
        const farePatch: Partial<Ride> = {
          status:       'completed',
          completedAt:  e.completedAt,
          ...(e.totalFare    !== undefined ? { totalFare:    e.totalFare    } : {}),
          ...(e.distanceKm   !== undefined ? { distanceKm:   e.distanceKm   } : {}),
          ...(e.baseFare       !== undefined ? { baseFare:       e.baseFare       } : {}),
          ...(e.distanceFare   !== undefined ? { distanceFare:   e.distanceFare   } : {}),
          ...(e.timeFare       !== undefined ? { timeFare:       e.timeFare       } : {}),
          ...(e.discountAmount !== undefined ? { discountAmount: e.discountAmount } : {}),
          ...(e.promoCode      !== undefined ? { promoCode:      e.promoCode      } : {}),
          ...(e.driverId       !== undefined ? { driverId:       e.driverId       } : {}),
        };
        update(farePatch);
        // Also push the finalized ride into the shared store. PayCash reads the
        // fare from the store's activeRide (not this screen's local state), and
        // the server's getActiveRide excludes completed rides — so without this
        // the client would be stuck on "fare not finalized yet" even though the
        // driver already sees the total.
        const latest = rideRef.current ?? useRideStore.getState().activeRide;
        if (latest) { setActiveRide({ ...latest, ...farePatch } as Ride); }
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
          t('client.activeRide.rideCancelledTitle'),
          e.reason
            ? t('client.activeRide.rideCancelledReason', { reason: e.reason })
            : t('client.activeRide.rideCancelledByDriver'),
          [{ text: t('common.ok'), onPress: () => navigation.replace('ClientHomeMain') }],
        );
      },
    );

    // Live driver position updates (includes ETA to pickup)
    const unsubLocation = socketService.on<WsDriverLocationUpdate>(
      'driver_location_update',
      (e) => {
        setDriverLocation({ lat: e.lat, lng: e.lng, etaMinutes: e.etaMinutes });
        // Accumulate trail for the in-progress breadcrumb polyline
        setDriverTrail(prev => [...prev, { latitude: e.lat, longitude: e.lng }]);
      },
    );

    // Driver marked an intermediate stop as reached
    const unsubStop = socketService.on<WsStopReached>('stop_reached', (e) => {
      if (e.rideId !== rideId) { return; }
      setRide(r => {
        if (!r) return r;
        const updatedStops = (r.stops ?? []).map(s =>
          s.id === e.stopId ? { ...s, reachedAt: e.reachedAt } : s,
        );
        return { ...r, stops: updatedStops };
      });
    });

    // Approximate fare (re)computed whenever the ride is dispatched to a driver.
    // Reflects the tariff of whoever is currently being asked — updates live if
    // the request passes from one driver to another with a different tariff.
    const unsubEstimate = socketService.on<WsRideEstimate>('ride_estimate', (e) => {
      if (e.rideId !== rideId) { return; }
      update({
        estimatedFare: e.estimatedFare,
        ...(e.tariffSnapshot ? { tariffSnapshot: e.tariffSnapshot } : {}),
      });
    });

    // Incoming chat messages from driver
    const unsubChat = socketService.on<WsRideMessage>('ride_message', (e) => {
      if (e.rideId !== rideId || e.fromRole !== 'driver') { return; }
      const msg: ChatMessage = {
        id: `${e.ts}-${Math.random()}`,
        text: e.text,
        fromMe: false,
        ts: e.ts,
      };
      setMessages(prev => [...prev, msg]);
      setChatOpen(open => {
        if (!open) { setUnreadCount(c => c + 1); }
        return open;
      });
    });

    return () => {
      unsubEnRoute();
      unsubArrived();
      unsubStarted();
      unsubCompleted();
      unsubCancelled();
      unsubLocation();
      unsubStop();
      unsubChat();
      unsubEstimate();
    };
  }, [rideId, navigation, clearAll, setActiveRide]);

  // ── No-show eligibility timer ─────────────────────────────────────────────────
  // Re-check every 30 s whether the client has waited long enough to report no-show.
  useEffect(() => {
    const check = () => {
      if (!ride?.acceptedAt || ride.status === 'requested' || ride.status === 'in_progress' ||
          ride.status === 'completed' || ride.status === 'cancelled' || ride.pickupArrivedAt) {
        setCanReportNoShow(false);
        return;
      }
      const waited = Date.now() - new Date(ride.acceptedAt).getTime();
      setCanReportNoShow(waited >= NOSHOW_WAIT_MS);
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [ride?.acceptedAt, ride?.status, ride?.pickupArrivedAt]);

  // ── Driver no-show ────────────────────────────────────────────────────────────
  const handleDriverNoShow = () => {
    Alert.alert(
      t('client.activeRide.noShowTitle'),
      t('client.activeRide.noShowMsg'),
      [
        { text: t('client.activeRide.keepWaiting'), style: 'cancel' },
        {
          text: t('client.activeRide.reportNoShow'),
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await ridesApi.reportNoShow(rideId);
              clearAll();
              navigation.replace('ClientHomeMain');
            } catch (err: any) {
              Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('common.error')));
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

  // ── Cancel by client ─────────────────────────────────────────────────────────
  const handleCancelConfirm = async (reason: string) => {
    setCancelling(true);
    try {
      await ridesApi.cancelRide(rideId, { reason });
      setCancelModalVisible(false);
      clearAll();
      navigation.replace('ClientHomeMain');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('common.error');
      Alert.alert(t('common.error'), msg);
    } finally {
      setCancelling(false);
    }
  };

  // ── Chat helpers ─────────────────────────────────────────────────────────────
  const openChat = () => {
    setChatOpen(true);
    setUnreadCount(0);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const sendMessage = () => {
    const text = chatInput.trim();
    if (!text) { return; }
    const msg: ChatMessage = {
      id: `${Date.now()}-me`,
      text,
      fromMe: true,
      ts: Date.now(),
    };
    setMessages(prev => [...prev, msg]);
    setChatInput('');
    socketService.emit('ride_message', { rideId, text });
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  // ── Trip sharing ─────────────────────────────────────────────────────────────
  // Generates (or fetches the existing) public tracking token, builds a URL
  // pointing at the GitHub Pages live-tracking page, and opens the native
  // share sheet so the passenger can send it to family / friends.
  const handleShareRide = async () => {
    if (!ride?.id) return;
    const pickup  = ride?.pickupAddress  ?? 'pickup location';
    const dropoff = ride?.dropoffAddress ?? 'destination';
    let trackingUrl: string | null = null;
    try {
      const { data } = await ridesApi.createShareToken(ride.id);
      trackingUrl = `${TRIP_SHARE_BASE_URL}?token=${encodeURIComponent(data.token)}`;
    } catch { /* fall through — share text-only if token issuance fails */ }

    const message = trackingUrl
      ? `🚕 I'm on my way!\n\nFollow my ride live: ${trackingUrl}\n\nPickup: ${pickup}\nDropoff: ${dropoff}`
      : `🚕 I'm on my way!\n\nPickup: ${pickup}\nDropoff: ${dropoff}\n\nTracking my TaxiApp ride — I'll let you know when I arrive!`;
    try {
      await Share.share({ message, url: trackingUrl ?? undefined });
    } catch { /* user dismissed — ignore */ }
  };

  if (!ride) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{t('client.activeRide.rideNotFound')}</Text>
        <TouchableOpacity onPress={() => navigation.replace('ClientHomeMain')}>
          <Text style={styles.linkText}>{t('common.goHome')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const status = ride.status as RideStatus;
  const canCancel = status === 'requested' || status === 'accepted' || status === 'driving_to_pickup';

  return (
    <View style={styles.container}>
      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={MAP_PROVIDER}
        customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
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
          pinColor={colors.primary}
        />
        {/* Intermediate stop markers */}
        {ride.stops && ride.stops.map((stop, i) => (
          <Marker
            key={stop.id}
            coordinate={{ latitude: stop.lat, longitude: stop.lng }}
            title={`Stop ${i + 1}`}
            description={stop.reachedAt ? '✓ Reached' : (stop.address ?? '')}
            pinColor={stop.reachedAt ? '#6b7280' : '#f59e0b'}
          />
        ))}
        {/* Dropoff */}
        {ride.dropoffLat != null && ride.dropoffLng != null && (
          <Marker
            coordinate={{ latitude: ride.dropoffLat, longitude: ride.dropoffLng }}
            title="Dropoff"
            pinColor={colors.info}
          />
        )}
        {/* Live driver position */}
        {driverLocation && (
          <Marker
            coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
            title={driverName ?? 'Your driver'}
            description={vehiclePlate ?? undefined}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}>
            <View style={styles.driverMarkerWrap}>
              <Text style={styles.driverMarkerIcon}>🚕</Text>
            </View>
          </Marker>
        )}

        {/* Pickup → Dropoff route (always shown when dropoff is set) */}
        {pickupToDropoffRoute.length > 1 && (
          <Polyline
            coordinates={pickupToDropoffRoute}
            strokeColor={colors.primary}
            strokeWidth={4}
            lineDashPattern={[0]}
          />
        )}

        {/* Driver → Pickup route (shown while driver is en-route) */}
        {driverToPickupRoute.length > 1 &&
         (status === 'accepted' || status === 'driving_to_pickup') && (
          <Polyline
            coordinates={driverToPickupRoute}
            strokeColor="#8b5cf6"
            strokeWidth={3}
            lineDashPattern={[8, 4]}
          />
        )}

        {/* Live driver trail (GPS breadcrumbs during the ride) */}
        {driverTrail.length > 1 && status === 'in_progress' && (
          <Polyline
            coordinates={driverTrail}
            strokeColor={colors.success}
            strokeWidth={4}
            lineDashPattern={[0]}
          />
        )}
      </MapView>

      {/* ── Real-time taximeter — shows from acceptance (0.00) and starts
            ticking when the driver taps "Start ride" (status → in_progress). */}
      {(ride.status === 'accepted' || ride.status === 'driving_to_pickup' || ride.status === 'in_progress') && (
        <Taximeter
          tariff={ride.tariffSnapshot ?? null}
          startedAt={ride.status === 'in_progress' ? ride.startedAt : null}
          position={driverLocation ? { latitude: driverLocation.lat, longitude: driverLocation.lng } : null}
        />
      )}

      {/* ── Floating action buttons (share + chat) ──────────────────────── */}
      {!chatOpen && (
        <View style={styles.floatingButtons}>
          {/* Share ride */}
          <TouchableOpacity
            style={styles.floatingShare}
            onPress={handleShareRide}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Share my trip">
            <Text style={styles.floatingShareIcon}>↗️</Text>
          </TouchableOpacity>
          {/* Chat */}
          <TouchableOpacity
            style={styles.floatingChat}
            onPress={openChat}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `Chat with driver, ${unreadCount} unread` : 'Chat with driver'}>
            <Text style={styles.floatingChatIcon}>💬</Text>
            {unreadCount > 0 && (
              <View style={styles.floatingChatBadge}>
                <Text style={styles.floatingChatBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Chat panel overlay ──────────────────────────────────────────── */}
      {chatOpen && (
        <KeyboardAvoidingView
          style={styles.chatOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.chatPanel}>
            {/* Chat header */}
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle}>💬 {t('client.activeRide.chatDriver')}</Text>
              <TouchableOpacity
                onPress={() => setChatOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close chat">
                <Text style={styles.chatClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Messages */}
            <ScrollView
              ref={chatScrollRef}
              style={styles.chatMessages}
              contentContainerStyle={{ paddingVertical: 8 }}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}>
              {messages.length === 0 ? (
                <Text style={styles.chatEmpty}>{t('client.activeRide.noMessages')}</Text>
              ) : (
                messages.map(m => (
                  <View
                    key={m.id}
                    style={[styles.bubble, m.fromMe ? styles.bubbleMe : styles.bubbleThem]}>
                    <Text style={[styles.bubbleText, m.fromMe && styles.bubbleTextMe]}>
                      {m.text}
                    </Text>
                    <Text style={[styles.bubbleTime, m.fromMe && styles.bubbleTimeMe]}>
                      {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Input row */}
            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder={t('client.activeRide.typePlaceholder')}
                placeholderTextColor={colors.textDisabled}
                returnKeyType="send"
                onSubmitEditing={sendMessage}
                multiline={false}
                accessibilityLabel="Type a message to driver"
              />
              <TouchableOpacity
                style={[styles.chatSend, !chatInput.trim() && styles.chatSendDisabled]}
                onPress={sendMessage}
                disabled={!chatInput.trim()}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Send message"
                accessibilityState={{ disabled: !chatInput.trim() }}>
                <Text style={styles.chatSendIcon}>➤</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

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
            {/* Searching radar — animated while waiting for a driver to accept */}
            {status === 'requested' && (
              <View style={styles.searchingBlock}>
                <SearchingForDriver size={112} />
                <Text style={styles.searchingText}>
                  {t('client.activeRide.searchingSubtitle')}
                </Text>
              </View>
            )}

            {/* ETA banner — shown while driver is en-route */}
            {status === 'driving_to_pickup' &&
             driverLocation?.etaMinutes != null && (
              <View style={styles.etaBanner}>
                <Text style={styles.etaIcon}>🕐</Text>
                <Text style={styles.etaText}>
                  Driver arriving in{' '}
                  <Text style={styles.etaBold}>~{driverLocation.etaMinutes} min</Text>
                </Text>
              </View>
            )}

            {/* Driver info card */}
            {driverName && (
              <View style={styles.driverCard}>
                <View style={styles.driverAvatar}>
                  <Text style={styles.driverAvatarText}>
                    {driverName[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
                <View style={styles.driverInfo}>
                  <Text style={styles.driverName}>{driverName}</Text>
                  {vehicleMake && vehicleModel && (
                    <Text style={styles.driverVehicle}>
                      {vehicleColor ? `${vehicleColor} ` : ''}{vehicleMake} {vehicleModel}
                      {vehiclePlate ? ` · ${vehiclePlate}` : ''}
                    </Text>
                  )}
                </View>
                {driverLocation && (
                  <View style={styles.liveTag}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>{t('client.activeRide.live')}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Pickup */}
            <InfoRow
              icon="📍"
              label={t('client.activeRide.pickup')}
              value={ride.pickupAddress ?? `${ride.pickupLat.toFixed(5)}, ${ride.pickupLng.toFixed(5)}`}
            />

            {/* Intermediate stops */}
            {ride.stops && ride.stops.length > 0 && ride.stops.map((stop, i) => (
              <InfoRow
                key={stop.id}
                icon={stop.reachedAt ? '✅' : '🟠'}
                label={t('client.activeRide.stop', { n: i + 1 })}
                value={stop.address ?? `${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}`}
              />
            ))}

            {/* Dropoff */}
            {ride.dropoffLat != null && (
              <InfoRow
                icon="🏁"
                label={t('client.activeRide.dropoff')}
                value={
                  ride.dropoffAddress ??
                  `${ride.dropoffLat.toFixed(5)}, ${ride.dropoffLng!.toFixed(5)}`
                }
              />
            )}

            {/* Approximate fare — based on the offered driver's tariff. Shown
                while waiting / en-route; the live meter takes over in-progress. */}
            {ride.estimatedFare != null &&
             status !== 'completed' && status !== 'cancelled' && status !== 'in_progress' && (
              <View style={styles.estimateCard}>
                <View style={styles.estimateRow}>
                  <Text style={styles.estimateLabel}>💰 {t('client.activeRide.estimatedFare')}</Text>
                  <Text style={styles.estimateValue}>{ride.estimatedFare.toFixed(2)} €</Text>
                </View>
                <Text style={styles.estimateNote}>
                  {ride.tariffSnapshot ? `${ride.tariffSnapshot.name} · ` : ''}
                  {t('client.activeRide.estimatedFareNote')}
                </Text>
              </View>
            )}

            {/* Arrived notice */}
            {status === 'driving_to_pickup' && ride.pickupArrivedAt && (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>🚕 {t('client.activeRide.driverArrived')}</Text>
              </View>
            )}

            {/* In progress notice */}
            {status === 'in_progress' && (
              <View style={[styles.noticeBox, styles.noticeGreen]}>
                <Text style={styles.noticeText}>🛣️ {t('client.activeRide.onYourWay')}</Text>
              </View>
            )}
          </ScrollView>

          {/* Driver no-show button — shown after 10 min wait without driver arriving */}
          {canReportNoShow && (
            <TouchableOpacity
              style={[styles.noShowBtn, cancelling && styles.cancelBtnDisabled]}
              onPress={handleDriverNoShow}
              disabled={cancelling}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Report driver not coming">
              <Text style={styles.noShowBtnText}>🚫  {t('client.activeRide.driverNotComing')}</Text>
            </TouchableOpacity>
          )}

          {/* Cancel button — only while driver hasn't started the ride */}
          {canCancel && (
            <TouchableOpacity
              style={[styles.cancelBtn, cancelling && styles.cancelBtnDisabled]}
              onPress={() => setCancelModalVisible(true)}
              disabled={cancelling}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={status === 'requested' ? 'Cancel ride request' : 'Cancel ride'}
              accessibilityState={{ disabled: cancelling }}>
              <Text style={styles.cancelBtnText}>
                {cancelling
                  ? t('client.activeRide.cancelling')
                  : status === 'requested'
                    ? t('client.activeRide.cancelRequest')
                    : t('client.activeRide.cancelRide')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      {/* SOS emergency button */}
      <SosButton rideId={rideId} />

      {/* Cancel reason modal */}
      <CancelRideModal
        visible={cancelModalVisible}
        role="client"
        rideId={rideId ?? undefined}
        onClose={() => setCancelModalVisible(false)}
        onConfirm={handleCancelConfirm}
      />
    </View>
  );
}

// ── Small helper component ────────────────────────────────────────────────────
function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const ic = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
      <Text style={{ fontSize: 18, marginRight: 10, marginTop: 2 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: ic.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
        <Text style={{ fontSize: 14, color: ic.text, fontWeight: '500', marginTop: 2 }} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

function getStyles(c: ColorPalette) { return StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 16, color: c.textSecondary, marginBottom: 12 },
  linkText: { fontSize: 15, color: c.primary, fontWeight: '700' },

  panelWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  panel: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: c.background,
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

  // ETA banner
  etaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.primaryLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  etaIcon: { fontSize: 18 },
  etaText: { fontSize: 14, color: c.text, flex: 1 },
  etaBold: { fontWeight: '800', color: c.primaryDark },

  noticeBox: {
    backgroundColor: c.infoLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: c.info,
  },
  noticeGreen: {
    backgroundColor: c.successLight,
    borderColor: c.success,
  },
  noticeText: { fontSize: 14, color: c.text, fontWeight: '500' },

  // Searching-for-driver radar block (shown while status === 'requested')
  searchingBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 4,
  },
  searchingText: {
    fontSize: 14,
    color: c.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
  },

  // Approximate fare card
  estimateCard: {
    backgroundColor: c.surfaceAlt,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  estimateLabel: { fontSize: 14, fontWeight: '700', color: c.textSecondary },
  estimateValue: { fontSize: 22, fontWeight: '800', color: c.primary, fontVariant: ['tabular-nums'] },
  estimateNote: { fontSize: 11, color: c.textSecondary, marginTop: 6 },

  // Driver info card
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  driverAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  driverAvatarText: { fontSize: 18, fontWeight: '800', color: c.textOnPrimary },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 15, fontWeight: '700', color: c.text },
  driverVehicle: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.successLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.success,
  },
  liveText: { fontSize: 11, fontWeight: '700', color: c.success },

  noShowBtn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: c.warning + '22',
    borderWidth: 1.5,
    borderColor: c.warning,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  noShowBtnText: { fontSize: 14, fontWeight: '700', color: c.warning },

  cancelBtn: {
    height: 46,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  cancelBtnDisabled: { opacity: 0.5 },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: c.error },

  // Floating action buttons column
  floatingButtons: {
    position: 'absolute',
    top: 60,
    right: 16,
    gap: 10,
    zIndex: 10,
  },
  floatingShare: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: c.background,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    borderWidth: 1.5,
    borderColor: c.border,
  },
  floatingShareIcon: { fontSize: 20 },

  // Floating chat button
  floatingChat: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: c.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    borderWidth: 1.5,
    borderColor: c.border,
  },
  floatingChatIcon: { fontSize: 22 },
  floatingChatBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: c.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingChatBadgeText: { fontSize: 10, fontWeight: '800', color: c.white },

  // Chat overlay panel
  chatOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 999,
    elevation: 20,
  },
  chatPanel: {
    backgroundColor: c.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 16,
    maxHeight: '70%',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  chatTitle: { fontSize: 16, fontWeight: '700', color: c.text },
  chatClose: { fontSize: 18, color: c.textSecondary },
  chatMessages: { paddingHorizontal: 16, maxHeight: 280 },
  chatEmpty: {
    textAlign: 'center',
    color: c.textDisabled,
    fontSize: 14,
    marginTop: 24,
    fontStyle: 'italic',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: c.primary,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 14, color: c.text },
  bubbleTextMe: { color: c.textOnPrimary },
  bubbleTime: { fontSize: 10, color: c.textSecondary, marginTop: 3, alignSelf: 'flex-end' },
  bubbleTimeMe: { color: c.textOnPrimary + 'BB' },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  chatInput: {
    flex: 1,
    height: 44,
    backgroundColor: c.surface,
    borderRadius: 22,
    paddingHorizontal: 16,
    fontSize: 14,
    color: c.text,
    borderWidth: 1,
    borderColor: c.border,
  },
  chatSend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendDisabled: { opacity: 0.4 },
  chatSendIcon: { fontSize: 16, color: c.textOnPrimary },

  // Driver marker
  driverMarkerWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: c.background, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: c.primary,
    elevation: 4, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.22, shadowRadius: 3,
  },
  driverMarkerIcon: { fontSize: 20 },
}); }
