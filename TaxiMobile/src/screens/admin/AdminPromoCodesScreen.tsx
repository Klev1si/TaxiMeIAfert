/**
 * AdminPromoCodesScreen
 *
 * Lets the super-admin view, create, toggle and delete promo codes.
 * Calls the backend /admin/promo-codes endpoints.
 */

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
import {
  adminApi,
  type AdminPromoCode,
  type CreatePromoPayload,
  type PromoDiscountType,
} from '../../api/admin';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';

// ── Helpers ────────────────────────────────────────────────────────────────────

function discountLabel(code: AdminPromoCode): string {
  if (code.discountType === 'percent') {
    const cap = code.maxDiscountAmount != null ? ` (max $${code.maxDiscountAmount})` : '';
    return `${code.discountValue}% off${cap}`;
  }
  return `$${code.discountValue} off`;
}

function expiryLabel(code: AdminPromoCode): string {
  if (!code.expiresAt) return 'No expiry';
  const d = new Date(code.expiresAt);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (diffDays < 0)  return `⚠️ Expired ${label}`;
  if (diffDays === 0) return `⚠️ Expires today`;
  if (diffDays <= 7) return `⚠️ Expires in ${diffDays}d`;
  return `Expires ${label}`;
}

// ── Create Promo Modal ─────────────────────────────────────────────────────────

interface CreateModalProps {
  visible:  boolean;
  onClose:  () => void;
  onCreated: (code: AdminPromoCode) => void;
}

