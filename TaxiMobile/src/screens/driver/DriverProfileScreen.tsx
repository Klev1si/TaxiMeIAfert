import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { useDriverStore } from '../../stores/driverStore';
import { authApi } from '../../api/auth';
import { useTranslation } from '../../i18n';
import { ridesApi, type DriverRatings } from '../../api/rides';
import { documentsApi, type DriverDocument, type DocumentType } from '../../api/documents';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import AvatarPicker from '../../components/AvatarPicker';
import LanguagePickerModal from '../../components/LanguagePickerModal';
import ThemeToggle from '../../components/ThemeToggle';
import Config from '../../config';

type DriverProfile = {
  phone: string; role: string;
  avatarUrl: string | null;
  firstName: string | null; lastName: string | null; rating: number | null;
  isApproved: boolean;
  licenseNumber: string | null;
  vehicleMake: string | null; vehicleModel: string | null;
  vehiclePlate: string | null; vehicleColor: string | null;
  vehicleYear: number | null;
  /** Null = solo driver (can set own tariff and keeps 100% of fares) */
  companyId: string | null;
};

// ── Edit Profile Modal ────────────────────────────────────────────────────────

function EditProfileModal({
  visible,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initial: {
    firstName: string; lastName: string; vehicleColor: string;
    vehicleMake: string; vehicleModel: string; vehicleYear: string;
    isApproved: boolean;
  };
  onClose: () => void;
  /** Called with the full updated driver profile returned by the API. */
  onSaved: (updated: Partial<DriverProfile>) => void;
}) {
  const colors = useColors();
  const modalStyles = useMemo(() => getModalStyles(colors), [colors]);
  const { t } = useTranslation();
  const [firstName,    setFirstName]    = useState(initial.firstName);
  const [lastName,     setLastName]     = useState(initial.lastName);
  const [vehicleColor, setVehicleColor] = useState(initial.vehicleColor);
  const [vehicleMake,  setVehicleMake]  = useState(initial.vehicleMake);
  const [vehicleModel, setVehicleModel] = useState(initial.vehicleModel);
  const [vehicleYear,  setVehicleYear]  = useState(initial.vehicleYear);
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    if (visible) {
      setFirstName(initial.firstName);
      setLastName(initial.lastName);
      setVehicleColor(initial.vehicleColor);
      setVehicleMake(initial.vehicleMake);
      setVehicleModel(initial.vehicleModel);
      setVehicleYear(initial.vehicleYear);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Highlight which fields revoke approval so the driver isn't surprised.
  const vehicleChanged =
    vehicleMake.trim()  !== initial.vehicleMake  ||
    vehicleModel.trim() !== initial.vehicleModel ||
    vehicleYear.trim()  !== initial.vehicleYear;

  const handleSave = async () => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const vc = vehicleColor.trim();
    const vmk = vehicleMake.trim();
    const vmd = vehicleModel.trim();
    const vyStr = vehicleYear.trim();
    if (!fn) { Alert.alert(t('common.validation'), t('driver.profile.firstNameRequired')); return; }
    if (vmk && vmk.length < 2)  { Alert.alert(t('common.validation'), 'Vehicle make is too short.'); return; }
    if (vmd && vmd.length < 1)  { Alert.alert(t('common.validation'), 'Vehicle model is required.'); return; }
    let vy: number | undefined;
    if (vyStr) {
      vy = parseInt(vyStr, 10);
      const thisYear = new Date().getFullYear();
      if (!Number.isFinite(vy) || vy < 1900 || vy > thisYear + 1) {
        Alert.alert(t('common.validation'), `Vehicle year must be between 1900 and ${thisYear + 1}.`);
        return;
      }
    }

    const doSave = async () => {
      setSaving(true);
      try {
        const { data } = await authApi.updateProfile({
          firstName: fn,
          lastName:  ln || undefined,
          vehicleColor: vc || undefined,
          vehicleMake:  vmk || undefined,
          vehicleModel: vmd || undefined,
          vehicleYear:  vy,
        });
        onSaved(data as Partial<DriverProfile>);
      } catch (err: any) {
        const msg = err?.response?.data?.message ?? t('driver.profile.saveFailMsg');
        Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
      } finally {
        setSaving(false);
      }
    };

    if (vehicleChanged && initial.isApproved) {
      // Confirm before re-approval-revoking action.
      Alert.alert(
        'Re-approval required',
        'Changing vehicle make, model, or year revokes your approved status. ' +
        'You won\'t be able to accept rides until an admin re-approves you.\n\n' +
        'Continue?',
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: 'Save anyway', style: 'destructive', onPress: doSave },
        ],
      );
    } else {
      await doSave();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={modalStyles.sheet} onPress={() => {}}>
            <Text style={modalStyles.title}>{t('driver.profile.editTitle')}</Text>

            <Text style={modalStyles.label}>{t('driver.profile.firstNameLabel')}</Text>
            <TextInput
              style={modalStyles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder={t('driver.profile.firstNamePlaceholder')}
              placeholderTextColor={colors.textDisabled}
              autoCapitalize="words"
              returnKeyType="next"
              maxLength={80}
              accessibilityLabel={t('driver.profile.firstNameLabel')}
            />

            <Text style={modalStyles.label}>{t('driver.profile.lastNameLabel')}</Text>
            <TextInput
              style={modalStyles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder={t('driver.profile.lastNamePlaceholder')}
              placeholderTextColor={colors.textDisabled}
              autoCapitalize="words"
              returnKeyType="next"
              maxLength={80}
              accessibilityLabel={t('driver.profile.lastNameLabel')}
            />

            <Text style={modalStyles.label}>{t('driver.profile.vehicleColorLabel')}</Text>
            <TextInput
              style={modalStyles.input}
              value={vehicleColor}
              onChangeText={setVehicleColor}
              placeholder={t('driver.profile.vehicleColorPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              autoCapitalize="words"
              returnKeyType="next"
              maxLength={40}
            />

            <View style={{
              marginTop: 4, marginBottom: 8,
              padding: 10, borderRadius: 8,
              backgroundColor: vehicleChanged ? '#FEF3C7' : colors.surfaceAlt ?? colors.surface,
              borderWidth: 1, borderColor: vehicleChanged ? '#F59E0B' : colors.border,
            }}>
              <Text style={{ fontSize: 11, color: vehicleChanged ? '#92400E' : colors.textSecondary }}>
                {vehicleChanged
                  ? '⚠ Saving will revoke your approval until an admin re-approves you.'
                  : 'ⓘ Changing make / model / year requires admin re-approval before you can accept rides.'}
              </Text>
            </View>

            <Text style={modalStyles.label}>Vehicle make</Text>
            <TextInput
              style={modalStyles.input}
              value={vehicleMake}
              onChangeText={setVehicleMake}
              placeholder="e.g. Toyota"
              placeholderTextColor={colors.textDisabled}
              autoCapitalize="words"
              returnKeyType="next"
              maxLength={60}
            />

            <Text style={modalStyles.label}>Vehicle model</Text>
            <TextInput
              style={modalStyles.input}
              value={vehicleModel}
              onChangeText={setVehicleModel}
              placeholder="e.g. Corolla"
              placeholderTextColor={colors.textDisabled}
              autoCapitalize="words"
              returnKeyType="next"
              maxLength={60}
            />

            <Text style={modalStyles.label}>Vehicle year</Text>
            <TextInput
              style={modalStyles.input}
              value={vehicleYear}
              onChangeText={setVehicleYear}
              placeholder="e.g. 2020"
              placeholderTextColor={colors.textDisabled}
              keyboardType="number-pad"
              returnKeyType="done"
              maxLength={4}
            />

            <View style={modalStyles.row}>
              <TouchableOpacity
                style={modalStyles.btnCancel}
                onPress={onClose}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
                accessibilityState={{ disabled: saving }}>
                <Text style={modalStyles.btnCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.btnSave, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={t('common.save')}
                accessibilityState={{ disabled: saving }}>
                {saving
                  ? <ActivityIndicator color={colors.textOnPrimary} />
                  : <Text style={modalStyles.btnSaveText}>{t('common.save')}</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Change Password Modal ─────────────────────────────────────────────────────

function ChangePasswordModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const modalStyles = useMemo(() => getModalStyles(colors), [colors]);
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    if (visible) { setCurrent(''); setNext(''); setConfirm(''); }
  }, [visible]);

  const handleSave = async () => {
    if (!current) { Alert.alert(t('common.validation'), t('driver.profile.currentPasswordRequired')); return; }
    if (next.length < 6) { Alert.alert(t('common.validation'), t('driver.profile.passwordTooShort')); return; }
    if (next !== confirm) { Alert.alert(t('common.validation'), t('driver.profile.passwordMismatch')); return; }
    setSaving(true);
    try {
      await authApi.changePassword({ currentPassword: current, newPassword: next });
      Alert.alert(t('common.success'), t('driver.profile.passwordChanged'));
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('driver.profile.passwordChangeFailMsg');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={modalStyles.sheet} onPress={() => {}}>
            <Text style={modalStyles.title}>{t('driver.profile.changePwTitle')}</Text>

            <Text style={modalStyles.label}>{t('driver.profile.currentPwLabel')}</Text>
            <TextInput
              style={modalStyles.input}
              value={current}
              onChangeText={setCurrent}
              placeholder={t('driver.profile.currentPwPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              returnKeyType="next"
              accessibilityLabel={t('driver.profile.currentPwLabel')}
            />

            <Text style={modalStyles.label}>{t('driver.profile.newPwLabel')}</Text>
            <TextInput
              style={modalStyles.input}
              value={next}
              onChangeText={setNext}
              placeholder={t('driver.profile.newPwPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              returnKeyType="next"
              maxLength={64}
              accessibilityLabel={t('driver.profile.newPwLabel')}
            />

            <Text style={modalStyles.label}>{t('driver.profile.confirmPwLabel')}</Text>
            <TextInput
              style={modalStyles.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder={t('driver.profile.confirmPwPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              returnKeyType="done"
              maxLength={64}
              accessibilityLabel={t('driver.profile.confirmPwLabel')}
            />

            <View style={modalStyles.row}>
              <TouchableOpacity
                style={modalStyles.btnCancel}
                onPress={onClose}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
                accessibilityState={{ disabled: saving }}>
                <Text style={modalStyles.btnCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.btnSave, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={t('common.save')}
                accessibilityState={{ disabled: saving }}>
                {saving
                  ? <ActivityIndicator color={colors.textOnPrimary} />
                  : <Text style={modalStyles.btnSaveText}>{t('common.save')}</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function DriverProfileScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const navigation       = useNavigation<any>();
  const { user, logout } = useAuthStore();
  const { isOnline }     = useDriverStore();
  const { t }            = useTranslation();
  const [profile,          setProfile]          = useState<DriverProfile | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [loggingOut,       setLoggingOut]       = useState(false);
  const [editVisible,      setEditVisible]      = useState(false);
  const [pwVisible,        setPwVisible]        = useState(false);
  const [langVisible,      setLangVisible]      = useState(false);
  const [ratings,          setRatings]          = useState<DriverRatings | null>(null);
  const [showAllReviews,   setShowAllReviews]   = useState(false);
  const [deletingAccount,  setDeletingAccount]  = useState(false);
  const [documents,        setDocuments]        = useState<DriverDocument[]>([]);
  const [uploadingDocType, setUploadingDocType] = useState<DocumentType | null>(null);

  useEffect(() => {
    authApi.getMe()
      .then(({ data }) => setProfile(data as DriverProfile))
      .catch(() => {})
      .finally(() => setLoading(false));

    ridesApi.getRatings()
      .then(({ data }) => setRatings(data))
      .catch(() => {});

    documentsApi.getMyDocuments()
      .then(({ data }) => setDocuments(data))
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    Alert.alert(t('auth.signOutTitle'), t('auth.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.signOut'),
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try { await logout(); } finally { setLoggingOut(false); }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('profile.deleteAccount.title'),
      t('profile.deleteAccount.confirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.deleteAccount.button'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('profile.deleteAccount.finalTitle'),
              t('profile.deleteAccount.finalConfirm'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('profile.deleteAccount.button'),
                  style: 'destructive',
                  onPress: async () => {
                    setDeletingAccount(true);
                    try {
                      await authApi.deleteAccount();
                      await logout();
                    } catch (err: any) {
                      const msg = err?.response?.data?.message ?? t('profile.deleteAccount.error');
                      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
                    } finally {
                      setDeletingAccount(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleProfileSaved = (updated: Partial<DriverProfile>) => {
    // Merge the new fields returned by the API into the existing profile so
    // re-approval revocation, vehicle changes, etc. are reflected immediately.
    setProfile(prev => prev ? { ...prev, ...updated } : prev);
    setEditVisible(false);
  };

  // ── Document upload ────────────────────────────────────────────────────────
  const handleUploadDocument = async (type: DocumentType) => {
    // Dynamically load image picker (same approach as AvatarPicker)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let picker: any = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      picker = require('react-native-image-picker');
    } catch {
      Alert.alert(t('common.notAvailable'), t('driver.profile.imagePickerUnavailable'));
      return;
    }

    picker.launchImageLibrary(
      { mediaType: 'photo', quality: 0.85, includeBase64: false },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (response: any) => {
        if (response.didCancel || !response.assets?.[0]) { return; }
        const asset = response.assets[0];
        if (!asset.uri) { return; }

        setUploadingDocType(type);
        try {
          const formData = new FormData();
          formData.append('file', {
            uri:  asset.uri,
            type: asset.type ?? 'image/jpeg',
            name: asset.fileName ?? `doc-${type}.jpg`,
          } as any);
          formData.append('type', type);
          const { data } = await documentsApi.uploadDocument(formData);
          setDocuments(prev => {
            const filtered = prev.filter(d => d.type !== type);
            return [...filtered, data];
          });
          Alert.alert(t('common.uploaded'), t('driver.profile.docSubmitted'));
        } catch (err: any) {
          const msg = err?.response?.data?.message ?? t('driver.profile.uploadFailed');
          Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
        } finally {
          setUploadingDocType(null);
        }
      },
    );
  };

  const displayName = profile?.firstName
    ? `${profile.firstName} ${profile.lastName ?? ''}`.trim()
    : user?.phone ?? '—';

  const ratingStyles = useMemo(() => getRatingStyles(colors), [colors]);
  const docStyles = useMemo(() => getDocStyles(colors), [colors]);
  const rowStyles = useMemo(() => getRowStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Avatar + name */}
        <View style={styles.avatarWrap}>
          <AvatarPicker
            avatarUrl={profile?.avatarUrl ?? null}
            initial={(profile?.firstName?.[0] ?? user?.phone?.[0] ?? '?')}
            size={88}
            onChanged={(url) => setProfile(prev => prev ? { ...prev, avatarUrl: url } : prev)}
          />
          {loading
            ? <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
            : <Text style={styles.name}>{displayName}</Text>}

          {/* Online badge */}
          <View style={[styles.onlineBadge, { backgroundColor: isOnline ? colors.success + '22' : colors.surfaceAlt }]}>
            <View style={[styles.onlineDot, { backgroundColor: isOnline ? colors.success : colors.textDisabled }]} />
            <Text style={[styles.onlineText, { color: isOnline ? colors.success : colors.textSecondary }]}>
              {isOnline ? t('driver.home.statusOnline') : t('driver.home.statusOffline')}
            </Text>
          </View>

          {profile?.rating != null && (
            <View style={styles.ratingRow}>
              <Text style={styles.ratingStar}>⭐</Text>
              <Text style={styles.ratingValue}>{Number(profile.rating).toFixed(1)}</Text>
              <Text style={styles.ratingLabel}> {t('driver.profile.driverRatingLabel')}</Text>
            </View>
          )}
        </View>

        {/* Approval status */}
        {profile && !profile.isApproved && (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingText}>
              ⏳ {t('driver.profile.pendingApproval')}
            </Text>
          </View>
        )}

        {/* Account info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('driver.profile.accountSection')}</Text>
          <InfoRow label={t('driver.profile.phoneLabel')}  value={user?.phone ?? '—'} rowStyles={rowStyles} />
          <InfoRow label={t('driver.profile.roleLabel')}   value={t('driver.profile.roleValue')} rowStyles={rowStyles} />
          <InfoRow label={t('driver.profile.statusLabel')} value={profile?.isApproved ? `✅ ${t('driver.profile.statusApproved')}` : `⏳ ${t('driver.profile.statusPending')}`} rowStyles={rowStyles} />
          {profile?.licenseNumber && (
            <InfoRow label={t('driver.profile.licenseLabel')} value={profile.licenseNumber} rowStyles={rowStyles} />
          )}
        </View>

        {/* Vehicle info */}
        {profile && (profile.vehicleMake || profile.vehicleModel) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('driver.profile.vehicleSection')}</Text>
            {profile.vehicleMake && profile.vehicleModel && (
              <InfoRow
                label={t('driver.profile.carLabel')}
                value={`${profile.vehicleMake} ${profile.vehicleModel}${profile.vehicleYear ? ` (${profile.vehicleYear})` : ''}`}
                rowStyles={rowStyles}
              />
            )}
            {profile.vehiclePlate && (
              <InfoRow label={t('driver.profile.plateLabel')} value={profile.vehiclePlate} rowStyles={rowStyles} />
            )}
            {profile.vehicleColor && (
              <InfoRow label={t('driver.profile.colorLabel')} value={profile.vehicleColor} rowStyles={rowStyles} />
            )}
          </View>
        )}

        {/* ── Documents card ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('driver.profile.docsSection')}</Text>
          <Text style={docStyles.hint}>
            {t('driver.profile.docsHint')}
          </Text>
          {DOC_TYPE_KEYS.map(({ type, labelKey, icon }) => {
            const label = t(labelKey);
            const doc = documents.find(d => d.type === type);
            const isUploading = uploadingDocType === type;
            const docStatusLabel: Record<DriverDocument['status'], string> = {
              pending:  t('driver.profile.docStatusPending'),
              approved: t('driver.profile.docStatusApproved'),
              rejected: t('driver.profile.docStatusRejected'),
            };
            return (
              <View key={type} style={docStyles.row}>
                <Text style={docStyles.icon}>{icon}</Text>
                <View style={docStyles.info}>
                  <Text style={docStyles.label}>{label}</Text>
                  {doc ? (
                    <>
                      <View style={[docStyles.badge, docStatusStyle(doc.status, colors)]}>
                        <Text style={[docStyles.badgeText, docStatusTextStyle(doc.status, colors)]}>
                          {docStatusLabel[doc.status]}
                        </Text>
                      </View>
                      {doc.status === 'rejected' && doc.rejectionReason && (
                        <Text style={docStyles.rejectionReason} numberOfLines={2}>
                          ⚠️ {doc.rejectionReason}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={docStyles.noDoc}>{t('driver.profile.docNotUploaded')}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[docStyles.uploadBtn, isUploading && docStyles.uploadBtnDisabled]}
                  onPress={() => handleUploadDocument(type)}
                  disabled={isUploading || doc?.status === 'approved'}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={
                    doc?.status === 'approved'
                      ? t('driver.profile.docApprovedLabel', { label })
                      : doc
                        ? t('driver.profile.docReuploadLabel', { label })
                        : t('driver.profile.docUploadLabel', { label })
                  }
                  accessibilityState={{ disabled: isUploading || doc?.status === 'approved' }}>
                  {isUploading
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Text style={[
                        docStyles.uploadBtnText,
                        doc?.status === 'approved' && docStyles.uploadBtnTextDone,
                      ]}>
                        {doc?.status === 'approved' ? '✓' : doc ? t('driver.profile.reuploadBtn') : t('driver.profile.uploadBtn')}
                      </Text>}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* ── Ratings card ───────────────────────────────────────────────── */}
        {ratings && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('driver.profile.myRatings')}</Text>

            {ratings.total === 0 ? (
              <Text style={ratingStyles.empty}>{t('driver.profile.noRatingsYet')}</Text>
            ) : (
              <>
                {/* Overall score row */}
                <View style={ratingStyles.scoreRow}>
                  <Text style={ratingStyles.scoreNumber}>
                    {ratings.average != null ? ratings.average.toFixed(1) : '—'}
                  </Text>
                  <View style={ratingStyles.scoreRight}>
                    <View style={ratingStyles.starsRow}>
                      {[1, 2, 3, 4, 5].map(s => (
                        <Text
                          key={s}
                          style={[
                            ratingStyles.starIcon,
                            {
                              color:
                                ratings.average != null && s <= Math.round(ratings.average)
                                  ? '#f59e0b'
                                  : colors.border,
                            },
                          ]}>
                          ★
                        </Text>
                      ))}
                    </View>
                    <Text style={ratingStyles.totalText}>
                      {ratings.total} {ratings.total === 1 ? 'rating' : 'ratings'}
                    </Text>
                  </View>
                </View>

                {/* Per-star breakdown bars */}
                <View style={ratingStyles.barsWrap}>
                  {[5, 4, 3, 2, 1].map(star => {
                    const count = ratings.breakdown[String(star)] ?? 0;
                    const pct   = ratings.total > 0 ? count / ratings.total : 0;
                    return (
                      <View key={star} style={ratingStyles.barRow}>
                        <Text style={ratingStyles.barLabel}>{star}★</Text>
                        <View style={ratingStyles.barTrack}>
                          <View
                            style={[
                              ratingStyles.barFill,
                              { width: `${Math.round(pct * 100)}%` as any },
                              star >= 4
                                ? { backgroundColor: colors.success }
                                : star === 3
                                  ? { backgroundColor: colors.warning }
                                  : { backgroundColor: colors.error },
                            ]}
                          />
                        </View>
                        <Text style={ratingStyles.barCount}>{count}</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Recent reviews */}
                {ratings.recent.length > 0 && (
                  <>
                    <Text style={[styles.cardTitle, { marginTop: 16, marginBottom: 10 }]}>
                      {t('driver.profile.recentReviews')}
                    </Text>
                    {(showAllReviews ? ratings.recent : ratings.recent.slice(0, 3)).map(
                      (r, i) => (
                        <View key={i} style={ratingStyles.reviewCard}>
                          {/* Stars */}
                          <View style={ratingStyles.reviewStarsRow}>
                            {[1, 2, 3, 4, 5].map(s => (
                              <Text
                                key={s}
                                style={[
                                  ratingStyles.reviewStar,
                                  { color: s <= r.rating ? colors.warning : colors.border },
                                ]}>
                                ★
                              </Text>
                            ))}
                            {r.completedAt && (
                              <Text style={ratingStyles.reviewDate}>
                                {new Date(r.completedAt).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day:   'numeric',
                                  year:  'numeric',
                                })}
                              </Text>
                            )}
                          </View>
                          {/* Review text */}
                          {r.review ? (
                            <Text style={ratingStyles.reviewText}>"{r.review}"</Text>
                          ) : (
                            <Text style={ratingStyles.reviewNoText}>{t('driver.profile.noComment')}</Text>
                          )}
                          {/* Pickup address */}
                          {r.pickupAddress && (
                            <Text style={ratingStyles.reviewAddress} numberOfLines={1}>
                              📍 {r.pickupAddress}
                            </Text>
                          )}
                        </View>
                      ),
                    )}

                    {ratings.recent.length > 3 && (
                      <TouchableOpacity
                        style={ratingStyles.toggleBtn}
                        onPress={() => setShowAllReviews(v => !v)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={showAllReviews ? 'Show fewer reviews' : `Show all ${ratings.recent.length} reviews`}>
                        <Text style={ratingStyles.toggleText}>
                          {showAllReviews
                            ? t('driver.profile.showFewer')
                            : t('driver.profile.showAllReviews', { count: ratings.recent.length })}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.cardTitle}>{t('driver.profile.settings')}</Text>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => setEditVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Edit profile">
            <Text style={styles.actionLabel}>✏️  {t('profile.editProfile')}</Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => setLangVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Language">
            <Text style={styles.actionLabel}>🌐  {t('profile.language')}</Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => setPwVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Change password">
            <Text style={styles.actionLabel}>🔒  {t('profile.changePassword')}</Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>

          {/* "My Tariff" — solo drivers only (companyId is null). Company drivers
              get their tariff from the company admin, so we hide this row for them. */}
          {profile?.companyId == null && (
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => navigation.navigate('DriverTariff')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="My Tariff">
              <Text style={styles.actionLabel}>💲  My Tariff</Text>
              <Text style={styles.actionChevron}>›</Text>
            </TouchableOpacity>
          )}

          {/* Subscription — solo drivers only. Company drivers are billed via
              their company, so the personal subscription plan is hidden. */}
          {profile?.companyId == null && (
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => navigation.navigate('DriverSubscription')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Subscription">
              <Text style={styles.actionLabel}>⭐  {t('driver.subscription.title')}</Text>
              <Text style={styles.actionChevron}>›</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.actionRow, { borderBottomWidth: 0 }]}
            onPress={() => navigation.navigate('Support')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Help and support">
            <Text style={styles.actionLabel}>🎫  {t('client.profile.helpSupport')}</Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Appearance */}
        <View style={styles.card}>
          <ThemeToggle />
        </View>

        {/* Sign out */}
        <TouchableOpacity
          style={[styles.logoutBtn, loggingOut && styles.logoutBtnDisabled]}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          accessibilityState={{ disabled: loggingOut }}>
          {loggingOut
            ? <ActivityIndicator color={colors.error} />
            : <Text style={styles.logoutText}>{t('auth.signOut')}</Text>}
        </TouchableOpacity>

        {/* Delete account — GDPR */}
        <TouchableOpacity
          style={styles.deleteAccountBtn}
          onPress={handleDeleteAccount}
          disabled={deletingAccount}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          accessibilityState={{ disabled: deletingAccount }}>
          {deletingAccount
            ? <ActivityIndicator color={colors.textDisabled} size="small" />
            : <Text style={styles.deleteAccountText}>{t('profile.deleteAccount.button')}</Text>}
        </TouchableOpacity>

      </ScrollView>

      {/* Modals */}
      <EditProfileModal
        visible={editVisible}
        initial={{
          firstName:    profile?.firstName    ?? '',
          lastName:     profile?.lastName     ?? '',
          vehicleColor: profile?.vehicleColor ?? '',
          vehicleMake:  profile?.vehicleMake  ?? '',
          vehicleModel: profile?.vehicleModel ?? '',
          vehicleYear:  profile?.vehicleYear != null ? String(profile.vehicleYear) : '',
          isApproved:   profile?.isApproved  ?? false,
        }}
        onClose={() => setEditVisible(false)}
        onSaved={handleProfileSaved}
      />
      <ChangePasswordModal
        visible={pwVisible}
        onClose={() => setPwVisible(false)}
      />
      <LanguagePickerModal
        visible={langVisible}
        onClose={() => setLangVisible(false)}
      />
    </SafeAreaView>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function InfoRow({ label, value, rowStyles }: { label: string; value: string; rowStyles: ReturnType<typeof getRowStyles> }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ── Document section constants ────────────────────────────────────────────────

const DOC_TYPE_KEYS: { type: DocumentType; labelKey: string; icon: string }[] = [
  { type: 'license',              labelKey: 'driver.profile.docLicense',       icon: '🪪' },
  { type: 'vehicle_registration', labelKey: 'driver.profile.docRegistration',  icon: '📄' },
  { type: 'insurance',            labelKey: 'driver.profile.docInsurance',     icon: '🛡️' },
];

function docStatusStyle(status: DriverDocument['status'], colors: ColorPalette) {
  switch (status) {
    case 'approved': return { backgroundColor: colors.successLight ?? '#D1FAE5' };
    case 'rejected': return { backgroundColor: colors.error + '18' };
    default:         return { backgroundColor: colors.warningLight ?? '#FEF3C7' };
  }
}

function docStatusTextStyle(status: DriverDocument['status'], colors: ColorPalette) {
  switch (status) {
    case 'approved': return { color: colors.success };
    case 'rejected': return { color: colors.error };
    default:         return { color: colors.warning };
  }
}

function getDocStyles(c: ColorPalette) {
  return StyleSheet.create({
    hint: {
      fontSize: 13,
      color: c.textSecondary,
      lineHeight: 18,
      marginBottom: 16,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 10,
    },
    icon: { fontSize: 22, width: 30, textAlign: 'center' },
    info: { flex: 1 },
    label: { fontSize: 14, fontWeight: '600', color: c.text, marginBottom: 4 },
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
    },
    badgeText: { fontSize: 11, fontWeight: '700' },
    noDoc: { fontSize: 12, color: c.textDisabled },
    rejectionReason: { fontSize: 11, color: c.error, marginTop: 3, lineHeight: 15 },
    uploadBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: c.primary,
      minWidth: 70,
      alignItems: 'center',
    },
    uploadBtnDisabled: { opacity: 0.5 },
    uploadBtnText: { fontSize: 12, fontWeight: '700', color: c.primary },
    uploadBtnTextDone: { color: c.success },
  });
}

function getRowStyles(c: ColorPalette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    label: { fontSize: 14, color: c.textSecondary, fontWeight: '600' },
    value: { fontSize: 14, color: c.text, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  });
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    scroll: { padding: Sizes.screenPadding },

    avatarWrap: { alignItems: 'center', paddingVertical: 32 },
    avatar: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    avatarText: { fontSize: 36, fontWeight: '800', color: c.textOnPrimary },
    name: { fontSize: 22, fontWeight: '800', color: c.text, marginBottom: 8 },

    onlineBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 20,
      marginBottom: 8,
    },
    onlineDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    onlineText: { fontSize: 13, fontWeight: '700' },

    ratingRow: { flexDirection: 'row', alignItems: 'center' },
    ratingStar: { fontSize: 16 },
    ratingValue: { fontSize: 16, fontWeight: '700', color: c.text, marginLeft: 4 },
    ratingLabel: { fontSize: 13, color: c.textSecondary },

    pendingBox: {
      backgroundColor: c.warningLight,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: c.warning,
      marginBottom: 20,
    },
    pendingText: { fontSize: 13, color: c.text, lineHeight: 20 },

    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 16,
    },
    actionsCard: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 24,
    },
    cardTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 4,
    },

    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    actionLabel: { fontSize: 15, color: c.text, fontWeight: '500' },
    actionChevron: { fontSize: 22, color: c.textSecondary, lineHeight: 26 },

    logoutBtn: {
      height: 50,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: c.error,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      marginBottom: 32,
    },
    logoutBtnDisabled: { opacity: 0.5 },
    logoutText: { fontSize: 16, fontWeight: '700', color: c.error },

    deleteAccountBtn: {
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      marginBottom: 32,
    },
    deleteAccountText: {
      fontSize: 13,
      color: c.textDisabled,
      fontWeight: '500',
      textDecorationLine: 'underline',
    },
  });
}

// ── Rating card styles ────────────────────────────────────────────────────────

function getRatingStyles(c: ColorPalette) {
  return StyleSheet.create({
    empty: {
      fontSize: 14,
      color: c.textSecondary,
      fontStyle: 'italic',
      textAlign: 'center',
      paddingVertical: 12,
    },

    // Overall score
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      gap: 16,
    },
    scoreNumber: {
      fontSize: 48,
      fontWeight: '800',
      color: c.text,
      lineHeight: 54,
    },
    scoreRight: { flex: 1 },
    starsRow: { flexDirection: 'row', gap: 3, marginBottom: 4 },
    starIcon: { fontSize: 22 },
    totalText: { fontSize: 13, color: c.textSecondary, fontWeight: '500' },

    // Breakdown bars
    barsWrap: { gap: 6, marginBottom: 4 },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    barLabel: {
      width: 24,
      fontSize: 12,
      color: c.textSecondary,
      fontWeight: '600',
      textAlign: 'right',
    },
    barTrack: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.border,
      overflow: 'hidden',
    },
    barFill: {
      height: 8,
      borderRadius: 4,
      backgroundColor: c.primary,
    },
    barCount: {
      width: 22,
      fontSize: 12,
      color: c.textSecondary,
      textAlign: 'right',
    },

    // Individual review cards
    reviewCard: {
      backgroundColor: c.surfaceAlt,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    reviewStarsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
      gap: 2,
    },
    reviewStar: { fontSize: 14 },
    reviewDate: {
      fontSize: 11,
      color: c.textSecondary,
      marginLeft: 'auto' as any,
    },
    reviewText: {
      fontSize: 13,
      color: c.text,
      fontStyle: 'italic',
      lineHeight: 18,
      marginBottom: 4,
    },
    reviewNoText: {
      fontSize: 12,
      color: c.textDisabled,
      fontStyle: 'italic',
      marginBottom: 4,
    },
    reviewAddress: {
      fontSize: 11,
      color: c.textSecondary,
      marginTop: 2,
    },

    // Show more / less toggle
    toggleBtn: {
      alignItems: 'center',
      paddingVertical: 8,
      marginTop: 4,
    },
    toggleText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.primary,
    },
  });
}

// ── Modal shared styles ───────────────────────────────────────────────────────

function getModalStyles(c: ColorPalette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    sheet: {
      backgroundColor: c.background,
      borderRadius: 20,
      padding: 24,
      width: '100%',
      maxWidth: 420,
    },
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: c.text,
      marginBottom: 20,
      textAlign: 'center',
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
      marginBottom: 6,
      marginTop: 10,
    },
    input: {
      height: 48,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.border,
      paddingHorizontal: 14,
      fontSize: 15,
      color: c.text,
      backgroundColor: c.surface,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 24,
    },
    btnCancel: {
      flex: 1,
      height: 48,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnCancelText: { fontSize: 15, fontWeight: '700', color: c.textSecondary },
    btnSave: {
      flex: 1,
      height: 48,
      borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnSaveText: { fontSize: 15, fontWeight: '700', color: c.textOnPrimary },
  });
}
