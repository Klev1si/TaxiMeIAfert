import React, { useMemo } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import ThemeToggle from '../../components/ThemeToggle';
import type { ColorPalette } from '../../constants/colors';
import type { AdminProfileStackScreenProps } from '../../navigation/types';
import { useTranslation } from '../../i18n';

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const colors = useColors();
  const row = useMemo(() => getRowStyles(colors), [colors]);
  return (
    <View style={row.wrap}>
      <Text style={row.label}>{label}</Text>
      <Text style={[row.value, mono && row.mono]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function getRowStyles(c: ColorPalette) { return StyleSheet.create({
  wrap:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13 },
  label: { fontSize: 14, color: c.textSecondary },
  value: { fontSize: 14, fontWeight: '600', color: c.text, maxWidth: '55%', textAlign: 'right' },
  mono:  { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 12 },
}); }

function Divider() {
  const colors = useColors();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

type Props = AdminProfileStackScreenProps<'AdminProfileMain'>;

function NavRow({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const colors = useColors();
  const nav = useMemo(() => getNavStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={nav.wrap}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Text style={nav.icon}>{icon}</Text>
      <Text style={nav.label}>{label}</Text>
      <Text style={nav.chevron}>›</Text>
    </TouchableOpacity>
  );
}

function getNavStyles(c: ColorPalette) { return StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  icon:    { fontSize: 18, width: 24, textAlign: 'center' },
  label:   { flex: 1, fontSize: 15, fontWeight: '500', color: c.text },
  chevron: { fontSize: 20, color: c.textSecondary },
}); }

export default function AdminProfileScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { user, logout } = useAuthStore();
  const { t } = useTranslation();

  const handleLogout = () => {
    Alert.alert(t('admin.profile.logoutTitle'), t('admin.profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('admin.profile.logoutBtn'), style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('admin.profile.title')}</Text>

        {/* Account info */}
        <Text style={styles.sectionLabel}>{t('admin.profile.sectionAccount')}</Text>
        <View style={styles.card}>
          <Row label={t('admin.profile.roleLabel')}  value={t('admin.profile.roleValue')} />
          <Divider />
          <Row label={t('admin.profile.phoneLabel')}  value={user?.phone ?? '—'} />
          <Divider />
          <Row label={t('admin.profile.userIdLabel')} value={(user?.id ?? '—').slice(0, 18) + '…'} mono />
        </View>

        {/* Management */}
        <Text style={styles.sectionLabel}>{t('admin.profile.sectionManagement')}</Text>
        <View style={styles.card}>
          <NavRow
            icon="📋"
            label={t('admin.profile.plansLink')}
            onPress={() => navigation.navigate('AdminPlans')}
          />
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <NavRow
            icon="💸"
            label={t('admin.profile.tariffsLink')}
            onPress={() => navigation.navigate('AdminGlobalTariffs')}
          />
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <NavRow
            icon="💳"
            label={t('admin.profile.payoutsLink')}
            onPress={() => navigation.navigate('AdminPayouts')}
          />
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <NavRow
            icon="📜"
            label={t('admin.profile.auditLink')}
            onPress={() => navigation.navigate('AdminAuditLogs')}
          />
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <NavRow
            icon="🚨"
            label={t('admin.profile.fraudLink')}
            onPress={() => navigation.navigate('AdminFraudEvents')}
          />
        </View>

        {/* Appearance */}
        <Text style={styles.sectionLabel}>{t('admin.profile.sectionAppearance')}</Text>
        <View style={[styles.card, { paddingVertical: 12 }]}>
          <ThemeToggle />
        </View>

        {/* Capabilities info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>{t('admin.profile.infoText')}</Text>
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Log out">
          <Text style={styles.logoutText}>{t('admin.profile.logoutBtn')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles(c: ColorPalette) { return StyleSheet.create({
  safe:   { flex: 1, backgroundColor: c.background },
  scroll: { padding: Sizes.screenPadding, paddingBottom: 40 },

  title:  { fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 20 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: c.textSecondary,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 8, marginLeft: 2,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4,
    borderWidth: 1, borderColor: c.border, marginBottom: 20,
  },

  infoBox: {
    backgroundColor: c.infoLight ?? '#eff6ff',
    borderRadius: 12, padding: 14, marginBottom: 28,
    borderWidth: 1, borderColor: c.info ?? '#3b82f6',
  },
  infoText: { fontSize: 13, color: c.info ?? '#1d4ed8', lineHeight: 20 },

  logoutBtn: {
    backgroundColor: c.errorLight ?? '#fef2f2',
    borderRadius: 12, padding: 15, alignItems: 'center',
    borderWidth: 1, borderColor: c.error,
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: c.error },
}); }
