import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  adminApi,
  type AdminGlobalTariff,
  type CreateGlobalTariffPayload,
  type VehicleType,
} from '../../api/admin';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import type { AdminProfileStackScreenProps } from '../../navigation/types';
import { useTranslation } from '../../i18n';

// ── Constants ─────────────────────────────────────────────────────────────────

const VEHICLE_TYPES: { label: string; value: VehicleType | null }[] = [
  { label: 'All',     value: null      },
  { label: 'Economy', value: 'economy' },
  { label: 'Comfort', value: 'comfort' },
  { label: 'XL',      value: 'xl'      },
];

// ── TariffCard ────────────────────────────────────────────────────────────────

function TariffCard({
  tariff,
  onEdit,
  onDeactivate,
}: {
  tariff: AdminGlobalTariff;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const colors = useColors();
  const cardStyles = useMemo(() => getCardStyles(colors), [colors]);
  const { t } = useTranslation();

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.top}>
        <View style={cardStyles.titleRow}>
          <Text style={cardStyles.name}>{tariff.name}</Text>
          {tariff.vehicleType && (
            <View style={cardStyles.typeBadge}>
              <Text style={cardStyles.typeBadgeText}>
                {VEHICLE_TYPES.find(v => v.value === tariff.vehicleType)?.label ?? tariff.vehicleType}
              </Text>
            </View>
          )}
          {tariff.isNightTariff && (
            <View style={cardStyles.nightBadge}>
              <Text style={cardStyles.nightBadgeText}>🌙 Night</Text>
            </View>
          )}
          {!tariff.isActive && (
            <View style={cardStyles.inactiveBadge}>
              <Text style={cardStyles.inactiveBadgeText}>Inactive</Text>
            </View>
          )}
        </View>
        <View style={cardStyles.actions}>
          <TouchableOpacity
            style={cardStyles.editBtn}
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel={`Edit tariff ${tariff.name}`}>
            <Text style={cardStyles.editBtnText}>{t('admin.globalTariffs.editBtn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={cardStyles.deleteBtn}
            onPress={onDeactivate}
            accessibilityRole="button"
            accessibilityLabel={`Deactivate tariff ${tariff.name}`}>
            <Text style={cardStyles.deleteBtnText}>{t('admin.globalTariffs.deleteBtn')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={cardStyles.grid}>
        <FareItem label="Base fare"    value={`$${Number(tariff.baseFare).toFixed(2)}`}       cardStyles={cardStyles} />
        <FareItem label="Per km"       value={`$${Number(tariff.perKmRate).toFixed(2)}`}      cardStyles={cardStyles} />
        <FareItem label="Per minute"   value={`$${Number(tariff.perMinuteRate).toFixed(2)}`}  cardStyles={cardStyles} />
        <FareItem label="Minimum fare" value={`$${Number(tariff.minimumFare).toFixed(2)}`}    cardStyles={cardStyles} />
      </View>

      {tariff.surgeMultiplier !== 1 && (
        <View style={cardStyles.surgeRow}>
          <Text style={cardStyles.surgeText}>
            ⚡ Surge ×{Number(tariff.surgeMultiplier).toFixed(2)}
          </Text>
        </View>
      )}

      {tariff.isNightTariff && tariff.nightStartHour != null && tariff.nightEndHour != null && (
        <Text style={cardStyles.nightHours}>
          🕙 Night hours: {String(tariff.nightStartHour).padStart(2, '0')}:00 – {String(tariff.nightEndHour).padStart(2, '0')}:00
        </Text>
      )}
    </View>
  );
}

function FareItem({ label, value, cardStyles }: { label: string; value: string; cardStyles: ReturnType<typeof getCardStyles> }) {
  return (
    <View style={cardStyles.fareItem}>
      <Text style={cardStyles.fareLabel}>{label}</Text>
      <Text style={cardStyles.fareValue}>{value}</Text>
    </View>
  );
}

function getCardStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface, borderRadius: 16,
      padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 12,
    },
    top:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    name:     { fontSize: 16, fontWeight: '700', color: c.text },
    typeBadge: {
      backgroundColor: c.primary + '22', borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 3,
      borderWidth: 1, borderColor: c.primary + '55',
    },
    typeBadgeText: { fontSize: 11, fontWeight: '700', color: c.primary },
    nightBadge: {
      backgroundColor: '#1e1b4b', borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    nightBadgeText: { fontSize: 11, fontWeight: '700', color: '#c7d2fe' },
    inactiveBadge: {
      backgroundColor: c.border, borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    inactiveBadgeText: { fontSize: 11, fontWeight: '700', color: c.textSecondary },
    actions:    { flexDirection: 'row', gap: 8, marginLeft: 8 },
    editBtn:    { backgroundColor: c.infoLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    editBtnText:{ fontSize: 13, fontWeight: '700', color: c.info },
    deleteBtn:  { backgroundColor: c.errorLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    deleteBtnText: { fontSize: 13, fontWeight: '700', color: c.error },
    grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    fareItem:  { width: '47%', backgroundColor: c.surfaceAlt, borderRadius: 8, padding: 10 },
    fareLabel: { fontSize: 11, color: c.textSecondary, marginBottom: 3 },
    fareValue: { fontSize: 15, fontWeight: '800', color: c.text },
    surgeRow:  { marginTop: 10, flexDirection: 'row' },
    surgeText: { fontSize: 12, fontWeight: '700', color: c.warning },
    nightHours:{ marginTop: 6, fontSize: 12, color: c.textSecondary },
  });
}

// ── TariffModal ────────────────────────────────────────────────────────────────

interface TariffForm {
  name:            string;
  baseFare:        string;
  perKmRate:       string;
  perMinuteRate:   string;
  minimumFare:     string;
  surgeMultiplier: string;
  vehicleType:     VehicleType | null;
  isNightTariff:   boolean;
  nightStartHour:  string;
  nightEndHour:    string;
}

const EMPTY_FORM: TariffForm = {
  name: '', baseFare: '', perKmRate: '',
  perMinuteRate: '', minimumFare: '',
  surgeMultiplier: '1.00',
  vehicleType: null,
  isNightTariff: false, nightStartHour: '22', nightEndHour: '6',
};

function tariffToForm(t: AdminGlobalTariff): TariffForm {
  return {
    name:            t.name,
    baseFare:        String(t.baseFare),
    perKmRate:       String(t.perKmRate),
    perMinuteRate:   String(t.perMinuteRate),
    minimumFare:     String(t.minimumFare),
    surgeMultiplier: String(t.surgeMultiplier ?? 1),
    vehicleType:     t.vehicleType,
    isNightTariff:   t.isNightTariff,
    nightStartHour:  t.nightStartHour != null ? String(t.nightStartHour) : '22',
    nightEndHour:    t.nightEndHour   != null ? String(t.nightEndHour)   : '6',
  };
}

function TariffModal({
  visible,
  tariff,
  onClose,
  onSaved,
}: {
  visible:  boolean;
  tariff:   AdminGlobalTariff | null;
  onClose:  () => void;
  onSaved:  (t: AdminGlobalTariff) => void;
}) {
  const colors = useColors();
  const mStyles = useMemo(() => getMStyles(colors), [colors]);
  const { t } = useTranslation();

  const [form,    setForm]    = useState<TariffForm>(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setForm(tariff ? tariffToForm(tariff) : EMPTY_FORM);
      setFormErr(null);
    }
  }, [visible, tariff]);

  const set = (key: keyof TariffForm) => (val: string | boolean | VehicleType | null) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    const baseFare      = parseFloat(form.baseFare);
    const perKmRate     = parseFloat(form.perKmRate);
    const perMinuteRate = parseFloat(form.perMinuteRate);
    const minimumFare   = parseFloat(form.minimumFare);
    const surgeMultiplier = parseFloat(form.surgeMultiplier);

    if (!form.name.trim())                         { setFormErr(t('admin.globalTariffs.nameRequired')); return; }
    if (isNaN(baseFare) || baseFare < 0)           { setFormErr(t('admin.globalTariffs.baseFareInvalid')); return; }
    if (isNaN(perKmRate) || perKmRate < 0)         { setFormErr(t('admin.globalTariffs.perKmInvalid')); return; }
    if (isNaN(perMinuteRate) || perMinuteRate < 0) { setFormErr(t('admin.globalTariffs.perMinuteInvalid')); return; }
    if (isNaN(minimumFare) || minimumFare < 0)     { setFormErr(t('admin.globalTariffs.minimumFareInvalid')); return; }
    if (isNaN(surgeMultiplier) || surgeMultiplier < 1 || surgeMultiplier > 10) {
      setFormErr(t('admin.globalTariffs.surgeInvalid'));
      return;
    }

    const payload: CreateGlobalTariffPayload = {
      name:             form.name.trim(),
      baseFare,
      perKmRate,
      perMinuteRate,
      minimumFare,
      surgeMultiplier,
      isNightTariff:    form.isNightTariff,
      vehicleType:      form.vehicleType ?? undefined,
    };

    if (form.isNightTariff) {
      const startH = parseInt(form.nightStartHour, 10);
      const endH   = parseInt(form.nightEndHour,   10);
      if (isNaN(startH) || startH < 0 || startH > 23) { setFormErr(t('admin.globalTariffs.nightStartInvalid')); return; }
      if (isNaN(endH)   || endH   < 0 || endH   > 23) { setFormErr(t('admin.globalTariffs.nightEndInvalid'));   return; }
      payload.nightStartHour = startH;
      payload.nightEndHour   = endH;
    }

    setFormErr(null);
    setSaving(true);
    try {
      let res;
      if (tariff) {
        res = await adminApi.updateGlobalTariff(tariff.id, payload);
      } else {
        res = await adminApi.createGlobalTariff(payload);
      }
      onSaved(res.data);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setFormErr(Array.isArray(msg) ? msg.join('\n') : (msg ?? t('admin.globalTariffs.saveError')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={mStyles.safe}>
          <View style={mStyles.header}>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel">
              <Text style={mStyles.cancel}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={mStyles.title}>{tariff ? t('admin.globalTariffs.editTariffTitle') : t('admin.globalTariffs.newTariffTitle')}</Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save tariff"
              accessibilityState={{ disabled: saving }}>
              {saving
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={mStyles.save}>{t('common.save')}</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={mStyles.scroll} keyboardShouldPersistTaps="handled">
            {formErr && (
              <View style={mStyles.errorBox}>
                <Text style={mStyles.errorText}>{formErr}</Text>
              </View>
            )}

            <MField label="Tariff name" value={form.name} onChange={set('name')} placeholder="Standard / Night / XL…" mStyles={mStyles} colors={colors} />

            {/* Vehicle type selector */}
            <Text style={mStyles.sectionHeader}>Vehicle Type</Text>
            <View style={mStyles.typeRow}>
              {VEHICLE_TYPES.map(vt => (
                <TouchableOpacity
                  key={String(vt.value)}
                  style={[mStyles.typePill, form.vehicleType === vt.value && mStyles.typePillActive]}
                  onPress={() => set('vehicleType')(vt.value)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Vehicle type: ${vt.label}`}
                  accessibilityState={{ checked: form.vehicleType === vt.value }}>
                  <Text style={[mStyles.typePillText, form.vehicleType === vt.value && mStyles.typePillTextActive]}>
                    {vt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={mStyles.sectionHeader}>Rates</Text>
            <View style={mStyles.twoCol}>
              <View style={{ flex: 1 }}>
                <MField label="Base fare ($)" value={form.baseFare} onChange={set('baseFare')} keyboardType="decimal-pad" placeholder="1.50" mStyles={mStyles} colors={colors} />
              </View>
              <View style={{ flex: 1 }}>
                <MField label="Minimum fare ($)" value={form.minimumFare} onChange={set('minimumFare')} keyboardType="decimal-pad" placeholder="3.00" mStyles={mStyles} colors={colors} />
              </View>
            </View>
            <View style={mStyles.twoCol}>
              <View style={{ flex: 1 }}>
                <MField label="Per km ($)" value={form.perKmRate} onChange={set('perKmRate')} keyboardType="decimal-pad" placeholder="0.50" mStyles={mStyles} colors={colors} />
              </View>
              <View style={{ flex: 1 }}>
                <MField label="Per minute ($)" value={form.perMinuteRate} onChange={set('perMinuteRate')} keyboardType="decimal-pad" placeholder="0.10" mStyles={mStyles} colors={colors} />
              </View>
            </View>

            <Text style={mStyles.sectionHeader}>Surge</Text>
            <MField
              label="Surge multiplier (1.00 = normal)"
              value={form.surgeMultiplier}
              onChange={set('surgeMultiplier')}
              keyboardType="decimal-pad"
              placeholder="1.00"
              mStyles={mStyles}
              colors={colors}
            />

            <Text style={mStyles.sectionHeader}>Night tariff</Text>
            <View style={mStyles.switchRow}>
              <Text style={mStyles.switchLabel}>Enable night tariff</Text>
              <Switch
                value={form.isNightTariff}
                onValueChange={v => set('isNightTariff')(v)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
                accessibilityRole="switch"
                accessibilityLabel={form.isNightTariff ? 'Night tariff enabled' : 'Night tariff disabled'}
              />
            </View>

            {form.isNightTariff && (
              <View style={mStyles.twoCol}>
                <View style={{ flex: 1 }}>
                  <MField label="Night start (0–23)" value={form.nightStartHour} onChange={set('nightStartHour')} keyboardType="number-pad" placeholder="22" mStyles={mStyles} colors={colors} />
                </View>
                <View style={{ flex: 1 }}>
                  <MField label="Night end (0–23)" value={form.nightEndHour} onChange={set('nightEndHour')} keyboardType="number-pad" placeholder="6" mStyles={mStyles} colors={colors} />
                </View>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MField({ label, value, onChange, placeholder, keyboardType, mStyles, colors }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboardType?: any;
  mStyles: ReturnType<typeof getMStyles>; colors: ColorPalette;
}) {
  return (
    <View style={mStyles.fieldWrap}>
      <Text style={mStyles.fieldLabel}>{label}</Text>
      <TextInput
        style={mStyles.fieldInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType={keyboardType ?? 'default'}
        autoCorrect={false}
        autoCapitalize="sentences"
      />
    </View>
  );
}

function getMStyles(c: ColorPalette) {
  return StyleSheet.create({
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
      marginTop: 20, marginBottom: 10, marginLeft: 2,
    },

    typeRow:             { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
    typePill:            { borderRadius: 16, borderWidth: 1.5, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: c.surface },
    typePillActive:      { backgroundColor: c.primary, borderColor: c.primary },
    typePillText:        { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    typePillTextActive:  { color: c.white },

    twoCol:    { flexDirection: 'row', gap: 10 },
    fieldWrap: { marginBottom: 12 },
    fieldLabel:{ fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 5 },
    fieldInput:{
      backgroundColor: c.surface, borderRadius: 10,
      borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 11,
      fontSize: 15, color: c.text,
    },

    switchRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.surface, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12,
      borderWidth: 1, borderColor: c.border, marginBottom: 12,
    },
    switchLabel: { fontSize: 15, color: c.text, fontWeight: '500' },

    errorBox:  { backgroundColor: c.errorLight, borderRadius: 10, padding: 12, marginBottom: 12 },
    errorText: { fontSize: 13, color: c.error, lineHeight: 18 },
  });
}

// ── Main screen ───────────────────────────────────────────────────────────────

type Props = AdminProfileStackScreenProps<'AdminGlobalTariffs'>;

export default function AdminGlobalTariffsScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [tariffs,    setTariffs]    = useState<AdminGlobalTariff[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<AdminGlobalTariff | null>(null);
  const [modalOpen,  setModalOpen]  = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getGlobalTariffs();
      setTariffs(res.data);
    } catch {
      setError(t('admin.globalTariffs.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const openEdit = (t: AdminGlobalTariff) => {
    setEditTarget(t);
    setModalOpen(true);
  };

  const handleDeactivate = (t: AdminGlobalTariff) => {
    Alert.alert(
      t('admin.globalTariffs.deleteTitle'),
      t('admin.globalTariffs.deleteMsg', { name: t.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.globalTariffs.deleteBtn'), style: 'destructive',
          onPress: async () => {
            try {
              await adminApi.deactivateGlobalTariff(t.id);
              setTariffs(prev => prev.filter(x => x.id !== t.id));
            } catch {
              Alert.alert(t('common.error'), t('admin.globalTariffs.deleteError'));
            }
          },
        },
      ],
    );
  };

  const handleSaved = (saved: AdminGlobalTariff) => {
    setTariffs(prev => {
      const idx = prev.findIndex(t => t.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setModalOpen(false);
  };

  const activeTariffs   = tariffs.filter(t => t.isActive);
  const inactiveTariffs = tariffs.filter(t => !t.isActive);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backText}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('admin.globalTariffs.title')}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={openCreate}
          accessibilityRole="button"
          accessibilityLabel="Create new tariff">
          <Text style={styles.addBtnText}>{t('admin.globalTariffs.addBtn')}</Text>
        </TouchableOpacity>
      </View>

      {/* Info box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          🚖 Global tariffs apply to <Text style={{ fontWeight: '700' }}>solo (independent) drivers</Text> who
          are not linked to a company. Companies manage their own tariffs separately.
        </Text>
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
            onPress={() => load()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading tariffs">
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}>

          {activeTariffs.length === 0 && inactiveTariffs.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>💸</Text>
              <Text style={styles.emptyTitle}>{t('admin.globalTariffs.emptyTitle')}</Text>
              <Text style={styles.emptyText}>{t('admin.globalTariffs.emptyText')}</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={openCreate}
                accessibilityRole="button"
                accessibilityLabel="Create first tariff">
                <Text style={styles.emptyBtnText}>{t('admin.globalTariffs.addBtn')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {activeTariffs.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Active ({activeTariffs.length})</Text>
                  {activeTariffs.map(t => (
                    <TariffCard
                      key={t.id}
                      tariff={t}
                      onEdit={() => openEdit(t)}
                      onDeactivate={() => handleDeactivate(t)}
                    />
                  ))}
                </>
              )}

              {inactiveTariffs.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
                    Inactive ({inactiveTariffs.length})
                  </Text>
                  {inactiveTariffs.map(t => (
                    <TariffCard
                      key={t.id}
                      tariff={t}
                      onEdit={() => openEdit(t)}
                      onDeactivate={() => handleDeactivate(t)}
                    />
                  ))}
                </>
              )}
            </>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      <TariffModal
        visible={modalOpen}
        tariff={editTarget}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },

    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: Sizes.screenPadding, paddingTop: 8, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn:  { marginRight: 8 },
    backText: { fontSize: 16, color: c.primary, fontWeight: '600' },
    title:    { flex: 1, fontSize: 20, fontWeight: '800', color: c.text },
    addBtn:   { backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
    addBtnText: { fontSize: 14, fontWeight: '700', color: c.textOnPrimary },

    infoBox: {
      backgroundColor: c.infoLight ?? '#eff6ff',
      borderLeftWidth: 4, borderLeftColor: c.info ?? '#3b82f6',
      paddingHorizontal: 14, paddingVertical: 10,
      marginHorizontal: Sizes.screenPadding, marginTop: 12,
      borderRadius: 8,
    },
    infoText: { fontSize: 12, color: c.info ?? '#1d4ed8', lineHeight: 18 },

    scroll: { padding: Sizes.screenPadding },

    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textSecondary,
      letterSpacing: 0.8, textTransform: 'uppercase',
      marginBottom: 8, marginLeft: 2,
    },

    centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorText: { fontSize: 15, color: c.error, textAlign: 'center', marginBottom: 16 },
    retryBtn:  { backgroundColor: c.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
    retryText: { fontWeight: '700', color: c.textOnPrimary },

    emptyBox:  { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
    emptyIcon: { fontSize: 48, marginBottom: 16 },
    emptyTitle:{ fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8 },
    emptyText: { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    emptyBtn:  { backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
    emptyBtnText: { fontSize: 15, fontWeight: '700', color: c.textOnPrimary },
  });
}
