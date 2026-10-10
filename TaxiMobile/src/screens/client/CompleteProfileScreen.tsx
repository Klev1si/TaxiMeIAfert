/**
 * CompleteProfileScreen — required gate for passengers whose account is
 * missing a verified phone or a real first/last name. Google/Apple sign-ins
 * never supply a phone, and Apple often hides the name ("Apple User").
 *
 * Shown by RootNavigator instead of the client app until both are set, so
 * every passenger has a reachable, verified phone and a proper name before
 * they can use the app. Steps: name + phone → SMS code → save both.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../stores/authStore';
import { useColors } from '../../stores/themeStore';
import { useTranslation } from '../../i18n';
import { toAlertString } from '../../utils/errorMessage';
import { isRealName } from '../../utils/validators';
import type { ColorPalette } from '../../constants/colors';

const OTP_LENGTH = 6;

interface Props {
  /** Values already on the account (may be placeholders like "Apple User"). */
  initialFirstName: string | null;
  initialLastName: string | null;
  /** True when the account already has a verified phone — only the name is asked. */
  hasPhone: boolean;
  /** Called once everything is saved; RootNavigator then shows the client app. */
  onCompleted: () => void;
}

export default function CompleteProfileScreen({
  initialFirstName, initialLastName, hasPhone, onCompleted,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const refreshSession = useAuthStore(s => s.refreshSession);
  const logout = useAuthStore(s => s.logout);

  // Pre-fill only names that already look real, so "Apple" / "User" placeholders
  // don't get confirmed with a single tap.
  const prefill = isRealName(initialFirstName) && isRealName(initialLastName);
  const [firstName, setFirstName] = useState(prefill ? initialFirstName!.trim() : '');
  const [lastName,  setLastName]  = useState(prefill ? initialLastName!.trim() : '');
  const [phone, setPhone] = useState('+383');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const codeRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (countdown <= 0) { return; }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const nameValid  = isRealName(firstName) && isRealName(lastName);
  // E.164 — same shape the backend's SendOtpDto enforces.
  const phoneValid = /^\+[1-9]\d{6,14}$/.test(phone.trim());

  const saveName = () =>
    authApi.updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() });

  const finish = async () => {
    // Re-issue tokens so the new phone lands in the JWT / local user state.
    try { await refreshSession(); } catch { /* non-fatal — saved server-side */ }
    onCompleted();
  };

  const handleContinue = async () => {
    if (!nameValid) {
      Alert.alert(t('client.completeProfile.invalidNameTitle'), t('client.completeProfile.invalidNameMsg'));
      return;
    }
    if (hasPhone) {
      setLoading(true);
      try {
        await saveName();
        await finish();
      } catch (err: any) {
        Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('client.completeProfile.saveError')));
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!phoneValid) {
      Alert.alert(t('client.addPhone.invalidPhoneTitle'), t('client.completeProfile.invalidPhoneMsg'));
      return;
    }
    setLoading(true);
    try {
      await authApi.sendOtp(phone.trim());
      setCode('');
      setStep('code');
      setCountdown(60);
      setTimeout(() => codeRef.current?.focus(), 300);
    } catch (err: any) {
      Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('client.addPhone.sendError')));
    } finally {
      setLoading(false);
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
      await saveName();
      await finish();
    } catch (err: any) {
      Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('client.addPhone.attachError')));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    try {
      await authApi.sendOtp(phone.trim());
      setCode('');
      setCountdown(60);
      Alert.alert(t('auth.otp.codeSentTitle'), t('auth.otp.codeSentMsg', { phone: phone.trim() }));
    } catch (err: any) {
      Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('auth.otp.resendError')));
    } finally {
      setLoading(false);
    }
  };

  const continueDisabled = loading || !nameValid || (!hasPhone && !phoneValid);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.emoji}>👤</Text>
          <Text style={styles.title}>{t('client.completeProfile.title')}</Text>

          {step === 'details' ? (
            <>
              <Text style={styles.subtitle}>
                {hasPhone ? t('client.completeProfile.introNameOnly') : t('client.completeProfile.intro')}
              </Text>

              <Text style={styles.label}>{t('client.completeProfile.firstName')}</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                autoComplete="given-name"
                textContentType="givenName"
                maxLength={80}
                accessibilityLabel={t('client.completeProfile.firstName')}
              />

              <Text style={styles.label}>{t('client.completeProfile.lastName')}</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                autoComplete="family-name"
                textContentType="familyName"
                maxLength={80}
                accessibilityLabel={t('client.completeProfile.lastName')}
              />

              {!hasPhone && (
                <>
                  <Text style={styles.label}>{t('client.addPhone.phoneLabel')}</Text>
                  <TextInput
                    style={styles.input}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+383 4X XXX XXX"
                    placeholderTextColor={colors.textDisabled}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    textContentType="telephoneNumber"
                    autoCorrect={false}
                    accessibilityLabel={t('client.addPhone.phoneLabel')}
                  />
                  <Text style={styles.hint}>{t('client.completeProfile.phoneHint')}</Text>
                </>
              )}

              <TouchableOpacity
                style={[styles.btn, continueDisabled && styles.btnDisabled]}
                onPress={handleContinue}
                disabled={continueDisabled}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ disabled: continueDisabled }}>
                {loading
                  ? <ActivityIndicator color={colors.textOnPrimary} />
                  : <Text style={styles.btnText}>
                      {hasPhone ? t('client.completeProfile.saveBtn') : t('client.addPhone.sendBtn')}
                    </Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>{t('client.addPhone.codeIntro', { length: OTP_LENGTH })}</Text>
              <Text style={styles.phone}>{phone.trim()}</Text>

              <TextInput
                ref={codeRef}
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={v => setCode(v.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH))}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={OTP_LENGTH}
                textAlign="center"
                accessibilityLabel="Verification code"
              />

              <TouchableOpacity
                style={[styles.btn, (loading || code.length < OTP_LENGTH) && styles.btnDisabled]}
                onPress={handleVerify}
                disabled={loading || code.length < OTP_LENGTH}
                activeOpacity={0.85}
                accessibilityRole="button">
                {loading
                  ? <ActivityIndicator color={colors.textOnPrimary} />
                  : <Text style={styles.btnText}>{t('client.completeProfile.saveBtn')}</Text>}
              </TouchableOpacity>

              <View style={styles.row}>
                <TouchableOpacity onPress={() => setStep('details')} disabled={loading} accessibilityRole="button">
                  <Text style={styles.link}>{t('client.completeProfile.changeNumber')}</Text>
                </TouchableOpacity>
                {countdown > 0 ? (
                  <Text style={styles.muted}>{t('auth.otp.resendIn', { countdown })}</Text>
                ) : (
                  <TouchableOpacity onPress={handleResend} disabled={loading} accessibilityRole="button">
                    <Text style={styles.link}>{t('auth.otp.resendBtn')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* Way out — otherwise someone without a phone at hand is stuck here. */}
          <TouchableOpacity style={styles.logout} onPress={() => { void logout(); }} accessibilityRole="button">
            <Text style={styles.muted}>{t('client.completeProfile.logout')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: c.background },
    flex:   { flex: 1 },
    scroll: { padding: 24, paddingTop: 40 },

    emoji:    { fontSize: 48, marginBottom: 12, textAlign: 'center' },
    title:    { fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 10, textAlign: 'center' },
    subtitle: { fontSize: 14, color: c.textSecondary, marginBottom: 24, lineHeight: 21, textAlign: 'center' },
    phone:    { fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'center', marginBottom: 20 },

    label: { fontSize: 14, fontWeight: '600', color: c.text, marginBottom: 6 },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1, borderColor: c.border, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 16, color: c.text,
      marginBottom: 16,
    },
    codeInput: { fontSize: 24, fontWeight: '700', letterSpacing: 8 },
    hint:      { fontSize: 12, color: c.textSecondary, marginTop: -8, marginBottom: 20 },

    btn: {
      backgroundColor: c.primary, borderRadius: 14,
      height: 52, alignItems: 'center', justifyContent: 'center',
      marginTop: 4, marginBottom: 20,
    },
    btnDisabled: { opacity: 0.5 },
    btnText:     { fontSize: 16, fontWeight: '700', color: c.textOnPrimary },

    row:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    link:   { fontSize: 14, color: c.primary, fontWeight: '700' },
    muted:  { fontSize: 14, color: c.textSecondary },
    logout: { alignItems: 'center', marginTop: 32 },
  });
}
