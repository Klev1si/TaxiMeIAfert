/**
 * PayCashScreen — Payment method selection after ride completion.
 *
 * Supports three flows:
 *   • Cash        — shows fare summary, waits for driver's WS "payment_confirmed" event.
 *   • Card (sheet)— Stripe payment sheet (standard flow, no saved card).
 *   • Saved card  — server-side auto-charge; no sheet needed unless 3-D Secure fires.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Share,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePaymentSheet } from '@stripe/stripe-react-native';
import { useRideStore } from '../../stores/rideStore';
import { socketService } from '../../services/socket';
import { paymentsApi, type SavedPaymentMethod } from '../../api/payments';
import { ridesApi } from '../../api/rides';
import { track } from '../../services/analytics';
import { crash } from '../../services/crashlytics';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import { useTranslation } from '../../i18n';
import { isStripeConfigured, cardPaymentsEnabled } from '../../config';
import type { ColorPalette } from '../../constants/colors';
import type { WsPaymentConfirmed } from '../../types/api';
import type { ClientStackScreenProps } from '../../navigation/types';

type Props = ClientStackScreenProps<'PayCash'>;
type PayMethod = 'cash' | 'card' | 'saved_card';
type CardState =
  | 'idle'
  | 'creating_intent'
  | 'awaiting_sheet'
  | 'processing'
  | 'success'
  | 'failed';

export default function PayCashScreen({ navigation, route }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const { rideId }               = route.params;
  const { activeRide: activeRideFromStore, clearAll } = useRideStore();

  // Keep a snapshot so the summary stays visible after clearAll() is called
  const rideSnapshotRef = useRef(activeRideFromStore);
  if (activeRideFromStore) rideSnapshotRef.current = activeRideFromStore;
  const activeRide = rideSnapshotRef.current;

  const [method,      setMethod]      = useState<PayMethod>('cash');
  const [confirmed,   setConfirmed]   = useState(false);
  const [cardState,   setCardState]   = useState<CardState>('idle');
  const [cardError,   setCardError]   = useState<string | null>(null);
  const [sharing,     setSharing]     = useState(false);

  // Saved cards
  const [savedCards,     setSavedCards]     = useState<SavedPaymentMethod[]>([]);
  const [selectedCard,   setSelectedCard]   = useState<SavedPaymentMethod | null>(null);
  const [loadingCards,   setLoadingCards]   = useState(true);

  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  // ── Track screen view ────────────────────────────────────────────────────────
  useEffect(() => {
    track.screen('PayCash');
    track.paymentScreenViewed(rideId);
  }, [rideId]);

  // ── Fallback: fetch ride from server when totalFare is missing ─────────────
  // The 'ride_completed' WS event might race ahead of the DB save, OR the
  // client may have opened this screen via a cold-start FCM tap with an empty
  // store. In either case we fetch the canonical ride from the server so the
  // amount-due card always has the real total to display.
  const [fetchedRide, setFetchedRide] = useState<typeof activeRideFromStore>(null);
  useEffect(() => {
    // Skip the fetch only if the snapshot already has a totalFare
    if (rideSnapshotRef.current?.totalFare != null) return;
    ridesApi.getActiveRide()
      .then(({ data }) => { if (data && data.id === rideId) setFetchedRide(data); })
      .catch(() => { /* non-fatal — UI will gracefully show "Fare not finalized yet…" */ });
  }, [rideId]);
  // Prefer fetched data if it has a fare and the snapshot doesn't
  if (fetchedRide && (rideSnapshotRef.current?.totalFare == null)) {
    rideSnapshotRef.current = fetchedRide;
  }

  // ── Load saved cards ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Card payments paused — skip fetching cards so nothing can auto-select
    // a card method and the screen stays cash-only.
    if (!cardPaymentsEnabled) {
      setLoadingCards(false);
      return;
    }
    paymentsApi.getPaymentMethods()
      .then(({ data }) => {
        setSavedCards(data);
        // Auto-select the first saved card if available
        if (data.length > 0) {
          setSelectedCard(data[0]);
          setMethod('saved_card');
        }
      })
      .catch(() => { /* silently ignore — fall back to cash/card */ })
      .finally(() => setLoadingCards(false));
  }, []);

  // ── WebSocket: payment confirmed / failed ────────────────────────────────────
  useEffect(() => {
    const unsubOk = socketService.on<WsPaymentConfirmed>('payment_confirmed', (e) => {
      if (e.rideId !== rideId) return;
      // Use paymentMethod from the SERVER event — not local state
      setMethod(e.paymentMethod as PayMethod);
      track.paymentConfirmed(rideId, e.paymentMethod);
      setConfirmed(true);
      setCardState('success');
      setTimeout(() => {
        navigation.replace('RateRide', { rideId, rateTarget: 'driver', driverId: activeRide?.driverId ?? undefined });
      }, 1500);
    });

    const unsubFail = socketService.on<{ rideId: string; reason: string }>(
      'payment_failed',
      (e) => {
        if (e.rideId !== rideId) return;
        setCardState('failed');
        setCardError(e.reason ?? 'Payment failed. Please try again.');
      },
    );

    return () => { unsubOk(); unsubFail(); };
  }, [rideId, navigation]);

  // ── Saved card: auto-charge ──────────────────────────────────────────────────
  const handleSavedCardPay = useCallback(async () => {
    if (!selectedCard) return;

    setCardState('creating_intent');
    setCardError(null);
    track.paymentMethodSelected('card');

    try {
      const { data } = await paymentsApi.createIntent(rideId, selectedCard.id);

      if (data.autoCharged) {
        // Server confirmed immediately — wait for WS 'payment_confirmed'
        setCardState('processing');
        return;
      }

      if (data.requiresAction && data.clientSecret) {
        // 3-D Secure: show the Stripe sheet to handle authentication
        const { error: initError } = await initPaymentSheet({
          merchantDisplayName:       'TaxiApp',
          paymentIntentClientSecret: data.clientSecret,
          style: 'automatic',
        });

        if (initError) {
          setCardState('failed');
          setCardError(initError.message);
          return;
        }

        setCardState('awaiting_sheet');
        const { error: presentError } = await presentPaymentSheet();

        if (presentError) {
          if (presentError.code === 'Canceled') {
            setCardState('idle');
          } else {
            setCardState('failed');
            setCardError(presentError.message);
          }
          return;
        }

        setCardState('processing');
        return;
      }

      // Fallback (shouldn't normally reach here)
      setCardState('processing');

    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Something went wrong. Please try again.';
      setCardState('failed');
      setCardError(msg);
      track.paymentFailed(rideId, msg);
      crash.recordError(err, 'PayCashScreen.handleSavedCardPay');
    }
  }, [rideId, selectedCard, initPaymentSheet, presentPaymentSheet]);

  // ── Card (new): Stripe payment sheet ────────────────────────────────────────
  const handleCardPay = useCallback(async () => {
    setCardState('creating_intent');
    setCardError(null);
    track.paymentMethodSelected('card');

    try {
      const { data } = await paymentsApi.createIntent(rideId);

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName:        'TaxiApp',
        paymentIntentClientSecret:  data.clientSecret!,
        applePay:    { merchantCountryCode: 'US' },
        googlePay:   { merchantCountryCode: 'US', testEnv: __DEV__ },
        style:       'automatic',
      });

      if (initError) {
        setCardState('failed');
        setCardError(initError.message);
        return;
      }

      setCardState('awaiting_sheet');
      track.stripeSheetOpened(rideId);
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === 'Canceled') {
          setCardState('idle');
        } else {
          setCardState('failed');
          setCardError(presentError.message);
        }
        return;
      }

      // Sheet confirmed — WS 'payment_confirmed' will navigate to rating
      setCardState('processing');

    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Something went wrong. Please try again.';
      setCardState('failed');
      setCardError(msg);
      track.paymentFailed(rideId, msg);
      crash.recordError(err, 'PayCashScreen.handleCardPay');
    }
  }, [rideId, initPaymentSheet, presentPaymentSheet]);

  // ── Share receipt ────────────────────────────────────────────────────────────
  const handleShareReceipt = useCallback(async () => {
    if (!activeRide) return;
    setSharing(true);
    try {
      const LINE = '─────────────────────────────';
      const lines: string[] = [
        '🚕  TaxiApp — Ride Receipt',
        LINE,
        `Ride ID:  #${rideId.slice(0, 8).toUpperCase()}`,
        '',
      ];
      if (activeRide.pickupAddress)  lines.push(`📍 From: ${activeRide.pickupAddress}`);
      if (activeRide.dropoffAddress) lines.push(`📍 To:   ${activeRide.dropoffAddress}`);
      if (activeRide.distanceKm != null)
        lines.push(`Distance: ${Number(activeRide.distanceKm).toFixed(2)} km`);
      if (activeRide.promoCode && activeRide.discountAmount != null)
        lines.push(`🏷️ Promo (${activeRide.promoCode}): −$${Number(activeRide.discountAmount).toFixed(2)}`);
      if (activeRide.totalFare != null) {
        lines.push(LINE);
        lines.push(`Total paid: $${Number(activeRide.totalFare).toFixed(2)}`);
      }
      lines.push('');
      lines.push(LINE);
      lines.push('Thank you for riding with TaxiApp!');

      const message = lines.join('\n');
      await Share.share({
        message,
        ...(Platform.OS === 'ios' && { subject: `TaxiApp Receipt — #${rideId.slice(0, 8).toUpperCase()}` }),
      });
    } catch {
      // User dismissed — no error
    } finally {
      setSharing(false);
    }
  }, [activeRide, rideId]);

  // ── Cash: manual proceed ─────────────────────────────────────────────────────
  const handleCashProceed = () => {
    clearAll();
    navigation.replace('RateRide', { rideId, rateTarget: 'driver', driverId: activeRide?.driverId ?? undefined });
  };

  const handleSkip = () => {
    clearAll();
    navigation.replace('ClientHomeMain');
  };

  const isCardBusy =
    cardState === 'creating_intent' ||
    cardState === 'awaiting_sheet'  ||
    cardState === 'processing';

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function brandLabel(brand: string) {
    return brand.charAt(0).toUpperCase() + brand.slice(1);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        {/* Icon */}
        <View style={[styles.iconWrap, confirmed && styles.iconWrapSuccess]}>
          <Text style={styles.icon}>
            {confirmed
              ? '✅'
              : method === 'saved_card' || method === 'card'
                ? '💳'
                : '💵'}
          </Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>
          {confirmed
            ? t('client.payCash.titleConfirmed')
            : cardState === 'processing'
              ? t('client.payCash.titleProcessing')
              : t('client.payCash.titlePayment')}
        </Text>

        <Text style={styles.subtitle}>
          {confirmed
            ? method === 'cash'
              ? t('client.payCash.cashReceiptMsg')
              : t('client.payCash.cardSuccessMsg')
            : cardState === 'processing'
              ? t('client.payCash.waitingMsg')
              : t('client.payCash.choosePayment')}
        </Text>

        {/* ── Big amount-due display ───────────────────────────────────────
            Shown prominently at the top so the client immediately knows
            how much to pay. Falls back to a clear message when the fare
            hasn't been finalized yet. */}
        {!confirmed && cardState !== 'processing' && activeRide && (
          <View style={styles.amountDueWrap}>
            <Text style={styles.amountDueLabel}>Amount due</Text>
            {activeRide.totalFare != null ? (
              <Text style={styles.amountDueValue}>${Number(activeRide.totalFare).toFixed(2)}</Text>
            ) : (
              <Text style={styles.amountPending}>Fare not finalized yet…</Text>
            )}
            {activeRide.promoCode && activeRide.discountAmount != null && Number(activeRide.discountAmount) > 0 && (
              <Text style={styles.amountDiscount}>
                Includes 🏷️ {activeRide.promoCode} discount −${Number(activeRide.discountAmount).toFixed(2)}
              </Text>
            )}
          </View>
        )}

        {/* Ride summary */}
        {activeRide && cardState !== 'processing' && (
          <View style={styles.summaryCard}>
            <SummaryRow label={t('client.payCash.rideLabel')}     value={`#${rideId.slice(0, 8).toUpperCase()}`} colors={colors} />
            {activeRide.pickupAddress  && <SummaryRow label={t('client.payCash.fromLabel')} value={activeRide.pickupAddress} colors={colors} />}
            {activeRide.dropoffAddress && <SummaryRow label={t('client.payCash.toLabel')}   value={activeRide.dropoffAddress} colors={colors} />}
            {activeRide.distanceKm != null && (
              <SummaryRow label={t('client.payCash.distanceLabel')} value={`${Number(activeRide.distanceKm).toFixed(2)} km`} colors={colors} />
            )}
            {activeRide.promoCode && activeRide.discountAmount != null && (
              <SummaryRow
                label={`🏷️ ${activeRide.promoCode}`}
                value={`−$${Number(activeRide.discountAmount).toFixed(2)}`}
                green
                colors={colors}
              />
            )}
            {activeRide.totalFare != null && (
              <SummaryRow
                label={confirmed ? t('client.payCash.amountPaidLabel') : t('client.payCash.amountDueLabel')}
                value={`$${Number(activeRide.totalFare).toFixed(2)}`}
                highlight
                colors={colors}
              />
            )}
          </View>
        )}

        {/* Processing spinner */}
        {cardState === 'processing' && (
          <View style={styles.processingRow}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.processingText}>{t('client.payCash.confirmingLabel')}</Text>
          </View>
        )}

        {/* Share receipt — shown after confirmation while auto-navigating */}
        {confirmed && activeRide?.totalFare != null && (
          <TouchableOpacity
            style={[styles.shareReceiptBtn, sharing && { opacity: 0.6 }]}
            onPress={handleShareReceipt}
            disabled={sharing}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Share ride receipt">
            {sharing
              ? <ActivityIndicator color={colors.primary} size="small" />
              : <Text style={styles.shareReceiptBtnText}>📤  {t('client.payCash.shareReceipt')}</Text>}
          </TouchableOpacity>
        )}

        {/* Payment options */}
        {!confirmed && cardState !== 'processing' && (
          <>
            {/* ── Method selector ────────────────────────────────────────── */}
            <View style={styles.methodRow}>

              {/* Cash */}
              <TouchableOpacity
                style={[styles.methodBtn, method === 'cash' && styles.methodBtnActive]}
                onPress={() => { setMethod('cash'); setCardState('idle'); setCardError(null); }}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityLabel="Pay with cash"
                accessibilityState={{ checked: method === 'cash' }}>
                <Text style={styles.methodIcon}>💵</Text>
                <Text style={[styles.methodLabel, method === 'cash' && styles.methodLabelActive]}>
                  {t('client.payCash.cashOption')}
                </Text>
              </TouchableOpacity>

              {/* Saved card (only if available) */}
              {cardPaymentsEnabled && !loadingCards && savedCards.length > 0 && (
                <TouchableOpacity
                  style={[styles.methodBtn, method === 'saved_card' && styles.methodBtnActive]}
                  onPress={() => {
                    setMethod('saved_card');
                    setCardState('idle');
                    setCardError(null);
                    if (!selectedCard) setSelectedCard(savedCards[0]);
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityLabel={`Pay with saved card ending in ${selectedCard?.last4 ?? savedCards[0].last4}`}
                  accessibilityState={{ checked: method === 'saved_card' }}>
                  <Text style={styles.methodIcon}>💳</Text>
                  <Text
                    style={[styles.methodLabel, method === 'saved_card' && styles.methodLabelActive]}
                    numberOfLines={1}>
                    ••••{selectedCard?.last4 ?? savedCards[0].last4}
                  </Text>
                </TouchableOpacity>
              )}

              {/* New card — hidden entirely while card payments are paused
                  (a visible-but-disabled option risks App Review flagging an
                  incomplete feature). */}
              {cardPaymentsEnabled && (
                <TouchableOpacity
                  style={[styles.methodBtn, method === 'card' && styles.methodBtnActive]}
                  onPress={() => { setMethod('card'); setCardState('idle'); setCardError(null); }}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityLabel="Pay with new card"
                  accessibilityState={{ checked: method === 'card' }}>
                  <Text style={styles.methodIcon}>➕</Text>
                  <Text style={[styles.methodLabel, method === 'card' && styles.methodLabelActive]}>
                    {t('client.payCash.newCardOption')}
                  </Text>
                </TouchableOpacity>
              )}

            </View>

            {/* Selected saved card details */}
            {method === 'saved_card' && selectedCard && (
              <View style={styles.savedCardBadge}>
                <Text style={styles.savedCardText}>
                  💳  {brandLabel(selectedCard.brand)} •••• {selectedCard.last4}
                  {'  '}
                  <Text style={styles.savedCardExp}>
                    {String(selectedCard.expMonth).padStart(2, '0')}/{selectedCard.expYear}
                  </Text>
                </Text>
              </View>
            )}

            {/* Multiple saved cards — picker */}
            {method === 'saved_card' && savedCards.length > 1 && (
              <View style={styles.cardPickerRow}>
                {savedCards.map(card => (
                  <TouchableOpacity
                    key={card.id}
                    style={[
                      styles.cardPickerBtn,
                      selectedCard?.id === card.id && styles.cardPickerBtnActive,
                    ]}
                    onPress={() => setSelectedCard(card)}
                    activeOpacity={0.8}>
                    <Text style={[
                      styles.cardPickerText,
                      selectedCard?.id === card.id && styles.cardPickerTextActive,
                    ]}>
                      ••••{card.last4}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Error */}
            {cardError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{cardError}</Text>
              </View>
            )}

            {/* Cash waiting notice */}
            {method === 'cash' && (
              <View style={styles.waitingRow}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={styles.waitingText}>
                  {t('client.payCash.waitingDriver')}
                </Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={styles.actions}>
              {method === 'cash' ? (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleCashProceed}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="I have paid cash – rate my driver">
                  <Text style={styles.primaryBtnText}>{t('client.payCash.rateDriverBtn')}</Text>
                </TouchableOpacity>

              ) : method === 'saved_card' ? (
                <TouchableOpacity
                  style={[styles.primaryBtn, styles.cardBtn, (isCardBusy || !isStripeConfigured) && styles.btnDisabled]}
                  onPress={handleSavedCardPay}
                  disabled={isCardBusy || !isStripeConfigured || !cardPaymentsEnabled}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={cardState === 'failed' ? 'Retry card payment' : 'Pay now with saved card'}
                  accessibilityState={{ disabled: isCardBusy || !isStripeConfigured }}>
                  {isCardBusy
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={styles.cardBtnText}>
                        {cardState === 'failed' ? t('client.payCash.retryBtn') : t('client.payCash.payNowBtn')}
                      </Text>}
                </TouchableOpacity>

              ) : (
                <TouchableOpacity
                  style={[styles.primaryBtn, styles.cardBtn, (isCardBusy || !isStripeConfigured) && styles.btnDisabled]}
                  onPress={handleCardPay}
                  disabled={isCardBusy || !isStripeConfigured || !cardPaymentsEnabled}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={cardState === 'failed' ? 'Retry card payment' : 'Pay by card'}
                  accessibilityState={{ disabled: isCardBusy || !isStripeConfigured }}>
                  {isCardBusy
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={styles.cardBtnText}>
                        {cardState === 'failed' ? t('client.payCash.retryCardBtn') : t('client.payCash.payByCardBtn')}
                      </Text>}
                </TouchableOpacity>
              )}
              {/* Only relevant while the card feature is live but Stripe is
                  misconfigured — when cards are paused the options are hidden
                  entirely, so no "coming soon" placeholder text should show. */}
              {cardPaymentsEnabled && !isStripeConfigured && (
                <Text style={{ fontSize: 11, color: colors.textSecondary, textAlign: 'center', marginTop: 6, paddingHorizontal: 16 }}>
                  💡 Card payments are coming soon. Please pay your driver in cash for now.
                </Text>
              )}

              <TouchableOpacity
                style={styles.skipBtn}
                onPress={handleSkip}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Skip payment and go home">
                <Text style={styles.skipBtnText}>{t('client.payCash.skipHomeBtn')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

      </View>
    </SafeAreaView>
  );
}

// ── Helper component ──────────────────────────────────────────────────────────

function SummaryRow({
  label, value, highlight, green, colors,
}: { label: string; value: string; highlight?: boolean; green?: boolean; colors: ColorPalette }) {
  const summaryStyles = useMemo(() => getSummaryStyles(colors), [colors]);
  return (
    <View style={summaryStyles.row}>
      <Text style={[
        summaryStyles.label,
        highlight && summaryStyles.labelHL,
        green && summaryStyles.labelGreen,
      ]}>
        {label}
      </Text>
      <Text style={[
        summaryStyles.value,
        highlight && summaryStyles.valueHL,
        green && summaryStyles.valueGreen,
      ]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// ── StyleSheets ───────────────────────────────────────────────────────────────

function getSummaryStyles(c: ColorPalette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    label:      { fontSize: 13, color: c.textSecondary, fontWeight: '600' },
    value:      { fontSize: 14, color: c.text, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
    labelHL:    { color: c.text, fontWeight: '700' },
    valueHL:    { fontSize: 20, fontWeight: '800', color: c.primary },
    labelGreen: { color: c.success, fontWeight: '700' },
    valueGreen: { color: c.success, fontWeight: '700' },
  });
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: {
      flex: 1,
      paddingHorizontal: Sizes.screenPadding,
      paddingTop: 48,
      alignItems: 'center',
    },

    iconWrap: {
      width: 96, height: 96, borderRadius: 48,
      backgroundColor: c.primaryLight,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 24,
    },
    iconWrapSuccess: { backgroundColor: c.successLight ?? '#dcfce7' },
    icon: { fontSize: 48 },

    title: {
      fontSize: 26, fontWeight: '800', color: c.text,
      marginBottom: 10, textAlign: 'center',
    },
    subtitle: {
      fontSize: 15, color: c.textSecondary,
      textAlign: 'center', lineHeight: 22,
      marginBottom: 28, paddingHorizontal: 16,
    },

    amountDueWrap: {
      width: '100%',
      backgroundColor: c.primary,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 6,
    },
    amountDueLabel: {
      fontSize: 13, fontWeight: '700',
      color: 'rgba(255,255,255,0.85)',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: 6,
    },
    amountDueValue: {
      fontSize: 42, fontWeight: '800',
      color: '#fff',
      letterSpacing: -1,
      fontVariant: ['tabular-nums'],
    },
    amountPending: {
      fontSize: 16, fontStyle: 'italic',
      color: 'rgba(255,255,255,0.85)',
      marginTop: 4,
    },
    amountDiscount: {
      fontSize: 12, fontWeight: '600',
      color: 'rgba(255,255,255,0.9)',
      marginTop: 8,
    },

    summaryCard: {
      width: '100%',
      backgroundColor: c.surface,
      borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: c.border,
      marginBottom: 24,
    },

    processingRow: {
      alignItems: 'center', gap: 16, marginVertical: 40,
    },
    processingText: { fontSize: 15, color: c.textSecondary, fontStyle: 'italic' },

    // ── Method selector ────────────────────────────────────────────────────────
    methodRow: {
      flexDirection: 'row', gap: 10, marginBottom: 16, width: '100%',
    },
    methodBtn: {
      flex: 1, height: 72, borderRadius: 16,
      borderWidth: 2, borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center', justifyContent: 'center', gap: 4,
      paddingHorizontal: 4,
    },
    methodBtnActive: { borderColor: c.primary, backgroundColor: c.primaryLight },
    methodIcon:  { fontSize: 24 },
    methodLabel: { fontSize: 12, fontWeight: '700', color: c.textSecondary, textAlign: 'center' },
    methodLabelActive: { color: c.primary },

    // ── Saved card badge ───────────────────────────────────────────────────────
    savedCardBadge: {
      width: '100%',
      backgroundColor: c.primaryLight,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.primary,
    },
    savedCardText: { fontSize: 14, fontWeight: '700', color: c.primary },
    savedCardExp:  { fontSize: 12, fontWeight: '400', color: c.textSecondary },

    // ── Multi-card picker ──────────────────────────────────────────────────────
    cardPickerRow: {
      flexDirection: 'row', gap: 8, marginBottom: 12, width: '100%', flexWrap: 'wrap',
    },
    cardPickerBtn: {
      paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: 20, borderWidth: 1.5, borderColor: c.border,
      backgroundColor: c.surface,
    },
    cardPickerBtnActive: { borderColor: c.primary, backgroundColor: c.primaryLight },
    cardPickerText:      { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    cardPickerTextActive: { color: c.primary },

    // ── Error ──────────────────────────────────────────────────────────────────
    errorBox: {
      width: '100%',
      backgroundColor: c.errorLight ?? '#fee2e2',
      borderRadius: 10, padding: 12, marginBottom: 16,
      borderWidth: 1, borderColor: c.error,
    },
    errorText: { fontSize: 13, color: c.error, fontWeight: '500' },

    // ── Cash waiting ───────────────────────────────────────────────────────────
    waitingRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginBottom: 24,
    },
    waitingText: { fontSize: 13, color: c.textSecondary, fontStyle: 'italic' },

    // ── Action buttons ─────────────────────────────────────────────────────────
    actions: { width: '100%', gap: 12 },
    primaryBtn: {
      height: 52, backgroundColor: c.primary,
      borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    },
    cardBtn: { backgroundColor: '#1a1a2e' },
    btnDisabled: { opacity: 0.55 },
    primaryBtnText: { fontSize: 16, fontWeight: '700', color: c.textOnPrimary },
    cardBtnText:    { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
    skipBtn:     { height: 44, alignItems: 'center', justifyContent: 'center' },
    skipBtnText: { fontSize: 14, color: c.textSecondary, fontWeight: '600' },

    shareReceiptBtn: {
      height: 44,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      marginBottom: 8,
    },
    shareReceiptBtnText: { fontSize: 14, fontWeight: '700', color: c.primary },
  });
}
