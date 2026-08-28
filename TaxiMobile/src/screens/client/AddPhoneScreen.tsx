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
import { useAuthStore } from '../../stores/authStore';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import { useTranslation } from '../../i18n';
import { toAlertString } from '../../utils/errorMessage';
import type { ColorPalette } from '../../constants/colors';
import type { ClientStackScreenProps } from '../../navigation/types';

type Props = ClientStackScreenProps<'AddPhone'>;

const OTP_LENGTH = 6;
const BOX_SIZE = 48;

/**
 * Post-login screen where a Google/Apple client adds a phone number — those
 * providers never supply one, and a verified phone is required before booking.
 * Two steps: enter phone → send OTP, then enter the code → attach it to the
 * current account. On success the session is refreshed so the new phone is
 * reflected locally, then we return to the previous screen.
 */
export default function AddPhoneScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const refreshSession = useAuthStore(s => s.refreshSession);

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const inputRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const code = digits.join('');
  // E.164 — same shape the backend's SendOtpDto enforces.
  const phoneValid = /^\+[1-9]\d{6,14}$/.test(phone.trim());

  const handleSend = async () => {
    if (!phoneValid) {
      Alert.alert(t('client.addPhone.invalidPhoneTitle'), t('client.addPhone.invalidPhoneMsg'));
      return;
    }
    setLoading(true);
    try {
      await authApi.sendOtp(phone.trim());
      setStep('code');
      setDigits(Array(OTP_LENGTH).fill(''));
      setCountdown(60);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      Alert.alert(t('common.error'), toAlertString(msg, t('client.addPhone.sendError')));
    } finally {
      setLoading(false);
    }
  };

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
      await authApi.attachPhone(phone.trim(), code);
      // Re-issue tokens so the new phone (now in the DB) lands in the JWT and
      // local user state — best-effort; the server gate already uses the DB.
      try {
        await refreshSession();
      } catch {
        /* non-fatal — the phone is attached server-side regardless */
      }
      Alert.alert(
        t('client.addPhone.successTitle'),
        t('client.addPhone.successMsg'),
        [{ text: t('common.ok'), onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      Alert.alert(t('common.error'), toAlertString(msg, t('client.addPhone.attachError')));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await authApi.sendOtp(phone.trim());
      setDigits(Array(OTP_LENGTH).fill(''));
      setCountdown(60);
      inputRefs.current[0]?.focus();
      Alert.alert(t('auth.otp.codeSentTitle'), t('auth.otp.codeSentMsg', { phone: phone.trim() }));
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      Alert.alert(t('common.error'), toAlertString(msg, t('auth.otp.resendError')));
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

          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => (step === 'code' ? setStep('phone') : navigation.goBack())}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Text style={styles.backText}>{t('auth.otp.backBtn')}</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{t('client.addPhone.title')}</Text>

          {step === 'phone' ? (
            <>
              <Text style={styles.subtitle}>{t('client.addPhone.intro')}</Text>

              <Text style={styles.label}>{t('client.addPhone.phoneLabel')}</Text>
              <TextInput
                style={styles.phoneInput}
                value={phone}
                onChangeText={setPhone}
                placeholder={t('client.addPhone.phonePlaceholder')}
                placeholderTextColor={colors.textDisabled}
                keyboardType="phone-pad"
                autoFocus
                autoCorrect={false}
                accessibilityLabel="Phone number"
              />

              <TouchableOpacity
                style={[styles.btn, (loading || !phoneValid) && styles.btnDisabled]}
                onPress={handleSend}
                disabled={loading || !phoneValid}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Send verification code"
                accessibilityState={{ disabled: loading || !phoneValid }}>
                {loading ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <Text style={styles.btnText}>{t('client.addPhone.sendBtn')}</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>
                {t('client.addPhone.codeIntro', { length: OTP_LENGTH })}
              </Text>
              <Text style={styles.phone}>{phone.trim()}</Text>

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

              <TouchableOpacity
                style={[styles.btn, (loading || code.length < OTP_LENGTH) && styles.btnDisabled]}
                onPress={handleVerify}
                disabled={loading || code.length < OTP_LENGTH}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Add phone"
                accessibilityState={{ disabled: loading || code.length < OTP_LENGTH }}>
                {loading ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <Text style={styles.btnText}>{t('client.addPhone.verifyBtn')}</Text>
                )}
              </TouchableOpacity>

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
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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
      marginBottom: 24,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
      marginBottom: 8,
    },
    phone: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
      marginTop: 4,
      marginBottom: 40,
    },

    phoneInput: {
      height: 52,
      borderWidth: 2,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.surface,
      marginBottom: 32,
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
