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
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supportApi, TicketCategory, TicketSummary } from '../../api/support';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { label: string; value: TicketCategory }[] = [
  { label: '🚗 Ride Issue',       value: 'ride_issue'      },
  { label: '💳 Payment',          value: 'payment'         },
  { label: '👤 Account',          value: 'account'         },
  { label: '🚨 Driver Behaviour', value: 'driver_behavior' },
  { label: '🐛 App Bug',          value: 'app_bug'         },
  { label: '❓ Other',            value: 'other'           },
];

const STATUS_COLOR: Record<string, string> = {
  open:        '#F59E0B',
  in_progress: '#3B82F6',
  resolved:    '#10B981',
  closed:      '#9CA3AF',
};

// STATUS_LABEL rendered at runtime with t() inside TicketRow

// ── New ticket modal ──────────────────────────────────────────────────────────

function NewTicketModal({
  visible,
  onClose,
  onCreated,
}: {
  visible:   boolean;
  onClose:   () => void;
  onCreated: (id: string) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [category, setCategory] = useState<TicketCategory>('ride_issue');
  const [subject,  setSubject]  = useState('');
  const [body,     setBody]     = useState('');
  const [loading,  setLoading]  = useState(false);

  const reset = () => { setCategory('ride_issue'); setSubject(''); setBody(''); };

  const submit = async () => {
    if (!subject.trim()) { Alert.alert(t('common.error'), t('shared.support.subjectRequired')); return; }
    if (body.trim().length < 10) { Alert.alert(t('common.error'), t('shared.support.detailsTooShort')); return; }
    setLoading(true);
    try {
      const ticket = await supportApi.createTicket({ category, subject: subject.trim(), body: body.trim() });
      reset();
      onCreated(ticket.id);
    } catch {
      Alert.alert(t('common.error'), t('shared.support.createError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => { reset(); onClose(); }}
              accessibilityRole="button"
              accessibilityLabel="Cancel new ticket">
              <Text style={styles.cancelBtn}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('shared.support.newTicketTitle')}</Text>
            <TouchableOpacity
              onPress={submit}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Submit support ticket"
              accessibilityState={{ disabled: loading }}>
              <Text style={[styles.submitBtn, loading && { opacity: 0.5 }]}>{t('shared.support.submitBtn')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            {/* Category */}
            <Text style={styles.fieldLabel}>{t('shared.support.categoryLabel')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c.value}
                  style={[styles.catChip, category === c.value && styles.catChipActive]}
                  onPress={() => setCategory(c.value)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Category: ${c.value}`}
                  accessibilityState={{ checked: category === c.value }}
                >
                  <Text style={[styles.catChipText, category === c.value && styles.catChipTextActive]}>
                    {c.value === 'ride_issue' ? `🚗 ${t('shared.support.catRideIssue')}`
                      : c.value === 'payment' ? `💳 ${t('shared.support.catPayment')}`
                      : c.value === 'account' ? `👤 ${t('shared.support.catAccount')}`
                      : c.value === 'driver_behavior' ? `🚨 ${t('shared.support.catDriverBehavior')}`
                      : c.value === 'app_bug' ? `🐛 ${t('shared.support.catAppBug')}`
                      : `❓ ${t('shared.support.catOther')}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Subject */}
            <Text style={styles.fieldLabel}>{t('shared.support.subjectLabel')}</Text>
            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              placeholder={t('shared.support.subjectPlaceholder')}
              placeholderTextColor="#AAA"
              maxLength={200}
              accessibilityLabel="Ticket subject"
            />

            {/* Body */}
            <Text style={styles.fieldLabel}>{t('shared.support.detailsLabel')}</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={body}
              onChangeText={setBody}
              placeholder={t('shared.support.detailsPlaceholder')}
              placeholderTextColor="#AAA"
              multiline
              maxLength={3000}
              textAlignVertical="top"
              accessibilityLabel="Describe your issue in detail"
            />
            <Text style={styles.charCount}>{body.length}/3000</Text>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Ticket row ────────────────────────────────────────────────────────────────

function TicketRow({ ticket, onPress }: { ticket: TicketSummary; onPress: () => void }) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const color = STATUS_COLOR[ticket.status] ?? '#9CA3AF';

  const statusLabel = ticket.status === 'open' ? t('shared.support.statusOpen')
    : ticket.status === 'in_progress' ? t('shared.support.statusInProgress')
    : ticket.status === 'resolved' ? t('shared.support.statusResolved')
    : t('shared.support.statusClosed');

  const categoryLabel = ticket.category === 'ride_issue' ? `🚗 ${t('shared.support.catRideIssue')}`
    : ticket.category === 'payment' ? `💳 ${t('shared.support.catPayment')}`
    : ticket.category === 'account' ? `👤 ${t('shared.support.catAccount')}`
    : ticket.category === 'driver_behavior' ? `🚨 ${t('shared.support.catDriverBehavior')}`
    : ticket.category === 'app_bug' ? `🐛 ${t('shared.support.catAppBug')}`
    : `❓ ${t('shared.support.catOther')}`;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${ticket.subject}, status: ${statusLabel}`}>
      <View style={styles.rowTop}>
        <Text style={styles.rowSubject} numberOfLines={1}>{ticket.subject}</Text>
        <View style={[styles.statusBadge, { backgroundColor: color + '22' }]}>
          <Text style={[styles.statusText, { color }]}>{statusLabel}</Text>
        </View>
      </View>
      <View style={styles.rowBottom}>
        <Text style={styles.rowMeta}>{categoryLabel}</Text>
        <Text style={styles.rowMeta}>
          {ticket.messageCount !== 1
            ? t('shared.support.messageCountPlural', { n: ticket.messageCount })
            : t('shared.support.messageCount', { n: ticket.messageCount })} ·{' '}
          {new Date(ticket.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SupportScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();

  const [tickets,    setTickets]    = useState<TicketSummary[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNew,    setShowNew]    = useState(false);
  const [error,      setError]      = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const data = await supportApi.getMyTickets();
      setTickets(data);
    } catch {
      setError(t('shared.support.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreated = (id: string) => {
    setShowNew(false);
    load();
    navigation.navigate('SupportTicket', { ticketId: id });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('shared.support.title')}</Text>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => setShowNew(true)}
          accessibilityRole="button"
          accessibilityLabel="Create new support ticket">
          <Text style={styles.newBtnText}>{t('shared.support.newBtn')}</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}

      <FlatList
        data={tickets}
        keyExtractor={t => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        renderItem={({ item }) => (
          <TicketRow
            ticket={item}
            onPress={() => navigation.navigate('SupportTicket', { ticketId: item.id })}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎫</Text>
            <Text style={styles.emptyText}>{t('shared.support.emptyTitle')}</Text>
            <Text style={styles.emptySubtext}>{t('shared.support.emptyHint')}</Text>
          </View>
        }
        contentContainerStyle={{ flexGrow: 1 }}
      />

      <NewTicketModal
        visible={showNew}
        onClose={() => setShowNew(false)}
        onCreated={handleCreated}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn:   { padding: 4 },
    backArrow: { fontSize: 22, color: c.primary },
    title:     { fontSize: 17, fontWeight: '700', color: c.text },
    newBtn:    { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.primary, borderRadius: 8 },
    newBtnText:{ color: c.white, fontSize: 13, fontWeight: '600' },

    row: { backgroundColor: c.surface, padding: 16 },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    rowSubject: { fontSize: 14, fontWeight: '600', color: c.text, flex: 1, marginRight: 8 },
    statusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
    statusText:  { fontSize: 11, fontWeight: '700' },
    rowBottom:   { flexDirection: 'row', justifyContent: 'space-between' },
    rowMeta:     { fontSize: 12, color: c.textSecondary },

    sep: { height: 1, backgroundColor: c.border },

    empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    emptyIcon:   { fontSize: 48, marginBottom: 12 },
    emptyText:   { fontSize: 16, fontWeight: '600', color: c.text, marginBottom: 6 },
    emptySubtext:{ fontSize: 13, color: c.textSecondary, textAlign: 'center' },

    errorText: { color: c.error, textAlign: 'center', padding: 16 },

    // Modal
    modal:       { flex: 1, backgroundColor: c.background },
    modalHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    modalTitle:  { fontSize: 16, fontWeight: '700', color: c.text },
    cancelBtn:   { fontSize: 15, color: c.textSecondary },
    submitBtn:   { fontSize: 15, fontWeight: '700', color: c.primary },
    modalBody:   { padding: 16 },

    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 8, marginTop: 16 },

    catRow: { flexDirection: 'row', marginBottom: 4 },
    catChip: {
      borderWidth: 1, borderColor: c.border, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, backgroundColor: c.surface,
    },
    catChipActive:     { borderColor: c.primary, backgroundColor: c.primary + '15' },
    catChipText:       { fontSize: 13, color: c.textSecondary },
    catChipTextActive: { color: c.primary, fontWeight: '600' },

    input: {
      backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.text,
    },
    inputMulti: { height: 140, marginBottom: 4 },
    charCount:  { fontSize: 11, color: c.textSecondary, textAlign: 'right' },
  });
}
