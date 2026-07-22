/**
 * LoginScreen — phone-or-email + password sign-in, with Google as a
 * secondary "Or continue with" option. Registration lives on its own
 * SignUpScreen now; this page focuses on getting existing users in.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { signInWithGoogle } from '../../services/googleAuth';
import { signInWithApple } from '../../services/appleAuth';
import { isGoogleConfigured } from '../../config';
import { useColors } from '../../stores/themeStore';
import { useTranslation } from '../../i18n';
import type { ColorPalette } from '../../constants/colors';
import type { AuthScreenProps } from '../../navigation/types';

type Props = AuthScreenProps<'Login'>;
type Method = 'phone' | 'email';

export default function LoginScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const { login, loginWithGoogle, loginWithApple, isLoading } = useAuthStore();

  const [method,     setMethod]     = useState<Method>('phone');
  const [phone,      setPhone]      = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [showPwd,    setShowPwd]    = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const identifier = method === 'phone' ? phone.trim() : email.trim();

  const handleLogin = async () => {
    if (!identifier || !password) {
      Alert.alert(t('auth.login.missingFieldsTitle'), t('auth.login.missingFieldsMsg'));
      return;
    }
    try {
      await login(identifier, password);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('auth.login.errorMsg');
      Alert.alert(t('auth.login.errorTitle'), Array.isArray(msg) ? msg.join('\n') : msg);
    }
  };

  const handleGoogle = async () => {
    const outcome = await signInWithGoogle();
    if (outcome.kind === 'cancelled' || outcome.kind === 'in_progress') return;
    if (outcome.kind === 'play_services_unavailable') {
      Alert.alert(t('common.error'), t('auth.login.googlePlayUnavailable'));
      return;
    }
    if (outcome.kind === 'error') {
      Alert.alert(t('common.error'), outcome.message);
      return;
    }
    try {
      await loginWithGoogle(outcome.idToken);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('auth.login.signInFailed');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    }
  };

  const handleApple = async () => {
    const outcome = await signInWithApple();
    if (outcome.kind === 'cancelled') return;
    if (outcome.kind === 'unsupported') {
      Alert.alert(t('common.error'), t('auth.login.appleUnavailable'));
      return;
    }
    if (outcome.kind === 'error') {
      Alert.alert(t('common.error'), outcome.message);
      return;
    }
    try {
      await loginWithApple(outcome.identityToken, outcome.firstName, outcome.lastName);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('auth.login.signInFailed');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Logo */}
          <View style={styles.header}>
            <View style={styles.logoBox}>
              <Text style={styles.logoEmoji}>🚕</Text>
            </View>
            <Text style={styles.brand}>TaxiMeIAfert</Text>
          </View>

          {/* Welcome */}
          <Text style={styles.welcome}>{t('auth.login.welcome')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.login.subtitle')}
          </Text>

          {/* Tab switcher: Phone / Email */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, method === 'phone' && styles.tabActive]}
              onPress={() => setMethod('phone')}
              activeOpacity={0.8}>
              <Text style={[styles.tabText, method === 'phone' && styles.tabTextActive]}>
                {t('auth.login.tabPhone')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, method === 'email' && styles.tabActive]}
              onPress={() => setMethod('email')}
              activeOpacity={0.8}>
              <Text style={[styles.tabText, method === 'email' && styles.tabTextActive]}>
                {t('auth.login.tabEmail')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Identifier field — switches between phone and email */}
          <Text style={styles.fieldLabel}>{method === 'phone' ? t('auth.login.phoneLabel') : t('auth.login.emailLabel')}</Text>
          {method === 'phone' ? (
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
                returnKeyType="next"
              />
            </View>
          ) : (
            <View style={styles.inputWrap}>
              <Text style={styles.inputIcon}>✉️</Text>
              <TextInput
                style={styles.input}
                placeholder={t('auth.login.emailPlaceholder')}
                placeholderTextColor={colors.textDisabled}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="next"
              />
            </View>
          )}

          {/* Password */}
          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('auth.login.passwordLabel')}</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.inputIcon}>🔒</Text>
            <TextInput
              style={styles.input}
              placeholder={t('auth.login.passwordPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPwd}
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPwd(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.inputTrailing}>{showPwd ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>

          {/* Remember me + Forgot password */}
          <View style={styles.utilRow}>
            <TouchableOpacity
              style={styles.rememberWrap}
              onPress={() => setRememberMe(v => !v)}
              activeOpacity={0.7}>
              <View style={[styles.checkbox, rememberMe && styles.checkboxOn]}>
                {rememberMe && <Text style={styles.checkboxTick}>✓</Text>}
              </View>
              <Text style={styles.rememberText}>{t('auth.login.rememberMe')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} activeOpacity={0.7}>
              <Text style={styles.forgotText}>{t('auth.login.forgotPassword')}</Text>
            </TouchableOpacity>
          </View>

          {/* Sign in button — pill style */}
          <TouchableOpacity
            style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.85}>
            {isLoading
              ? <ActivityIndicator color={colors.textOnPrimary} />
              : <Text style={styles.primaryBtnText}>{t('auth.login.signInBtn')}</Text>}
          </TouchableOpacity>

          {/* "Or continue with" with Google in a circle */}
          {isGoogleConfigured && (
            <>
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>{t('auth.login.orContinueWith')}</Text>
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

                {/* Sign in with Apple — iOS only. Apple's brand guidelines
                    require a black-or-white  glyph; we use a simple round
                    button styled to match the Google one for consistency. */}
                {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    style={[styles.socialCircle, styles.appleCircle]}
                    onPress={handleApple}
                    disabled={isLoading}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Continue with Apple">
                    <Text style={styles.appleGlyph}>{''}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* Sign up link at the bottom */}
          <TouchableOpacity
            style={styles.bottomLink}
            onPress={() => navigation.navigate('SignUp')}
            activeOpacity={0.7}>
            <Text style={styles.bottomLinkText}>
              {t('auth.login.noAccount')} <Text style={styles.bottomLinkAccent}>{t('auth.login.signUpLink')}</Text>
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

    header:  { alignItems: 'center', marginTop: 8, marginBottom: 20 },
    logoBox: {
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 10,
    },
    logoEmoji: { fontSize: 32 },
    brand: { fontSize: 18, fontWeight: '800', color: c.text, letterSpacing: 0.3 },

    welcome:  { fontSize: 26, fontWeight: '800', color: c.text, textAlign: 'center', marginTop: 4 },
    subtitle: { fontSize: 14, color: c.textSecondary, textAlign: 'center', marginTop: 6, marginBottom: 20 },

    // Tab switcher — pill style, two segments
    tabRow: {
      flexDirection: 'row',
      backgroundColor: c.surfaceAlt ?? c.surface,
      borderRadius: 28,
      padding: 4,
      marginBottom: 20,
    },
    tab: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 24,
      alignItems: 'center',
    },
    tabActive:     { backgroundColor: c.primary },
    tabText:       { fontSize: 14, fontWeight: '700', color: c.textSecondary },
    tabTextActive: { color: c.textOnPrimary },

    fieldLabel: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 8 },
    inputWrap: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      borderWidth: 1, borderColor: c.border,
      height: 52,
    },
    inputIcon: { fontSize: 18, marginRight: 10 },
    input:     { flex: 1, fontSize: 15, color: c.text },
    inputTrailing: { fontSize: 18, paddingLeft: 8, color: c.textSecondary },

    utilRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 14,
      marginBottom: 22,
    },
    rememberWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    checkbox: {
      width: 20, height: 20,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.surface,
    },
    checkboxOn: { backgroundColor: c.primary, borderColor: c.primary },
    checkboxTick: { color: c.textOnPrimary, fontSize: 12, fontWeight: '900' },
    rememberText: { fontSize: 13, color: c.text, fontWeight: '600' },
    forgotText:   { fontSize: 13, color: c.primary, fontWeight: '700' },

    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: 28,
      height: 54,
      alignItems: 'center', justifyContent: 'center',
    },
    btnDisabled:    { opacity: 0.6 },
    primaryBtnText: { fontSize: 16, fontWeight: '800', color: c.textOnPrimary },

    orRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 22 },
    orLine: { flex: 1, height: 1, backgroundColor: c.border },
    orText: { fontSize: 12, color: c.textSecondary, fontWeight: '700' },

    socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
    socialCircle: {
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: c.surface,
      borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    googleG: { fontSize: 22, fontWeight: '800', color: '#4285F4' },

    // Apple — black circle with white  glyph per Apple's brand guidance
    appleCircle: { backgroundColor: '#000', borderColor: '#000' },
    appleGlyph:  { fontSize: 24, color: '#fff', fontWeight: '600', marginTop: -2 },

    bottomLink: { alignItems: 'center', paddingVertical: 16, marginTop: 'auto', paddingTop: 28 },
    bottomLinkText:   { fontSize: 14, color: c.textSecondary, fontWeight: '600' },
    bottomLinkAccent: { color: c.primary, fontWeight: '800' },
  });
}
