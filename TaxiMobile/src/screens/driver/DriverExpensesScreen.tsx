import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { toAlertString } from '../../utils/errorMessage';
import {
  expensesApi,
  EXPENSE_TYPE_LABELS,
  type Expense,
  type ExpenseListResponse,
  type ExpenseType,
} from '../../api/expenses';
import { useTranslation } from '../../i18n';

// ── Constants ──────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { label: string; value: string }[] = [
  { label: 'Today',     value: 'today' },
  { label: 'This Week', value: 'week'  },
  { label: 'This Month', value: 'month' },
  { label: 'All Time',  value: 'all'   },
];

const TYPE_OPTIONS: { label: string; value: ExpenseType | 'all' }[] = [
  { label: 'All Types',    value: 'all'         },
  { label: '⛽ Fuel',       value: 'fuel'        },
  { label: '🅿️  Parking',   value: 'parking'     },
  { label: '🔧 Maintenance',value: 'maintenance' },
  { label: '🛣️  Toll',      value: 'toll'        },
  { label: '📦 Other',      value: 'other'       },
];

// Today's date as 'YYYY-MM-DD'
const todayStr = () => new Date().toISOString().slice(0, 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(amount: string | number): string {
  return `$${Number(amount).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TotalsCard({ data }: { data: ExpenseListResponse }) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const hasBreakdown = Object.keys(data.totals).length > 1;
  return (
    <View style={styles.totalsCard}>
      <Text style={styles.totalsTitle}>{t('driver.expenses.totalLabel')}</Text>
      <Text style={styles.totalsAmount}>{formatAmount(data.grandTotal)}</Text>
      {hasBreakdown && (
        <View style={styles.totalsBreakdown}>
          {Object.entries(data.totals).map(([type, amt]) => (
            <View key={type} style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                {EXPENSE_TYPE_LABELS[type as ExpenseType] ?? type}
              </Text>
              <Text style={styles.totalsValue}>{formatAmount(amt)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ExpenseCard({
  expense,
  onDelete,
}: {
  expense: Expense;
  onDelete: (id: string) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const handleDelete = () => {
    Alert.alert(
      t('driver.expenses.deleteTitle'),
      t('driver.expenses.deleteMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => onDelete(expense.id) },
      ],
    );
  };

  return (
    <View style={styles.expenseCard}>
      <View style={styles.expenseCardLeft}>
        <Text style={styles.expenseType}>
          {EXPENSE_TYPE_LABELS[expense.type] ?? expense.type}
        </Text>
        <Text style={styles.expenseDate}>{formatDate(expense.expenseDate)}</Text>
        {expense.description ? (
          <Text style={styles.expenseDesc} numberOfLines={2}>{expense.description}</Text>
        ) : null}
      </View>
      <View style={styles.expenseCardRight}>
        <Text style={styles.expenseAmount}>{formatAmount(expense.amount)}</Text>
        <TouchableOpacity
          onPress={handleDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${EXPENSE_TYPE_LABELS[expense.type] ?? expense.type} expense`}>
          <Text style={styles.deleteBtn}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Add Expense Modal ──────────────────────────────────────────────────────────

interface AddExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function AddExpenseModal({ visible, onClose, onSaved }: AddExpenseModalProps) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [type, setType]           = useState<ExpenseType>('fuel');
  const [amount, setAmount]       = useState('');
  const [description, setDesc]    = useState('');
  const [expenseDate, setDate]    = useState(todayStr());
  const [saving, setSaving]       = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);

  // Reset form when opened
  useEffect(() => {
    if (visible) {
      setType('fuel');
      setAmount('');
      setDesc('');
      setDate(todayStr());
    }
  }, [visible]);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert(t('driver.expenses.invalidAmount'), 'Please enter a valid amount greater than 0.');
      return;
    }
    if (!expenseDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert(t('driver.expenses.invalidDate'), 'Use YYYY-MM-DD format.');
      return;
    }

    setSaving(true);
    try {
      await expensesApi.create({
        type,
        amount: amt,
        description: description.trim() || undefined,
        expenseDate,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, 'Could not save expense.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel">
            <Text style={styles.modalCancel}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{t('driver.expenses.addExpenseTitle')}</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save expense"
            accessibilityState={{ disabled: saving }}>
            {saving
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={styles.modalSave}>{t('common.save')}</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
          {/* Type picker trigger */}
          <Text style={styles.fieldLabel}>{t('driver.expenses.typeLabel')}</Text>
          <TouchableOpacity
            style={styles.typeSelector}
            onPress={() => setShowTypePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Expense type: ${EXPENSE_TYPE_LABELS[type]}. Tap to change`}>
            <Text style={styles.typeSelectorText}>
              {EXPENSE_TYPE_LABELS[type]}
            </Text>
            <Text style={styles.typeSelectorChevron}>›</Text>
          </TouchableOpacity>

          {/* Inline type list (shown when picker open) */}
          {showTypePicker && (
            <View style={styles.typeList}>
              {(TYPE_OPTIONS.filter(o => o.value !== 'all') as { label: string; value: ExpenseType }[]).map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.typeOption, type === opt.value && styles.typeOptionSelected]}
                  onPress={() => { setType(opt.value); setShowTypePicker(false); }}
                  accessibilityRole="radio"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ checked: type === opt.value }}>
                  <Text style={[
                    styles.typeOptionText,
                    type === opt.value && styles.typeOptionTextSelected,
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Amount */}
          <Text style={styles.fieldLabel}>{t('driver.expenses.amountLabel')}</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Expense amount in dollars"
          />

          {/* Date */}
          <Text style={styles.fieldLabel}>{t('driver.expenses.dateLabel')}</Text>
          <TextInput
            style={styles.input}
            value={expenseDate}
            onChangeText={setDate}
            placeholder="2025-01-15"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Expense date in YYYY-MM-DD format"
          />

          {/* Description */}
          <Text style={styles.fieldLabel}>{t('driver.expenses.descriptionLabel')}</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={description}
            onChangeText={setDesc}
            placeholder="e.g. Fill-up at Shell station"
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={3}
            accessibilityLabel="Expense description, optional"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function DriverExpensesScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [data, setData]               = useState<ExpenseListResponse | null>(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [period, setPeriod]           = useState('month');
  const [typeFilter, setTypeFilter]   = useState<ExpenseType | 'all'>('all');
  const [showModal, setShowModal]     = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await expensesApi.list(
        period,
        typeFilter !== 'all' ? typeFilter : undefined,
      );
      setData(res.data);
    } catch {
      Alert.alert(t('common.error'), t('driver.expenses.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    try {
      await expensesApi.remove(id);
      setData(prev =>
        prev
          ? {
              ...prev,
              expenses: prev.expenses.filter(e => e.id !== id),
              // Recalc totals optimistically
              grandTotal: prev.expenses
                .filter(e => e.id !== id)
                .reduce((sum, e) => sum + Number(e.amount), 0),
            }
          : prev,
      );
    } catch {
      Alert.alert(t('common.error'), t('driver.expenses.deleteError'));
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('driver.expenses.title')}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Add new expense">
          <Text style={styles.addBtnText}>{t('driver.expenses.addBtn')}</Text>
        </TouchableOpacity>
      </View>

      {/* Period selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pillRow}
        contentContainerStyle={styles.pillRowContent}>
        {PERIOD_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.pill, period === opt.value && styles.pillActive]}
            onPress={() => setPeriod(opt.value)}
            accessibilityRole="radio"
            accessibilityLabel={`Period: ${opt.label}`}
            accessibilityState={{ checked: period === opt.value }}>
            <Text style={[styles.pillText, period === opt.value && styles.pillTextActive]}>
              {opt.value === 'today' ? t('driver.expenses.periodToday') : opt.value === 'week' ? t('driver.expenses.periodWeek') : opt.value === 'month' ? t('driver.expenses.periodMonth') : t('driver.expenses.periodAll')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Type filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pillRow}
        contentContainerStyle={styles.pillRowContent}>
        {TYPE_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.pill, typeFilter === opt.value && styles.pillActive]}
            onPress={() => setTypeFilter(opt.value as ExpenseType | 'all')}
            accessibilityRole="radio"
            accessibilityLabel={`Filter: ${opt.label}`}
            accessibilityState={{ checked: typeFilter === opt.value }}>
            <Text style={[styles.pillText, typeFilter === opt.value && styles.pillTextActive]}>
              {opt.value === 'all' ? t('driver.expenses.typeAll') : opt.value === 'fuel' ? `⛽ ${t('driver.expenses.typeFuel')}` : opt.value === 'parking' ? `🅿️  ${t('driver.expenses.typeParking')}` : opt.value === 'maintenance' ? `🔧 ${t('driver.expenses.typeMaintenance')}` : opt.value === 'toll' ? `🛣️  ${t('driver.expenses.typeToll')}` : `📦 ${t('driver.expenses.typeOther')}`}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
          }>
          {/* Totals card */}
          {data && <TotalsCard data={data} />}

          {/* Expense list */}
          {data?.expenses.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>{t('driver.expenses.emptyTitle')}</Text>
              <Text style={styles.emptyHint}>
                {t('driver.expenses.emptyHint')}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.listTitle}>
                {data?.expenses.length ?? 0} record{data?.expenses.length !== 1 ? 's' : ''}
              </Text>
              {data?.expenses.map(expense => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  onDelete={handleDelete}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* Add modal */}
      <AddExpenseModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSaved={() => load()}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: c.white,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: c.text,
  },
  addBtn: {
    backgroundColor: c.primary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  addBtnText: {
    color: c.white,
    fontWeight: '700',
    fontSize: 14,
  },

  // Filter pills
  pillRow: {
    maxHeight: 48,
    backgroundColor: c.white,
  },
  pillRowContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  pill: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: c.white,
  },
  pillActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  pillText: {
    fontSize: 13,
    color: c.textSecondary,
  },
  pillTextActive: {
    color: c.white,
    fontWeight: '600',
  },

  // Loader
  loader: {
    marginTop: 60,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },

  // Totals card
  totalsCard: {
    backgroundColor: c.primary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  totalsTitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 4,
  },
  totalsAmount: {
    color: c.white,
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 12,
  },
  totalsBreakdown: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
    paddingTop: 10,
    gap: 6,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalsLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
  },
  totalsValue: {
    color: c.white,
    fontSize: 13,
    fontWeight: '600',
  },

  // Expense card
  listTitle: {
    fontSize: 13,
    color: c.textSecondary,
    marginBottom: 8,
  },
  expenseCard: {
    backgroundColor: c.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  expenseCardLeft: { flex: 1, marginRight: 12 },
  expenseType: {
    fontSize: 15,
    fontWeight: '600',
    color: c.text,
    marginBottom: 2,
  },
  expenseDate: {
    fontSize: 12,
    color: c.textSecondary,
    marginBottom: 4,
  },
  expenseDesc: {
    fontSize: 13,
    color: c.textSecondary,
  },
  expenseCardRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
  },
  deleteBtn: {
    fontSize: 16,
    color: c.error ?? '#ef4444',
    fontWeight: '700',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: c.text,
    marginBottom: 6,
  },
  emptyHint: {
    fontSize: 14,
    color: c.textSecondary,
    textAlign: 'center',
  },

  // Add Expense Modal
  modalContainer: {
    flex: 1,
    backgroundColor: c.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: c.white,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: c.text,
  },
  modalCancel: {
    fontSize: 16,
    color: c.textSecondary,
  },
  modalSave: {
    fontSize: 16,
    fontWeight: '700',
    color: c.primary,
  },
  modalBody: {
    flex: 1,
    padding: 16,
  },

  // Form fields
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textSecondary,
    marginBottom: 6,
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: c.text,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Type selector
  typeSelector: {
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeSelectorText: {
    fontSize: 15,
    color: c.text,
  },
  typeSelectorChevron: {
    fontSize: 20,
    color: c.textSecondary,
    lineHeight: 22,
  },
  typeList: {
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    marginTop: 4,
    overflow: 'hidden',
  },
  typeOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  typeOptionSelected: {
    backgroundColor: c.primary + '18',
  },
  typeOptionText: {
    fontSize: 15,
    color: c.text,
  },
  typeOptionTextSelected: {
    color: c.primary,
    fontWeight: '700',
  },
  });
}
