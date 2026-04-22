import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authApi } from '../../api/auth';
import { Colors, Sizes } from '../../constants';
import type { AuthScreenProps } from '../../navigation/types';

type Props = AuthScreenProps<'Otp'>;

const OTP_LENGTH = 6;

export default function OtpScreen({ navigation, route }: Props) {
  const { phone, mode, role } = route.params;

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);

  const inputRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) {
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const code = digits.join('');

  const handleDigitChange = (text: string, index: number) => {
    const sanitized = text.replace(/[^0-9]/g, '').slice(-1);
    const next = [...digits];
    next[index] = sanitized;
    setDigits(next);

    if (sanitized && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    if (code.length < OTP_LENGTH) {
      Alert.alert('Incomplete code', `Please enter all ${OTP_LENGTH} digits.`);
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.verifyOtp(phone, code);
      if (!data.verified) {
        Alert.alert('Invalid code', 'The code you entered is incorrect. Please try again.');
        return;
      }
      if (mode === 'register') {
        if (role === 'driver') {
          navigation.navigate('RegisterDriver', { phone });
        } else {
          navigation.navigate('RegisterClient', { phone });
        }
      } else {
        // mode === 'verify' — go back to login (phone verified)
        navigation.navigate('Login');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Verification failed.';
      Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await authApi.sendOtp(phone);
      setDigits(Array(OTP_LENGTH).fill(''));
      setCountdown(60);
      inputRefs.current[0]?.focus();
      Alert.alert('Code sent', `A new code was sent to ${phone}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Failed to resend code.';
      Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>

          {/* Back button */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          {/* Title */}
          <Text style={styles.title}>Verify Phone</Text>
          <Text style={styles.subtitle}>
            We sent a {OTP_LENGTH}-digit code to
          </Text>
          <Text style={styles.phone}>{phone}</Text>

          {/* OTP boxes */}
          <View style={styles.otpRow}>
            {digits.map((digit, i) => (
              <TextInput
                key={i}
                ref={ref => { inputRefs.current[i] = ref; }}
                style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                value={digit}
                onChangeText={text => handleDigitChange(text, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                keyboardType="number-pad"
                maxLength={1}
                textAlign="center"
                selectTextOnFocus
                autoFocus={i === 0}
              />
            ))}
          </View>

          {/* Verify button */}
          <TouchableOpacity
            style={[styles.btn, (loading || code.length < OTP_LENGTH) && styles.btnDisabled]}
            onPress={handleVerify}
            disabled={loading || code.length < OTP_LENGTH}
            activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color={Colors.textOnPrimary} />
            ) : (
              <Text style={styles.btnText}>Verify Code</Text>
            )}
          </TouchableOpacity>

          {/* Resend */}
          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't receive it? </Text>
            {countdown > 0 ? (
              <Text style={styles.resendCountdown}>Resend in {countdown}s</Text>
            ) : (
              <TouchableOpacity
                onPress={handleResend}
                disabled={resending}
                activeOpacity={0.7}>
                {resending ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={styles.resendLink}>Resend Code</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const BOX_SIZE = 48;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: Sizes.screenPadding,
    paddingTop: 16,
  },

  backBtn: { marginBottom: 32 },
  backText: { fontSize: 16, color: Colors.primary, fontWeight: '600' },

  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  phone: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 4,
    marginBottom: 40,
  },

  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  otpBox: {
    width: BOX_SIZE,
    height: BOX_SIZE + 8,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  otpBoxFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },

  btn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 16, fontWeight: '700', color: Colors.textOnPrimary },

  resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  resendLabel: { fontSize: 14, color: Colors.textSecondary },
  resendCountdown: { fontSize: 14, color: Colors.textDisabled, fontWeight: '600' },
  resendLink: { fontSize: 14, color: Colors.primary, fontWeight: '700' },
});
