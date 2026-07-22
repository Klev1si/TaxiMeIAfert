/**
 * ForgotPasswordScreen — request a password reset code via email or SMS.
 *
 * Flow:
 *   1. User picks Email or SMS toggle
 *   2. Enters the matching identifier
 *   3. Taps "Send code" → POST /auth/forgot-password
 *   4. On success, navigates to ResetPasswordScreen
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
import { authApi, type ResetMethod } from '../../api/auth';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';
import { isValidEmail, isValidE164Phone } from '../../utils/validators';
import type { AuthStackScreenProps } from '../../navigation/types';

type Props = AuthStackScreenProps<'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [method,     setMethod]     = useState<ResetMethod>('email');
  const [identifier, setIdentifier] = useState('');
  const [loading,    setLoading]    = useState(false);

  const handleSend = async () => {
    const v = identifier.trim();
    if (!v) {
      Alert.alert(t('common.validation'), t('auth.forgotPassword.missingIdentifier'));
      return;
    }
    if (method === 'email' && !isValidEmail(v)) {
      Alert.alert(t('common.validation'), t('auth.invalidEmail'));
      return;
    }
    if (method === 'sms' && !isValidE164Phone(v)) {
      Alert.alert(t('common.validation'), t('auth.forgotPassword.invalidPhone'));
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword({ method, identifier: v });
      // Endpoint is enumeration-safe — we always navigate to the next screen
      // even if the identifier doesn't match an account. The error (if any)
      // will surface as "incorrect code" on the reset screen.
      navigation.navigate('ResetPassword', { method, identifier: v });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('auth.forgotPassword.sendError');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ {t('common.back')}</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{t('auth.forgotPassword.title')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.forgotPassword.subtitle')}
          </Text>

          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.togglePill, method === 'email' && styles.togglePillActive]}
              onPress={() => setMethod('email')}
              activeOpacity={0.75}>
              <Text style={[styles.toggleText, method === 'email' && styles.toggleTextActive]}>
                📧  {t('auth.forgotPassword.tabEmail')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.togglePill, method === 'sms' && styles.togglePillActive]}
              onPress={() => setMethod('sms')}
              activeOpacity={0.75}>
              <Text style={[styles.toggleText, method === 'sms' && styles.toggleTextActive]}>
                💬  {t('auth.forgotPassword.tabSms')}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>
            {method === 'email' ? t('auth.forgotPassword.emailLabel') : t('auth.forgotPassword.phoneLabel')}
          </Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder={method === 'email' ? 'you@example.com' : '+37491123456'}
            placeholderTextColor={colors.textDisabled}
            keyboardType={method === 'email' ? 'email-address' : 'phone-pad'}
            autoCapitalize="none"
            autoComplete={method === 'email' ? 'email' : 'tel'}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />

          <TouchableOpacity
            style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={loading}
            activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.sendBtnText}>{t('auth.forgotPassword.sendBtn')}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    scroll: { padding: 24, paddingTop: 40 },

    backBtn: { paddingVertical: 8 },
    backText: { fontSize: 16, color: c.primary, fontWeight: '600' },

    title:    { fontSize: 28, fontWeight: '800', color: c.text, marginTop: 16 },
    subtitle: { fontSize: 14, color: c.textSecondary, marginTop: 6, marginBottom: 24, lineHeight: 20 },

    toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    togglePill: {
      flex: 1, paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1, borderColor: c.border,
      alignItems: 'center',
    },
    togglePillActive: { backgroundColor: c.primary, borderColor: c.primary },
    toggleText:       { fontSize: 14, fontWeight: '700', color: c.text },
    toggleTextActive: { color: '#fff' },

    fieldLabel: {
      fontSize: 12, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
    },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1, borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 16, color: c.text,
      marginBottom: 24,
    },

    sendBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    sendBtnDisabled: { opacity: 0.5 },
    sendBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
