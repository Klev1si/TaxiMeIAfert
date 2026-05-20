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
import { companyApi, CompanyTariff, TariffPayload } from '../../api/company';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';

// ─────────────────────────────────────────────────────────────────────────────

export default function CompanyTariffsScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [tariffs,    setTariffs]    = useState<CompanyTariff[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<CompanyTariff | null>(null);  // null = create new
  const [modalOpen,  setModalOpen]  = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await companyApi.getTariffs();
      setTariffs(res.data);
    } catch {
      setError(t('company.tariffs.loadError'));
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

  const openEdit = (tariff: CompanyTariff) => {
    setEditTarget(tariff);
    setModalOpen(true);
  };

  const handleDeactivate = (tariff: CompanyTariff) => {
    Alert.alert(
      t('company.tariffs.deactivateTitle'),
      t('company.tariffs.deactivateMsg', { name: tariff.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('company.tariffs.deactivateBtn'), style: 'destructive',
          onPress: async () => {
            try {
              await companyApi.deactivateTariff(tariff.id);
              setTariffs(prev => prev.filter(t => t.id !== tariff.id));
            } catch {
              Alert.alert(t('common.error'), t('company.tariffs.deactivateError'));
            }
          },
        },
      ],
    );
  };

  const handleSaved = (saved: CompanyTariff) => {
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('company.tariffs.title')}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={openCreate}
          accessibilityRole="button"
          accessibilityLabel="Create new tariff">
          <Text style={styles.addBtnText}>{t('company.tariffs.addBtn')}</Text>
        </TouchableOpacity>
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

          {tariffs.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>💸</Text>
              <Text style={styles.emptyTitle}>{t('company.tariffs.emptyTitle')}</Text>
              <Text style={styles.emptyText}>
                {t('company.tariffs.emptyText')}
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={openCreate}
                accessibilityRole="button"
                accessibilityLabel="Create your first tariff">
                <Text style={styles.emptyBtnText}>{t('company.tariffs.createFirstBtn')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            tariffs.map(t => (
              <TariffCard
                key={t.id}
                tariff={t}
                onEdit={() => openEdit(t)}
                onDeactivate={() => handleDeactivate(t)}
              />
            ))
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

// ── TariffCard ────────────────────────────────────────────────────────────────

function TariffCard({ tariff, onEdit, onDeactivate }: {
  tariff: CompanyTariff;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const colors = useColors();
  const cardStyles = useMemo(() => getCardStylesStyles(colors), [colors]);
  const { t } = useTranslation();
  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.top}>
        <View style={cardStyles.titleRow}>
          <Text style={cardStyles.name}>{tariff.name}</Text>
          {tariff.isNightTariff && (
            <View style={cardStyles.nightBadge}>
              <Text style={cardStyles.nightBadgeText}>🌙 {t('company.tariffs.nightBadge')}</Text>
            </View>
          )}
        </View>
        <View style={cardStyles.actions}>
          <TouchableOpacity
            style={cardStyles.editBtn}
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel={`Edit tariff ${tariff.name}`}>
            <Text style={cardStyles.editBtnText}>{t('company.tariffs.editBtn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={cardStyles.deleteBtn}
            onPress={onDeactivate}
            accessibilityRole="button"
            accessibilityLabel={`Deactivate tariff ${tariff.name}`}>
            <Text style={cardStyles.deleteBtnText}>{t('company.tariffs.deactivateBtn')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={cardStyles.grid}>
        <FareItem label={t('company.tariffs.baseFare')}    value={`$${tariff.baseFare.toFixed(2)}`} />
        <FareItem label={t('company.tariffs.perKm')}       value={`$${tariff.perKmRate.toFixed(2)}`} />
        <FareItem label={t('company.tariffs.perMinute')}   value={`$${tariff.perMinuteRate.toFixed(2)}`} />
        <FareItem label={t('company.tariffs.minimumFare')} value={`$${tariff.minimumFare.toFixed(2)}`} />
      </View>

      {tariff.isNightTariff && tariff.nightStartHour != null && tariff.nightEndHour != null && (
        <Text style={cardStyles.nightHours}>
          🕙 {t('company.tariffs.nightHours', { start: String(tariff.nightStartHour).padStart(2, '0'), end: String(tariff.nightEndHour).padStart(2, '0') })}
        </Text>
      )}
    </View>
  );
}

function FareItem({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  const cardStyles = useMemo(() => getCardStylesStyles(colors), [colors]);
  return (
    <View style={cardStyles.fareItem}>
      <Text style={cardStyles.fareLabel}>{label}</Text>
      <Text style={cardStyles.fareValue}>{value}</Text>
    </View>
  );
}

function getCardStylesStyles(c: ColorPalette) { return StyleSheet.create({
  card: {
    backgroundColor: c.surface, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 12,
  },
  top:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  name:     { fontSize: 16, fontWeight: '700', color: c.text },
  nightBadge: {
    backgroundColor: '#1e1b4b', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  nightBadgeText: { fontSize: 11, fontWeight: '700', color: '#c7d2fe' },
  actions:    { flexDirection: 'row', gap: 8, marginLeft: 8 },
  editBtn:    { backgroundColor: c.infoLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  editBtnText:{ fontSize: 13, fontWeight: '700', color: c.info },
  deleteBtn:  { backgroundColor: c.errorLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  deleteBtnText: { fontSize: 13, fontWeight: '700', color: c.error },

  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fareItem:  { width: '47%', backgroundColor: c.surfaceAlt, borderRadius: 8, padding: 10 },
  fareLabel: { fontSize: 11, color: c.textSecondary, marginBottom: 3 },
  fareValue: { fontSize: 15, fontWeight: '800', color: c.text },

  nightHours: { marginTop: 10, fontSize: 12, color: c.textSecondary },
}); }

// ── TariffModal ───────────────────────────────────────────────────────────────

interface TariffForm {
  name: string;
  baseFare: string;
  perKmRate: string;
  perMinuteRate: string;
  minimumFare: string;
  isNightTariff: boolean;
  nightStartHour: string;
  nightEndHour: string;
}

const EMPTY_TARIFF_FORM: TariffForm = {
  name: '', baseFare: '', perKmRate: '',
  perMinuteRate: '', minimumFare: '',
  isNightTariff: false, nightStartHour: '22', nightEndHour: '6',
};

function tariffToForm(t: CompanyTariff): TariffForm {
  return {
    name:           t.name,
    baseFare:       String(t.baseFare),
    perKmRate:      String(t.perKmRate),
    perMinuteRate:  String(t.perMinuteRate),
    minimumFare:    String(t.minimumFare),
    isNightTariff:  t.isNightTariff,
    nightStartHour: t.nightStartHour != null ? String(t.nightStartHour) : '22',
    nightEndHour:   t.nightEndHour   != null ? String(t.nightEndHour)   : '6',
  };
}

function TariffModal({ visible, tariff, onClose, onSaved }: {
  visible: boolean;
  tariff: CompanyTariff | null;
  onClose: () => void;
  onSaved: (t: CompanyTariff) => void;
}) {
  const colors = useColors();
  const mStyles = useMemo(() => getMStylesStyles(colors), [colors]);
  const { t } = useTranslation();
  const [form,    setForm]    = useState<TariffForm>(EMPTY_TARIFF_FORM);
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setForm(tariff ? tariffToForm(tariff) : EMPTY_TARIFF_FORM);
      setFormErr(null);
    }
  }, [visible, tariff]);

  const set = (key: keyof TariffForm) => (val: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    const baseFare      = parseFloat(form.baseFare);
    const perKmRate     = parseFloat(form.perKmRate);
    const perMinuteRate = parseFloat(form.perMinuteRate);
    const minimumFare   = parseFloat(form.minimumFare);

    if (!form.name.trim()) { setFormErr(t('company.tariffs.nameRequired')); return; }
    if (isNaN(baseFare) || baseFare < 0)      { setFormErr(t('company.tariffs.baseFareInvalid')); return; }
    if (isNaN(perKmRate) || perKmRate < 0)    { setFormErr(t('company.tariffs.perKmInvalid')); return; }
    if (isNaN(perMinuteRate) || perMinuteRate < 0) { setFormErr(t('company.tariffs.perMinuteInvalid')); return; }
    if (isNaN(minimumFare) || minimumFare < 0) { setFormErr(t('company.tariffs.minimumFareInvalid')); return; }

    const payload: TariffPayload = {
      name: form.name.trim(),
      baseFare, perKmRate, perMinuteRate, minimumFare,
      isNightTariff: form.isNightTariff,
    };
    if (form.isNightTariff) {
      const startH = parseInt(form.nightStartHour, 10);
      const endH   = parseInt(form.nightEndHour,   10);
      if (isNaN(startH) || startH < 0 || startH > 23) { setFormErr(t('company.tariffs.nightStartInvalid')); return; }
      if (isNaN(endH)   || endH   < 0 || endH   > 23) { setFormErr(t('company.tariffs.nightEndInvalid')); return; }
      payload.nightStartHour = startH;
      payload.nightEndHour   = endH;
    }

    setFormErr(null);
    setSaving(true);
    try {
      let res;
      if (tariff) {
        res = await companyApi.updateTariff(tariff.id, payload);
      } else {
        res = await companyApi.createTariff(payload);
      }
      onSaved(res.data);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setFormErr(Array.isArray(msg) ? msg.join('\n') : (msg ?? t('company.tariffs.saveTariffError')));
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
            <Text style={mStyles.title}>{tariff ? t('company.tariffs.editTariffTitle') : t('company.tariffs.newTariffTitle')}</Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={tariff ? `Save changes to tariff ${tariff.name}` : 'Save new tariff'}
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

            <MField label={t('company.tariffs.tariffNameLabel')} value={form.name} onChange={set('name')} placeholder={t('company.tariffs.tariffNamePlaceholder')} />

            <Text style={mStyles.sectionHeader}>{t('company.tariffs.ratesSection')}</Text>
            <View style={mStyles.twoCol}>
              <View style={{ flex: 1 }}>
                <MField label={t('company.tariffs.baseFareLabel')} value={form.baseFare} onChange={set('baseFare')} keyboardType="decimal-pad" placeholder="1.50" />
              </View>
              <View style={{ flex: 1 }}>
                <MField label={t('company.tariffs.minimumFareLabel')} value={form.minimumFare} onChange={set('minimumFare')} keyboardType="decimal-pad" placeholder="3.00" />
              </View>
            </View>
            <View style={mStyles.twoCol}>
              <View style={{ flex: 1 }}>
                <MField label={t('company.tariffs.perKmLabel')} value={form.perKmRate} onChange={set('perKmRate')} keyboardType="decimal-pad" placeholder="0.50" />
              </View>
              <View style={{ flex: 1 }}>
                <MField label={t('company.tariffs.perMinuteLabel')} value={form.perMinuteRate} onChange={set('perMinuteRate')} keyboardType="decimal-pad" placeholder="0.10" />
              </View>
            </View>

            <Text style={mStyles.sectionHeader}>{t('company.tariffs.nightTariffSection')}</Text>
            <View style={mStyles.switchRow}>
              <Text style={mStyles.switchLabel}>{t('company.tariffs.enableNight')}</Text>
              <Switch
                value={form.isNightTariff}
                onValueChange={v => set('isNightTariff')(v)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
                accessibilityRole="switch"
                accessibilityLabel={`Night tariff ${form.isNightTariff ? 'enabled' : 'disabled'}`}
              />
            </View>

            {form.isNightTariff && (
              <View style={mStyles.twoCol}>
                <View style={{ flex: 1 }}>
                  <MField label={t('company.tariffs.nightStartLabel')} value={form.nightStartHour} onChange={set('nightStartHour')} keyboardType="number-pad" placeholder="22" />
                </View>
                <View style={{ flex: 1 }}>
                  <MField label={t('company.tariffs.nightEndLabel')} value={form.nightEndHour} onChange={set('nightEndHour')} keyboardType="number-pad" placeholder="6" />
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

function MField({ label, value, onChange, placeholder, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboardType?: any;
}) {
  const colors = useColors();
  const mStyles = useMemo(() => getMStylesStyles(colors), [colors]);
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
        accessibilityLabel={label}
      />
    </View>
  );
}

function getMStylesStyles(c: ColorPalette) { return StyleSheet.create({
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
}); }

// ── Screen styles ─────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Sizes.screenPadding, paddingTop: 8, paddingBottom: 4,
  },
  title:       { fontSize: 26, fontWeight: '800', color: c.text },
  addBtn:      { backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  addBtnText:  { fontSize: 14, fontWeight: '700', color: c.textOnPrimary },

  scroll: { padding: Sizes.screenPadding },

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
}); }
