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
import { authApi } from '../../api/auth';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import { useTranslation } from '../../i18n';
import type { ColorPalette } from '../../constants/colors';
import type { AuthScreenProps } from '../../navigation/types';

type Props = AuthScreenProps<'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { login, isLoading } = useAuthStore();
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const [regPhone, setRegPhone] = useState('');
  const [regRole, setRegRole] = useState<'client' | 'driver' | 'company'>('client');
  const [sendingOtp, setSendingOtp] = useState(false);

  const handleLogin = async () => {
    if (!phone.trim() || !password) {
      Alert.alert(t('auth.login.missingFieldsTitle'), t('auth.login.missingFieldsMsg'));
      return;
    }
    try {
      await login(phone.trim(), password);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('auth.login.errorMsg');
      Alert.alert(t('auth.login.errorTitle'), Array.isArray(msg) ? msg.join('\n') : msg);
    }
  };

  const handleSendOtp = async () => {
    const trimmed = regPhone.trim();
    if (!trimmed) {
      Alert.alert(t('auth.login.missingPhoneTitle'), t('auth.login.missingPhoneMsg'));
      return;
    }
    setSendingOtp(true);
    try {
      await authApi.sendOtp(trimmed);
      navigation.navigate('Otp', { phone: trimmed, mode: 'register', role: regRole });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('auth.login.otpErrorMsg');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSendingOtp(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <View style={styles.logoBox}>
              <Text style={styles.logoEmoji}>🚕</Text>
            </View>
            <Text style={styles.appName}>{t('auth.login.title')}</Text>
            <Text style={styles.tagline}>{t('auth.login.tagline')}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('auth.login.signInBtn')}</Text>

            <Text style={styles.label}>{t('auth.login.phoneLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder="+1 555 000 0000"
              placeholderTextColor={colors.textDisabled}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="next"
              accessibilityLabel="Phone number"
            />

            <Text style={styles.label}>{t('auth.login.passwordLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('auth.login.passwordPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              accessibilityLabel="Password"
            />

            <TouchableOpacity
              style={[styles.btn, isLoading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityState={{ disabled: isLoading }}>
              {isLoading
                ? <ActivityIndicator color={colors.textOnPrimary} />
                : <Text style={styles.btnText}>{t('auth.login.signInBtn')}</Text>}
            </TouchableOpacity>

            {/* Forgot password link — opens the email/SMS reset flow */}
            <TouchableOpacity
              onPress={() => navigation.navigate('ForgotPassword')}
              activeOpacity={0.7}
              style={{ alignItems: 'center', marginTop: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Forgot password">
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>
                Forgot password?
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>{t('auth.login.newHere')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('auth.login.createAccount')}</Text>

            <View style={styles.roleRow}>
              {(['client', 'driver', 'company'] as const).map(r => {
                const label = r === 'client' ? t('auth.login.rolePassenger') : r === 'driver' ? t('auth.login.roleDriver') : t('auth.login.roleCompany');
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleBtn, regRole === r && styles.roleBtnActive]}
                    onPress={() => setRegRole(r)}
                    activeOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityLabel={`Account type: ${label}`}
                    accessibilityState={{ checked: regRole === r }}>
                    <Text style={[styles.roleBtnText, regRole === r && styles.roleBtnTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>{t('auth.login.phoneLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder="+1 555 000 0000"
              placeholderTextColor={colors.textDisabled}
              value={regPhone}
              onChangeText={setRegPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="done"
              onSubmitEditing={handleSendOtp}
              accessibilityLabel="Phone number for new account"
            />

            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, sendingOtp && styles.btnDisabled]}
              onPress={handleSendOtp}
              disabled={sendingOtp}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Send verification code"
              accessibilityState={{ disabled: sendingOtp }}>
              {sendingOtp
                ? <ActivityIndicator color={colors.primary} />
                : <Text style={[styles.btnText, styles.btnTextOutline]}>{t('auth.login.sendOtpBtn')}</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.bottomPad} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: c.background },
    flex:   { flex: 1 },
    scroll: { padding: Sizes.screenPadding },

    header:    { alignItems: 'center', marginBottom: 32, marginTop: 16 },
    logoBox:   { width: 80, height: 80, borderRadius: 24, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    logoEmoji: { fontSize: 40 },
    appName:   { fontSize: 28, fontWeight: '800', color: c.text },
    tagline:   { fontSize: 14, color: c.textSecondary, marginTop: 4 },

    card:      { backgroundColor: c.surface, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: c.border },
    cardTitle: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 16 },

    label: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6, marginTop: 8 },
    input: { height: 48, borderWidth: 1.5, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.background },

    btn:            { height: 50, backgroundColor: c.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
    btnDisabled:    { opacity: 0.6 },
    btnText:        { fontSize: 16, fontWeight: '700', color: c.textOnPrimary },
    btnOutline:     { backgroundColor: c.transparent, borderWidth: 2, borderColor: c.primary },
    btnTextOutline: { color: c.primary },

    roleRow:          { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 4, marginBottom: 8 },
    roleBtn:          { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
    roleBtnActive:    { backgroundColor: c.primary },
    roleBtnText:      { fontSize: 14, fontWeight: '600', color: c.textSecondary },
    roleBtnTextActive:{ color: c.textOnPrimary },

    dividerRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    dividerLine:  { flex: 1, height: 1, backgroundColor: c.border },
    dividerLabel: { fontSize: 13, color: c.textSecondary, marginHorizontal: 12, fontWeight: '500' },

    bottomPad: { height: 32 },
  });
}
