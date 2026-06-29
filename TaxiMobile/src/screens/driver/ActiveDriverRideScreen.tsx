import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { UserLocationChangeEvent } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRideStore } from '../../stores/rideStore';
import { ridesApi } from '../../api/rides';
import { socketService } from '../../services/socket';
import { useColors } from '../../stores/themeStore';
import { useTranslation } from '../../i18n';
import type { ColorPalette } from '../../constants/colors';
import CancelRideModal from '../../components/CancelRideModal';
import SosButton from '../../components/SosButton';
import Taximeter from '../../components/Taximeter';
import type { Ride, RideStatus, WsRideMessage } from '../../types/api';
import type { DriverStackScreenProps } from '../../navigation/types';
import Config from '../../config';
import { fetchRoute, haversineKm, type LatLng } from '../../services/directions';

/** Compute compass bearing (degrees, 0 = North) from point A to B. */
function bearingDegrees(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);
  const y  = Math.sin(Δλ) * Math.cos(φ2);
  const x  = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
import { toAlertString } from '../../utils/errorMessage';

type Props = DriverStackScreenProps<'ActiveDriverRide'>;

interface RideCancelledEvent { rideId: string; cancelledBy: string; reason: string | null }

interface ChatMessage {
  id: string;
  text: string;
  fromMe: boolean;
  ts: number;
}

// What action button to show at each status
type ActionStep =
  | { label: string; action: () => void; color: string }
  | null;

