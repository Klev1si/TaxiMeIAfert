import React, { useState } from 'react';
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
import { Colors, Sizes } from '../../constants';

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

export default function RateRideScreen({ navigation, route }: Props) {
  const { rideId, rateTarget } = route.params;
  const { clearAll } = useRideStore();

  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isRatingDriver = rateTarget === 'driver';
  const targetLabel = isRatingDriver ? 'driver' : 'passenger';

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('No rating', 'Please tap a star to rate your ride.');
      return;
    }
    setSubmitting(true);
    try {
      await ridesApi.rateRide(rideId, { rating, review: review.trim() || undefined });
      setSubmitted(true);
      clearAll();
      setTimeout(() => {
        navigation.replace(isRatingDriver ? 'ClientHomeMain' : 'DriverHomeMain');
      }, 1800);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Failed to submit rating.';
      Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    clearAll();
    navigation.replace(isRatingDriver ? 'ClientHomeMain' : 'DriverHomeMain');
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>⭐</Text>
          <Text style={styles.successTitle}>Thank you!</Text>
          <Text style={styles.successSub}>Your rating has been submitted.</Text>
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
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
            <Text style={styles.title}>Rate Your {isRatingDriver ? 'Driver' : 'Passenger'}</Text>
            <Text style={styles.subtitle}>
              How was your experience with this {targetLabel}?
            </Text>
          </View>

          {/* Stars */}
          <View style={styles.starsRow}>
            {STARS.map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                activeOpacity={0.7}
                style={styles.starBtn}>
                <Text style={[styles.star, star <= rating && styles.starFilled]}>
                  {star <= rating ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Label under stars */}
          {rating > 0 && (
            <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text>
          )}

          {/* Review input */}
          <View style={styles.reviewWrap}>
            <Text style={styles.reviewLabel}>Leave a comment (optional)</Text>
            <TextInput
              style={styles.reviewInput}
              placeholder={`What was great or could be improved about this ${targetLabel}?`}
              placeholderTextColor={Colors.textDisabled}
              value={review}
              onChangeText={setReview}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={300}
            />
            <Text style={styles.charCount}>{review.length}/300</Text>
          </View>

          {/* Buttons */}
          <TouchableOpacity
            style={[styles.submitBtn, (submitting || rating === 0) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || rating === 0}
            activeOpacity={0.85}>
            {submitting
              ? <ActivityIndicator color={Colors.textOnPrimary} />
              : <Text style={styles.submitBtnText}>Submit Rating</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleSkip}
            activeOpacity={0.7}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const RATING_LABELS: Record<number, string> = {
  1: '😞 Poor',
  2: '😐 Fair',
  3: '🙂 Good',
  4: '😊 Great',
  5: '🤩 Excellent!',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  scroll: { padding: Sizes.screenPadding, alignItems: 'center' },

  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  successIcon: { fontSize: 64, marginBottom: 20 },
  successTitle: { fontSize: 28, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  successSub: { fontSize: 15, color: Colors.textSecondary },

  header: { alignItems: 'center', marginBottom: 36, marginTop: 16 },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  starsRow: { flexDirection: 'row', marginBottom: 12 },
  starBtn: { padding: 6 },
  star: { fontSize: 44, color: Colors.border },
  starFilled: { color: Colors.primary },

  ratingLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 28,
  },

  reviewWrap: { width: '100%', marginBottom: 24 },
  reviewLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 },
  reviewInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: Colors.text,
    minHeight: 100,
    backgroundColor: Colors.surface,
  },
  charCount: { fontSize: 11, color: Colors.textDisabled, textAlign: 'right', marginTop: 4 },

  submitBtn: {
    width: '100%',
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: Colors.textOnPrimary },

  skipBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  skipBtnText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
});
