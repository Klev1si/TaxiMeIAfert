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

type Props = AuthScreenProps<'RegisterDriver'>;

export default function RegisterDriverScreen({ navigation, route }: Props) {
  const { phone } = route.params;

  // Personal
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Vehicle
  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');

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
    if (!licenseNumber.trim()) {
      Alert.alert('Missing field', 'Please enter your driver\'s license number.');
      return;
    }
    if (!vehicleMake.trim() || !vehicleModel.trim()) {
      Alert.alert('Missing vehicle info', 'Please enter vehicle make and model.');
      return;
    }
    const year = parseInt(vehicleYear, 10);
    const currentYear = new Date().getFullYear();
    if (!year || year < 1990 || year > currentYear + 1) {
      Alert.alert('Invalid year', `Vehicle year must be between 1990 and ${currentYear + 1}.`);
      return;
    }
    if (!vehiclePlate.trim()) {
      Alert.alert('Missing field', 'Please enter your license plate number.');
      return;
    }

    setLoading(true);
    try {
      await authApi.registerDriver({
        phone,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        licenseNumber: licenseNumber.trim().toUpperCase(),
        vehicleMake: vehicleMake.trim(),
        vehicleModel: vehicleModel.trim(),
        vehicleYear: year,
        vehiclePlate: vehiclePlate.trim().toUpperCase(),
        vehicleColor: vehicleColor.trim() || undefined,
      });
      Alert.alert(
        'Application submitted!',
        'Your driver account is pending approval. You will be notified once approved.',
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
          <Text style={styles.title}>Driver Registration</Text>
          <Text style={styles.subtitle}>
            Phone: <Text style={styles.phoneText}>{phone}</Text>
          </Text>

          {/* Personal info */}
          <Text style={styles.sectionLabel}>Personal Information</Text>
          <View style={styles.card}>
            <Field label="First Name">
              <TextInput
                style={styles.input}
                placeholder="John"
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
                placeholder="Smith"
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
                returnKeyType="next"
              />
            </Field>

            <Field label="Driver's License Number">
              <TextInput
                style={styles.input}
                placeholder="DL-123456"
                placeholderTextColor={Colors.textDisabled}
                value={licenseNumber}
                onChangeText={setLicenseNumber}
                autoCapitalize="characters"
                returnKeyType="next"
              />
            </Field>
          </View>

          {/* Vehicle info */}
          <Text style={styles.sectionLabel}>Vehicle Information</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Field label="Make">
                  <TextInput
                    style={styles.input}
                    placeholder="Toyota"
                    placeholderTextColor={Colors.textDisabled}
                    value={vehicleMake}
                    onChangeText={setVehicleMake}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </Field>
              </View>
              <View style={styles.halfField}>
                <Field label="Model">
                  <TextInput
                    style={styles.input}
                    placeholder="Camry"
                    placeholderTextColor={Colors.textDisabled}
                    value={vehicleModel}
                    onChangeText={setVehicleModel}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </Field>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Field label="Year">
                  <TextInput
                    style={styles.input}
                    placeholder="2020"
                    placeholderTextColor={Colors.textDisabled}
                    value={vehicleYear}
                    onChangeText={setVehicleYear}
                    keyboardType="number-pad"
                    maxLength={4}
                    returnKeyType="next"
                  />
                </Field>
              </View>
              <View style={styles.halfField}>
                <Field label="Color">
                  <TextInput
                    style={styles.input}
                    placeholder="White"
                    placeholderTextColor={Colors.textDisabled}
                    value={vehicleColor}
                    onChangeText={setVehicleColor}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </Field>
              </View>
            </View>

            <Field label="License Plate">
              <TextInput
                style={styles.input}
                placeholder="ABC-1234"
                placeholderTextColor={Colors.textDisabled}
                value={vehiclePlate}
                onChangeText={setVehiclePlate}
                autoCapitalize="characters"
                returnKeyType="done"
                onSubmitEditing={handleRegister}
              />
            </Field>
          </View>

          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              Your application will be reviewed by an administrator before activation.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color={Colors.textOnPrimary} />
            ) : (
              <Text style={styles.btnText}>Submit Application</Text>
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

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },

  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },

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

  noteBox: {
    backgroundColor: Colors.infoLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.info,
  },
  noteText: { fontSize: 13, color: Colors.info, lineHeight: 18 },

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