function CreatePromoModal({ visible, onClose, onCreated }: CreateModalProps) {
  const colors = useColors();
  const modal = useMemo(() => getModalStyles(colors), [colors]);
  const { t } = useTranslation();

  const [code,          setCode]          = useState('');
  const [description,   setDescription]   = useState('');
  const [discountType,  setDiscountType]  = useState<PromoDiscountType>('flat');
  const [discountValue, setDiscountValue] = useState('');
  const [maxDiscount,   setMaxDiscount]   = useState('');
  const [minFare,       setMinFare]       = useState('');
  const [maxUses,       setMaxUses]       = useState('');
  const [expiresAt,     setExpiresAt]     = useState('');  // YYYY-MM-DD
  const [saving,        setSaving]        = useState(false);

  useEffect(() => {
    if (visible) {
      setCode(''); setDescription(''); setDiscountType('flat');
      setDiscountValue(''); setMaxDiscount(''); setMinFare('');
      setMaxUses(''); setExpiresAt('');
    }
  }, [visible]);

  const handleCreate = async () => {
    const trimCode = code.trim().toUpperCase();
    if (!trimCode) { Alert.alert(t('common.validation'), t('admin.promoCodes.codeRequired')); return; }
    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) {
      Alert.alert(t('common.validation'), t('admin.promoCodes.discountInvalid')); return;
    }
    if (discountType === 'percent' && val > 100) {
      Alert.alert(t('common.validation'), t('admin.promoCodes.discountPercentMax')); return;
    }
    if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
      Alert.alert(t('common.validation'), t('admin.promoCodes.expiryInvalid')); return;
    }

    const payload: CreatePromoPayload = {
      code:              trimCode,
      description:       description.trim() || undefined,
      discountType,
      discountValue:     val,
      maxDiscountAmount: maxDiscount   ? parseFloat(maxDiscount)  : undefined,
      minimumFare:       minFare       ? parseFloat(minFare)      : undefined,
      maxUses:           maxUses       ? parseInt(maxUses, 10)    : undefined,
      expiresAt:         expiresAt     ? `${expiresAt}T23:59:59Z` : undefined,
    };

    setSaving(true);
    try {
      const { data } = await adminApi.createPromoCode(payload);
      onCreated(data);
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('admin.promoCodes.saveError');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={modal.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={modal.sheet} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              <Text style={modal.title}>{t('admin.promoCodes.newCodeTitle')}</Text>

              {/* Code */}
              <Text style={modal.label}>{t('admin.promoCodes.codeFieldLabel')}</Text>
              <TextInput
                style={modal.input}
                value={code}
                onChangeText={v => setCode(v.toUpperCase())}
                placeholder="e.g. SAVE20"
                placeholderTextColor={colors.textDisabled}
                autoCapitalize="characters"
                maxLength={50}
                accessibilityLabel="Promo code"
              />

              {/* Description */}
              <Text style={modal.label}>{t('admin.promoCodes.descriptionLabel')}</Text>
              <TextInput
                style={modal.input}
                value={description}
                onChangeText={setDescription}
                placeholder={t('admin.promoCodes.descriptionPlaceholder')}
                placeholderTextColor={colors.textDisabled}
                maxLength={200}
                accessibilityLabel="Description (optional)"
              />

              {/* Discount type toggle */}
              <Text style={modal.label}>{t('admin.promoCodes.discountTypeLabel')}</Text>
              <View style={modal.typeRow}>
                {(['flat', 'percent'] as PromoDiscountType[]).map(dt => (
                  <TouchableOpacity
                    key={dt}
                    style={[modal.typeBtn, discountType === dt && modal.typeBtnActive]}
                    onPress={() => setDiscountType(dt)}
                    accessibilityRole="radio"
                    accessibilityLabel={dt === 'flat' ? 'Flat dollar amount' : 'Percentage'}
                    accessibilityState={{ checked: discountType === dt }}>
                    <Text style={[modal.typeBtnText, discountType === dt && modal.typeBtnTextActive]}>
                      {dt === 'flat' ? t('admin.promoCodes.typeFlat') : t('admin.promoCodes.typePercent')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Discount value */}
              <Text style={modal.label}>{t('admin.promoCodes.discountValueLabel')} ({discountType === 'flat' ? '$' : '%'})</Text>
              <TextInput
                style={modal.input}
                value={discountValue}
                onChangeText={setDiscountValue}
                placeholder={discountType === 'flat' ? 'e.g. 5.00' : 'e.g. 20'}
                placeholderTextColor={colors.textDisabled}
                keyboardType="decimal-pad"
                accessibilityLabel={discountType === 'flat' ? 'Discount value in dollars' : 'Discount value as percentage'}
              />

              {/* Max discount (percent only) */}
              {discountType === 'percent' && (
                <>
                  <Text style={modal.label}>{t('admin.promoCodes.maxDiscountLabel')}</Text>
                  <TextInput
                    style={modal.input}
                    value={maxDiscount}
                    onChangeText={setMaxDiscount}
                    placeholder="e.g. 10.00"
                    placeholderTextColor={colors.textDisabled}
                    keyboardType="decimal-pad"
                    accessibilityLabel="Maximum discount amount in dollars (optional)"
                  />
                </>
              )}

              {/* Min fare */}
              <Text style={modal.label}>{t('admin.promoCodes.minFareFieldLabel')}</Text>
              <TextInput
                style={modal.input}
                value={minFare}
                onChangeText={setMinFare}
                placeholder="e.g. 5.00"
                placeholderTextColor={colors.textDisabled}
                keyboardType="decimal-pad"
                accessibilityLabel="Minimum fare in dollars (optional)"
              />

              {/* Max uses */}
              <Text style={modal.label}>{t('admin.promoCodes.maxUsesFieldLabel')}</Text>
              <TextInput
                style={modal.input}
                value={maxUses}
                onChangeText={setMaxUses}
                placeholder="e.g. 100"
                placeholderTextColor={colors.textDisabled}
                keyboardType="number-pad"
                accessibilityLabel="Maximum number of uses (optional, blank for unlimited)"
              />

              {/* Expiry */}
              <Text style={modal.label}>{t('admin.promoCodes.expiryFieldLabel')}</Text>
              <TextInput
                style={modal.input}
                value={expiresAt}
                onChangeText={setExpiresAt}
                placeholder="e.g. 2026-12-31"
                placeholderTextColor={colors.textDisabled}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                accessibilityLabel="Expiry date in YYYY-MM-DD format (optional)"
              />

              {/* Buttons */}
              <View style={modal.btnRow}>
                <TouchableOpacity
                  style={modal.btnCancel}
                  onPress={onClose}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                  accessibilityState={{ disabled: saving }}>
                  <Text style={modal.btnCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[modal.btnCreate, saving && { opacity: 0.6 }]}
                  onPress={handleCreate}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Create promo code"
                  accessibilityState={{ disabled: saving }}>
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={modal.btnCreateText}>{t('common.create')}</Text>}
                </TouchableOpacity>
              </View>

            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function getModalStyles(c: ColorPalette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      maxHeight: '90%',
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: c.text,
      marginBottom: 20,
      textAlign: 'center',
    },
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 6,
      marginTop: 14,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      height: 46,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.border,
      paddingHorizontal: 14,
      fontSize: 15,
      color: c.text,
      backgroundColor: c.surface,
    },
    typeRow: { flexDirection: 'row', gap: 10 },
    typeBtn: {
      flex: 1, height: 44, borderRadius: 12,
      borderWidth: 1.5, borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center', justifyContent: 'center',
    },
    typeBtnActive:     { borderColor: c.primary, backgroundColor: c.primaryLight },
    typeBtnText:       { fontSize: 14, fontWeight: '600', color: c.textSecondary },
    typeBtnTextActive: { color: c.primary },
    btnRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 24,
      marginBottom: 8,
    },
    btnCancel: {
      flex: 1, height: 50, borderRadius: 12,
      borderWidth: 1.5, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
    },
    btnCancelText: { fontSize: 15, fontWeight: '700', color: c.textSecondary },
    btnCreate: {
      flex: 1, height: 50, borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    btnCreateText: { fontSize: 15, fontWeight: '700', color: c.textOnPrimary },
  });
}

