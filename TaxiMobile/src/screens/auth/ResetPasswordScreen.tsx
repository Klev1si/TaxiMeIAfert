/**
 * ResetPasswordScreen — verify the 6-digit code and set a new password.
 *
 * Lands here from ForgotPasswordScreen with `{ method, identifier }` in
 * route params. User types the code from their email/SMS + a new password,
 * server validates, and we route back to Login on success.
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
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';
import type { AuthStackScreenProps } from '../../navigation/types';

type Props = AuthStackScreenProps<'ResetPassword'>;

export default function ResetPasswordScreen({ navigation, route }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const { method, identifier } = route.params;

  const [code,        setCode]        = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPwd,  setConfirmPwd]  = useState('');
  const [loading,     setLoading]     = useState(false);
  const [resending,   setResending]   = useState(false);

  const handleSubmit = async () => {
    if (code.trim().length < 4) {
      Alert.alert(t('common.validation'), method === 'email' ? t('auth.resetPassword.codeFromEmail') : t('auth.resetPassword.codeFromSms'));
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert(t('common.validation'), t('auth.resetPassword.pwTooShort'));
      return;
    }
    if (newPassword !== confirmPwd) {
      Alert.alert(t('common.validation'), t('auth.resetPassword.pwMismatch'));
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword({ method, identifier, code: code.trim(), newPassword });
      Alert.alert(
        t('auth.resetPassword.successTitle'),
        t('auth.resetPassword.successMsg'),
        [{ text: t('auth.resetPassword.signInBtn'), onPress: () => navigation.popToTop() }],
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('auth.resetPassword.resetError');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await authApi.forgotPassword({ method, identifier });
      Alert.alert(t('auth.resetPassword.codeSentTitle'), method === 'email' ? t('auth.resetPassword.codeSentEmail') : t('auth.resetPassword.codeSentPhone'));
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('auth.resetPassword.resendError');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ {t('common.back')}</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{t('auth.resetPassword.title')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.resetPassword.subtitle')}{'\n'}<Text style={styles.identifier}>{identifier}</Text>
          </Text>

          <Text style={styles.fieldLabel}>{t('auth.resetPassword.codeLabel')}</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            placeholderTextColor={colors.textDisabled}
            keyboardType="number-pad"
            autoFocus
            maxLength={6}
          />

          <Text style={styles.fieldLabel}>{t('auth.resetPassword.newPwLabel')}</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder={t('auth.resetPassword.newPwPlaceholder')}
            placeholderTextColor={colors.textDisabled}
            secureTextEntry
          />

          <Text style={styles.fieldLabel}>{t('auth.resetPassword.confirmPwLabel')}</Text>
          <TextInput
            style={styles.input}
            value={confirmPwd}
            onChangeText={setConfirmPwd}
            placeholder={t('auth.resetPassword.confirmPwPlaceholder')}
            placeholderTextColor={colors.textDisabled}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>{t('auth.resetPassword.submitBtn')}</Text>}
          </TouchableOpacity>

          <View style={styles.resendWrap}>
            <Text style={styles.resendHint}>{t('auth.resetPassword.resendHint')}</Text>
            <TouchableOpacity onPress={handleResend} disabled={resending} activeOpacity={0.7}>
              <Text style={[styles.resendLink, resending && { opacity: 0.5 }]}>
                {resending ? t('auth.resetPassword.sending') : t('auth.resetPassword.resendLink')}
              </Text>
            </TouchableOpacity>
          </View>
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
    identifier:{ fontWeight: '700', color: c.text },

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
      marginBottom: 18,
    },
    codeInput: {
      fontSize: 22, fontWeight: '700',
      letterSpacing: 8,
      textAlign: 'center',
    },

    submitBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },

    resendWrap: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 6 },
    resendHint: { fontSize: 13, color: c.textSecondary },
    resendLink: { fontSize: 13, color: c.primary, fontWeight: '700' },
  });
}
