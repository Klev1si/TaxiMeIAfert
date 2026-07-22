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

type Props = AuthScreenProps<'RegisterCompany'>;

export default function RegisterCompanyScreen({ navigation, route }: Props) {
  const { phone } = route.params;
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [companyName,     setCompanyName]     = useState('');
  const [email,           setEmail]           = useState('');
  const [address,         setAddress]         = useState('');
  const [city,            setCity]            = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading,         setLoading]         = useState(false);

  const handleRegister = async () => {
    if (!companyName.trim()) {
      Alert.alert(t('auth.registerCompany.missingTitle'), t('auth.registerCompany.missingMsg'));
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert(t('common.validation'), t('auth.invalidEmail'));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t('auth.registerCompany.weakPassTitle'), t('auth.registerCompany.weakPassMsg'));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('auth.registerCompany.mismatchTitle'), t('auth.registerCompany.mismatchMsg'));
      return;
    }

    setLoading(true);
    try {
      await authApi.registerCompany({
        phone,
        email: email.trim(),
        password,
        companyName: companyName.trim(),
        address:     address.trim()  || undefined,
        city:        city.trim()     || undefined,
      });
      Alert.alert(
        t('auth.registerCompany.successTitle'),
        t('auth.registerCompany.successMsg'),
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
          <Text style={styles.title}>{t('auth.registerCompany.title')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.registerClient.phoneLabel')} <Text style={styles.phoneText}>{phone}</Text>
          </Text>

          {/* Company info */}
          <Text style={styles.sectionLabel}>{t('auth.registerCompany.sectionCompany')}</Text>
          <View style={styles.card}>
            <Field label={t('auth.registerCompany.nameLabel')} colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="Acme Taxi Co."
                placeholderTextColor={colors.textDisabled}
                value={companyName}
                onChangeText={setCompanyName}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="Company name"
              />
            </Field>

            <Field label={t('auth.emailLabel')} colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="admin@acmetaxi.com"
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

            <Field label={t('auth.registerCompany.addressLabel')} colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="123 Main St"
                placeholderTextColor={colors.textDisabled}
                value={address}
                onChangeText={setAddress}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="Company address, optional"
              />
            </Field>

            <Field label={t('auth.registerCompany.cityLabel')} colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="Yerevan"
                placeholderTextColor={colors.textDisabled}
                value={city}
                onChangeText={setCity}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="City, optional"
              />
            </Field>
          </View>

          {/* Password */}
          <Text style={styles.sectionLabel}>{t('auth.registerCompany.sectionSecurity')}</Text>
          <View style={styles.card}>
            <Field label={t('auth.registerDriver.passwordLabel')} colors={colors}>
              <TextInput
                style={styles.input}
                placeholder={t('auth.registerCompany.passwordPlaceholder')}
                placeholderTextColor={colors.textDisabled}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                returnKeyType="next"
                accessibilityLabel="Password, minimum 6 characters"
              />
            </Field>

            <Field label={t('auth.registerDriver.confirmLabel')} colors={colors}>
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

          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              🏢 {t('auth.registerCompany.pendingNote')}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Submit company application"
            accessibilityState={{ disabled: loading }}>
            {loading
              ? <ActivityIndicator color={colors.textOnPrimary} />
              : <Text style={styles.btnText}>{t('auth.registerCompany.submitBtn')}</Text>
            }
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

    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textSecondary,
      letterSpacing: 0.8, textTransform: 'uppercase',
      marginBottom: 8, marginLeft: 4,
    },

    card: {
      backgroundColor: c.surface, borderRadius: 16,
      padding: 20, borderWidth: 1, borderColor: c.border, marginBottom: 20,
    },

    input: {
      height: 48, borderWidth: 1.5, borderColor: c.border,
      borderRadius: 10, paddingHorizontal: 14,
      fontSize: 15, color: c.text, backgroundColor: c.background,
    },

    noteBox: {
      backgroundColor: c.infoLight, borderRadius: 10,
      padding: 12, marginBottom: 24, borderWidth: 1, borderColor: c.info,
    },
    noteText: { fontSize: 13, color: c.info, lineHeight: 18 },

    btn:         { height: 52, backgroundColor: c.primary, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    btnDisabled: { opacity: 0.6 },
    btnText:     { fontSize: 16, fontWeight: '700', color: c.textOnPrimary },

    bottomPad: { height: 32 },
  });
}