// ── Promo Card ─────────────────────────────────────────────────────────────────

function PromoCard({
  item,
  onToggle,
  onDelete,
}: {
  item:     AdminPromoCode;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string, code: string) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const usageText = item.maxUses != null
    ? `${item.usedCount}/${item.maxUses} used`
    : `${item.usedCount} used`;

  return (
    <View style={[styles.card, !item.isActive && styles.cardInactive]}>
      {/* Row 1: code badge + toggle */}
      <View style={styles.cardTop}>
        <View style={styles.codeBadge}>
          <Text style={styles.codeText}>{item.code}</Text>
        </View>
        <Switch
          value={item.isActive}
          onValueChange={v => onToggle(item.id, v)}
          trackColor={{ false: colors.border, true: colors.primary + '66' }}
          thumbColor={item.isActive ? colors.primary : colors.textDisabled}
          accessibilityRole="switch"
          accessibilityLabel={`${item.code} ${item.isActive ? 'active' : 'inactive'}`}
        />
      </View>

      {/* Row 2: discount + type */}
      <Text style={styles.discountLine}>{discountLabel(item)}</Text>

      {/* Row 3: description */}
      {item.description && (
        <Text style={styles.descText}>{item.description}</Text>
      )}

      {/* Row 4: stats row */}
      <View style={styles.statsRow}>
        <Text style={styles.statChip}>
          📊 {usageText}
        </Text>
        {item.minimumFare != null && (
          <Text style={styles.statChip}>
            💰 Min ${item.minimumFare}
          </Text>
        )}
        <Text style={[
          styles.statChip,
          !item.isValid && styles.statChipWarn,
        ]}>
          🗓 {expiryLabel(item)}
        </Text>
      </View>

      {/* Row 5: validity badge + delete */}
      <View style={styles.cardBottom}>
        <View style={[styles.validBadge, item.isValid ? styles.validBadgeOk : styles.validBadgeBad]}>
          <Text style={[styles.validText, item.isValid ? styles.validTextOk : styles.validTextBad]}>
            {item.isValid ? '✓ Valid' : '✕ Invalid'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => onDelete(item.id, item.code)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Delete promo code ${item.code}`}>
          <Text style={styles.deleteText}>{t('admin.promoCodes.deleteBtn')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function AdminPromoCodesScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [codes,      setCodes]      = useState<AdminPromoCode[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const PAGE_SIZE = 20;

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchCodes = useCallback(async (pageNum: number, replace = false) => {
    try {
      const { data } = await adminApi.getPromoCodes(pageNum, PAGE_SIZE);
      setCodes(prev => replace ? data.codes : [...prev, ...data.codes]);
      setTotal(data.total);
      setHasMore(data.codes.length === PAGE_SIZE);
      setPage(pageNum);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchCodes(1, true).finally(() => setLoading(false));
  }, [fetchCodes]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCodes(1, true);
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await fetchCodes(page + 1);
    setLoadingMore(false);
  };

  // ── Toggle active ──────────────────────────────────────────────────────────
  const handleToggle = useCallback(async (id: string, active: boolean) => {
    // Optimistic update
    setCodes(prev => prev.map(c => c.id === id ? { ...c, isActive: active, isValid: active } : c));
    try {
      await adminApi.updatePromoCode(id, { isActive: active });
    } catch (err: any) {
      // Roll back on failure
      setCodes(prev => prev.map(c => c.id === id ? { ...c, isActive: !active } : c));
      const msg = err?.response?.data?.message ?? t('admin.promoCodes.saveError');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    }
  }, []);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = useCallback((id: string, code: string) => {
    Alert.alert(
      t('admin.promoCodes.deleteTitle'),
      t('admin.promoCodes.deleteMsg', { code }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await adminApi.deletePromoCode(id);
              setCodes(prev => prev.filter(c => c.id !== id));
              setTotal(prev => prev - 1);
            } catch (err: any) {
              const msg = err?.response?.data?.message ?? t('admin.promoCodes.deleteError');
              Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
            }
          },
        },
      ],
    );
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t('admin.promoCodes.title')}</Text>
          <Text style={styles.subtitle}>{total} total · {codes.filter(c => c.isValid).length} valid</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowCreate(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Create new promo code">
          <Text style={styles.addBtnText}>{t('admin.promoCodes.addBtn')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={codes}
        keyExtractor={c => c.id}
        contentContainerStyle={codes.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏷️</Text>
            <Text style={styles.emptyTitle}>{t('admin.promoCodes.emptyMsg')}</Text>
          </View>
        }
        ListFooterComponent={
          loadingMore
            ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
            : null
        }
        renderItem={({ item }) => (
          <PromoCard item={item} onToggle={handleToggle} onDelete={handleDelete} />
        )}
      />

      <CreatePromoModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(code) => {
          setCodes(prev => [code, ...prev]);
          setTotal(prev => prev + 1);
        }}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:     { flex: 1, backgroundColor: c.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Sizes.screenPadding,
      paddingTop: 20,
      paddingBottom: 12,
    },
    title:    { fontSize: 22, fontWeight: '800', color: c.text },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    addBtn: {
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    addBtnText: { fontSize: 14, fontWeight: '700', color: c.textOnPrimary },

    listContent:    { padding: Sizes.screenPadding, paddingTop: 4 },
    emptyContainer: { flex: 1 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 72 },
    emptyIcon:  { fontSize: 56, marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8 },
    emptySub:   { fontSize: 14, color: c.textSecondary, textAlign: 'center', paddingHorizontal: 32 },

    // Promo card
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardInactive: { opacity: 0.6 },

    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    codeBadge: {
      backgroundColor: c.primary + '18',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    codeText:     { fontSize: 16, fontWeight: '800', color: c.primary, letterSpacing: 1 },
    discountLine: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 4 },
    descText:     { fontSize: 13, color: c.textSecondary, marginBottom: 8 },

    statsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10,
      marginTop: 4,
    },
    statChip: {
      fontSize: 12,
      color: c.textSecondary,
      backgroundColor: c.background,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: c.border,
    },
    statChipWarn: { color: c.warning, borderColor: (c.warning ?? '#f59e0b') + '55' },

    cardBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 10,
      marginTop: 2,
    },
    validBadge:    { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
    validBadgeOk:  { backgroundColor: c.successLight ?? '#dcfce7' },
    validBadgeBad: { backgroundColor: c.errorLight   ?? '#fee2e2' },
    validText:     { fontSize: 12, fontWeight: '700' },
    validTextOk:   { color: c.success },
    validTextBad:  { color: c.error },
    deleteText:    { fontSize: 13, fontWeight: '600', color: c.error },
  });
}
