/**
 * Taximeter — real-time running fare display.
 *
 * Reads:
 *   - tariff snapshot (from the Ride object)
 *   - the ride's startedAt timestamp (when in_progress) OR acceptedAt (preview)
 *   - a stream of GPS coordinates so it can accumulate distance
 *
 * Formula (matches the backend's completeRide() calc):
 *   raw  = baseFare + (distanceKm × perKmRate) + (durationMin × perMinuteRate)
 *   fare = max(raw, minimumFare) × surgeMultiplier
 *
 * Updates every second so the displayed value ticks like a real taxi meter.
 * The component itself doesn't fetch GPS — the parent screen passes positions
 * in via the `position` prop. The parent is responsible for the GPS plumbing
 * (which differs between client and driver screens).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ColorPalette } from '../constants/colors';
import { useColors } from '../stores/themeStore';

export interface TariffSnapshot {
  baseFare:        number;
  perKmRate:       number;
  perMinuteRate:   number;
  minimumFare:     number;
  surgeMultiplier: number;
  name:            string;
}

export interface LatLng { latitude: number; longitude: number }

interface Props {
  /** Tariff rates locked for this ride. Hides the meter if null. */
  tariff: TariffSnapshot | null;
  /** When the meter started counting time. Usually ride.startedAt. */
  startedAt: Date | string | null;
  /** Latest GPS position. Pass undefined to keep last known. */
  position?: LatLng | null;
  /** Currency symbol — defaults to $. */
  currency?: string;
  /** Reports the running fare upward (e.g. so a parent can preview it in a
   *  completion modal). Fires whenever the computed fare changes. */
  onFareChange?: (fare: number) => void;
}

const EARTH_KM = 6371;
function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude  - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export default function Taximeter({
  tariff,
  startedAt,
  position,
  currency = '$',
  onFareChange,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  // ── Distance tracking — accumulate haversine between consecutive points ────
  // Only starts accumulating once `startedAt` is set (ride actually started).
  // Before that we still observe `position` so we have a "last known" anchor
  // when the ride begins, but we don't add to the total — otherwise the driver
  // driving toward the pickup would inflate the trip distance.
  const lastPosRef    = useRef<LatLng | null>(null);
  const distanceRef   = useRef(0); // km
  const [distanceKm, setDistanceKm] = useState(0);

  // Reset accumulated distance the moment the ride transitions to "running".
  useEffect(() => {
    if (startedAt) {
      distanceRef.current = 0;
      setDistanceKm(0);
    }
  }, [startedAt]);

  useEffect(() => {
    if (!position) return;
    const last = lastPosRef.current;
    if (last && startedAt) {
      const d = haversineKm(last, position);
      // Ignore tiny jitter (<5 m) and impossible jumps (>2 km in one update)
      if (d >= 0.005 && d <= 2) {
        distanceRef.current += d;
        setDistanceKm(distanceRef.current);
      }
    }
    lastPosRef.current = position;
  }, [position, startedAt]);

  // ── 1-second ticker to keep the time component fresh ───────────────────────
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Until the driver taps "Start ride" (startedAt is null) we still show the
  // meter UI, but at 0.00 km / 00:00 / fare = 0.00. This lets the passenger
  // and driver see the meter is armed and ready before the trip begins.
  // Computed BEFORE the no-tariff early return below so the fare-reporting
  // effect stays an unconditional hook.
  const isRunning = !!startedAt;
  const startMs = isRunning
    ? (typeof startedAt === 'string' ? new Date(startedAt as string).getTime() : (startedAt as Date).getTime())
    : nowMs;
  const elapsedMin = isRunning ? Math.max(0, (nowMs - startMs) / 60_000) : 0;
  const liveDistanceKm = isRunning ? distanceKm : 0;

  const fare = (tariff && isRunning)
    ? Math.max(
        tariff.baseFare +
          liveDistanceKm * tariff.perKmRate +
          elapsedMin     * tariff.perMinuteRate,
        tariff.minimumFare,
      ) * (tariff.surgeMultiplier ?? 1)
    : 0;

  // Report the running fare upward so parents can preview it (e.g. the driver's
  // completion modal). Runs each tick while the meter is live.
  useEffect(() => {
    onFareChange?.(fare);
  }, [fare, onFareChange]);

  // Hide entirely if no tariff is configured — nothing to display.
  if (!tariff) return null;

  // Format minutes as mm:ss for a real-meter feel.
  const totalSec = isRunning ? Math.floor((nowMs - startMs) / 1000) : 0;
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.row}>
        <Text style={styles.label}>{isRunning ? 'FARE' : 'FARE • WAITING'}</Text>
        <Text style={styles.fare}>{currency}{fare.toFixed(2)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>📏 {liveDistanceKm.toFixed(2)} km</Text>
        <Text style={styles.meta}>⏱ {mm}:{ss}</Text>
      </View>
      {/* Driver's tariff rates — visible from acceptance so the passenger
          knows the pricing before the trip starts. */}
      <View style={styles.tariffBlock}>
        <Text style={styles.tariffName} numberOfLines={1}>{tariff.name}</Text>
        <Text style={styles.tariffRates}>
          {currency}{tariff.baseFare.toFixed(2)} + {currency}{tariff.perKmRate.toFixed(2)}/km + {currency}{tariff.perMinuteRate.toFixed(2)}/min
        </Text>
        <Text style={styles.tariffRates}>
          min {currency}{tariff.minimumFare.toFixed(2)}
          {tariff.surgeMultiplier > 1 ? `  •  ×${tariff.surgeMultiplier}` : ''}
        </Text>
      </View>
    </View>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      top: 80,
      alignSelf: 'center',
      backgroundColor: '#111827',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
      minWidth: 160,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 12,
    },
    label: {
      fontSize: 11,
      color: '#9ca3af',
      fontWeight: '700',
      letterSpacing: 1.5,
    },
    fare: {
      fontSize: 22,
      color: c.warning ?? '#fbbf24', // amber, like a classic taxi meter LED
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    meta: {
      fontSize: 11,
      color: '#d1d5db',
      fontVariant: ['tabular-nums'],
    },
    tariffBlock: {
      marginTop: 6,
      paddingTop: 5,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: '#374151',
    },
    tariffName: {
      fontSize: 10,
      color: '#9ca3af',
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    tariffRates: {
      fontSize: 10,
      color: '#d1d5db',
      fontVariant: ['tabular-nums'],
      marginTop: 1,
    },
  });
}
