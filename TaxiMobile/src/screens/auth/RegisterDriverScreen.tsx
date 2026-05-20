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
import type { VehicleType } from '../../api/rides';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import { useTranslation } from '../../i18n';
import type { ColorPalette } from '../../constants/colors';
import type { AuthScreenProps } from '../../navigation/types';

type Props = AuthScreenProps<'RegisterDriver'>;

export default function RegisterDriverScreen({ navigation, route }: Props) {
  const { phone } = route.params;
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

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
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);

  const VEHICLE_TYPES: { value: VehicleType; label: string; icon: string; desc: string }[] = [
    { value: 'economy', label: t('auth.registerDriver.categoryEconomy'), icon: '🚗', desc: t('auth.registerDriver.categoryEconomyDesc') },
    { value: 'comfort', label: t('auth.registerDriver.categoryComfort'), icon: '🚙', desc: t('auth.registerDriver.categoryComfortDesc') },
    { value: 'xl',      label: t('auth.registerDriver.categoryXL'),      icon: '🚐', desc: t('auth.registerDriver.categoryXLDesc') },
  ];

  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert(t('auth.registerDriver.missingTitle'), t('auth.registerDriver.missingMsg'));
      return;
    }
    if (password.length < 8) {
      Alert.alert(t('auth.registerDriver.weakPassTitle'), t('auth.registerDriver.weakPassMsg'));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('auth.registerDriver.mismatchTitle'), t('auth.registerDriver.mismatchMsg'));
      return;
    }
    if (!licenseNumber.trim()) {
      Alert.alert(t('auth.registerDriver.missingLicenseTitle'), t('auth.registerDriver.missingLicenseMsg'));
      return;
    }
    if (!vehicleMake.trim() || !vehicleModel.trim()) {
      Alert.alert(t('auth.registerDriver.missingVehicleInfo'), t('auth.registerDriver.missingVehicleInfoMsg'));
      return;
    }
    const year = parseInt(vehicleYear, 10);
    const currentYear = new Date().getFullYear();
    if (!year || year < 1990 || year > currentYear + 1) {
      Alert.alert(t('auth.registerDriver.invalidYearTitle'), t('auth.registerDriver.invalidYearMsg'));
      return;
    }
    if (!vehiclePlate.trim()) {
      Alert.alert(t('auth.registerDriver.missingPlateTitle'), t('auth.registerDriver.missingPlateMsg'));
      return;
    }
    if (!vehicleType) {
      Alert.alert(t('auth.registerDriver.missingVehicleTitle'), t('auth.registerDriver.missingVehicleMsg'));
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
        vehicleType: vehicleType,
      });
      Alert.alert(
        t('auth.registerDriver.successTitle'),
        t('auth.registerDriver.successMsg'),
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
          <Text style={styles.title}>{t('auth.registerDriver.title')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.registerClient.phoneLabel')} <Text style={styles.phoneText}>{phone}</Text>
          </Text>

          {/* Personal info */}
          <Text style={styles.sectionLabel}>{t('auth.registerDriver.sectionPersonal')}</Text>
          <View style={styles.card}>
            <Field label={t('auth.registerDriver.firstNameLabel')} colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="John"
                placeholderTextColor={colors.textDisabled}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="First name"
              />
            </Field>

            <Field label={t('auth.registerDriver.lastNameLabel')} colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="Smith"
                placeholderTextColor={colors.textDisabled}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="Last name"
              />
            </Field>

            <Field label={t('auth.registerDriver.passwordLabel')} colors={colors}>
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

            <Field label={t('auth.registerDriver.confirmLabel')} colors={colors}>
              <TextInput
                style={styles.input}
                placeholder={t('auth.registerClient.confirmPlaceholder')}
                placeholderTextColor={colors.textDisabled}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                returnKeyType="next"
                accessibilityLabel="Confirm password"
              />
            </Field>

            <Field label={t('auth.registerDriver.licenseLabel')} colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="DL-123456"
                placeholderTextColor={colors.textDisabled}
                value={licenseNumber}
                onChangeText={setLicenseNumber}
                autoCapitalize="characters"
                returnKeyType="next"
                accessibilityLabel="Driver's license number"
              />
            </Field>
          </View>

          {/* Vehicle info */}
          <Text style={styles.sectionLabel}>{t('auth.registerDriver.sectionVehicle')}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Field label={t('auth.registerDriver.makeLabel')} colors={colors}>
                  <TextInput
                    style={styles.input}
                    placeholder="Toyota"
                    placeholderTextColor={colors.textDisabled}
                    value={vehicleMake}
                    onChangeText={setVehicleMake}
                    autoCapitalize="words"
                    returnKeyType="next"
                    accessibilityLabel="Vehicle make"
                  />
                </Field>
              </View>
              <View style={styles.halfField}>
                <Field label={t('auth.registerDriver.modelLabel')} colors={colors}>
                  <TextInput
                    style={styles.input}
                    placeholder="Camry"
                    placeholderTextColor={colors.textDisabled}
                    value={vehicleModel}
                    onChangeText={setVehicleModel}
                    autoCapitalize="words"
                    returnKeyType="next"
                    accessibilityLabel="Vehicle model"
                  />
                </Field>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Field label={t('auth.registerDriver.yearLabel')} colors={colors}>
                  <TextInput
                    style={styles.input}
                    placeholder="2020"
                    placeholderTextColor={colors.textDisabled}
                    value={vehicleYear}
                    onChangeText={setVehicleYear}
                    keyboardType="number-pad"
                    maxLength={4}
                    returnKeyType="next"
                    accessibilityLabel="Vehicle year"
                  />
                </Field>
              </View>
              <View style={styles.halfField}>
                <Field label={t('auth.registerDriver.colorLabel')} colors={colors}>
                  <TextInput
                    style={styles.input}
                    placeholder="White"
                    placeholderTextColor={colors.textDisabled}
                    value={vehicleColor}
                    onChangeText={setVehicleColor}
                    autoCapitalize="words"
                    returnKeyType="next"
                    accessibilityLabel="Vehicle color"
                  />
                </Field>
              </View>
            </View>

            <Field label={t('auth.registerDriver.plateLabel')} colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="ABC-1234"
                placeholderTextColor={colors.textDisabled}
                value={vehiclePlate}
                onChangeText={setVehiclePlate}
                autoCapitalize="characters"
                returnKeyType="done"
                onSubmitEditing={handleRegister}
                accessibilityLabel="License plate number"
              />
            </Field>
          </View>

          {/* Vehicle category */}
          <Text style={styles.sectionLabel}>{t('auth.registerDriver.vehicleCategoryLabel')}</Text>
          <View style={styles.card}>
            <Text style={styles.typeHint}>
              {t('auth.registerDriver.categoryHint')}
            </Text>
            <View style={styles.typeGrid}>
              {VEHICLE_TYPES.map(vt => (
                <TouchableOpacity
                  key={vt.value}
                  style={[styles.typeCard, vehicleType === vt.value && styles.typeCardActive]}
                  onPress={() => setVehicleType(vt.value)}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityLabel={`${vt.label} – ${vt.desc}`}
                  accessibilityState={{ checked: vehicleType === vt.value }}
                >
                  <Text style={styles.typeIcon}>{vt.icon}</Text>
                  <Text style={[styles.typeLabel, vehicleType === vt.value && styles.typeLabelActive]}>
                    {vt.label}
                  </Text>
                  <Text style={styles.typeDesc}>{vt.desc}</Text>
                  {vehicleType === vt.value && (
                    <View style={styles.typeCheck}><Text style={styles.typeCheckText}>✓</Text></View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              {t('auth.registerDriver.pendingNote')}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Submit driver application"
            accessibilityState={{ disabled: loading }}>
            {loading ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.btnText}>{t('auth.registerDriver.submitBtn')}</Text>
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

    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginLeft: 4,
    },

    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 20,
    },

    row:       { flexDirection: 'row', gap: 12 },
    halfField: { flex: 1 },

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

    // Vehicle type grid
    typeHint: {
      fontSize: 13,
      color: c.textSecondary,
      marginBottom: 14,
      lineHeight: 18,
    },
    typeGrid: {
      flexDirection: 'row',
      gap: 10,
    },
    typeCard: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 8,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.background,
      position: 'relative',
    },
    typeCardActive: {
      borderColor: c.primary,
      backgroundColor: c.primary + '12',
    },
    typeIcon:  { fontSize: 28, marginBottom: 6 },
    typeLabel: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 3 },
    typeLabelActive: { color: c.primary },
    typeDesc: {
      fontSize: 10,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 13,
    },
    typeCheck: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    typeCheckText: { fontSize: 11, color: '#fff', fontWeight: '700' },

    noteBox: {
      backgroundColor: c.infoLight,
      borderRadius: 10,
      padding: 12,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: c.info,
    },
    noteText: { fontSize: 13, color: c.info, lineHeight: 18 },

    btn:         { height: 52, backgroundColor: c.primary, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    btnDisabled: { opacity: 0.6 },
    btnText:     { fontSize: 16, fontWeight: '700', color: c.textOnPrimary },

    bottomPad: { height: 32 },
  });
}
