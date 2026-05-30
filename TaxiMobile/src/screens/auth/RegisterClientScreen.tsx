import React, { useState, useMemo } from 'react';
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
import { authApi } from '../../api/auth';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import { useTranslation } from '../../i18n';
import { isValidEmail } from '../../utils/validators';
import type { ColorPalette } from '../../constants/colors';
import type { AuthScreenProps } from '../../navigation/types';

type Props = AuthScreenProps<'RegisterClient'>;

export default function RegisterClientScreen({ navigation, route }: Props) {
  const { phone } = route.params;
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert(t('auth.registerClient.missingTitle'), t('auth.registerClient.missingMsg'));
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert(t('common.validation'), 'Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      Alert.alert(t('auth.registerClient.weakPassTitle'), t('auth.registerClient.weakPassMsg'));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('auth.registerClient.mismatchTitle'), t('auth.registerClient.mismatchMsg'));
      return;
    }

    setLoading(true);
    try {
      await authApi.registerClient({
        phone,
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      Alert.alert(
        t('auth.registerClient.successTitle'),
        t('auth.registerClient.successMsg'),
        [{ text: t('auth.registerClient.signInBtn'), onPress: () => navigation.navigate('Login') }],
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('common.error');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setLoading(false);
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

          {/* Back */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Text style={styles.backText}>{t('auth.otp.backBtn')}</Text>
          </TouchableOpacity>

          {/* Title */}
          <Text style={styles.title}>{t('auth.registerClient.title')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.registerClient.phoneLabel')} <Text style={styles.phoneText}>{phone}</Text>
          </Text>

          {/* Form */}
          <View style={styles.card}>
            <Field label={t('auth.registerClient.firstNameLabel')} colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="Jane"
                placeholderTextColor={colors.textDisabled}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="First name"
              />
            </Field>

            <Field label={t('auth.registerClient.lastNameLabel')} colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="Doe"
                placeholderTextColor={colors.textDisabled}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="Last name"
              />
            </Field>

            <Field label="Email" colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textDisabled}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="next"
                accessibilityLabel="Email address"
              />
            </Field>

            <Field label={t('auth.registerClient.passwordLabel')} colors={colors}>
              <TextInput
                style={styles.input}
                placeholder={t('auth.registerClient.passwordPlaceholder')}
                placeholderTextColor={colors.textDisabled}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                returnKeyType="next"
                accessibilityLabel="Password, minimum 8 characters"
              />
            </Field>

            <Field label={t('auth.registerClient.confirmLabel')} colors={colors}>
              <TextInput
                style={styles.input}
                placeholder={t('auth.registerClient.confirmPlaceholder')}
                placeholderTextColor={colors.textDisabled}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleRegister}
                accessibilityLabel="Confirm password"
              />
            </Field>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Create account"
            accessibilityState={{ disabled: loading }}>
            {loading ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.btnText}>{t('auth.registerClient.createBtn')}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomPad} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children, colors }: { label: string; children: React.ReactNode; colors: ColorPalette }) {
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 12 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: c.background },
    flex:   { flex: 1 },
    scroll: { padding: Sizes.screenPadding },

    backBtn:  { marginBottom: 24 },
    backText: { fontSize: 16, color: c.primary, fontWeight: '600' },

    title:     { fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 8 },
    subtitle:  { fontSize: 14, color: c.textSecondary, marginBottom: 24 },
    phoneText: { color: c.text, fontWeight: '700' },

    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 24,
    },

    input: {
      height: 48,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      fontSize: 15,
      color: c.text,
      backgroundColor: c.background,
    },

    btn:         { height: 52, backgroundColor: c.primary, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    btnDisabled: { opacity: 0.6 },
    btnText:     { fontSize: 16, fontWeight: '700', color: c.textOnPrimary },

    bottomPad: { height: 32 },
  });
}
