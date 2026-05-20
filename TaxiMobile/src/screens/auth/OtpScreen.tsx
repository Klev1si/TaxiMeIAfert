import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import { useTranslation } from '../../i18n';
import type { ColorPalette } from '../../constants/colors';
import type { AuthScreenProps } from '../../navigation/types';

type Props = AuthScreenProps<'Otp'>;

const OTP_LENGTH = 6;

export default function OtpScreen({ navigation, route }: Props) {
  const { phone, mode, role } = route.params;
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

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
      Alert.alert(t('auth.otp.incompleteTitle'), t('auth.otp.incompleteMsg', { length: OTP_LENGTH }));
      return;
    }
    setLoading(true);
    try {
      // Backend returns 204 No Content on success; throws on wrong code
      await authApi.verifyOtp(phone, code);
      if (mode === 'register') {
        if (role === 'driver') {
          navigation.navigate('RegisterDriver', { phone });
        } else if (role === 'company') {
          navigation.navigate('RegisterCompany', { phone });
        } else {
          navigation.navigate('RegisterClient', { phone });
        }
      } else {
        // mode === 'verify' — go back to login (phone verified)
        navigation.navigate('Login');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('auth.otp.verifyFailed');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
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
      Alert.alert(t('auth.otp.codeSentTitle'), t('auth.otp.codeSentMsg', { phone }));
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('auth.otp.resendError');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
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
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Text style={styles.backText}>{t('auth.otp.backBtn')}</Text>
          </TouchableOpacity>

          {/* Title */}
          <Text style={styles.title}>{t('auth.otp.title')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.otp.subtitle', { length: OTP_LENGTH })}
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
                accessibilityLabel={`Digit ${i + 1} of ${OTP_LENGTH}`}
              />
            ))}
          </View>

          {/* Verify button */}
          <TouchableOpacity
            style={[styles.btn, (loading || code.length < OTP_LENGTH) && styles.btnDisabled]}
            onPress={handleVerify}
            disabled={loading || code.length < OTP_LENGTH}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Verify code"
            accessibilityState={{ disabled: loading || code.length < OTP_LENGTH }}>
            {loading ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.btnText}>{t('auth.otp.verifyBtn')}</Text>
            )}
          </TouchableOpacity>

          {/* Resend */}
          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>{t('auth.otp.didntReceive')} </Text>
            {countdown > 0 ? (
              <Text style={styles.resendCountdown}>{t('auth.otp.resendIn', { countdown })}</Text>
            ) : (
              <TouchableOpacity
                onPress={handleResend}
                disabled={resending}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Resend verification code"
                accessibilityState={{ disabled: resending }}>
                {resending ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.resendLink}>{t('auth.otp.resendBtn')}</Text>
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

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    container: {
      flex: 1,
      paddingHorizontal: Sizes.screenPadding,
      paddingTop: 16,
    },

    backBtn: { marginBottom: 32 },
    backText: { fontSize: 16, color: c.primary, fontWeight: '600' },

    title: {
      fontSize: 28,
      fontWeight: '800',
      color: c.text,
      marginBottom: 12,
    },
    subtitle: {
      fontSize: 15,
      color: c.textSecondary,
    },
    phone: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
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
      borderColor: c.border,
      borderRadius: 12,
      fontSize: 22,
      fontWeight: '700',
      color: c.text,
      backgroundColor: c.surface,
    },
    otpBoxFilled: {
      borderColor: c.primary,
      backgroundColor: c.primaryLight,
    },

    btn: {
      height: 52,
      backgroundColor: c.primary,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { fontSize: 16, fontWeight: '700', color: c.textOnPrimary },

    resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    resendLabel: { fontSize: 14, color: c.textSecondary },
    resendCountdown: { fontSize: 14, color: c.textDisabled, fontWeight: '600' },
    resendLink: { fontSize: 14, color: c.primary, fontWeight: '700' },
  });
}
