import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import {
  adminApi,
  type AdminPlan,
  type CreatePlanPayload,
  type PlanAudience,
} from '../../api/admin';
import { toAlertString } from '../../utils/errorMessage';
import type { AdminProfileStackScreenProps } from '../../navigation/types';
import { useTranslation } from '../../i18n';

type Props = AdminProfileStackScreenProps<'AdminPlans'>;

// ── Helpers ───────────────────────────────────────────────────────────────────

const AUDIENCES: { label: string; value: PlanAudience }[] = [
  { label: '🏢 Company', value: 'company' },
  { label: '🚗 Driver',  value: 'driver'  },
];

function formatPrice(p: number): string {
  return `$${Number(p).toFixed(2)}/mo`;
}

// ── Plan Form Modal ───────────────────────────────────────────────────────────

interface PlanFormState {
  name:           string;
  priceMonthly:   string;
  maxDrivers:     string;
  featuresText:   string;  // newline-separated
  targetAudience: PlanAudience;
  stripePriceId:  string;
  isActive:       boolean;
}

const EMPTY_FORM: PlanFormState = {
  name: '', priceMonthly: '', maxDrivers: '1',
  featuresText: '', targetAudience: 'company',
  stripePriceId: '', isActive: true,
};

function planToForm(plan: AdminPlan): PlanFormState {
  return {
    name:           plan.name,
    priceMonthly:   String(plan.priceMonthly),
    maxDrivers:     String(plan.maxDrivers),
    featuresText:   plan.features.join('\n'),
    targetAudience: plan.targetAudience,
    stripePriceId:  plan.stripePriceId ?? '',
    isActive:       plan.isActive,
  };
}

