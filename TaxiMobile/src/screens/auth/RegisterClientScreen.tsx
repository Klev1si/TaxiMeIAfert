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
import { authApi } from '../../api/auth';
import { Colors, Sizes } from '../../constants';
import type { AuthScreenProps } from '../../navigation/types';

type Props = AuthScreenProps<'RegisterClient'>;

export default function RegisterClientScreen({ navigation, route }: Props) {
  const { phone } = route.params;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Missing fields', 'Please enter your first and last name.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authApi.registerClient({
        phone,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      Alert.alert(
        'Account created!',
        'Your passenger account is ready. Please sign in.',
        [{ text: 'Sign In', onPress: () => navigation.navigate('Login') }],
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Registration failed.';
      Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : msg);
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
            activeOpacity={0.7}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          {/* Title */}
          <Text style={styles.title}>Create Passenger Account</Text>
          <Text style={styles.subtitle}>
            Phone: <Text style={styles.phoneText}>{phone}</Text>
          </Text>

          {/* Form */}
          <View style={styles.card}>
            <Field label="First Name">
              <TextInput
                style={styles.input}
                placeholder="Jane"
                placeholderTextColor={Colors.textDisabled}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </Field>

            <Field label="Last Name">
              <TextInput
                style={styles.input}
                placeholder="Doe"
                placeholderTextColor={Colors.textDisabled}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </Field>

            <Field label="Password">
              <TextInput
                style={styles.input}
                placeholder="Min. 8 characters"
                placeholderTextColor={Colors.textDisabled}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                returnKeyType="next"
              />
            </Field>

            <Field label="Confirm Password">
              <TextInput
                style={styles.input}
                placeholder="Repeat your password"
                placeholderTextColor={Colors.textDisabled}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleRegister}
              />
            </Field>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color={Colors.textOnPrimary} />
            ) : (
              <Text style={styles.btnText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomPad} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  scroll: { padding: Sizes.screenPadding },

  backBtn: { marginBottom: 24 },
  backText: { fontSize: 16, color: Colors.primary, fontWeight: '600' },

  title: { fontSize: 26, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },
  phoneText: { color: Colors.text, fontWeight: '700' },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
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
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 16, fontWeight: '700', color: Colors.textOnPrimary },

  bottomPad: { height: 32 },
});
