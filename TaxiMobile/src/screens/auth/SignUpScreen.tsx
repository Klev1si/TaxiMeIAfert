/**
 * SignUpScreen — choose an account type, then continue with phone OTP
 * or Google sign-up. Replaces the registration card that used to live
 * at the bottom of LoginScreen, so Login can focus on the sign-in flow.
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { authApi } from '../../api/auth';
import { signInWithGoogle } from '../../services/googleAuth';
import { signInWithApple } from '../../services/appleAuth';
import { useAuthStore } from '../../stores/authStore';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';
import { isGoogleConfigured } from '../../config';
import type { AuthScreenProps } from '../../navigation/types';

type Props = AuthScreenProps<'SignUp'>;
type Role = 'client' | 'driver' | 'company';

export default function SignUpScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const { loginWithGoogle, loginWithApple, isLoading } = useAuthStore();

  const [role,   setRole]   = useState<Role>('client');
  const [phone,  setPhone]  = useState('');
  const [sending, setSending] = useState(false);

  const handleSendOtp = async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      Alert.alert(t('auth.login.missingPhoneTitle'), t('auth.login.missingPhoneMsg'));
      return;
    }
    setSending(true);
    try {
      await authApi.sendOtp(trimmed);
      navigation.navigate('Otp', { phone: trimmed, mode: 'register', role });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('auth.login.otpErrorMsg');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSending(false);
    }
  };

  const handleGoogle = async () => {
    const outcome = await signInWithGoogle();
    if (outcome.kind === 'cancelled' || outcome.kind === 'in_progress') return;
    if (outcome.kind === 'play_services_unavailable') {
      Alert.alert(t('common.error'), 'Google Play services are not available on this device.');
      return;
    }
    if (outcome.kind === 'error') {
      Alert.alert(t('common.error'), outcome.message);
      return;
    }
    try {
      await loginWithGoogle(outcome.idToken);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Could not sign in.';
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    }
  };

  const handleApple = async () => {
    const outcome = await signInWithApple();
    if (outcome.kind === 'cancelled') return;
    if (outcome.kind === 'unsupported') {
      Alert.alert(t('common.error'), 'Sign in with Apple is not available on this device.');
      return;
    }
    if (outcome.kind === 'error') {
      Alert.alert(t('common.error'), outcome.message);
      return;
    }
    try {
      await loginWithApple(outcome.identityToken, outcome.firstName, outcome.lastName);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Could not sign in.';
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    }
  };

  const ROLES: { value: Role; label: string }[] = [
    { value: 'client',  label: t('auth.login.rolePassenger') },
    { value: 'driver',  label: t('auth.login.roleDriver')    },
    { value: 'company', label: t('auth.login.roleCompany')   },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← {t('common.back')}</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.logoBox}>
              <Text style={styles.logoEmoji}>🚕</Text>
            </View>
            <Text style={styles.welcome}>Create account 👋</Text>
            <Text style={styles.subtitle}>Pick how you want to use TaxiMeIAfert</Text>
          </View>

          <Text style={styles.sectionLabel}>I'm signing up as a…</Text>
          <View style={styles.roleRow}>
            {ROLES.map(r => (
              <TouchableOpacity
                key={r.value}
                style={[styles.roleBtn, role === r.value && styles.roleBtnActive]}
                onPress={() => setRole(r.value)}
                activeOpacity={0.8}>
                <Text style={[styles.roleBtnText, role === r.value && styles.roleBtnTextActive]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Phone Number</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.inputIcon}>📱</Text>
            <TextInput
              style={styles.input}
              placeholder="+1 555 000 0000"
              placeholderTextColor={colors.textDisabled}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              returnKeyType="done"
              onSubmitEditing={handleSendOtp}
            />
          </View>
          <Text style={styles.fieldHint}>
            We'll text you a code to confirm it's you.
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, sending && styles.btnDisabled]}
            onPress={handleSendOtp}
            disabled={sending}
            activeOpacity={0.85}>
            {sending
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>Send verification code</Text>}
          </TouchableOpacity>

          {isGoogleConfigured && role === 'client' && (
            <>
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>Or continue with</Text>
                <View style={styles.orLine} />
              </View>
              <View style={styles.socialRow}>
                <TouchableOpacity
                  style={styles.socialCircle}
                  onPress={handleGoogle}
                  disabled={isLoading}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google">
                  <Text style={styles.googleG}>G</Text>
                </TouchableOpacity>

                {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    style={[styles.socialCircle, styles.appleCircle]}
                    onPress={handleApple}
                    disabled={isLoading}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Continue with Apple">
                    <Text style={styles.appleGlyph}>{''}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.googleHint}>
                Passengers can also sign up with Google in one tap.
              </Text>
            </>
          )}

          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.bottomLink}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}>
            <Text style={styles.bottomLinkText}>
              Already have an account? <Text style={styles.bottomLinkAccent}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: c.background },
    scroll: { padding: 20, paddingBottom: 32, flexGrow: 1 },

    backBtn:  { paddingVertical: 4 },
    backText: { fontSize: 15, color: c.primary, fontWeight: '700' },

    header:  { alignItems: 'center', marginTop: 12, marginBottom: 24 },
    logoBox: {
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 16,
    },
    logoEmoji: { fontSize: 32 },
    welcome:   { fontSize: 24, fontWeight: '800', color: c.text, marginBottom: 6 },
    subtitle:  { fontSize: 14, color: c.textSecondary, textAlign: 'center', paddingHorizontal: 24 },

    sectionLabel: {
      fontSize: 13, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
    },
    roleRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    roleBtn: {
      flex: 1, paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1, borderColor: c.border,
      alignItems: 'center',
    },
    roleBtnActive:     { backgroundColor: c.primary, borderColor: c.primary },
    roleBtnText:       { fontSize: 13, fontWeight: '700', color: c.text },
    roleBtnTextActive: { color: '#fff' },

    fieldLabel: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 8 },
    inputWrap: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      borderWidth: 1, borderColor: c.border,
      height: 52,
    },
    inputIcon: { fontSize: 18, marginRight: 10, color: c.textSecondary },
    input:     { flex: 1, fontSize: 15, color: c.text },
    fieldHint: { fontSize: 12, color: c.textSecondary, marginTop: 6, marginBottom: 18 },

    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: 28,
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    btnDisabled:    { opacity: 0.6 },
    primaryBtnText: { fontSize: 16, fontWeight: '800', color: c.textOnPrimary },

    orRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 22 },
    orLine:  { flex: 1, height: 1, backgroundColor: c.border },
    orText:  { fontSize: 12, color: c.textSecondary, fontWeight: '700' },

    socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 12 },
    socialCircle: {
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: c.surface,
      borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    googleG:    { fontSize: 22, fontWeight: '800', color: '#4285F4' },
    appleCircle:{ backgroundColor: '#000', borderColor: '#000' },
    appleGlyph: { fontSize: 24, color: '#fff', fontWeight: '600', marginTop: -2 },
    googleHint: { fontSize: 12, color: c.textSecondary, textAlign: 'center', marginTop: 6, marginBottom: 12 },

    bottomLink:       { alignItems: 'center', paddingVertical: 16, marginTop: 24 },
    bottomLinkText:   { fontSize: 14, color: c.textSecondary, fontWeight: '600' },
    bottomLinkAccent: { color: c.primary, fontWeight: '800' },
  });
}
