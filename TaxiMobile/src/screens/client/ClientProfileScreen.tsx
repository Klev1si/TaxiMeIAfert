import React, { useEffect, useState, useMemo } from 'react';
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
import { authApi } from '../../api/auth';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import AvatarPicker from '../../components/AvatarPicker';
import LanguagePickerModal from '../../components/LanguagePickerModal';
import ThemeToggle from '../../components/ThemeToggle';
import { useTranslation } from '../../i18n';

type Profile = {
  phone: string; role: string;
  avatarUrl: string | null;
  firstName: string | null; lastName: string | null; rating: number | null;
};

// ── Edit Profile Modal ────────────────────────────────────────────────────────

function EditProfileModal({
  visible,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initial: { firstName: string; lastName: string };
  onClose: () => void;
  onSaved: (firstName: string, lastName: string) => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const modalStyles = useMemo(() => getModalStyles(colors), [colors]);

  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName,  setLastName]  = useState(initial.lastName);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (visible) {
      setFirstName(initial.firstName);
      setLastName(initial.lastName);
    }
  }, [visible]);

  const handleSave = async () => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn) { Alert.alert(t('common.validation'), t('profile.edit.firstNameRequired')); return; }
    setSaving(true);
    try {
      await authApi.updateProfile({ firstName: fn, lastName: ln || undefined });
      onSaved(fn, ln);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('profile.edit.saveError');
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
            <Text style={modalStyles.title}>{t('profile.edit.title')}</Text>

            <Text style={modalStyles.label}>{t('profile.edit.firstName')}</Text>
            <TextInput
              style={modalStyles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder={t('profile.edit.firstNamePlaceholder')}
              placeholderTextColor={colors.textDisabled}
              autoCapitalize="words"
              returnKeyType="next"
              maxLength={80}
              accessibilityLabel="First name"
            />

            <Text style={modalStyles.label}>{t('profile.edit.lastName')}</Text>
            <TextInput
              style={modalStyles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder={t('profile.edit.lastNamePlaceholder')}
              placeholderTextColor={colors.textDisabled}
              autoCapitalize="words"
              returnKeyType="done"
              maxLength={80}
              accessibilityLabel="Last name, optional"
            />

            <View style={modalStyles.row}>
              <TouchableOpacity
                style={modalStyles.btnCancel}
                onPress={onClose}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                accessibilityState={{ disabled: saving }}>
                <Text style={modalStyles.btnCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.btnSave, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Save profile changes"
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
  const { t } = useTranslation();
  const colors = useColors();
  const modalStyles = useMemo(() => getModalStyles(colors), [colors]);

  const [current, setCurrent] = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    if (visible) { setCurrent(''); setNext(''); setConfirm(''); }
  }, [visible]);

  const handleSave = async () => {
    if (!current) { Alert.alert(t('common.validation'), t('profile.password.enterCurrent')); return; }
    if (next.length < 6) { Alert.alert(t('common.validation'), t('profile.password.tooShort')); return; }
    if (next !== confirm) { Alert.alert(t('common.validation'), t('profile.password.mismatch')); return; }
    setSaving(true);
    try {
      await authApi.changePassword({ currentPassword: current, newPassword: next });
      Alert.alert(t('common.success'), t('profile.password.success'));
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('profile.password.saveError');
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
            <Text style={modalStyles.title}>{t('profile.password.title')}</Text>

            <Text style={modalStyles.label}>{t('profile.password.current')}</Text>
            <TextInput
              style={modalStyles.input}
              value={current}
              onChangeText={setCurrent}
              placeholder={t('profile.password.currentPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              returnKeyType="next"
              accessibilityLabel="Current password"
            />

            <Text style={modalStyles.label}>{t('profile.password.new')}</Text>
            <TextInput
              style={modalStyles.input}
              value={next}
              onChangeText={setNext}
              placeholder={t('profile.password.newPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              returnKeyType="next"
              maxLength={64}
              accessibilityLabel="New password"
            />

            <Text style={modalStyles.label}>{t('profile.password.confirm')}</Text>
            <TextInput
              style={modalStyles.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder={t('profile.password.confirmPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              returnKeyType="done"
              maxLength={64}
              accessibilityLabel="Confirm new password"
            />

            <View style={modalStyles.row}>
              <TouchableOpacity
                style={modalStyles.btnCancel}
                onPress={onClose}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                accessibilityState={{ disabled: saving }}>
                <Text style={modalStyles.btnCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.btnSave, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Save new password"
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

export default function ClientProfileScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [profile, setProfile]               = useState<Profile | null>(null);
  const [loading, setLoading]               = useState(true);
  const [loggingOut, setLoggingOut]         = useState(false);
  const [editVisible,     setEditVisible]     = useState(false);
  const [pwVisible,       setPwVisible]       = useState(false);
  const [langVisible,     setLangVisible]     = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    authApi.getMe()
      .then(({ data }) => setProfile(data as Profile))
      .catch(() => {})
      .finally(() => setLoading(false));
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

  const handleProfileSaved = (firstName: string, lastName: string) => {
    setProfile(prev => prev ? { ...prev, firstName, lastName } : prev);
    setEditVisible(false);
  };

  const displayName = profile?.firstName
    ? `${profile.firstName} ${profile.lastName ?? ''}`.trim()
    : user?.phone ?? '—';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Avatar */}
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
          {profile?.rating != null && (
            <View style={styles.ratingRow}>
              <Text style={styles.ratingStar}>⭐</Text>
              <Text style={styles.ratingLabel}>
                {t('profile.rating', { rating: Number(profile.rating).toFixed(1) })}
              </Text>
            </View>
          )}
        </View>

        {/* Info card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('profile.account')}</Text>
          <InfoRow label={t('profile.phone')}   value={user?.phone ?? '—'} colors={colors} />
          <InfoRow label={t('profile.role')}    value={t('profile.passenger')} colors={colors} />
          {profile?.firstName && (
            <InfoRow label={t('profile.name')} value={`${profile.firstName} ${profile.lastName ?? ''}`.trim()} colors={colors} />
          )}
        </View>

        {/* Theme toggle */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('common.appearance')}</Text>
          <ThemeToggle />
        </View>

        {/* Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.cardTitle}>{t('profile.settings')}</Text>

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
            onPress={() => navigation.navigate('SavedLocations')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Saved locations">
            <Text style={styles.actionLabel}>📍  {t('profile.savedLocations')}</Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => navigation.navigate('ManageCards')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Manage saved cards">
            <Text style={styles.actionLabel}>💳  {t('client.profile.manageCards')}</Text>
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

        {/* Delete account */}
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

      <EditProfileModal
        visible={editVisible}
        initial={{ firstName: profile?.firstName ?? '', lastName: profile?.lastName ?? '' }}
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

function InfoRow({ label, value, colors }: { label: string; value: string; colors: ColorPalette }) {
  return (
    <View style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    }}>
      <Text style={{ fontSize: 14, color: colors.textSecondary, fontWeight: '600' }}>{label}</Text>
      <Text style={{ fontSize: 14, color: colors.text, fontWeight: '500', maxWidth: '60%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: c.background },
    scroll: { padding: Sizes.screenPadding },

    avatarWrap: { alignItems: 'center', paddingVertical: 32 },
    name:       { fontSize: 22, fontWeight: '800', color: c.text, marginBottom: 6 },
    ratingRow:  { flexDirection: 'row', alignItems: 'center' },
    ratingStar: { fontSize: 16 },
    ratingLabel: { fontSize: 13, color: c.textSecondary },

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
    actionLabel:   { fontSize: 15, color: c.text, fontWeight: '500' },
    actionChevron: { fontSize: 22, color: c.textSecondary, lineHeight: 26 },

    logoutBtn:        { height: 50, borderRadius: 14, borderWidth: 2, borderColor: c.error, alignItems: 'center', justifyContent: 'center' },
    logoutBtnDisabled: { opacity: 0.5 },
    logoutText:       { fontSize: 16, fontWeight: '700', color: c.error },

    deleteAccountBtn:  { height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 24 },
    deleteAccountText: { fontSize: 13, color: c.textDisabled, fontWeight: '500', textDecorationLine: 'underline' },
  });
}

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
    title: { fontSize: 18, fontWeight: '800', color: c.text, marginBottom: 20, textAlign: 'center' },
    label: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6, marginTop: 10 },
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
    row:          { flexDirection: 'row', gap: 12, marginTop: 24 },
    btnCancel:    { flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    btnCancelText: { fontSize: 15, fontWeight: '700', color: c.textSecondary },
    btnSave:      { flex: 1, height: 48, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    btnSaveText:  { fontSize: 15, fontWeight: '700', color: c.textOnPrimary },
  });
}
