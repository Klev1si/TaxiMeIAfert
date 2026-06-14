/**
 * CompanyPromoCodesScreen
 *
 * Lets a company admin manage their own promo codes. Codes created here
 * only apply when the assigned driver belongs to this company — enforced
 * by the backend at ride-completion time.
 *
 * Rendered as a fullscreen modal from CompanyProfileScreen.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  companyApi,
  type CompanyPromoCode,
  type CompanyPromoPayload,
  type PromoDiscountType,
} from '../../api/company';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function discountLabel(c: CompanyPromoCode): string {
  if (c.discountType === 'percent') {
    const cap = c.maxDiscountAmount != null ? ` (max €${c.maxDiscountAmount})` : '';
    return `${c.discountValue}% off${cap}`;
  }
  return `€${c.discountValue} off`;
}

function expiryLabel(c: CompanyPromoCode): string {
  if (!c.expiresAt) return 'No expiry';
  const d = new Date(c.expiresAt);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (days < 0)  return `⚠️ Expired ${label}`;
  if (days === 0) return `⚠️ Expires today`;
  if (days <= 7) return `⚠️ Expires in ${days}d`;
  return `Expires ${label}`;
}

// ── Create Promo Modal ───────────────────────────────────────────────────────

function CreatePromoModal({
  visible, onClose, onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (c: CompanyPromoCode) => void;
}) {
  const colors = useColors();
  const modal = useMemo(() => getModalStyles(colors), [colors]);

  const [code, setCode]                   = useState('');
  const [description, setDescription]     = useState('');
  const [discountType, setDiscountType]   = useState<PromoDiscountType>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [maxDiscount, setMaxDiscount]     = useState('');
  const [minFare, setMinFare]             = useState('');
  const [maxUses, setMaxUses]             = useState('');
  const [expiresAt, setExpiresAt]         = useState(''); // YYYY-MM-DD
  const [saving, setSaving]               = useState(false);

  const reset = () => {
    setCode(''); setDescription(''); setDiscountType('percent');
    setDiscountValue(''); setMaxDiscount(''); setMinFare('');
    setMaxUses(''); setExpiresAt(''); setSaving(false);
  };

  useEffect(() => { if (visible) reset(); }, [visible]);

  const handleSave = async () => {
    if (!code.trim()) { Alert.alert('Validation', 'Code is required'); return; }
    const dv = Number(discountValue);
    if (!Number.isFinite(dv) || dv <= 0) {
      Alert.alert('Validation', 'Discount value must be a positive number');
      return;
    }
    if (discountType === 'percent' && dv > 100) {
      Alert.alert('Validation', 'Percent discount must be 100 or less');
      return;
    }

    const payload: CompanyPromoPayload = {
      code: code.trim().toUpperCase(),
      discountType,
      discountValue: dv,
    };
    if (description.trim()) payload.description = description.trim();
    if (maxDiscount.trim()) payload.maxDiscountAmount = Number(maxDiscount);
    if (minFare.trim())     payload.minimumFare      = Number(minFare);
    if (maxUses.trim())     payload.maxUses          = Number(maxUses);
    if (expiresAt.trim()) {
      // Accept YYYY-MM-DD and turn into end-of-day ISO
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiresAt.trim());
      if (!m) { Alert.alert('Validation', 'Expiry date must be YYYY-MM-DD'); return; }
      payload.expiresAt = new Date(`${expiresAt.trim()}T23:59:59`).toISOString();
    }

    setSaving(true);
    try {
      const { data } = await companyApi.createPromoCode(payload);
      onCreated(data);
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Could not create promo code';
      Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modal.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <Pressable style={modal.sheet} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={modal.title}>New promo code</Text>

              <Text style={modal.fieldLabel}>Code</Text>
              <TextInput
                style={modal.input} value={code} onChangeText={setCode}
                placeholder="e.g. SUMMER20" autoCapitalize="characters"
                maxLength={50}
              />

              <Text style={modal.fieldLabel}>Description (optional)</Text>
              <TextInput
                style={modal.input} value={description} onChangeText={setDescription}
                placeholder="e.g. Weekend special"
                maxLength={200}
              />

              <Text style={modal.fieldLabel}>Discount type</Text>
              <View style={modal.typeRow}>
                {(['percent', 'fixed'] as PromoDiscountType[]).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[modal.typeBtn, discountType === t && modal.typeBtnActive]}
                    onPress={() => setDiscountType(t)}>
                    <Text style={[modal.typeBtnText, discountType === t && modal.typeBtnTextActive]}>
                      {t === 'percent' ? '% off' : '€ off'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={modal.fieldLabel}>Discount value</Text>
              <TextInput
                style={modal.input} value={discountValue} onChangeText={setDiscountValue}
                placeholder={discountType === 'percent' ? '15' : '5.00'}
                keyboardType="numeric"
              />

              {discountType === 'percent' && (
                <>
                  <Text style={modal.fieldLabel}>Max discount cap (optional)</Text>
                  <TextInput
                    style={modal.input} value={maxDiscount} onChangeText={setMaxDiscount}
                    placeholder="e.g. 5.00"
                    keyboardType="numeric"
                  />
                </>
              )}

              <Text style={modal.fieldLabel}>Minimum fare to qualify (optional)</Text>
              <TextInput
                style={modal.input} value={minFare} onChangeText={setMinFare}
                placeholder="e.g. 3.00"
                keyboardType="numeric"
              />

              <Text style={modal.fieldLabel}>Max uses (optional)</Text>
              <TextInput
                style={modal.input} value={maxUses} onChangeText={setMaxUses}
                placeholder="Leave empty for unlimited"
                keyboardType="numeric"
              />

              <Text style={modal.fieldLabel}>Expires on (YYYY-MM-DD, optional)</Text>
              <TextInput
                style={modal.input} value={expiresAt} onChangeText={setExpiresAt}
                placeholder="e.g. 2026-12-31"
                autoCapitalize="none"
              />

              <View style={modal.btnRow}>
                <TouchableOpacity style={modal.btnCancel} onPress={onClose} disabled={saving}>
                  <Text style={modal.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={modal.btnCreate} onPress={handleSave} disabled={saving}>
                  {saving
                    ? <ActivityIndicator color={colors.textOnPrimary} />
                    : <Text style={modal.btnCreateText}>Create</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Promo Card ───────────────────────────────────────────────────────────────

function PromoCard({
  item, onToggle, onDelete,
}: {
  item: CompanyPromoCode;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string, code: string) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const usageText = item.maxUses != null
    ? `${item.usedCount}/${item.maxUses} used`
    : `${item.usedCount} used`;

  return (
    <View style={[styles.card, !item.isActive && styles.cardInactive]}>
      <View style={styles.cardTop}>
        <View style={styles.codeBadge}>
          <Text style={styles.codeText}>{item.code}</Text>
        </View>
        <Switch
          value={item.isActive}
          onValueChange={v => onToggle(item.id, v)}
          trackColor={{ false: colors.border, true: colors.primary + '66' }}
          thumbColor={item.isActive ? colors.primary : colors.textDisabled}
        />
      </View>
      <Text style={styles.discountLine}>{discountLabel(item)}</Text>
      {item.description ? <Text style={styles.descText}>{item.description}</Text> : null}
      <View style={styles.statsRow}>
        <Text style={styles.statChip}>📊 {usageText}</Text>
        {item.minimumFare != null && <Text style={styles.statChip}>💰 Min €{item.minimumFare}</Text>}
        <Text style={styles.statChip}>🗓 {expiryLabel(item)}</Text>
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.scopeText}>Applies only to your company's drivers</Text>
        <TouchableOpacity onPress={() => onDelete(item.id, item.code)}>
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function CompanyPromoCodesScreen({ visible, onClose }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [codes,      setCodes]      = useState<CompanyPromoCode[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const fetchCodes = useCallback(async () => {
    try {
      const { data } = await companyApi.getPromoCodes();
      setCodes(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchCodes().finally(() => setLoading(false));
  }, [visible, fetchCodes]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCodes();
    setRefreshing(false);
  };

  const handleToggle = useCallback(async (id: string, active: boolean) => {
    setCodes(prev => prev.map(c => c.id === id ? { ...c, isActive: active } : c));
    try {
      await companyApi.updatePromoCode(id, { isActive: active });
    } catch (err: any) {
      setCodes(prev => prev.map(c => c.id === id ? { ...c, isActive: !active } : c));
      const msg = err?.response?.data?.message ?? 'Could not update';
      Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : msg);
    }
  }, []);

  const handleDelete = useCallback((id: string, code: string) => {
    Alert.alert(
      'Delete promo code',
      `Permanently delete "${code}"? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await companyApi.deletePromoCode(id);
              setCodes(prev => prev.filter(c => c.id !== id));
            } catch (err: any) {
              const msg = err?.response?.data?.message ?? 'Could not delete';
              Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : msg);
            }
          },
        },
      ],
    );
  }, []);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.backArrow}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Promo Codes</Text>
          <TouchableOpacity onPress={() => setShowCreate(true)}>
            <Text style={styles.addBtn}>＋ New</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : codes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏷️</Text>
            <Text style={styles.emptyTitle}>No promo codes yet</Text>
            <Text style={styles.emptySub}>
              Create discount codes that only apply when one of your drivers takes the ride.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)}>
              <Text style={styles.emptyBtnText}>Create your first code</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={codes}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <PromoCard item={item} onToggle={handleToggle} onDelete={handleDelete} />
            )}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          />
        )}

        <CreatePromoModal
          visible={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={(c) => setCodes(prev => [c, ...prev])}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Sizes.screenPadding, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  backArrow:  { fontSize: 16, color: c.primary, fontWeight: '600' },
  headerTitle:{ fontSize: 17, fontWeight: '800', color: c.text },
  addBtn:     { fontSize: 15, fontWeight: '700', color: c.primary },

  list: { padding: Sizes.screenPadding, gap: 12 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  emptyIcon:  { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: c.text, marginBottom: 8 },
  emptySub:   { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn:   {
    height: 48, paddingHorizontal: 24, borderRadius: 14,
    backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: c.textOnPrimary },

  card: {
    backgroundColor: c.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: c.border,
  },
  cardInactive: { opacity: 0.55 },
  cardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  codeBadge:    {
    backgroundColor: c.primaryLight ?? (c.primary + '22'),
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
  },
  codeText:     { fontSize: 16, fontWeight: '800', color: c.primary, letterSpacing: 1 },
  discountLine: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 4 },
  descText:     { fontSize: 13, color: c.textSecondary, marginBottom: 10 },
  statsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  statChip:     {
    fontSize: 12, color: c.textSecondary,
    backgroundColor: c.surfaceAlt ?? c.background,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
  },
  cardBottom:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scopeText:    { fontSize: 11, color: c.textDisabled, fontStyle: 'italic', flex: 1 },
  deleteText:   { fontSize: 14, color: c.error, fontWeight: '600' },
}); }

function getModalStyles(c: ColorPalette) { return StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: c.overlay ?? 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  sheet: {
    backgroundColor: c.background, borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 460, maxHeight: '88%',
  },
  title: { fontSize: 18, fontWeight: '800', color: c.text, marginBottom: 8, textAlign: 'center' },
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: c.textSecondary,
    marginTop: 14, marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: c.border,
    paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.surface,
  },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeBtn: {
    flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: c.border,
    backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
  },
  typeBtnActive:     { borderColor: c.primary, backgroundColor: c.primaryLight ?? (c.primary + '22') },
  typeBtnText:       { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  typeBtnTextActive: { color: c.primary },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btnCancel: {
    flex: 1, height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  btnCancelText: { fontSize: 15, fontWeight: '700', color: c.textSecondary },
  btnCreate: {
    flex: 1, height: 50, borderRadius: 12, backgroundColor: c.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  btnCreateText: { fontSize: 15, fontWeight: '700', color: c.textOnPrimary },
}); }
