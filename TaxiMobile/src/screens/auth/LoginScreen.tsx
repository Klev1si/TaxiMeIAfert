import React, { useState } from 'react';
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
import { Colors, Sizes } from '../../constants';
import type { AuthScreenProps } from '../../navigation/types';

type Props = AuthScreenProps<'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { login, isLoading } = useAuthStore();

  // ── Login form ──────────────────────────────────────────────────────────────
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  // ── Register form ───────────────────────────────────────────────────────────
  const [regPhone, setRegPhone] = useState('');
  const [regRole, setRegRole] = useState<'client' | 'driver'>('client');
  const [sendingOtp, setSendingOtp] = useState(false);

  const handleLogin = async () => {
    if (!phone.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your phone number and password.');
      return;
    }
    try {
      await login(phone.trim(), password);
      // RootNavigator redirects automatically once user is set
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ?? 'Login failed. Check your credentials.';
      Alert.alert('Login Error', Array.isArray(msg) ? msg.join('\n') : msg);
    }
  };

  const handleSendOtp = async () => {
    const trimmed = regPhone.trim();
    if (!trimmed) {
      Alert.alert('Missing phone', 'Please enter your phone number.');
      return;
    }
    setSendingOtp(true);
    try {
      await authApi.sendOtp(trimmed);
      navigation.navigate('Otp', { phone: trimmed, mode: 'register', role: regRole });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Failed to send OTP.';
      Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : msg);
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

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoBox}>
              <Text style={styles.logoEmoji}>🚕</Text>
            </View>
            <Text style={styles.appName}>TaxiApp</Text>
            <Text style={styles.tagline}>Your ride, on demand</Text>
          </View>

          {/* Login card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign In</Text>

            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="+1 555 000 0000"
              placeholderTextColor={Colors.textDisabled}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="next"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={Colors.textDisabled}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            <TouchableOpacity
              style={[styles.btn, isLoading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}>
              {isLoading ? (
                <ActivityIndicator color={Colors.textOnPrimary} />
              ) : (
                <Text style={styles.btnText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>New here?</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Registration card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create Account</Text>

            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[styles.roleBtn, regRole === 'client' && styles.roleBtnActive]}
                onPress={() => setRegRole('client')}
                activeOpacity={0.8}>
                <Text
                  style={[
                    styles.roleBtnText,
                    regRole === 'client' && styles.roleBtnTextActive,
                  ]}>
                  Passenger
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleBtn, regRole === 'driver' && styles.roleBtnActive]}
                onPress={() => setRegRole('driver')}
                activeOpacity={0.8}>
                <Text
                  style={[
                    styles.roleBtnText,
                    regRole === 'driver' && styles.roleBtnTextActive,
                  ]}>
                  Driver
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="+1 555 000 0000"
              placeholderTextColor={Colors.textDisabled}
              value={regPhone}
              onChangeText={setRegPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="done"
              onSubmitEditing={handleSendOtp}
            />

            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, sendingOtp && styles.btnDisabled]}
              onPress={handleSendOtp}
              disabled={sendingOtp}
              activeOpacity={0.8}>
              {sendingOtp ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <Text style={[styles.btnText, styles.btnTextOutline]}>
                  Send Verification Code
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.bottomPad} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  scroll: { padding: Sizes.screenPadding },

  header: { alignItems: 'center', marginBottom: 32, marginTop: 16 },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoEmoji: { fontSize: 40 },
  appName: { fontSize: 28, fontWeight: '800', color: Colors.text },
  tagline: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.background,
  },

  btn: {
    height: 50,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 16, fontWeight: '700', color: Colors.textOnPrimary },
  btnOutline: {
    backgroundColor: Colors.transparent,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  btnTextOutline: { color: Colors.primary },

  roleRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    padding: 4,
    marginBottom: 8,
  },
  roleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  roleBtnActive: { backgroundColor: Colors.primary },
  roleBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  roleBtnTextActive: { color: Colors.textOnPrimary },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginHorizontal: 12,
    fontWeight: '500',
  },

  bottomPad: { height: 32 },
});
