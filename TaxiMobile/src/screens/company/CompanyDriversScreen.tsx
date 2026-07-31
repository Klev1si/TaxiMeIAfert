import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { companyApi, AddDriverPayload, CompanyDriver } from '../../api/company';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';

type Filter = 'all' | 'pending' | 'approved';

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All',      value: 'all'      },
  { label: 'Pending',  value: 'pending'  },
  { label: 'Approved', value: 'approved' },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function CompanyDriversScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [filter,      setFilter]      = useState<Filter>('all');
  const [drivers,     setDrivers]     = useState<CompanyDriver[]>([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [search,      setSearch]      = useState('');
  const [searchText,  setSearchText]  = useState('');
  const [error,       setError]       = useState<string | null>(null);
  const [addModal,    setAddModal]    = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (reset = false, isRefresh = false) => {
    const newPage = reset ? 1 : page;
    if (isRefresh) setRefreshing(true);
    else if (reset) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const res = await companyApi.getDrivers(filter, newPage, 20, search || undefined);
      const { drivers: newDrivers, total: newTotal } = res.data;
      setDrivers(reset ? newDrivers : prev => [...prev, ...newDrivers]);
      setTotal(newTotal);
      setPage(reset ? 2 : newPage + 1);
    } catch {
      setError(t('company.drivers.loadError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [filter, page, search]);

  // Re-fetch when filter or search changes
  useEffect(() => {
    setPage(1);
    load(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search]);

  const handleSearchChange = (text: string) => {
    setSearchText(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(text.trim()), 500);
  };

  const handleApprove = async (driver: CompanyDriver) => {
    Alert.alert(
      t('company.drivers.approveTitle'),
      t('company.drivers.approveMsg', { name: `${driver.firstName} ${driver.lastName}` }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('company.drivers.approveBtn'), style: 'default',
          onPress: async () => {
            try {
              // company controller doesn't have approve endpoint — only admin does
              // We'll gracefully inform the user
              Alert.alert(t('company.drivers.infoTitle'), t('company.drivers.approveInfoMsg'));
            } catch {
              Alert.alert(t('common.error'), t('company.drivers.addDriverError'));
            }
          },
        },
      ],
    );
  };

  const handleDriverAdded = (driver: CompanyDriver) => {
    setDrivers(prev => [driver, ...prev]);
    setTotal(prev => prev + 1);
    setAddModal(false);
  };

  const renderDriver = ({ item }: { item: CompanyDriver }) => (
    <DriverCard driver={item} onApprove={handleApprove} />
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('company.drivers.title')}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setAddModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Add new driver">
          <Text style={styles.addBtnText}>{t('company.drivers.addBtn')}</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('company.drivers.searchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={searchText}
          onChangeText={handleSearchChange}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search drivers by name or plate"
        />
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterTab, filter === f.value && styles.filterTabActive]}
            onPress={() => setFilter(f.value)}
            accessibilityRole="radio"
            accessibilityLabel={`Filter: ${f.label}`}
            accessibilityState={{ checked: filter === f.value }}>
            <Text style={[styles.filterTabText, filter === f.value && styles.filterTabTextActive]}>
              {f.value === 'all' ? t('company.drivers.filterAll') : f.value === 'pending' ? t('company.drivers.filterPending') : t('company.drivers.filterApproved')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => load(true)}
            accessibilityRole="button"
            accessibilityLabel="Retry loading drivers">
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={item => item.id}
          renderItem={renderDriver}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true, true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          onEndReached={() => {
            if (!loadingMore && drivers.length < total) load();
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                {search ? t('company.drivers.emptySearch') : t('company.drivers.emptyDefault')}
              </Text>
            </View>
          }
        />
      )}

      {/* Total count */}
      {!loading && !error && (
        <View style={styles.footer}>
          <Text style={styles.footerText}>{total !== 1 ? t('company.drivers.totalCountPlural', { n: total }) : t('company.drivers.totalCount', { n: total })}</Text>
        </View>
      )}

      {/* Add Driver Modal */}
      <AddDriverModal
        visible={addModal}
        onClose={() => setAddModal(false)}
        onAdded={handleDriverAdded}
      />
    </SafeAreaView>
  );
}

// ── DriverCard ────────────────────────────────────────────────────────────────

function DriverCard({ driver, onApprove }: {
  driver: CompanyDriver;
  onApprove: (d: CompanyDriver) => void;
}) {
  const colors = useColors();
  const cardStyles = useMemo(() => getCardStylesStyles(colors), [colors]);
  const { t } = useTranslation();
  const statusColor = driver.isApproved ? colors.success : colors.warning;
  const statusLabel = driver.isApproved ? t('company.drivers.statusApproved') : t('company.drivers.statusPending');

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.top}>
        <View style={cardStyles.info}>
          <Text style={cardStyles.name}>{driver.firstName} {driver.lastName}</Text>
          <Text style={cardStyles.plate}>{driver.vehiclePlate} · {driver.vehicleMake} {driver.vehicleModel}</Text>
          <Text style={cardStyles.meta}>
            ⭐ {driver.rating.toFixed(1)} · {driver.totalRides} rides · License: {driver.licenseNumber}
          </Text>
        </View>
        <View style={cardStyles.badges}>
          <View style={[cardStyles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
            <Text style={[cardStyles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          {driver.isOnline && (
            <View style={[cardStyles.onlineDot]} />
          )}
        </View>
      </View>

      {!driver.isApproved && (
        <TouchableOpacity
          style={cardStyles.approveBtn}
          onPress={() => onApprove(driver)}
          accessibilityRole="button"
          accessibilityLabel={`Approve driver ${driver.firstName} ${driver.lastName}`}>
          <Text style={cardStyles.approveBtnText}>{t('company.drivers.approveBtn')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function getCardStylesStyles(c: ColorPalette) { return StyleSheet.create({
  card: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 10,
  },
  top:    { flexDirection: 'row', justifyContent: 'space-between' },
  info:   { flex: 1, marginRight: 8 },
  badges: { alignItems: 'flex-end', gap: 6 },
  name:   { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 2 },
  plate:  { fontSize: 13, color: c.textSecondary, marginBottom: 3 },
  meta:   { fontSize: 12, color: c.textSecondary },
  statusBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10, borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  onlineDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: c.success,
    marginTop: 4,
  },
  approveBtn: {
    marginTop: 12, backgroundColor: c.primary,
    borderRadius: 8, paddingVertical: 8, alignItems: 'center',
  },
  approveBtnText: { fontSize: 13, fontWeight: '700', color: c.textOnPrimary },
}); }

// ── AddDriverModal ────────────────────────────────────────────────────────────

interface FormState {
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehiclePlate: string;
  vehicleColor: string;
}

const EMPTY_FORM: FormState = {
  phone: '', password: '', firstName: '', lastName: '',
  licenseNumber: '', vehicleMake: '', vehicleModel: '',
  vehicleYear: '', vehiclePlate: '', vehicleColor: '',
};

function AddDriverModal({ visible, onClose, onAdded }: {
  visible: boolean;
  onClose: () => void;
  onAdded: (d: CompanyDriver) => void;
}) {
  const colors = useColors();
  const modalStyles = useMemo(() => getModalStylesStyles(colors), [colors]);
  const { t } = useTranslation();
  const [form,    setForm]    = useState<FormState>(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const set = (key: keyof FormState) => (val: string) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    const { phone, password, firstName, lastName, licenseNumber,
            vehicleMake, vehicleModel, vehicleYear, vehiclePlate } = form;

    if (!phone || !password || !firstName || !lastName ||
        !licenseNumber || !vehicleMake || !vehicleModel || !vehicleYear || !vehiclePlate) {
      setFormErr(t('company.drivers.allFieldsRequired'));
      return;
    }
    const year = parseInt(vehicleYear, 10);
    if (isNaN(year) || year < 1990 || year > 2100) {
      setFormErr(t('company.drivers.invalidYear'));
      return;
    }

    setFormErr(null);
    setSaving(true);
    try {
      const payload: AddDriverPayload = {
        phone: phone.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        licenseNumber: licenseNumber.trim(),
        vehicleMake: vehicleMake.trim(),
        vehicleModel: vehicleModel.trim(),
        vehicleYear: year,
        vehiclePlate: vehiclePlate.trim(),
        vehicleColor: form.vehicleColor.trim() || undefined,
      };
      const res = await companyApi.addDriver(payload);
      setForm(EMPTY_FORM);
      onAdded(res.data);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setFormErr(Array.isArray(msg) ? msg.join('\n') : (msg ?? t('company.drivers.addDriverError')));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setFormErr(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={modalStyles.safe}>
          <View style={modalStyles.header}>
            <TouchableOpacity
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel">
              <Text style={modalStyles.cancel}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={modalStyles.title}>{t('company.drivers.addDriverTitle')}</Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save new driver"
              accessibilityState={{ disabled: saving }}>
              {saving
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={modalStyles.save}>{t('common.save')}</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={modalStyles.scroll} keyboardShouldPersistTaps="handled">
            {formErr && (
              <View style={modalStyles.errorBox}>
                <Text style={modalStyles.errorText}>{formErr}</Text>
              </View>
            )}

            <SectionHeader label={t('company.drivers.sectionAccount')} />
            <Field label={t('company.drivers.phoneLabel')}    value={form.phone}    onChange={set('phone')}    keyboardType="phone-pad" placeholder="+37491123456" />
            <Field label={t('company.drivers.passwordLabel')} value={form.password} onChange={set('password')} secureTextEntry placeholder={t('common.minChars')} />

            <SectionHeader label={t('company.drivers.sectionPersonal')} />
            <Field label={t('company.drivers.firstNameLabel')}  value={form.firstName} onChange={set('firstName')} placeholder="John" />
            <Field label={t('company.drivers.lastNameLabel')}   value={form.lastName}  onChange={set('lastName')}  placeholder="Smith" />
            <Field label={t('company.drivers.licenseLabel')}    value={form.licenseNumber} onChange={set('licenseNumber')} placeholder="AM-123456" autoCapitalize="characters" />

            <SectionHeader label={t('company.drivers.sectionVehicle')} />
            <Field label={t('company.drivers.makeLabel')}   value={form.vehicleMake}  onChange={set('vehicleMake')}  placeholder="Toyota" />
            <Field label={t('company.drivers.modelLabel')}  value={form.vehicleModel} onChange={set('vehicleModel')} placeholder="Camry" />
            <Field label={t('company.drivers.yearLabel')}   value={form.vehicleYear}  onChange={set('vehicleYear')}  keyboardType="number-pad" placeholder="2021" />
            <Field label={t('company.drivers.plateLabel')}  value={form.vehiclePlate} onChange={set('vehiclePlate')} placeholder="00 AB 111" autoCapitalize="characters" />
            <Field label={t('company.drivers.colorLabel')}  value={form.vehicleColor} onChange={set('vehicleColor')} placeholder={t('common.colorWhite')} />

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SectionHeader({ label }: { label: string }) {
  const colors = useColors();
  const modalStyles = useMemo(() => getModalStylesStyles(colors), [colors]);
  return <Text style={modalStyles.sectionHeader}>{label}</Text>;
}

function Field({ label, value, onChange, placeholder, keyboardType, secureTextEntry, autoCapitalize }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboardType?: any; secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const colors = useColors();
  const modalStyles = useMemo(() => getModalStylesStyles(colors), [colors]);
  return (
    <View style={modalStyles.fieldWrap}>
      <Text style={modalStyles.fieldLabel}>{label}</Text>
      <TextInput
        style={modalStyles.fieldInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType={keyboardType ?? 'default'}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize ?? 'words'}
        autoCorrect={false}
        accessibilityLabel={label}
      />
    </View>
  );
}

function getModalStylesStyles(c: ColorPalette) { return StyleSheet.create({
  safe:   { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  title:  { fontSize: 17, fontWeight: '700', color: c.text },
  cancel: { fontSize: 16, color: c.textSecondary },
  save:   { fontSize: 16, fontWeight: '700', color: c.primary },
  scroll: { padding: 16 },
  sectionHeader: {
    fontSize: 12, fontWeight: '700', color: c.textSecondary,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginTop: 20, marginBottom: 8, marginLeft: 2,
  },
  fieldWrap:  { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 5 },
  fieldInput: {
    backgroundColor: c.surface, borderRadius: 10,
    borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: c.text,
  },
  errorBox:  { backgroundColor: c.errorLight, borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { fontSize: 13, color: c.error, lineHeight: 18 },
}); }

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Sizes.screenPadding, paddingTop: 8, paddingBottom: 4,
  },
  title: { fontSize: 26, fontWeight: '800', color: c.text },
  addBtn: {
    backgroundColor: c.primary, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: c.textOnPrimary },

  searchWrap: {
    paddingHorizontal: Sizes.screenPadding, paddingTop: 10, paddingBottom: 4,
  },
  searchInput: {
    backgroundColor: c.surface, borderRadius: 10,
    borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: c.text,
  },

  filterRow: {
    flexDirection: 'row', paddingHorizontal: Sizes.screenPadding,
    paddingVertical: 8, gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1.5, borderColor: c.border,
    backgroundColor: c.surface,
  },
  filterTabActive:     { backgroundColor: c.primary, borderColor: c.primary },
  filterTabText:       { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  filterTabTextActive: { color: c.textOnPrimary },

  list: { paddingHorizontal: Sizes.screenPadding, paddingBottom: 16 },

  footer: {
    padding: 12, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: c.border,
  },
  footerText: { fontSize: 12, color: c.textSecondary },

  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 15, color: c.error, textAlign: 'center', marginBottom: 16 },
  retryBtn:  { backgroundColor: c.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText: { fontWeight: '700', color: c.textOnPrimary },

  emptyBox:  { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, color: c.textSecondary, textAlign: 'center' },
}); }
