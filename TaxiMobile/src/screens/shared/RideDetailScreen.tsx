import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { ridesApi } from '../../api/rides';
import type { Ride, RideStatus } from '../../types/api';
import { useTranslation } from '../../i18n';

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(date: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    ...opts,
  });
}

function fmtTime(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function money(val: number | null | undefined): string {
  if (val == null) return '—';
  return `$${Number(val).toFixed(2)}`;
}

function distance(val: number | null | undefined): string {
  if (val == null) return '—';
  return `${Number(val).toFixed(2)} km`;
}

function duration(val: number | null | undefined): string {
  if (val == null) return '—';
  const m = Math.round(Number(val));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}min`;
}

// ── Receipt builder ───────────────────────────────────────────────────────────

const LINE = '─────────────────────────────';

function buildReceiptText(ride: Ride): string {
  const date = ride.completedAt
    ? new Date(ride.completedAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : new Date(ride.createdAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });

  const lines: string[] = [
    '🚕  TaxiApp — Ride Receipt',
    LINE,
    `Ride ID:  #${ride.id.slice(0, 8).toUpperCase()}`,
    `Date:     ${date}`,
    '',
  ];

  if (ride.pickupAddress || ride.dropoffAddress || (ride.stops && ride.stops.length > 0)) {
    lines.push('Route');
    if (ride.pickupAddress) lines.push(`  📍 From: ${ride.pickupAddress}`);
    if (ride.stops && ride.stops.length > 0) {
      ride.stops.forEach((s, i) => {
        lines.push(`  🟠 Stop ${i + 1}: ${s.address ?? `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`}`);
      });
    }
    if (ride.dropoffAddress) lines.push(`  🏁 To:   ${ride.dropoffAddress}`);
    lines.push('');
  }

  if (ride.distanceKm != null || ride.durationMinutes != null) {
    if (ride.distanceKm != null)     lines.push(`Distance:  ${Number(ride.distanceKm).toFixed(2)} km`);
    if (ride.durationMinutes != null) {
      const m = Math.round(Number(ride.durationMinutes));
      const dur = m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}min`;
      lines.push(`Duration:  ${dur}`);
    }
    lines.push('');
  }

  if (ride.totalFare != null) {
    lines.push('Fare Breakdown');
    if (ride.baseFare     != null) lines.push(`  Base fare:      $${Number(ride.baseFare).toFixed(2)}`);
    if (ride.distanceFare != null) lines.push(`  Distance fare:  $${Number(ride.distanceFare).toFixed(2)}`);
    if (ride.timeFare     != null) lines.push(`  Time fare:      $${Number(ride.timeFare).toFixed(2)}`);
    if (ride.promoCode && ride.discountAmount != null) {
      lines.push(`  Promo (${ride.promoCode}):  −$${Number(ride.discountAmount).toFixed(2)}`);
    }
    lines.push(LINE);
    lines.push(`  Total paid:      $${Number(ride.totalFare).toFixed(2)}`);
    lines.push('');
  }

  lines.push('Payment:  ' + (ride.paymentStatus === 'paid' ? '✓ Paid' : ride.paymentStatus));
  lines.push('');
  lines.push(LINE);
  lines.push('Thank you for riding with TaxiApp!');

  return lines.join('\n');
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  route: { params: { ride: Ride } };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RideDetailScreen({ route }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const { ride } = route.params;
  const navigation = useNavigation();

  const STATUS_LABEL: Record<RideStatus, string> = {
    requested:         t('shared.rideDetail.statusRequested'),
    accepted:          t('shared.rideDetail.statusAccepted'),
    driving_to_pickup: t('shared.rideDetail.statusEnRoute'),
    in_progress:       t('shared.rideDetail.statusInProgress'),
    completed:         t('shared.rideDetail.statusCompleted'),
    cancelled:         t('shared.rideDetail.statusCancelled'),
  };

  const STATUS_COLOR: Record<RideStatus, string> = {
    requested:         colors.warning,
    accepted:          colors.info,
    driving_to_pickup: colors.info,
    in_progress:       colors.success,
    completed:         colors.textSecondary,
    cancelled:         colors.error,
  };

  // Local status tracks changes made on this screen (e.g. cancellation)
  const [currentStatus, setCurrentStatus] = useState<RideStatus>(ride.status as RideStatus);
  const [cancelling,    setCancelling]    = useState(false);
  const [sharing,       setSharing]       = useState(false);

  const status = currentStatus;
  const isCompleted = status === 'completed';
  const isCancelled = status === 'cancelled';

  /**
   * A scheduled booking can be cancelled if it's still in REQUESTED status
   * (i.e. no driver has been assigned yet).
   */
  const isCancellableBooking =
    currentStatus === 'requested' && ride.scheduledAt != null;

  const handleShareReceipt = async () => {
    setSharing(true);
    try {
      const message = buildReceiptText(ride);
      await Share.share({
        message,
        ...(Platform.OS === 'ios' && { subject: `TaxiApp Receipt — #${ride.id.slice(0, 8).toUpperCase()}` }),
      });
    } catch {
      // User dismissed the share sheet — no error needed
    } finally {
      setSharing(false);
    }
  };

  const handleCancelBooking = () => {
    Alert.alert(
      t('shared.rideDetail.cancelTitle'),
      `${t('shared.rideHistory.cancelMsg')}\n\n📅 ${fmt(ride.scheduledAt)}\n\nThis action cannot be undone.`,
      [
        { text: t('shared.rideDetail.keepBookingBtn'), style: 'cancel' },
        {
          text: t('shared.rideDetail.yesCancelBtn'),
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await ridesApi.cancelRide(ride.id, { reason: 'Cancelled by client' });
              setCurrentStatus('cancelled');
              Alert.alert(
                t('shared.rideDetail.cancelledTitle'),
                t('shared.rideDetail.cancelledMsg'),
                [{ text: t('common.ok'), onPress: () => navigation.goBack() }],
              );
            } catch (err: any) {
              const msg = err?.response?.data?.message ?? t('shared.rideHistory.cancelError');
              Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Back header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back to ride history">
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>{t('shared.rideDetail.backBtn')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('shared.rideDetail.title')}</Text>
        {/* Share receipt — visible only for completed paid rides */}
        {isCompleted && ride.totalFare != null ? (
          <TouchableOpacity
            onPress={handleShareReceipt}
            disabled={sharing}
            style={styles.shareBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Share ride receipt">
            {sharing
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={styles.shareBtnText}>{t('shared.rideDetail.shareBtn')}</Text>}
          </TouchableOpacity>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Status & date ─────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View style={[styles.badge, { backgroundColor: STATUS_COLOR[status] + '22' }]}>
              <Text style={[styles.badgeText, { color: STATUS_COLOR[status] }]}>
                {STATUS_LABEL[status]}
              </Text>
            </View>
            {ride.paymentStatus === 'paid' && (
              <View style={[styles.badge, { backgroundColor: colors.successLight }]}>
                <Text style={[styles.badgeText, { color: colors.success }]}>💵 Paid</Text>
              </View>
            )}
          </View>
          <Text style={styles.dateText}>{fmt(ride.createdAt)}</Text>
        </View>

        {/* ── Scheduled booking info + cancel ──────────────────────────────── */}
        {ride.scheduledAt && (
          <View style={[styles.card, isCancellableBooking ? styles.scheduledCard : undefined]}>
            <SectionTitle styles={styles}>{t('shared.rideDetail.scheduledBadge')}</SectionTitle>
            <View style={styles.scheduledDateRow}>
              <Text style={styles.scheduledDateIcon}>🗓</Text>
              <View>
                <Text style={styles.scheduledDateMain}>
                  {new Date(ride.scheduledAt).toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </Text>
                <Text style={styles.scheduledDateTime}>
                  {new Date(ride.scheduledAt).toLocaleTimeString('en-US', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>

            {isCancellableBooking && (
              <TouchableOpacity
                style={[styles.cancelBookingBtn, cancelling && styles.cancelBookingBtnDisabled]}
                onPress={handleCancelBooking}
                disabled={cancelling}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Cancel this scheduled booking"
                accessibilityState={{ disabled: cancelling }}>
                {cancelling ? (
                  <ActivityIndicator color={colors.error} size="small" />
                ) : (
                  <Text style={styles.cancelBookingBtnText}>✕  {t('shared.rideDetail.cancelBookingBtn')}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Route ─────────────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <SectionTitle styles={styles}>{t('shared.rideDetail.routeSection')}</SectionTitle>

          <View style={styles.routeBlock}>
            {/* Pickup */}
            <View style={styles.routeRow}>
              <View style={styles.routeIconCol}>
                <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
                <View style={styles.routeLine} />
              </View>
              <View style={styles.routeTextCol}>
                <Text style={styles.routeLabel}>{t('shared.rideDetail.pickup')}</Text>
                <Text style={styles.routeAddr}>
                  {ride.pickupAddress ?? `${ride.pickupLat.toFixed(5)}, ${ride.pickupLng.toFixed(5)}`}
                </Text>
              </View>
            </View>

            {/* Intermediate stops */}
            {ride.stops && ride.stops.length > 0 && ride.stops.map((stop, i) => (
              <View key={stop.id} style={styles.routeRow}>
                <View style={styles.routeIconCol}>
                  <View style={[styles.routeDot, { backgroundColor: colors.warning ?? colors.primary }]} />
                  <View style={styles.routeLine} />
                </View>
                <View style={styles.routeTextCol}>
                  <Text style={styles.routeLabel}>
                    {t('shared.rideDetail.stop', { n: i + 1 })}{stop.reachedAt ? ' · ✓' : ''}
                  </Text>
                  <Text style={styles.routeAddr}>
                    {stop.address ?? `${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}`}
                  </Text>
                </View>
              </View>
            ))}

            {/* Dropoff */}
            <View style={styles.routeRow}>
              <View style={styles.routeIconCol}>
                <View style={[styles.routeDot, { backgroundColor: colors.info }]} />
              </View>
              <View style={styles.routeTextCol}>
                <Text style={styles.routeLabel}>{t('shared.rideDetail.dropoff')}</Text>
                <Text style={styles.routeAddr}>
                  {ride.dropoffAddress
                    ?? (ride.dropoffLat != null
                      ? `${ride.dropoffLat.toFixed(5)}, ${ride.dropoffLng!.toFixed(5)}`
                      : t('shared.rideDetail.notRecorded'))}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Trip metrics ──────────────────────────────────────────────────── */}
        {(ride.distanceKm != null || ride.durationMinutes != null) && (
          <View style={styles.card}>
            <SectionTitle styles={styles}>{t('shared.rideDetail.tripSection')}</SectionTitle>
            <View style={styles.metricsRow}>
              <MetricBox icon="📍" label={t('shared.rideDetail.distanceLabel')} value={distance(ride.distanceKm)} styles={styles} />
              <MetricBox icon="⏱️" label={t('shared.rideDetail.durationLabel')} value={duration(ride.durationMinutes)} styles={styles} />
            </View>
          </View>
        )}

        {/* ── Fare breakdown ────────────────────────────────────────────────── */}
        {isCompleted && ride.totalFare != null && (
          <View style={styles.card}>
            <SectionTitle styles={styles}>{t('shared.rideDetail.fareLabel')}</SectionTitle>

            {ride.baseFare != null && (
              <FareRow label={t('shared.rideDetail.baseFare')}     value={money(ride.baseFare)} styles={styles} />
            )}
            {ride.distanceFare != null && (
              <FareRow label={t('shared.rideDetail.distanceFare')} value={money(ride.distanceFare)} styles={styles} />
            )}
            {ride.timeFare != null && (
              <FareRow label={t('shared.rideDetail.timeFare')}     value={money(ride.timeFare)} styles={styles} />
            )}
            {ride.promoCode && ride.discountAmount != null && (
              <FareRow
                label={`🏷️ Promo (${ride.promoCode})`}
                value={`−${money(ride.discountAmount)}`}
                green
                styles={styles}
              />
            )}

            <View style={styles.fareDivider} />
            <View style={styles.fareTotalRow}>
              <Text style={styles.fareTotalLabel}>{t('shared.rideDetail.totalPaid')}</Text>
              <Text style={styles.fareTotalValue}>{money(ride.totalFare)}</Text>
            </View>

            {/* Share receipt CTA inside the card */}
            <TouchableOpacity
              style={[styles.shareReceiptBtn, sharing && { opacity: 0.6 }]}
              onPress={handleShareReceipt}
              disabled={sharing}
              activeOpacity={0.8}>
              {sharing
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={styles.shareReceiptBtnText}>📤  {t('shared.rideDetail.shareReceipt')}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Cancellation reason ───────────────────────────────────────────── */}
        {isCancelled && ride.cancelReason && (
          <View style={[styles.card, styles.cancelCard]}>
            <SectionTitle styles={styles}>{t('shared.rideDetail.cancellationSection')}</SectionTitle>
            <InfoRow label={t('shared.rideDetail.cancelledBy')} value={ride.cancelledBy === 'client' ? t('shared.rideDetail.cancelledByPassenger') : t('shared.rideDetail.cancelledByDriver')} styles={styles} />
            <InfoRow label={t('shared.rideDetail.reasonLabel')} value={ride.cancelReason} styles={styles} />
          </View>
        )}

        {/* ── Ratings ───────────────────────────────────────────────────────── */}
        {isCompleted && (ride.clientRating != null || ride.driverRating != null) && (
          <View style={styles.card}>
            <SectionTitle styles={styles}>{t('shared.rideDetail.ratingsSection')}</SectionTitle>
            {ride.driverRating != null && (
              <>
                <InfoRow
                  label={t('shared.rideDetail.driverRated')}
                  value={`${'⭐'.repeat(Math.round(ride.driverRating))} ${ride.driverRating.toFixed(1)}`}
                  styles={styles}
                />
                {ride.driverReview ? (
                  <Text style={styles.reviewText}>"{ride.driverReview}"</Text>
                ) : null}
              </>
            )}
            {ride.clientRating != null && (
              <>
                <InfoRow
                  label={t('shared.rideDetail.passengerRated')}
                  value={`${'⭐'.repeat(Math.round(ride.clientRating))} ${ride.clientRating.toFixed(1)}`}
                  styles={styles}
                />
                {ride.clientReview ? (
                  <Text style={styles.reviewText}>"{ride.clientReview}"</Text>
                ) : null}
              </>
            )}
          </View>
        )}

        {/* ── Timeline ──────────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <SectionTitle styles={styles}>{t('shared.rideDetail.timelineSection')}</SectionTitle>
          <TimelineRow label={t('shared.rideDetail.timelineRequested')}  time={fmtTime(ride.createdAt)} active styles={styles} colors={colors} />
          <TimelineRow label={t('shared.rideDetail.timelineAccepted')}   time={fmtTime(ride.acceptedAt)}        active={ride.acceptedAt != null} styles={styles} colors={colors} />
          <TimelineRow label={t('shared.rideDetail.timelineArrived')}    time={fmtTime(ride.pickupArrivedAt)}   active={ride.pickupArrivedAt != null} styles={styles} colors={colors} />
          <TimelineRow label={t('shared.rideDetail.timelineStarted')}    time={fmtTime(ride.startedAt)}         active={ride.startedAt != null} styles={styles} colors={colors} />
          {isCompleted && (
            <TimelineRow label={t('shared.rideDetail.timelineCompleted')} time={fmtTime(ride.completedAt)}      active={ride.completedAt != null} last styles={styles} colors={colors} />
          )}
          {isCancelled && (
            <TimelineRow label={t('shared.rideDetail.timelineCancelled')} time={fmtTime(ride.cancelledAt)}      active={ride.cancelledAt != null} last error styles={styles} colors={colors} />
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

type StylesType = ReturnType<typeof getStyles>;

function SectionTitle({ children, styles }: { children: React.ReactNode; styles: StylesType }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function InfoRow({ label, value, styles }: { label: string; value: string; styles: StylesType }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function FareRow({ label, value, green, styles }: { label: string; value: string; green?: boolean; styles: StylesType }) {
  return (
    <View style={styles.fareRow}>
      <Text style={[styles.fareLabel, green && styles.fareGreen]}>{label}</Text>
      <Text style={[styles.fareValue, green && styles.fareGreen]}>{value}</Text>
    </View>
  );
}

function MetricBox({ icon, label, value, styles }: { icon: string; label: string; value: string; styles: StylesType }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricIcon}>{icon}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function TimelineRow({
  label, time, active, last, error, styles, colors,
}: {
  label: string; time: string; active?: boolean; last?: boolean; error?: boolean;
  styles: StylesType; colors: ColorPalette;
}) {
  const dotColor = !active ? colors.border : error ? colors.error : colors.success;
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineIconCol}>
        <View style={[styles.timelineDot, { backgroundColor: dotColor, borderColor: dotColor }]} />
        {!last && <View style={[styles.timelineConnector, { backgroundColor: active ? colors.border : colors.border }]} />}
      </View>
      <View style={styles.timelineTextCol}>
        <Text style={[styles.timelineLabel, !active && styles.timelineInactive]}>{label}</Text>
        <Text style={[styles.timelineTime, !active && styles.timelineInactive]}>{time}</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Sizes.screenPadding,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    backBtn: { flexDirection: 'row', alignItems: 'center', width: 64 },
    backArrow: { fontSize: 28, color: c.text, lineHeight: 32, marginRight: 2 },
    backLabel: { fontSize: 15, color: c.text, fontWeight: '600' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: c.text },
    shareBtn: { width: 64, alignItems: 'flex-end' },
    shareBtnText: { fontSize: 15, fontWeight: '700', color: c.primary },

    // Scroll
    scroll: { padding: Sizes.screenPadding, paddingTop: 16 },

    // Cards
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 16,
    },
    cancelCard: { borderColor: c.error + '55' },

    sectionTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 12,
    },

    // Status row
    statusRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    badgeText: { fontSize: 12, fontWeight: '700' },
    dateText: { fontSize: 13, color: c.textSecondary },

    // Route
    routeBlock: { gap: 0 },
    routeRow: { flexDirection: 'row', minHeight: 48 },
    routeIconCol: { width: 24, alignItems: 'center', paddingTop: 4 },
    routeDot: { width: 10, height: 10, borderRadius: 5 },
    routeLine: { flex: 1, width: 2, backgroundColor: c.border, marginTop: 4, marginBottom: 4 },
    routeTextCol: { flex: 1, paddingLeft: 12, paddingBottom: 8 },
    routeLabel: { fontSize: 11, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
    routeAddr: { fontSize: 14, color: c.text, fontWeight: '500', marginTop: 2 },

    // Metrics
    metricsRow: { flexDirection: 'row', gap: 12 },
    metricBox: {
      flex: 1,
      backgroundColor: c.surfaceAlt,
      borderRadius: 12,
      padding: 14,
      alignItems: 'center',
    },
    metricIcon: { fontSize: 22, marginBottom: 4 },
    metricValue: { fontSize: 18, fontWeight: '800', color: c.text },
    metricLabel: { fontSize: 11, color: c.textSecondary, fontWeight: '600', marginTop: 2 },

    // Fare
    fareRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    fareLabel:  { fontSize: 14, color: c.textSecondary },
    fareValue:  { fontSize: 14, color: c.text, fontWeight: '600' },
    fareGreen:  { color: c.success, fontWeight: '700' },
    fareDivider: { height: 1, backgroundColor: c.border, marginVertical: 4 },
    fareTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
    fareTotalLabel: { fontSize: 16, fontWeight: '800', color: c.text },
    fareTotalValue: { fontSize: 18, fontWeight: '800', color: c.text },

    shareReceiptBtn: {
      marginTop: 16,
      height: 44,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shareReceiptBtnText: { fontSize: 14, fontWeight: '700', color: c.primary },

    // Info rows
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    infoLabel: { fontSize: 13, color: c.textSecondary, fontWeight: '600' },
    infoValue: { fontSize: 13, color: c.text, fontWeight: '500', maxWidth: '55%', textAlign: 'right' },

    reviewText: {
      fontSize: 13,
      color: c.textSecondary,
      fontStyle: 'italic',
      marginTop: 4,
      marginBottom: 6,
      paddingLeft: 4,
    },

    // Scheduled booking card
    scheduledCard: {
      borderColor: c.primary + '55',
    },
    scheduledDateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 14,
    },
    scheduledDateIcon: { fontSize: 28 },
    scheduledDateMain: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    scheduledDateTime: {
      fontSize: 22,
      fontWeight: '800',
      color: c.primary,
      marginTop: 2,
    },
    cancelBookingBtn: {
      height: 48,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.error,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelBookingBtnDisabled: { opacity: 0.5 },
    cancelBookingBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.error,
    },

    // Timeline
    timelineRow: { flexDirection: 'row', minHeight: 44 },
    timelineIconCol: { width: 24, alignItems: 'center' },
    timelineDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      marginTop: 4,
    },
    timelineConnector: { flex: 1, width: 2, marginTop: 2, marginBottom: 2 },
    timelineTextCol: { flex: 1, paddingLeft: 12, paddingBottom: 8 },
    timelineLabel: { fontSize: 14, fontWeight: '600', color: c.text },
    timelineTime: { fontSize: 12, color: c.textSecondary, marginTop: 1 },
    timelineInactive: { color: c.textDisabled },
  });
}
