import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { MAP_PROVIDER } from '../../utils/mapProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRideStore } from '../../stores/rideStore';
import { ridesApi } from '../../api/rides';
import { useColors } from '../../stores/themeStore';
import { useTranslation } from '../../i18n';
import type { ColorPalette } from '../../constants/colors';
import type { DriverStackScreenProps } from '../../navigation/types';

type Props = DriverStackScreenProps<'IncomingRequest'>;

const TIMEOUT_SECONDS = 55; // Backend pending key TTL is 60 s; give 5 s margin

export default function IncomingRequestScreen({ navigation, route }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const { rideId } = route.params;
  const { incomingRequest, setIncomingRequest, setActiveRide } = useRideStore();

  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [countdown, setCountdown] = useState(TIMEOUT_SECONDS);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Countdown — auto-decline when time runs out ──────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          handleDecline(true); // auto-decline
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // ── Accept ───────────────────────────────────────────────────────────────────
  const handleAccept = async () => {
    stopTimer();
    setAccepting(true);
    try {
      const { data: ride } = await ridesApi.acceptRide(rideId);
      setActiveRide(ride);
      setIncomingRequest(null);
      navigation.replace('ActiveDriverRide', { rideId });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('driver.incomingRequest.acceptFailMsg');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
      setIncomingRequest(null);
      navigation.goBack();
    } finally {
      setAccepting(false);
    }
  };

  // ── Decline ──────────────────────────────────────────────────────────────────
  const handleDecline = async (auto = false) => {
    stopTimer();
    if (!auto) setDeclining(true);
    try {
      await ridesApi.declineRide(rideId);
    } catch {
      // best-effort
    } finally {
      setIncomingRequest(null);
      setDeclining(false);
      navigation.goBack();
    }
  };

  const req = incomingRequest;

  // Progress ring colour
  const urgentColor =
    countdown <= 10 ? colors.error : countdown <= 25 ? colors.warning : colors.success;

  return (
    <View style={styles.container}>
      {/* Map preview */}
      {req ? (
        <MapView
          style={styles.map}
          provider={MAP_PROVIDER}
          initialRegion={{
            latitude: req.pickupLat,
            longitude: req.pickupLng,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          }}
          scrollEnabled={false}
          zoomEnabled={false}>
          <Marker
            coordinate={{ latitude: req.pickupLat, longitude: req.pickupLng }}
            title={t('common.pickup')}
            pinColor={colors.primary}
          />
          {/* Intermediate stop markers */}
          {req.stops && req.stops.map((stop, i) => (
            <Marker
              key={stop.id}
              coordinate={{ latitude: stop.lat, longitude: stop.lng }}
              title={t('common.stop', { n: i + 1 })}
              description={stop.address ?? ''}
              pinColor="#f59e0b"
            />
          ))}
          {req.dropoffLat != null && req.dropoffLng != null && (
            <Marker
              coordinate={{ latitude: req.dropoffLat, longitude: req.dropoffLng }}
              title={t('common.dropoff')}
              pinColor={colors.info}
            />
          )}
        </MapView>
      ) : (
        <View style={[styles.map, styles.mapFallback]}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      )}

      {/* Bottom panel */}
      <SafeAreaView edges={['bottom']} style={styles.panelWrap}>
        <View style={styles.panel}>
          {/* Countdown */}
          <View style={styles.countdownRow}>
            <Text style={styles.countdownLabel}>{t('driver.incomingRequest.respondIn')}</Text>
            <Text style={[styles.countdownValue, { color: urgentColor }]}>
              {countdown}s
            </Text>
          </View>

          <Text style={styles.title}>{t('driver.incomingRequest.title')}</Text>

          {req && (
            <View style={styles.locations}>
              <LocationRow icon="📍" label={t('common.pickup')} value={req.pickupAddress ?? `${req.pickupLat.toFixed(4)}, ${req.pickupLng.toFixed(4)}`} />
              {/* Intermediate stops */}
              {req.stops && req.stops.length > 0 && req.stops.map((stop, i) => (
                <LocationRow
                  key={stop.id}
                  icon="🟠"
                  label={t('common.stop', { n: i + 1 })}
                  value={stop.address ?? `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`}
                />
              ))}
              {req.dropoffLat != null && (
                <LocationRow icon="🏁" label={t('common.dropoff')} value={req.dropoffAddress ?? `${req.dropoffLat!.toFixed(4)}, ${req.dropoffLng!.toFixed(4)}`} />
              )}
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnDecline, declining && styles.btnDisabled]}
              onPress={() => handleDecline(false)}
              disabled={declining || accepting}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('driver.incomingRequest.declineBtn')}
              accessibilityState={{ disabled: declining || accepting }}>
              {declining
                ? <ActivityIndicator color={colors.error} />
                : <Text style={[styles.btnText, styles.btnTextDecline]}>{t('driver.incomingRequest.declineBtn')}</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnAccept, accepting && styles.btnDisabled]}
              onPress={handleAccept}
              disabled={accepting || declining}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('driver.incomingRequest.acceptBtn')}
              accessibilityState={{ disabled: accepting || declining }}>
              {accepting
                ? <ActivityIndicator color={colors.textOnPrimary} />
                : <Text style={styles.btnText}>{t('driver.incomingRequest.acceptBtn')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function LocationRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const colors = useColors();
  const locStyles = useMemo(() => StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    icon: { fontSize: 16, marginRight: 10, marginTop: 2 },
    info: { flex: 1 },
    label: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
    value: { fontSize: 14, color: colors.text, fontWeight: '500', marginTop: 2 },
  }), [colors]);
  return (
    <View style={locStyles.row}>
      <Text style={locStyles.icon}>{icon}</Text>
      <View style={locStyles.info}>
        <Text style={locStyles.label}>{label}</Text>
        <Text style={locStyles.value} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

function getStyles(c: ColorPalette) { return StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  mapFallback: { backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },

  panelWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  panel: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: c.background,
    borderRadius: 20,
    padding: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },

  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  countdownLabel: { fontSize: 13, color: c.textSecondary, fontWeight: '600' },
  countdownValue: { fontSize: 22, fontWeight: '800' },

  title: { fontSize: 20, fontWeight: '800', color: c.text, marginBottom: 14 },

  locations: { marginBottom: 16 },

  btnRow: { flexDirection: 'row', gap: 12 },
  btn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.55 },
  btnAccept: { backgroundColor: c.primary },
  btnDecline: {
    backgroundColor: c.transparent,
    borderWidth: 2,
    borderColor: c.error,
  },
  btnText: { fontSize: 16, fontWeight: '700', color: c.textOnPrimary },
  btnTextDecline: { color: c.error },
}); }
