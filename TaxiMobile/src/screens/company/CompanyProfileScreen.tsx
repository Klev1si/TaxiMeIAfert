import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { authApi } from '../../api/auth';
import { companyApi } from '../../api/company';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import ThemeToggle from '../../components/ThemeToggle';
import CompanyPromoCodesScreen from './CompanyPromoCodesScreen';
import CompanyMessagesScreen from './CompanyMessagesScreen';
import LanguagePickerModal from '../../components/LanguagePickerModal';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';

export default function CompanyProfileScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const [commissionModal, setCommissionModal] = useState(false);
  const [promoModal, setPromoModal] = useState(false);
  const [messagesModal, setMessagesModal] = useState(false);
  const [langVisible, setLangVisible] = useState(false);

  // Company info — fetched from /auth/me since the auth store only carries the
  // bare User row. Refreshed each time the edit modal closes successfully.
  const [info, setInfo] = useState<{
    companyName: string | null; address: string | null; city: string | null;
    logoUrl: string | null; isApproved: boolean;
  } | null>(null);
  const [infoModal, setInfoModal] = useState(false);

  const loadInfo = async () => {
    try {
      const { data } = await authApi.getMe();
      // The /auth/me response for companies includes the company-specific fields.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      setInfo({
        companyName: d.companyName ?? null,
        address:     d.address     ?? null,
        city:        d.city        ?? null,
        logoUrl:     d.logoUrl     ?? null,
        isApproved:  !!d.isApproved,
      });
    } catch { /* network blip — show fallback */ }
  };
  useEffect(() => { loadInfo(); }, []);

  const handleLogout = () => {
    Alert.alert(t('company.profile.logoutTitle'), t('company.profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('company.profile.logoutBtn'), style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('company.profile.title')}</Text>

        {/* ── Account card ── */}
        <Text style={styles.sectionLabel}>{t('company.profile.sectionAccount')}</Text>
        <View style={styles.card}>
          <Row label={t('company.profile.roleLabel')}  value={t('company.profile.roleValue')} />
          <Divider />
          <Row label={t('company.profile.phoneLabel')} value={user?.phone ?? '—'} />
          <Divider />
          <Row label={t('company.profile.userIdLabel')} value={(user?.id ?? '—').slice(0, 18) + '…'} mono />
        </View>

        {/* ── Company info card ── */}
        <Text style={styles.sectionLabel}>Company info</Text>
        <View style={styles.card}>
          <Row label="Name"    value={info?.companyName ?? '—'} />
          <Divider />
          <Row label="Address" value={info?.address     ?? '—'} />
          <Divider />
          <Row label="City"    value={info?.city        ?? '—'} />
          <Divider />
          <Row
            label="Approved"
            value={info ? (info.isApproved ? '✓ Yes' : '⏳ Pending') : '—'}
          />
          <Divider />
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => setInfoModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Edit company info">
            <Text style={styles.actionLabel}>✏️  Edit company info</Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── Settings ── */}
        <Text style={styles.sectionLabel}>{t('company.profile.sectionSettings')}</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => setCommissionModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Set driver commission percentage">
            <Text style={styles.actionLabel}>💼  {t('company.profile.commissionAction')}</Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
            onPress={() => setPromoModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Manage promo codes">
            <Text style={styles.actionLabel}>🏷️  Promo Codes</Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
            onPress={() => setMessagesModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Messages with drivers">
            <Text style={styles.actionLabel}>💬  Messages</Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
            onPress={() => setLangVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Change language">
            <Text style={styles.actionLabel}>🌐  {t('profile.language')}</Text>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── Appearance ── */}
        <Text style={styles.sectionLabel}>{t('company.profile.sectionAppearance')}</Text>
        <View style={[styles.card, { paddingVertical: 12 }]}>
          <ThemeToggle />
        </View>

        {/* ── Info box ── */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 {t('company.profile.infoText')}
          </Text>
        </View>

        {/* ── Logout ── */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Log out">
          <Text style={styles.logoutText}>{t('company.profile.logoutBtn')}</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      <CommissionModal
        visible={commissionModal}
        onClose={() => setCommissionModal(false)}
      />

      {infoModal && info && (
        <CompanyInfoModal
          initial={info}
          onClose={() => setInfoModal(false)}
          onSaved={() => { setInfoModal(false); loadInfo(); }}
        />
      )}

      <CompanyPromoCodesScreen
        visible={promoModal}
        onClose={() => setPromoModal(false)}
      />

      <CompanyMessagesScreen
        visible={messagesModal}
        onClose={() => setMessagesModal(false)}
      />

      <LanguagePickerModal
        visible={langVisible}
        onClose={() => setLangVisible(false)}
      />
    </SafeAreaView>
  );
}

// ── CompanyInfoModal ──────────────────────────────────────────────────────────
function CompanyInfoModal({
  initial, onClose, onSaved,
}: {
  initial: {
    companyName: string | null; address: string | null; city: string | null;
    logoUrl: string | null; isApproved: boolean;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const colors = useColors();
  const cmStyles = useMemo(() => getCmStylesStyles(colors), [colors]);
  const { t } = useTranslation();
  const [name,    setName]    = useState(initial.companyName ?? '');
  const [address, setAddress] = useState(initial.address     ?? '');
  const [city,    setCity]    = useState(initial.city        ?? '');
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl     ?? '');
  const [saving,  setSaving]  = useState(false);

  const nameChanged = name.trim() !== (initial.companyName ?? '');

  const submit = async () => {
    setSaving(true);
    try {
      await authApi.updateProfile({
        companyName: name.trim() || undefined,
        address:     address.trim() ? address.trim() : '',
        city:        city.trim()    ? city.trim()    : '',
        logoUrl:     logoUrl.trim() ? logoUrl.trim() : '',
      });
      onSaved();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Failed to update company info.';
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert(t('common.validation'), 'Company name is required.');
      return;
    }
    if (nameChanged && initial.isApproved) {
      Alert.alert(
        'Re-approval required',
        'Changing the company name revokes your approved status. An admin will need to re-approve you.\n\nContinue?',
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: 'Save anyway', style: 'destructive', onPress: submit },
        ],
      );
    } else {
      submit();
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={cmStyles.safe}>
          <View style={cmStyles.header}>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={cmStyles.cancel}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={cmStyles.title}>Company info</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving} accessibilityRole="button" accessibilityLabel="Save">
              {saving
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={cmStyles.save}>{t('common.save')}</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 24, gap: 8 }}>
            <Text style={cmStyles.description}>
              Address, city, and logo are safe self-edits. Changing the company
              name will require admin re-approval.
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Company name
            </Text>
            <TextInput
              style={cmStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="Acme Taxi LLC"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
              maxLength={150}
            />
            {nameChanged && initial.isApproved && (
              <Text style={{ fontSize: 12, color: '#92400E' }}>
                ⚠ Saving will revoke your approval until an admin re-approves.
              </Text>
            )}

            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Address
            </Text>
            <TextInput
              style={cmStyles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Street, building, etc."
              placeholderTextColor={colors.textSecondary}
              maxLength={300}
            />

            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              City
            </Text>
            <TextInput
              style={cmStyles.input}
              value={city}
              onChangeText={setCity}
              placeholder="e.g. Pristina"
              placeholderTextColor={colors.textSecondary}
              maxLength={100}
            />

            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Logo URL
            </Text>
            <TextInput
              style={cmStyles.input}
              value={logoUrl}
              onChangeText={setLogoUrl}
              placeholder="https://…"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              maxLength={500}
            />
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: -2 }}>
              Paste a public image URL — file upload isn't supported yet for company logos.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── CommissionModal ───────────────────────────────────────────────────────────

function CommissionModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const cmStyles = useMemo(() => getCmStylesStyles(colors), [colors]);
  const { t } = useTranslation();
  const [value,   setValue]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    const pct = parseFloat(value);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setError(t('company.profile.commissionError'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await companyApi.setCommission(pct);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setValue('');
        onClose();
      }, 1200);
    } catch {
      setError(t('company.profile.commissionSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setValue('');
    setError(null);
    setSuccess(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={cmStyles.safe}>
          <View style={cmStyles.header}>
            <TouchableOpacity
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel">
              <Text style={cmStyles.cancel}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={cmStyles.title}>{t('company.profile.commissionTitle')}</Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving || success}
              accessibilityRole="button"
              accessibilityLabel="Save commission"
              accessibilityState={{ disabled: saving || success }}>
              {saving
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={cmStyles.save}>{success ? `✓ ${t('company.profile.commissionSaved')}` : t('common.save')}</Text>}
            </TouchableOpacity>
          </View>

          <View style={cmStyles.body}>
            <Text style={cmStyles.description}>
              {t('company.profile.commissionDesc')}
            </Text>

            <View style={cmStyles.inputRow}>
              <TextInput
                style={cmStyles.input}
                value={value}
                onChangeText={v => { setValue(v); setError(null); }}
                placeholder="e.g. 80"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                maxLength={5}
                accessibilityLabel="Driver commission percentage"
              />
              <Text style={cmStyles.pctSymbol}>%</Text>
            </View>

            {error && <Text style={cmStyles.errorText}>{error}</Text>}

            <View style={cmStyles.exampleBox}>
              <Text style={cmStyles.exampleTitle}>{t('company.profile.commissionExample')}</Text>
              {(() => {
                const pct = parseFloat(value);
                const fare = 10;
                if (!isNaN(pct) && pct >= 0 && pct <= 100) {
                  const driverShare  = (fare * pct / 100).toFixed(2);
                  const companyShare = (fare * (100 - pct) / 100).toFixed(2);
                  return (
                    <Text style={cmStyles.exampleText}>
                      {t('company.profile.commissionExampleText', { driver: `$${driverShare}`, company: `$${companyShare}` })}
                    </Text>
                  );
                }
                return (
                  <Text style={cmStyles.exampleText}>
                    {t('company.profile.commissionExampleHint')}
                  </Text>
                );
              })()}
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function getCmStylesStyles(c: ColorPalette) { return StyleSheet.create({
  safe:   { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  title:   { fontSize: 17, fontWeight: '700', color: c.text },
  cancel:  { fontSize: 16, color: c.textSecondary },
  save:    { fontSize: 16, fontWeight: '700', color: c.primary },

  body:        { padding: 20 },
  description: { fontSize: 14, color: c.textSecondary, lineHeight: 20, marginBottom: 24 },

  inputRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  input: {
    flex: 1, backgroundColor: c.surface,
    borderRadius: 12, borderWidth: 1.5, borderColor: c.border,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 24, fontWeight: '700', color: c.text,
  },
  pctSymbol: { fontSize: 28, fontWeight: '700', color: c.textSecondary, marginLeft: 10 },

  errorText: { fontSize: 13, color: c.error, marginBottom: 16 },

  exampleBox: {
    backgroundColor: c.surface, borderRadius: 12,
    padding: 14, marginTop: 16,
    borderWidth: 1, borderColor: c.border,
  },
  exampleTitle: { fontSize: 12, fontWeight: '700', color: c.textSecondary, marginBottom: 6, textTransform: 'uppercase' },
  exampleText:  { fontSize: 14, color: c.text, lineHeight: 20 },
}); }

// ── Sub-components ────────────────────────────────────────────────────────────

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const colors = useColors();
  const rowStyles = useMemo(() => getRowStylesStyles(colors), [colors]);
  return (
    <View style={rowStyles.wrap}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, mono && rowStyles.mono]}>{value}</Text>
    </View>
  );
}

function Divider() {
  const colors = useColors();
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />;
}

function getRowStylesStyles(c: ColorPalette) { return StyleSheet.create({
  wrap:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  label: { fontSize: 14, color: c.textSecondary },
  value: { fontSize: 14, fontWeight: '600', color: c.text, maxWidth: '60%', textAlign: 'right' },
  mono:  { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 12 },
}); }

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  safe:   { flex: 1, backgroundColor: c.background },
  scroll: { padding: Sizes.screenPadding },

  title:    { fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 20 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: c.textSecondary,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 8, marginLeft: 2,
  },

  card: {
    backgroundColor: c.surface, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 4,
    borderWidth: 1, borderColor: c.border, marginBottom: 20,
  },

  actionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14,
  },
  actionLabel:   { fontSize: 15, color: c.text },
  actionChevron: { fontSize: 20, color: c.textSecondary },

  infoBox: {
    backgroundColor: c.infoLight, borderRadius: 12,
    padding: 14, marginBottom: 24,
    borderWidth: 1, borderColor: c.info,
  },
  infoText: { fontSize: 13, color: c.info, lineHeight: 20 },

  logoutBtn: {
    backgroundColor: c.errorLight, borderRadius: 12,
    padding: 15, alignItems: 'center',
    borderWidth: 1, borderColor: c.error,
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: c.error },
}); }
