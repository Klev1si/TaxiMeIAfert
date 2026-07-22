/**
 * AddEmailScreen — one-time prompt for legacy users whose account doesn't
 * have an email yet. Shown by RootNavigator after login when getMe() returns
 * no email. Required (can't be skipped) so the user can use Forgot Password
 * if they ever need to.
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
} from 'react-native';
import { authApi } from '../../api/auth';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';
import { isValidEmail } from '../../utils/validators';

interface Props {
  /** Called after the email is successfully saved — root navigator
   *  re-reads getMe() and dismisses this modal. */
  onCompleted: () => void;
}

export default function AddEmailScreen({ onCompleted }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    const v = email.trim();
    if (!isValidEmail(v)) {
      Alert.alert(t('common.validation'), t('auth.invalidEmail'));
      return;
    }
    setLoading(true);
    try {
      await authApi.setEmail(v);
      onCompleted();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('auth.addEmail.saveError');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.emoji}>📧</Text>
          <Text style={styles.title}>{t('auth.addEmail.title')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.addEmail.subtitle')}
          </Text>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textDisabled}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>{t('auth.addEmail.saveBtn')}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    scroll: { padding: 28, paddingTop: 60, alignItems: 'center' },

    emoji: { fontSize: 56, marginBottom: 16 },
    title: { fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 10, textAlign: 'center' },
    subtitle: { fontSize: 14, color: c.textSecondary, marginBottom: 24, lineHeight: 22, textAlign: 'center' },

    input: {
      width: '100%',
      backgroundColor: c.surface,
      borderWidth: 1, borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 16, color: c.text,
      marginBottom: 18,
    },

    btn: {
      width: '100%',
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