function PlanFormModal({
  visible,
  editing,
  onSave,
  onClose,
  saving,
}: {
  visible: boolean;
  editing: AdminPlan | null;
  onSave:  (form: PlanFormState) => void;
  onClose: () => void;
  saving:  boolean;
}) {
  const colors = useColors();
  const fm = useMemo(() => getFmStyles(colors), [colors]);
  const { t } = useTranslation();
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);

  // Seed form when opening
  useEffect(() => {
    if (visible) setForm(editing ? planToForm(editing) : EMPTY_FORM);
  }, [visible, editing]);

  const set = (key: keyof PlanFormState, val: string | boolean | PlanAudience) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = () => {
    if (!form.name.trim())        { Alert.alert(t('common.validation'), 'Name is required.'); return; }
    const price = parseFloat(form.priceMonthly);
    if (isNaN(price) || price < 0) { Alert.alert(t('common.validation'), 'Enter a valid price.'); return; }
    const maxD  = parseInt(form.maxDrivers, 10);
    if (isNaN(maxD) || maxD < 1)   { Alert.alert(t('common.validation'), 'Max drivers must be ≥ 1.'); return; }
    onSave(form);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={fm.overlay} onPress={onClose}>
        <Pressable style={fm.sheet} onPress={e => e.stopPropagation()}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>

              {/* Header */}
              <View style={fm.header}>
                <Text style={fm.title}>{editing ? t('admin.subscriptionPlans.editPlanTitle') : t('admin.subscriptionPlans.newPlanTitle')}</Text>
                <TouchableOpacity
                  onPress={onClose}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close">
                  <Text style={fm.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Audience selector */}
              <Text style={fm.label}>{t('admin.subscriptionPlans.typeLabel')}</Text>
              <View style={fm.segRow}>
                {AUDIENCES.map(a => (
                  <TouchableOpacity
                    key={a.value}
                    style={[fm.seg, form.targetAudience === a.value && fm.segActive]}
                    onPress={() => set('targetAudience', a.value)}
                    accessibilityRole="radio"
                    accessibilityLabel={a.value === 'company' ? 'Company' : 'Driver'}
                    accessibilityState={{ checked: form.targetAudience === a.value }}>
                    <Text style={[fm.segText, form.targetAudience === a.value && fm.segTextActive]}>
                      {a.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Name */}
              <Text style={fm.label}>{t('admin.subscriptionPlans.nameLabel')}</Text>
              <TextInput
                style={fm.input}
                value={form.name}
                onChangeText={v => set('name', v)}
                placeholder="e.g. Standard, Pro, Enterprise"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Plan name"
              />

              {/* Price */}
              <Text style={fm.label}>{t('admin.subscriptionPlans.priceLabel')}</Text>
              <TextInput
                style={fm.input}
                value={form.priceMonthly}
                onChangeText={v => set('priceMonthly', v)}
                placeholder="29.99"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                accessibilityLabel="Monthly price in dollars"
              />

              {/* Max Drivers */}
              <Text style={fm.label}>
                {form.targetAudience === 'driver' ? 'Seats (set to 1 for drivers)' : 'Max Drivers *'}
              </Text>
              <TextInput
                style={fm.input}
                value={form.maxDrivers}
                onChangeText={v => set('maxDrivers', v)}
                placeholder="1"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                accessibilityLabel={form.targetAudience === 'driver' ? 'Number of seats' : 'Maximum number of drivers'}
              />

              {/* Features */}
              <Text style={fm.label}>{t('admin.subscriptionPlans.featuresLabel')}</Text>
              <TextInput
                style={[fm.input, fm.inputTall]}
                value={form.featuresText}
                onChangeText={v => set('featuresText', v)}
                placeholder={'Priority dispatch\nReduced commission\nAnalytics dashboard'}
                placeholderTextColor={colors.textSecondary}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Plan features, one per line"
              />

              {/* Stripe Price ID */}
              <Text style={fm.label}>Stripe Price ID (optional)</Text>
              <TextInput
                style={fm.input}
                value={form.stripePriceId}
                onChangeText={v => set('stripePriceId', v)}
                placeholder="price_..."
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Stripe price ID (optional)"
              />

              {/* Active toggle — only for existing plans */}
              {editing && (
                <View style={fm.switchRow}>
                  <Text style={fm.switchLabel}>Active</Text>
                  <Switch
                    value={form.isActive}
                    onValueChange={v => set('isActive', v)}
                    trackColor={{ true: colors.primary, false: colors.border }}
                    thumbColor={colors.white}
                    accessibilityRole="switch"
                    accessibilityLabel={`Plan active: ${form.isActive ? 'yes' : 'no'}`}
                  />
                </View>
              )}

              {/* Save */}
              <TouchableOpacity
                style={[fm.saveBtn, saving && fm.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={editing ? `Save changes to ${editing.name}` : 'Create plan'}
                accessibilityState={{ disabled: saving }}>
                {saving
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Text style={fm.saveBtnText}>{editing ? t('common.save') : t('admin.subscriptionPlans.addBtn')}</Text>}
              </TouchableOpacity>

              <View style={{ height: 20 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function getFmStyles(c: ColorPalette) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.background,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingHorizontal: Sizes.screenPadding,
      paddingTop: 20,
      maxHeight: '92%',
    },
    header: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 20,
    },
    title:   { fontSize: 20, fontWeight: '800', color: c.text },
    closeBtn:{ fontSize: 18, color: c.textSecondary, padding: 4 },

    label: {
      fontSize: 12, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.6,
      marginBottom: 6, marginTop: 14,
    },
    input: {
      backgroundColor: c.surface, borderRadius: 10,
      borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 14, color: c.text,
    },
    inputTall: { minHeight: 90, textAlignVertical: 'top' },

    segRow:      { flexDirection: 'row', gap: 8 },
    seg:         { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1.5, borderColor: c.border, alignItems: 'center' },
    segActive:   { borderColor: c.primary, backgroundColor: c.primary + '15' },
    segText:     { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    segTextActive: { color: c.primary },

    switchRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
    switchLabel: { fontSize: 15, fontWeight: '600', color: c.text },

    saveBtn:         { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnText:     { color: c.white, fontSize: 15, fontWeight: '700' },
  });
}

// ── Plan Card ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  onEdit,
  onToggle,
  onDelete,
  actionLoading,
}: {
  plan:          AdminPlan;
  onEdit:        (plan: AdminPlan) => void;
  onToggle:      (plan: AdminPlan) => void;
  onDelete:      (plan: AdminPlan) => void;
  actionLoading: string | null;
}) {
  const colors = useColors();
  const pc = useMemo(() => getPcStyles(colors), [colors]);
  const { t } = useTranslation();
  const busy = actionLoading === plan.id;

  return (
    <View style={[pc.wrap, !plan.isActive && pc.wrapInactive]}>
      {/* Header row */}
      <View style={pc.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={pc.badgeRow}>
            <View style={[pc.badge, plan.targetAudience === 'driver' ? pc.badgeDriver : pc.badgeCompany]}>
              <Text style={[pc.badgeText, plan.targetAudience === 'driver' ? pc.badgeTextDriver : pc.badgeTextCompany]}>
                {plan.targetAudience === 'driver' ? `🚗 ${t('admin.subscriptionPlans.typeDriver')}` : `🏢 ${t('admin.subscriptionPlans.typeCompany')}`}
              </Text>
            </View>
            {!plan.isActive && (
              <View style={pc.badgeInactive}>
                <Text style={pc.badgeInactiveText}>Inactive</Text>
              </View>
            )}
          </View>
          <Text style={pc.name}>{plan.name}</Text>
        </View>
        <Text style={pc.price}>{formatPrice(plan.priceMonthly)}</Text>
      </View>

      {/* Meta */}
      <Text style={pc.meta}>
        👥 {plan.targetAudience === 'driver' ? '1 driver' : `Up to ${plan.maxDrivers} drivers`}
      </Text>
      {plan.stripePriceId && (
        <Text style={pc.meta}>🔗 {plan.stripePriceId}</Text>
      )}

      {/* Features */}
      {plan.features.length > 0 && (
        <View style={pc.features}>
          {plan.features.map((f, i) => (
            <Text key={i} style={pc.feature}>✓ {f}</Text>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={pc.actions}>
        {busy ? (
          <ActivityIndicator color={colors.primary} style={{ flex: 1 }} />
        ) : (
          <>
            <TouchableOpacity
              style={pc.editBtn}
              onPress={() => onEdit(plan)}
              accessibilityRole="button"
              accessibilityLabel={`Edit plan ${plan.name}`}>
              <Text style={pc.editBtnText}>✏️ {t('admin.subscriptionPlans.editBtn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pc.toggleBtn, plan.isActive ? pc.toggleBtnDeactivate : pc.toggleBtnActivate]}
              onPress={() => onToggle(plan)}
              accessibilityRole="button"
              accessibilityLabel={plan.isActive ? `Deactivate plan ${plan.name}` : `Activate plan ${plan.name}`}>
              <Text style={[pc.toggleBtnText, plan.isActive ? pc.toggleBtnTextDeactivate : pc.toggleBtnTextActivate]}>
                {plan.isActive ? 'Deactivate' : 'Activate'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

function getPcStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.surface, borderRadius: 14,
      padding: 14, marginBottom: 12,
      borderWidth: 1, borderColor: c.border,
    },
    wrapInactive: { opacity: 0.6 },

    headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
    badgeRow:  { flexDirection: 'row', gap: 6, marginBottom: 6 },

    badge:           { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    badgeCompany:    { backgroundColor: c.primary + '22' },
    badgeDriver:     { backgroundColor: c.success + '22' },
    badgeText:       { fontSize: 11, fontWeight: '700' },
    badgeTextCompany:{ color: c.primary },
    badgeTextDriver: { color: c.success },

    badgeInactive:     { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: c.border },
    badgeInactiveText: { fontSize: 11, fontWeight: '700', color: c.textSecondary },

    name:  { fontSize: 17, fontWeight: '700', color: c.text },
    price: { fontSize: 18, fontWeight: '800', color: c.text },
    meta:  { fontSize: 12, color: c.textSecondary, marginBottom: 2 },

    features: { marginTop: 8, gap: 3 },
    feature:  { fontSize: 12, color: c.textSecondary },

    actions:               { flexDirection: 'row', gap: 8, marginTop: 12 },
    editBtn:               { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 9, alignItems: 'center' },
    editBtnText:           { fontSize: 13, fontWeight: '600', color: c.text },
    toggleBtn:             { flex: 1, borderRadius: 10, padding: 9, alignItems: 'center' },
    toggleBtnDeactivate:   { borderWidth: 1, borderColor: c.error },
    toggleBtnActivate:     { backgroundColor: c.success },
    toggleBtnText:         { fontSize: 13, fontWeight: '700' },
    toggleBtnTextDeactivate: { color: c.error },
    toggleBtnTextActivate:   { color: c.white },
  });
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminSubscriptionPlansScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [plans, setPlans]       = useState<AdminPlan[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [modalVisible, setModalVisible]   = useState(false);
  const [editingPlan,  setEditingPlan]    = useState<AdminPlan | null>(null);

  /** Active filter: null = show all */
  const [audienceFilter, setAudienceFilter] = useState<PlanAudience | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await adminApi.getPlans();
      setPlans(res.data);
    } catch {
      Alert.alert(t('common.error'), t('admin.subscriptionPlans.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form: PlanFormState) => {
    setSaving(true);
    const features = form.featuresText
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    try {
      if (editingPlan) {
        const res = await adminApi.updatePlan(editingPlan.id, {
          name:           form.name.trim(),
          priceMonthly:   parseFloat(form.priceMonthly),
          maxDrivers:     parseInt(form.maxDrivers, 10),
          features,
          targetAudience: form.targetAudience,
          stripePriceId:  form.stripePriceId.trim() || null,
          isActive:       form.isActive,
        });
        setPlans(prev => prev.map(p => p.id === editingPlan.id ? res.data : p));
      } else {
        const payload: CreatePlanPayload = {
          name:           form.name.trim(),
          priceMonthly:   parseFloat(form.priceMonthly),
          maxDrivers:     parseInt(form.maxDrivers, 10),
          features,
          targetAudience: form.targetAudience,
          ...(form.stripePriceId.trim() ? { stripePriceId: form.stripePriceId.trim() } : {}),
        };
        const res = await adminApi.createPlan(payload);
        setPlans(prev => [res.data, ...prev]);
      }
      setModalVisible(false);
      setEditingPlan(null);
    } catch (err: any) {
      Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('admin.subscriptionPlans.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (plan: AdminPlan) => {
    const action = plan.isActive ? 'deactivate' : 'activate';
    Alert.alert(
      `${plan.isActive ? 'Deactivate' : 'Activate'} Plan`,
      `${plan.isActive ? 'Deactivate' : 'Activate'} "${plan.name}"? ${plan.isActive ? 'Existing subscribers keep their plan until it expires.' : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: plan.isActive ? 'Deactivate' : 'Activate',
          style: plan.isActive ? 'destructive' : 'default',
          onPress: async () => {
            setActionLoading(plan.id);
            try {
              if (plan.isActive) {
                await adminApi.deactivatePlan(plan.id);
                setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, isActive: false } : p));
              } else {
                const res = await adminApi.updatePlan(plan.id, { isActive: true });
                setPlans(prev => prev.map(p => p.id === plan.id ? res.data : p));
              }
            } catch (err: any) {
              Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('admin.subscriptionPlans.saveError')));
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  const openCreate = () => {
    setEditingPlan(null);
    setModalVisible(true);
  };

  const openEdit = (plan: AdminPlan) => {
    setEditingPlan(plan);
    setModalVisible(true);
  };

  const displayed = audienceFilter
    ? plans.filter(p => p.targetAudience === audienceFilter)
    : plans;

  const companyCount = plans.filter(p => p.targetAudience === 'company' && p.isActive).length;
  const driverCount  = plans.filter(p => p.targetAudience === 'driver'  && p.isActive).length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('admin.subscriptionPlans.title')}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={openCreate}
          accessibilityRole="button"
          accessibilityLabel="Create new subscription plan">
          <Text style={styles.addBtnText}>{t('admin.subscriptionPlans.addBtn')}</Text>
        </TouchableOpacity>
      </View>

      {/* Summary + filter pills */}
      <View style={styles.filterRow}>
        {[
          { label: `All (${plans.length})`,                      value: null           },
          { label: `🏢 Company (${companyCount} active)`,        value: 'company' as PlanAudience },
          { label: `🚗 Driver (${driverCount} active)`,          value: 'driver'  as PlanAudience },
        ].map(f => (
          <TouchableOpacity
            key={String(f.value)}
            style={[styles.pill, audienceFilter === f.value && styles.pillActive]}
            onPress={() => setAudienceFilter(f.value)}
            accessibilityRole="radio"
            accessibilityLabel={`Filter: ${f.value === null ? 'All plans' : f.value === 'company' ? 'Company plans' : 'Driver plans'}`}
            accessibilityState={{ checked: audienceFilter === f.value }}>
            <Text style={[styles.pillText, audienceFilter === f.value && styles.pillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={p => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <PlanCard
              plan={item}
              onEdit={openEdit}
              onToggle={handleToggle}
              onDelete={() => {}} // delete = deactivate; handled by toggle
              actionLoading={actionLoading}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>{t('admin.subscriptionPlans.emptyMsg')}</Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
          }
        />
      )}

      {/* Create / Edit modal */}
      <PlanFormModal
        visible={modalVisible}
        editing={editingPlan}
        onSave={handleSave}
        onClose={() => { setModalVisible(false); setEditingPlan(null); }}
        saving={saving}
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
      paddingHorizontal: Sizes.screenPadding,
      paddingTop: 12, paddingBottom: 10,
      backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn:  { paddingVertical: 6, paddingRight: 10 },
    backText: { fontSize: 14, fontWeight: '600', color: c.primary },
    title:    { flex: 1, fontSize: 17, fontWeight: '700', color: c.text },
    addBtn:   { backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    addBtnText: { color: c.white, fontWeight: '700', fontSize: 13 },

    filterRow: {
      flexDirection: 'row', gap: 8, flexWrap: 'wrap',
      paddingHorizontal: 12, paddingVertical: 10,
      backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    pill:          { borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.surface },
    pillActive:    { backgroundColor: c.primary, borderColor: c.primary },
    pillText:      { fontSize: 12, color: c.textSecondary },
    pillTextActive:{ color: c.white, fontWeight: '600' },

    list:      { padding: 12 },
    empty:     { alignItems: 'center', marginTop: 60 },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyText: { fontSize: 16, fontWeight: '600', color: c.text, marginBottom: 6 },
    emptyHint: { fontSize: 13, color: c.textSecondary },
  });
}
