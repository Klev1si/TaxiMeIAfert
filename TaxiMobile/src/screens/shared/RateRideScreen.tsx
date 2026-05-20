import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRideStore } from '../../stores/rideStore';
import { ridesApi } from '../../api/rides';
import { track } from '../../services/analytics';
import { maybeRequestReview } from '../../services/inAppReview';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import type { PaymentStatus } from '../../types/api';
import { useTranslation } from '../../i18n';

// Used by both ClientStack (RateRide) and DriverStack (RateClient)
// Navigation types differ so we accept props loosely
interface RateScreenParams {
  rideId: string;
  rateTarget: 'driver' | 'client';
}

interface RateScreenNavigation {
  replace: (screen: string) => void;
}

interface Props {
  navigation: RateScreenNavigation;
  route: { params: RateScreenParams };
}

const STARS = [1, 2, 3, 4, 5];

// Suppress unused-import warning — PaymentStatus is used for type narrowing below
type _PS = PaymentStatus;

export default function RateRideScreen({ navigation, route }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const { rideId, rateTarget } = route.params;
  const { clearAll } = useRideStore();

  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Driver-only: track whether cash has been confirmed so the button becomes a tick
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [confirmingCash, setConfirmingCash] = useState(false);

  const isRatingDriver = rateTarget === 'driver';

  const handleConfirmCash = async () => {
    setConfirmingCash(true);
    try {
      await ridesApi.confirmCashPayment(rideId);
      setCashConfirmed(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('shared.rateRide.confirmCashError');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setConfirmingCash(false);
    }
  };

  const targetLabel = isRatingDriver ? 'driver' : 'passenger';

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert(t('shared.rateRide.noRatingTitle'), t('shared.rateRide.noRatingMsg'));
      return;
    }
    setSubmitting(true);
    try {
      await ridesApi.rateRide(rideId, { rating, review: review.trim() || undefined });
      track.ratingSubmitted(rideId, rating, rateTarget);
      setSubmitted(true);
      clearAll();
      // Show native Play Store review dialog after ride fully completes.
      // Called before setTimeout so it fires while the success screen is visible.
      void maybeRequestReview();
      setTimeout(() => {
        navigation.replace(isRatingDriver ? 'ClientHomeMain' : 'DriverHomeMain');
      }, 1800);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('shared.rateRide.submitError');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    track.ratingSkipped(rideId);
    clearAll();
    void maybeRequestReview();
    navigation.replace(isRatingDriver ? 'ClientHomeMain' : 'DriverHomeMain');
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>⭐</Text>
          <Text style={styles.successTitle}>{t('shared.rateRide.successTitle')}</Text>
          <Text style={styles.successSub}>{t('shared.rateRide.successSub')}</Text>
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.emoji}>🚕</Text>
            <Text style={styles.title}>{isRatingDriver ? t('shared.rateRide.titleDriver') : t('shared.rateRide.titlePassenger')}</Text>
            <Text style={styles.subtitle}>
              {isRatingDriver ? t('shared.rateRide.subtitleDriver') : t('shared.rateRide.subtitlePassenger')}
            </Text>
          </View>

          {/* ── Driver only: confirm cash received ───────────────────────── */}
          {!isRatingDriver && (
            <TouchableOpacity
              style={[
                styles.cashBtn,
                cashConfirmed && styles.cashBtnDone,
                confirmingCash && styles.cashBtnDisabled,
              ]}
              onPress={handleConfirmCash}
              disabled={cashConfirmed || confirmingCash}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={cashConfirmed ? 'Cash payment confirmed' : 'Confirm cash received'}
              accessibilityState={{ disabled: cashConfirmed || confirmingCash }}>
              {confirmingCash
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.cashBtnText}>
                    {cashConfirmed ? `✅  ${t('shared.rateRide.cashConfirmedBtn')}` : `💵  ${t('shared.rateRide.cashConfirmBtn')}`}
                  </Text>}
            </TouchableOpacity>
          )}

          {/* Stars */}
          <View style={styles.starsRow}>
            {STARS.map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                activeOpacity={0.7}
                style={styles.starBtn}
                accessibilityRole="button"
                accessibilityLabel={`${star} star${star !== 1 ? 's' : ''}`}
                accessibilityState={{ selected: star <= rating }}>
                <Text style={[styles.star, star <= rating && styles.starFilled]}>
                  {star <= rating ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Label under stars */}
          {rating > 0 && (
            <Text style={styles.ratingLabel}>
              {RATING_EMOJIS[rating]} {rating === 1 ? t('shared.rateRide.rating1')
                : rating === 2 ? t('shared.rateRide.rating2')
                : rating === 3 ? t('shared.rateRide.rating3')
                : rating === 4 ? t('shared.rateRide.rating4')
                : t('shared.rateRide.rating5')}
            </Text>
          )}

          {/* Review input */}
          <View style={styles.reviewWrap}>
            <Text style={styles.reviewLabel}>{t('shared.rateRide.commentLabel')}</Text>
            <TextInput
              style={styles.reviewInput}
              placeholder={t('shared.rateRide.commentPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              value={review}
              onChangeText={setReview}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={300}
              accessibilityLabel={`Optional review comment for ${targetLabel}`}
            />
            <Text style={styles.charCount}>{review.length}/300</Text>
          </View>

          {/* Buttons */}
          <TouchableOpacity
            style={[styles.submitBtn, (submitting || rating === 0) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || rating === 0}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Submit rating"
            accessibilityState={{ disabled: submitting || rating === 0 }}>
            {submitting
              ? <ActivityIndicator color={colors.textOnPrimary} />
              : <Text style={styles.submitBtnText}>{t('shared.rateRide.submitBtn')}</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleSkip}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Skip rating">
            <Text style={styles.skipBtnText}>{t('shared.rateRide.skipBtn')}</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const RATING_EMOJIS: Record<number, string> = {
  1: '😞', 2: '😐', 3: '🙂', 4: '😊', 5: '🤩',
};

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    scroll: { padding: Sizes.screenPadding, alignItems: 'center' },

    successContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    successIcon: { fontSize: 64, marginBottom: 20 },
    successTitle: { fontSize: 28, fontWeight: '800', color: c.text, marginBottom: 8 },
    successSub: { fontSize: 15, color: c.textSecondary },

    header: { alignItems: 'center', marginBottom: 36, marginTop: 16 },
    emoji: { fontSize: 56, marginBottom: 16 },
    title: { fontSize: 24, fontWeight: '800', color: c.text, marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 15, color: c.textSecondary, textAlign: 'center', lineHeight: 22 },

    starsRow: { flexDirection: 'row', marginBottom: 12 },
    starBtn: { padding: 6 },
    star: { fontSize: 44, color: c.border },
    starFilled: { color: c.primary },

    ratingLabel: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
      marginBottom: 28,
    },

    reviewWrap: { width: '100%', marginBottom: 24 },
    reviewLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 8 },
    reviewInput: {
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: 12,
      padding: 14,
      fontSize: 14,
      color: c.text,
      minHeight: 100,
      backgroundColor: c.surface,
    },
    charCount: { fontSize: 11, color: c.textDisabled, textAlign: 'right', marginTop: 4 },

    submitBtn: {
      width: '100%',
      height: 52,
      backgroundColor: c.primary,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnText: { fontSize: 16, fontWeight: '700', color: c.textOnPrimary },

    skipBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
    skipBtnText: { fontSize: 14, color: c.textSecondary, fontWeight: '600' },

    // Cash confirmation button (driver side only)
    cashBtn: {
      width: '100%',
      height: 52,
      backgroundColor: c.success,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 28,
    },
    cashBtnDone: { backgroundColor: c.successLight, borderWidth: 2, borderColor: c.success },
    cashBtnDisabled: { opacity: 0.6 },
    cashBtnText: { fontSize: 16, fontWeight: '700', color: c.white },
  });
}
