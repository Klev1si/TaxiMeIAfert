import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRideStore } from '../../stores/rideStore';
import { socketService } from '../../services/socket';
import { Colors, Sizes } from '../../constants';
import type { WsPaymentConfirmed } from '../../types/api';
import type { ClientStackScreenProps } from '../../navigation/types';

type Props = ClientStackScreenProps<'PayCash'>;

export default function PayCashScreen({ navigation, route }: Props) {
  const { rideId } = route.params;
  const { activeRide, clearAll } = useRideStore();

  const [confirmed, setConfirmed] = useState(false);

  // Listen for driver confirming cash payment
  useEffect(() => {
    const unsub = socketService.on<WsPaymentConfirmed>('payment_confirmed', (e) => {
      if (e.rideId !== rideId) { return; }
      setConfirmed(true);
      // Brief pause so user sees the confirmation, then go to rating
      setTimeout(() => {
        navigation.replace('RateRide', { rideId, rateTarget: 'driver' });
      }, 1500);
    });
    return unsub;
  }, [rideId, navigation]);

  const handleProceedToRate = () => {
    clearAll();
    navigation.replace('RateRide', { rideId, rateTarget: 'driver' });
  };

  const handleSkip = () => {
    clearAll();
    navigation.replace('ClientHomeMain');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        {/* Icon */}
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{confirmed ? '✅' : '💵'}</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>
          {confirmed ? 'Payment Confirmed!' : 'Cash Payment'}
        </Text>

        <Text style={styles.subtitle}>
          {confirmed
            ? 'Your driver has confirmed cash payment.'
            : 'Please hand the cash fare to your driver.'}
        </Text>

        {/* Ride summary */}
        {activeRide && (
          <View style={styles.summaryCard}>
            <SummaryRow label="Ride ID" value={`#${rideId.slice(0, 8).toUpperCase()}`} />
            {activeRide.pickupAddress && (
              <SummaryRow label="Pickup" value={activeRide.pickupAddress} />
            )}
            {activeRide.dropoffAddress && (
              <SummaryRow label="Dropoff" value={activeRide.dropoffAddress} />
            )}
            <SummaryRow label="Payment" value="Cash" />
          </View>
        )}

        {/* Waiting indicator */}
        {!confirmed && (
          <View style={styles.waitingRow}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.waitingText}>
              Waiting for driver to confirm receipt…
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {!confirmed && (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleProceedToRate}
              activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Paid — Rate Your Driver</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleSkip}
            activeOpacity={0.7}>
            <Text style={styles.skipBtnText}>Skip & Go Home</Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={summaryStyles.row}>
      <Text style={summaryStyles.label}>{label}</Text>
      <Text style={summaryStyles.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  value: { fontSize: 14, color: Colors.text, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: {
    flex: 1,
    paddingHorizontal: Sizes.screenPadding,
    paddingTop: 48,
    alignItems: 'center',
  },

  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  icon: { fontSize: 48 },

  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 16,
  },

  summaryCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 28,
  },

  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 32,
  },
  waitingText: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },

  actions: { width: '100%', gap: 12 },
  primaryBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: Colors.textOnPrimary },
  skipBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
});