export default function ActiveDriverRideScreen({ navigation, route }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const completeStyles = useMemo(() => getCompleteStyles(colors), [colors]);
  const stopRowStyles = useMemo(() => getStopRowStyles(colors), [colors]);
  const { t } = useTranslation();
  const { rideId } = route.params;
  const { activeRide, setActiveRide, clearAll } = useRideStore();

  const [ride, setRide] = useState<Ride | null>(activeRide);
  const [markingStopId, setMarkingStopId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // ── Completion modal state ───────────────────────────────────────────────────
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [fareInput, setFareInput]         = useState('');

  // ── Chat state ───────────────────────────────────────────────────────────────
  const [chatOpen,    setChatOpen]    = useState(false);
  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [chatInput,   setChatInput]   = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const chatScrollRef = useRef<ScrollView>(null);

  // ── Route polylines ──────────────────────────────────────────────────────────
  const [currentToPickupRoute, setCurrentToPickupRoute] = useState<LatLng[]>([]);
  const [pickupToDropoffRoute, setPickupToDropoffRoute] = useState<LatLng[]>([]);
  const lastDriverPosFetchRef = useRef<LatLng | null>(null);

  // ── Driver position & rotation — used to render the moving 🚕 marker ───────
  const [driverPos, setDriverPos] = useState<LatLng | null>(null);
  const [carHeading, setCarHeading] = useState(0); // bearing in degrees (0 = north)
  const mapViewRef = useRef<MapView>(null);

  const updateRide = (patch: Partial<Ride>) =>
    setRide(r => (r ? { ...r, ...patch } : r));

  // ── Client cancels while driver is en-route ──────────────────────────────────
  useEffect(() => {
    const unsubCancel = socketService.on<RideCancelledEvent>('ride_cancelled', (e) => {
      if (e.rideId !== rideId) { return; }
      clearAll();
      Alert.alert(
        t('driver.activeRide.rideCancelledTitle'),
        e.reason ? t('driver.activeRide.rideCancelledWithReason', { reason: e.reason }) : t('driver.activeRide.rideCancelledMsg'),
        [{ text: t('common.ok'), onPress: () => navigation.replace('DriverHomeMain') }],
      );
    });

    // Incoming chat messages from client
    const unsubChat = socketService.on<WsRideMessage>('ride_message', (e) => {
      if (e.rideId !== rideId || e.fromRole !== 'client') { return; }
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

    return () => { unsubCancel(); unsubChat(); };
  }, [rideId, navigation, clearAll]);

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

  // ── Handle driver's device location updates from MapView ─────────────────────
  //
  // Two things happen on every significant move (≥ 150 m):
  //  1. Emit `gps_update` → server broadcasts `driver_location_update` to the
  //     client, which then shows the 🚕 marker moving on their map.
  //  2. Re-fetch the driver→pickup route polyline for the local map.
  const handleUserLocationChange = (e: UserLocationChangeEvent) => {
    const coord = e.nativeEvent.coordinate;
    if (!coord || !ride) return;
    const { latitude, longitude } = coord;

    const driverLatLng: LatLng = { latitude, longitude };

    // Always update the car marker position so it animates smoothly across the map
    setDriverPos(prev => {
      // Compute the bearing (direction the car is facing) from the previous point
      if (prev && (Math.abs(prev.latitude - latitude) > 1e-6 || Math.abs(prev.longitude - longitude) > 1e-6)) {
        setCarHeading(bearingDegrees(prev, driverLatLng));
      }
      return driverLatLng;
    });

    // During the ride, keep the camera centered on the moving car
    if (status === 'in_progress') {
      mapViewRef.current?.animateCamera({ center: driverLatLng }, { duration: 600 });
    }

    const lastFetch = lastDriverPosFetchRef.current;

    // Throttle network/socket calls: only act when driver has moved ≥ 150 m
    if (lastFetch && haversineKm(lastFetch, driverLatLng) < 0.15) return;
    lastDriverPosFetchRef.current = driverLatLng;

    // 1️⃣ Broadcast location to the server (→ client sees driver moving)
    socketService.emit('gps_update', {
      lat: latitude,
      lng: longitude,
      ts:  Date.now(),
    });

    // 2️⃣ Refresh driver→pickup route polyline on the local map
    const pickup: LatLng = { latitude: ride.pickupLat, longitude: ride.pickupLng };
    fetchRoute(driverLatLng, pickup, Config.GOOGLE_MAPS_API_KEY).then(pts => {
      if (pts.length) setCurrentToPickupRoute(pts);
    });
  };

  // ── Lifecycle action helpers ──────────────────────────────────────────────────
  const doAction = async (apiCall: () => Promise<{ data: Ride }>) => {
    setBusy(true);
    try {
      const { data: updated } = await apiCall();
      // Status update responses don't re-load stops — preserve them from current state
      const withStops: Ride = { ...updated, stops: ride?.stops ?? updated.stops ?? [] };
      setRide(withStops);
      setActiveRide(withStops);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('driver.activeRide.actionFailMsg');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setBusy(false);
    }
  };

  const handleEnRoute  = () => doAction(() => ridesApi.markEnRoute(rideId));
  const handleArrived  = () => doAction(() => ridesApi.markArrived(rideId));
  const handleStart    = () => doAction(() => ridesApi.startRide(rideId));

  const handleMarkStop = async (stopId: string) => {
    setMarkingStopId(stopId);
    try {
      const { data: updatedStop } = await ridesApi.markStopReached(rideId, stopId);
      setRide(r => {
        if (!r) return r;
        const updatedStops = (r.stops ?? []).map(s =>
          s.id === stopId ? { ...s, reachedAt: updatedStop.reachedAt } : s,
        );
        return { ...r, stops: updatedStops };
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('driver.activeRide.stopFailMsg');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setMarkingStopId(null);
    }
  };

  /** Opens the completion modal. Distance is no longer driver-supplied — the
   *  backend computes it from the GPS waypoints recorded during the ride. */
  const handleComplete = () => {
    setFareInput('');
    setCompleteModalVisible(true);
  };

  /** Called when driver confirms the completion modal */
  const handleConfirmComplete = async () => {
    const fare = fareInput.trim() ? parseFloat(fareInput) : undefined;

    // If driver has no tariff and gave no fare at all — warn
    if (!ride?.tariffId && fare == null) {
      Alert.alert(
        t('driver.activeRide.fareRequiredTitle'),
        t('driver.activeRide.fareRequiredMsg'),
      );
      return;
    }

    setCompleteModalVisible(false);
    setBusy(true);
    try {
      // Distance is intentionally omitted — the backend computes it from the
      // GPS waypoints recorded during the ride (more accurate than any value
      // the driver could enter manually).
      const { data: completed } = await ridesApi.completeRide(rideId, {
        totalFare: fare,
      });
      setActiveRide(completed);

      // Do NOT confirm payment here — the client chooses their payment method
      // on their PayCash screen. Cash is confirmed by a separate driver action;
      // card goes through Stripe. Calling confirmCashPayment here would skip
      // the client's payment method selection entirely.
      navigation.replace('RateClient', { rideId, rateTarget: 'client' });
    } catch (err: any) {
      Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('driver.activeRide.completeFailMsg')));
    } finally {
      setBusy(false);
    }
  };

  // ── Passenger no-show ────────────────────────────────────────────────────────
  const handlePassengerNoShow = () => {
    Alert.alert(
      t('driver.activeRide.noShowTitle'),
      t('driver.activeRide.noShowMsg'),
      [
        { text: t('driver.activeRide.noShowWait'), style: 'cancel' },
        {
          text: t('driver.activeRide.noShowReport'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await ridesApi.reportNoShow(rideId);
              clearAll();
              navigation.replace('DriverHomeMain');
            } catch (err: any) {
              Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('driver.activeRide.noShowFailMsg')));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  // ── Cancel by driver ─────────────────────────────────────────────────────────
  const handleCancelConfirm = async (reason: string) => {
    setCancelling(true);
    try {
      await ridesApi.cancelRide(rideId, { reason });
      setCancelModalVisible(false);
      clearAll();
      navigation.replace('DriverHomeMain');
    } catch (err: any) {
      Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('driver.activeRide.cancelFailMsg')));
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
    const msg: ChatMessage = { id: `${Date.now()}-me`, text, fromMe: true, ts: Date.now() };
    setMessages(prev => [...prev, msg]);
    setChatInput('');
    socketService.emit('ride_message', { rideId, text });
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  if (!ride) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{t('driver.activeRide.rideNotFound')}</Text>
        <TouchableOpacity onPress={() => navigation.replace('DriverHomeMain')}>
          <Text style={styles.linkText}>{t('common.goHome')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const status = ride.status as RideStatus;

  // Determine which action button to show
  let actionStep: ActionStep = null;
  if (status === 'accepted') {
    actionStep = { label: `🚗  ${t('driver.activeRide.stepEnRoute')}`, action: handleEnRoute, color: colors.info };
  } else if (status === 'driving_to_pickup' && !ride.pickupArrivedAt) {
    actionStep = { label: `📍  ${t('driver.activeRide.stepArrived')}`, action: handleArrived, color: colors.warning };
  } else if (status === 'driving_to_pickup' && ride.pickupArrivedAt) {
    actionStep = { label: `▶️  ${t('driver.activeRide.stepStart')}`, action: handleStart, color: colors.success };
  } else if (status === 'in_progress') {
    actionStep = { label: `🏁  ${t('driver.activeRide.stepComplete')}`, action: handleComplete, color: colors.primary };
  }

  const statusColors: Record<RideStatus, string> = {
    requested: colors.warning,
    accepted: colors.info,
    driving_to_pickup: colors.info,
    in_progress: colors.success,
    completed: colors.textSecondary,
    cancelled: colors.error,
  };

  const statusLabels: Record<RideStatus, string> = {
    requested: t('driver.activeRide.statusRequested'),
    accepted: t('driver.activeRide.statusAccepted'),
    driving_to_pickup: ride.pickupArrivedAt ? t('driver.activeRide.statusArrivedPickup') : t('driver.activeRide.statusDrivingPickup'),
    in_progress: t('driver.activeRide.statusInProgress'),
    completed: t('driver.activeRide.statusCompleted'),
    cancelled: t('driver.activeRide.statusCancelled'),
  };

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapViewRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation={false}  /* hide default blue dot — we draw our own 🚕 */
        onUserLocationChange={handleUserLocationChange}
        initialRegion={{
          latitude: ride.pickupLat,
          longitude: ride.pickupLng,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }}>
        {/* Driver position — animated car marker */}
        {driverPos && (
          <Marker
            coordinate={driverPos}
            anchor={{ x: 0.5, y: 0.5 }}
            flat              /* keep flat against the map so rotation works */
            rotation={carHeading}
            tracksViewChanges={false}  /* let the marker animate smoothly between coordinates */
          >
            <View style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: 'white',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: colors.primary,
              shadowColor: '#000', shadowOpacity: 0.3,
              shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
              elevation: 4,
            }}>
              <Text style={{ fontSize: 22 }}>🚕</Text>
            </View>
          </Marker>
        )}

        <Marker
          coordinate={{ latitude: ride.pickupLat, longitude: ride.pickupLng }}
          title={t('common.pickup')}
          pinColor={colors.primary}
        />
        {/* Intermediate stop markers */}
        {ride.stops && ride.stops.map((stop, i) => (
          <Marker
            key={stop.id}
            coordinate={{ latitude: stop.lat, longitude: stop.lng }}
            title={t('common.stop', { n: i + 1 })}
            description={stop.address ?? ''}
            pinColor={stop.reachedAt ? '#6b7280' : '#f59e0b'}
          />
        ))}

        {ride.dropoffLat != null && ride.dropoffLng != null && (
          <Marker
            coordinate={{ latitude: ride.dropoffLat, longitude: ride.dropoffLng }}
            title={t('common.dropoff')}
            pinColor={colors.info}
          />
        )}

        {/* Driver → Pickup route (while heading to pickup) */}
        {currentToPickupRoute.length > 1 &&
         (status === 'accepted' || status === 'driving_to_pickup') && (
          <Polyline
            coordinates={currentToPickupRoute}
            strokeColor="#8b5cf6"
            strokeWidth={4}
            lineDashPattern={[8, 4]}
          />
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
      </MapView>

      {/* ── Real-time taximeter — shows from acceptance (0.00) and starts
            ticking when the driver taps "Start ride" (status → in_progress). */}
      {(status === 'accepted' || status === 'driving_to_pickup' || status === 'in_progress') && (
        <Taximeter
          tariff={ride.tariffSnapshot ?? null}
          startedAt={status === 'in_progress' ? ride.startedAt : null}
          position={driverPos}
        />
      )}

      {/* ── Floating chat button ────────────────────────────────────────── */}
      {!chatOpen && (
        <TouchableOpacity
          style={styles.floatingChat}
          onPress={openChat}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? t('driver.activeRide.chatUnread', { count: unreadCount }) : t('driver.activeRide.chatLabel')}>
          <Text style={styles.floatingChatIcon}>💬</Text>
          {unreadCount > 0 && (
            <View style={styles.floatingChatBadge}>
              <Text style={styles.floatingChatBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* ── Chat overlay ────────────────────────────────────────────────── */}
      {chatOpen && (
        <KeyboardAvoidingView
          style={styles.chatOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.chatPanel}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle}>💬 {t('driver.activeRide.chatLabel')}</Text>
              <TouchableOpacity
                onPress={() => setChatOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}>
                <Text style={styles.chatClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              ref={chatScrollRef}
              style={styles.chatMessages}
              contentContainerStyle={{ paddingVertical: 8 }}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}>
              {messages.length === 0 ? (
                <Text style={styles.chatEmpty}>{t('driver.activeRide.chatEmpty')}</Text>
              ) : (
                messages.map(m => (
                  <View key={m.id} style={[styles.bubble, m.fromMe ? styles.bubbleMe : styles.bubbleThem]}>
                    <Text style={[styles.bubbleText, m.fromMe && styles.bubbleTextMe]}>{m.text}</Text>
                    <Text style={[styles.bubbleTime, m.fromMe && styles.bubbleTimeMe]}>
                      {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder={t('driver.activeRide.chatPlaceholder')}
                placeholderTextColor={colors.textDisabled}
                returnKeyType="send"
                onSubmitEditing={sendMessage}
                multiline={false}
              />
              <TouchableOpacity
                style={[styles.chatSend, !chatInput.trim() && styles.chatSendDisabled]}
                onPress={sendMessage}
                disabled={!chatInput.trim()}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('common.send')}
                accessibilityState={{ disabled: !chatInput.trim() }}>
                <Text style={styles.chatSendIcon}>➤</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

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
            <InfoRow icon="📍" label={t('common.pickup')}
              value={ride.pickupAddress ?? `${ride.pickupLat.toFixed(5)}, ${ride.pickupLng.toFixed(5)}`} />

            {/* Intermediate stops */}
            {ride.stops && ride.stops.length > 0 && (
              <>
                {ride.stops.map((stop, i) => (
                  <View key={stop.id} style={stopRowStyles.row}>
                    <View style={stopRowStyles.left}>
                      <Text style={stopRowStyles.icon}>{stop.reachedAt ? '✅' : '🟠'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={stopRowStyles.label}>{t('common.stop', { n: i + 1 })}</Text>
                        <Text style={stopRowStyles.value} numberOfLines={2}>
                          {stop.address ?? `${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}`}
                        </Text>
                        {stop.reachedAt && (
                          <Text style={stopRowStyles.reachedText}>
                            {t('driver.activeRide.stopReached', { time: new Date(stop.reachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
                          </Text>
                        )}
                      </View>
                    </View>
                    {status === 'in_progress' && !stop.reachedAt && (
                      <TouchableOpacity
                        style={[stopRowStyles.reachBtn, markingStopId === stop.id && { opacity: 0.5 }]}
                        onPress={() => handleMarkStop(stop.id)}
                        disabled={markingStopId === stop.id}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={t('driver.activeRide.markStopLabel', { n: i + 1 })}
                        accessibilityState={{ disabled: markingStopId === stop.id }}>
                        {markingStopId === stop.id
                          ? <ActivityIndicator size="small" color={colors.white} />
                          : <Text style={stopRowStyles.reachBtnText}>{t('driver.activeRide.reachedBtn')}</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </>
            )}

            {ride.dropoffLat != null && (
              <InfoRow icon="🏁" label={t('common.dropoff')}
                value={ride.dropoffAddress ?? `${ride.dropoffLat.toFixed(5)}, ${ride.dropoffLng!.toFixed(5)}`} />
            )}
          </ScrollView>

          {/* Action button */}
          {actionStep && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: actionStep.color }, busy && styles.actionBtnDisabled]}
              onPress={actionStep.action}
              disabled={busy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={actionStep.label.replace(/[^\w\s'-]/g, '').trim()}
              accessibilityState={{ disabled: busy }}>
              {busy
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.actionBtnText}>{actionStep.label}</Text>}
            </TouchableOpacity>
          )}

          {/* Passenger no-show — shown after driver has arrived but client isn't there */}
          {status === 'driving_to_pickup' && !!ride.pickupArrivedAt && (
            <TouchableOpacity
              style={[styles.noShowBtn, busy && styles.cancelBtnDisabled]}
              onPress={handlePassengerNoShow}
              disabled={busy}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('driver.activeRide.noShowReport')}>
              <Text style={styles.noShowBtnText}>🚫  {t('driver.activeRide.noShowReport')}</Text>
            </TouchableOpacity>
          )}

          {/* Cancel button — only before ride starts */}
          {(status === 'accepted' || status === 'driving_to_pickup') && (
            <TouchableOpacity
              style={[styles.cancelBtn, cancelling && styles.cancelBtnDisabled]}
              onPress={() => setCancelModalVisible(true)}
              disabled={cancelling}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('driver.activeRide.cancelRideBtn')}
              accessibilityState={{ disabled: cancelling }}>
              <Text style={styles.cancelBtnText}>
                {cancelling ? t('driver.activeRide.cancellingLabel') : t('driver.activeRide.cancelRideBtn')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      {/* SOS emergency button */}
      <SosButton rideId={rideId} />

      {/* ── Trip completion modal ────────────────────────────────────────── */}
      <Modal
        visible={completeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCompleteModalVisible(false)}>
        <KeyboardAvoidingView
          style={completeStyles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={completeStyles.card}>
            <Text style={completeStyles.title}>🏁 {t('driver.activeRide.completeModalTitle')}</Text>
            <Text style={completeStyles.subtitle}>
              {t('driver.activeRide.completeModalSubtitle')}
            </Text>

            {/* Distance is auto-computed from GPS — driver doesn't enter it */}
            <View style={completeStyles.tariffNote}>
              <Text style={completeStyles.tariffNoteText}>
                📍 Distance will be calculated automatically from your GPS route.
              </Text>
            </View>

            {/* Fare — only required when no tariff is configured */}
            {!ride?.tariffId && (
              <>
                <Text style={completeStyles.fieldLabel}>
                  {t('driver.activeRide.fareLabel')}
                </Text>
                <TextInput
                  style={completeStyles.input}
                  value={fareInput}
                  onChangeText={setFareInput}
                  placeholder={t('driver.activeRide.farePlaceholder')}
                  placeholderTextColor={colors.textDisabled}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </>
            )}

            {ride?.tariffId && (
              <View style={completeStyles.tariffNote}>
                <Text style={completeStyles.tariffNoteText}>
                  ✅ {t('driver.activeRide.tariffNote')}
                </Text>
              </View>
            )}

            <View style={completeStyles.btnRow}>
              <TouchableOpacity
                style={completeStyles.cancelBtn}
                onPress={() => setCompleteModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}>
                <Text style={completeStyles.cancelBtnText}>{t('common.back')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={completeStyles.confirmBtn}
                onPress={handleConfirmComplete}
                accessibilityRole="button"
                accessibilityLabel={t('driver.activeRide.confirmCompleteBtn')}>
                <Text style={completeStyles.confirmBtnText}>{t('driver.activeRide.confirmCompleteBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cancel reason modal */}
      <CancelRideModal
        visible={cancelModalVisible}
        role="driver"
        rideId={rideId}
        onClose={() => setCancelModalVisible(false)}
        onConfirm={handleCancelConfirm}
      />
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const colors = useColors();
  const infoStyles = useMemo(() => StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
    icon: { fontSize: 18, marginRight: 10, marginTop: 2 },
    text: { flex: 1 },
    label: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
    value: { fontSize: 14, color: colors.text, fontWeight: '500', marginTop: 2 },
  }), [colors]);
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

function getStopRowStyles(c: ColorPalette) { return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: c.border,
    gap: 6,
  },
  left:  { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 8 },
  icon:  { fontSize: 16, marginTop: 2 },
  label: { fontSize: 11, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 14, color: c.text, fontWeight: '500', marginTop: 2 },
  reachedText: { fontSize: 11, color: c.success, marginTop: 2, fontWeight: '600' },
  reachBtn: {
    backgroundColor: c.warning,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'center',
  },
  reachBtnText: { fontSize: 12, fontWeight: '700', color: c.white },
}); }

function getStyles(c: ColorPalette) { return StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 16, color: c.textSecondary, marginBottom: 12 },
  linkText: { fontSize: 15, color: c.primary, fontWeight: '700' },

  panelWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  panel: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: c.background,
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
  actionBtnText: { fontSize: 16, fontWeight: '700', color: c.white },

  noShowBtn: {
    height: 44,
    borderRadius: 12,
    backgroundColor: c.warning + '22',
    borderWidth: 1.5,
    borderColor: c.warning,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  noShowBtnText: { fontSize: 14, fontWeight: '700', color: c.warning },

  cancelBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  cancelBtnDisabled: { opacity: 0.5 },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: c.error },

  // Floating chat button
  floatingChat: {
    position: 'absolute',
    top: 60,
    right: 16,
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

  // Chat panel
  chatOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 999, elevation: 20 },
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
}); }

function getCompleteStyles(c: ColorPalette) { return StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: c.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: c.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: c.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: c.text,
    backgroundColor: c.surface,
    marginBottom: 16,
  },
  tariffNote: {
    backgroundColor: c.success + '18',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: c.success + '40',
  },
  tariffNoteText: {
    fontSize: 13,
    color: c.success,
    fontWeight: '600',
    lineHeight: 18,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: c.textSecondary,
  },
  confirmBtn: {
    flex: 2,
    height: 50,
    borderRadius: 12,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: c.textOnPrimary,
  },
}); }
