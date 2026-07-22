import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import {
  supportApi,
  type AdminTicketSummary,
  type AdminTicketDetail,
  type SupportMessage,
  type TicketStatus,
  type TicketPriority,
} from '../../api/support';
import { t as tr, useTranslation } from '../../i18n';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Label maps ────────────────────────────────────────────────────────────────
// Status/priority labels are translated at the call site via t('admin.support.*').
// The label-map constants below are kept only for accessibility fallbacks where
// the t() helper is awkward to thread in (e.g. accessibilityLabel composition).

type TranslateFn = (k: string) => string;
function statusLabel(s: TicketStatus, t: TranslateFn): string {
  return t(`admin.support.status_${s}`);
}
function priorityLabel(p: TicketPriority, t: TranslateFn): string {
  return t(`admin.support.priority_${p}`);
}

const STATUS_COLOR: Record<TicketStatus, string> = {
  open:        '#f59e0b',
  in_progress: '#3b82f6',
  resolved:    '#16a34a',
  closed:      '#6b7280',
};

const PRIORITY_COLOR: Record<TicketPriority, string> = {
  low:    '#6b7280',
  normal: '#3b82f6',
  high:   '#f59e0b',
  urgent: '#ef4444',
};

const CATEGORY_LABEL: Record<string, string> = {
  ride_issue:      'Ride Issue',
  payment:         'Payment',
  account:         'Account',
  driver_behavior: 'Driver',
  app_bug:         'App Bug',
  other:           'Other',
};

// ── Status filter pills ───────────────────────────────────────────────────────

type StatusFilter = TicketStatus | 'all';

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All',         value: 'all'        },
  { label: 'Open',        value: 'open'       },
  { label: 'In Progress', value: 'in_progress'},
  { label: 'Resolved',    value: 'resolved'   },
  { label: 'Closed',      value: 'closed'     },
];

// ── Ticket Card ───────────────────────────────────────────────────────────────

function TicketCard({
  ticket,
  onPress,
}: {
  ticket: AdminTicketSummary;
  onPress: () => void;
}) {
  const colors = useColors();
  const card = useMemo(() => getCardStyles(colors), [colors]);
  const { t } = useTranslation();
  const statusColor   = STATUS_COLOR[ticket.status];
  const priorityColor = PRIORITY_COLOR[ticket.priority];

  return (
    <TouchableOpacity
      style={card.wrap}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${ticket.subject}, ${statusLabel(ticket.status, t)}, ${priorityLabel(ticket.priority, t)} priority, ${ticket.messageCount} messages`}>
      {/* Top row: category + role + time */}
      <View style={card.topRow}>
        <View style={[card.badge, { backgroundColor: statusColor + '22' }]}>
          <Text style={[card.badgeText, { color: statusColor }]}>
            {statusLabel(ticket.status, t)}
          </Text>
        </View>
        {ticket.priority !== 'normal' && (
          <View style={[card.badge, { backgroundColor: priorityColor + '22', marginLeft: 6 }]}>
            <Text style={[card.badgeText, { color: priorityColor }]}>
              {priorityLabel(ticket.priority, t)}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Text style={card.time}>{timeAgo(ticket.updatedAt)}</Text>
      </View>

      {/* Subject */}
      <Text style={card.subject} numberOfLines={2}>{ticket.subject}</Text>

      {/* Bottom row: role tag + category + message count */}
      <View style={card.bottomRow}>
        <Text style={card.roleTag}>
          {ticket.userRole === 'driver' ? '🚗 Driver' : '👤 Passenger'}
        </Text>
        <Text style={card.category}>· {CATEGORY_LABEL[ticket.category] ?? ticket.category}</Text>
        <View style={{ flex: 1 }} />
        <Text style={card.msgCount}>💬 {ticket.messageCount}</Text>
      </View>
    </TouchableOpacity>
  );
}

function getCardStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.surface, borderRadius: 14,
      padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: c.border,
    },
    topRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    badge:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
    time:      { fontSize: 11, color: c.textSecondary },
    subject:   { fontSize: 14, fontWeight: '600', color: c.text, marginBottom: 8, lineHeight: 19 },
    bottomRow: { flexDirection: 'row', alignItems: 'center' },
    roleTag:   { fontSize: 12, color: c.textSecondary },
    category:  { fontSize: 12, color: c.textSecondary, marginLeft: 4 },
    msgCount:  { fontSize: 12, color: c.textSecondary },
  });
}

// ── Ticket Detail Modal ───────────────────────────────────────────────────────

function TicketDetailModal({
  ticketId,
  visible,
  onClose,
  onTicketUpdated,
}: {
  ticketId:        string | null;
  visible:         boolean;
  onClose:         () => void;
  onTicketUpdated: (t: AdminTicketSummary) => void;
}) {
  const colors = useColors();
  const detail = useMemo(() => getDetailStyles(colors), [colors]);
  const bubble = useMemo(() => getBubbleStyles(colors), [colors]);
  const { t } = useTranslation();

  const insets                      = useSafeAreaInsets();
  const [ticket, setTicket]         = useState<AdminTicketDetail | null>(null);
  const [loading, setLoading]       = useState(false);
  const [reply, setReply]           = useState('');
  const [sending, setSending]       = useState(false);
  const [updating, setUpdating]     = useState(false);
  const scrollRef                   = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible && ticketId) {
      setLoading(true);
      setTicket(null);
      supportApi.adminGetTicket(ticketId)
        .then(res => setTicket(res.data))
        .catch(() => Alert.alert(t('common.error'), t('admin.support.loadError')))
        .finally(() => setLoading(false));
    }
  }, [visible, ticketId]);

  const handleSend = async () => {
    if (!ticket || !reply.trim()) return;
    setSending(true);
    try {
      const msg = await supportApi.adminAddMessage(ticket.id, reply.trim());
      const newMsg: SupportMessage = msg.data as unknown as SupportMessage;
      setTicket(prev => prev
        ? {
            ...prev,
            messages:     [...prev.messages, newMsg],
            messageCount: prev.messageCount + 1,
            status: prev.status === 'open' ? 'in_progress' : prev.status,
          }
        : prev);
      setReply('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert(t('common.error'), t('admin.support.replyError'));
    } finally {
      setSending(false);
    }
  };

  const handleUpdateStatus = async (status: TicketStatus) => {
    if (!ticket) return;
    setUpdating(true);
    try {
      const res = await supportApi.adminUpdateTicket(ticket.id, { status });
      setTicket(res.data);
      onTicketUpdated({ ...ticket, status });
    } catch {
      Alert.alert(t('common.error'), t('admin.support.statusError'));
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdatePriority = async (priority: TicketPriority) => {
    if (!ticket) return;
    setUpdating(true);
    try {
      const res = await supportApi.adminUpdateTicket(ticket.id, { priority });
      setTicket(res.data);
      onTicketUpdated({ ...ticket, priority });
    } catch {
      Alert.alert(t('common.error'), t('admin.support.priorityError'));
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={detail.safe}>
        {/* Header */}
        <View style={detail.header}>
          <TouchableOpacity
            style={detail.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close ticket">
            <Text style={detail.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={detail.headerTitle} numberOfLines={1}>
            {ticket ? ticket.subject : t('common.loading')}
          </Text>
        </View>

        {loading || !ticket ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* Meta bar: status + priority */}
            <View style={detail.metaBar}>
              <View style={detail.metaGroup}>
                <Text style={detail.metaLabel}>{t('admin.support.statusLabel')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={detail.chipScroll}>
                  {(['open', 'in_progress', 'resolved', 'closed'] as TicketStatus[]).map(s => {
                    const label = statusLabel(s, t);
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[
                          detail.chip,
                          ticket.status === s && { backgroundColor: STATUS_COLOR[s], borderColor: STATUS_COLOR[s] },
                        ]}
                        onPress={() => ticket.status !== s && handleUpdateStatus(s)}
                        disabled={updating}
                        accessibilityRole="radio"
                        accessibilityLabel={`Status: ${label}`}
                        accessibilityState={{ checked: ticket.status === s, disabled: updating }}>
                        <Text style={[
                          detail.chipText,
                          ticket.status === s && { color: colors.white, fontWeight: '700' },
                        ]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={[detail.metaGroup, { marginTop: 8 }]}>
                <Text style={detail.metaLabel}>{t('admin.support.priorityLabel')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={detail.chipScroll}>
                  {(['low', 'normal', 'high', 'urgent'] as TicketPriority[]).map(p => {
                    const label = priorityLabel(p, t);
                    return (
                    <TouchableOpacity
                      key={p}
                      style={[
                        detail.chip,
                        ticket.priority === p && { backgroundColor: PRIORITY_COLOR[p], borderColor: PRIORITY_COLOR[p] },
                      ]}
                      onPress={() => ticket.priority !== p && handleUpdatePriority(p)}
                      disabled={updating}
                      accessibilityRole="radio"
                      accessibilityLabel={`Priority: ${label}`}
                      accessibilityState={{ checked: ticket.priority === p, disabled: updating }}>
                      <Text style={[
                        detail.chipText,
                        ticket.priority === p && { color: colors.white, fontWeight: '700' },
                      ]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Ticket meta info */}
              <View style={detail.infoRow}>
                <Text style={detail.infoText}>
                  {ticket.userRole === 'driver' ? '🚗 Driver' : '👤 Passenger'}
                  {' · '}{CATEGORY_LABEL[ticket.category] ?? ticket.category}
                  {' · '}Opened {formatDate(ticket.createdAt)}
                </Text>
              </View>
            </View>

            {/* Message thread */}
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={insets.top + 60}>
              <ScrollView
                ref={scrollRef}
                style={detail.thread}
                contentContainerStyle={detail.threadContent}
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
                {ticket.messages.map(msg => (
                  <MessageBubble key={msg.id} msg={msg} bubble={bubble} colors={colors} />
                ))}
              </ScrollView>

              {/* Reply input */}
              {ticket.status !== 'closed' ? (
                <View style={[detail.replyRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                  <TextInput
                    style={detail.replyInput}
                    value={reply}
                    onChangeText={setReply}
                    placeholder={t('admin.support.replyPlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    maxLength={3000}
                    accessibilityLabel="Type a reply"
                  />
                  <TouchableOpacity
                    style={[detail.sendBtn, (!reply.trim() || sending) && detail.sendBtnDisabled]}
                    onPress={handleSend}
                    disabled={!reply.trim() || sending}
                    accessibilityRole="button"
                    accessibilityLabel="Send reply"
                    accessibilityState={{ disabled: !reply.trim() || sending }}>
                    {sending
                      ? <ActivityIndicator size="small" color={colors.white} />
                      : <Text style={detail.sendBtnText}>{t('admin.support.sendBtn')}</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[detail.closedNotice, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                  <Text style={detail.closedNoticeText}>{t('admin.support.closedNotice')}</Text>
                </View>
              )}
            </KeyboardAvoidingView>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function MessageBubble({ msg, bubble, colors }: { msg: SupportMessage; bubble: ReturnType<typeof getBubbleStyles>; colors: ColorPalette }) {
  const isAdmin = msg.authorRole === 'admin';
  return (
    <View style={[bubble.row, isAdmin ? bubble.rowAdmin : bubble.rowUser]}>
      <View style={[bubble.bubble, isAdmin ? bubble.bubbleAdmin : bubble.bubbleUser]}>
        {isAdmin && <Text style={bubble.adminLabel}>{tr('shared.supportTicket.supportTeamLabel')}</Text>}
        <Text style={[bubble.body, isAdmin ? bubble.bodyAdmin : bubble.bodyUser]}>
          {msg.body}
        </Text>
        <Text style={[bubble.time, isAdmin ? bubble.timeAdmin : bubble.timeUser]}>
          {formatTime(msg.createdAt)}
        </Text>
      </View>
    </View>
  );
}

function getBubbleStyles(c: ColorPalette) {
  return StyleSheet.create({
    row:       { marginBottom: 12, flexDirection: 'row' },
    rowUser:   { justifyContent: 'flex-end' },
    rowAdmin:  { justifyContent: 'flex-start' },
    bubble:    { maxWidth: '78%', borderRadius: 16, padding: 12 },
    bubbleUser:  { backgroundColor: c.primary, borderBottomRightRadius: 4 },
    bubbleAdmin: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderBottomLeftRadius: 4 },
    adminLabel:  { fontSize: 10, fontWeight: '700', color: c.textSecondary, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
    body:      { fontSize: 14, lineHeight: 20 },
    bodyUser:  { color: c.white },
    bodyAdmin: { color: c.text },
    time:      { fontSize: 10, marginTop: 4 },
    timeUser:  { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
    timeAdmin: { color: c.textSecondary },
  });
}

function getDetailStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:       { flex: 1, backgroundColor: c.background },
    header:     {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: c.white, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    closeBtn:     { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    closeText:    { fontSize: 16, color: c.textSecondary },
    headerTitle:  { flex: 1, fontSize: 16, fontWeight: '700', color: c.text },

    metaBar:      { backgroundColor: c.white, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    metaGroup:    {},
    metaLabel:    { fontSize: 11, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    chipScroll:   { flexDirection: 'row' },
    chip:         {
      borderRadius: 20, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 5, marginRight: 6,
      backgroundColor: c.surface,
    },
    chipText:     { fontSize: 12, color: c.text },
    infoRow:      { marginTop: 10 },
    infoText:     { fontSize: 12, color: c.textSecondary },

    thread:       { flex: 1 },
    threadContent:{ padding: 16 },

    replyRow:     {
      flexDirection: 'row', alignItems: 'flex-end', gap: 8,
      paddingHorizontal: 12, paddingTop: 8,
      backgroundColor: c.white, borderTopWidth: 1, borderTopColor: c.border,
    },
    replyInput:   {
      flex: 1, backgroundColor: c.background,
      borderRadius: 20, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 8,
      fontSize: 14, color: c.text, maxHeight: 100,
    },
    sendBtn:          { backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
    sendBtnDisabled:  { opacity: 0.4 },
    sendBtnText:      { color: c.white, fontWeight: '700', fontSize: 14 },

    closedNotice:     { padding: 16, alignItems: 'center', backgroundColor: c.white, borderTopWidth: 1, borderTopColor: c.border },
    closedNoticeText: { fontSize: 13, color: c.textSecondary, fontStyle: 'italic' },
  });
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminSupportScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [tickets, setTickets]         = useState<AdminTicketSummary[]>([]);
  const [total, setTotal]             = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [roleFilter, setRoleFilter]   = useState<'all' | 'client' | 'driver'>('all');
  const [page, setPage]               = useState(1);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [activeId, setActiveId]       = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const LIMIT = 20;

  const load = useCallback(async (reset = false, isRefresh = false) => {
    const p = reset ? 1 : page;
    if (isRefresh)    setRefreshing(true);
    else if (reset)   setLoading(true);
    else              setLoadingMore(true);

    try {
      const res = await supportApi.adminGetTickets({
        page:    p,
        limit:   LIMIT,
        status:  statusFilter,
        userRole: roleFilter !== 'all' ? roleFilter : undefined,
      });
      if (reset) {
        setTickets(res.data.tickets);
        setPage(2);
      } else {
        setTickets(prev => [...prev, ...res.data.tickets]);
        setPage(p + 1);
      }
      setTotal(res.data.total);
    } catch {
      Alert.alert(t('common.error'), t('admin.support.loadError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [statusFilter, roleFilter, page]);

  // Reload whenever filters change
  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, roleFilter]);

  const openTicket = (id: string) => {
    setActiveId(id);
    setModalVisible(true);
  };

  const handleTicketUpdated = (updated: AdminTicketSummary) => {
    setTickets(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
  };

  const hasMore = tickets.length < total;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t('admin.support.title')}</Text>
          {statusFilter === 'all' && total > 0 && (
            <Text style={styles.subtitle}>{total} ticket{total !== 1 ? 's' : ''} total</Text>
          )}
        </View>
        <Text style={styles.count}>{total} total</Text>
      </View>

      {/* Status filter pills */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.pillRow} contentContainerStyle={styles.pillRowContent}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.pill, statusFilter === f.value && styles.pillActive]}
            onPress={() => setStatusFilter(f.value)}
            accessibilityRole="radio"
            accessibilityLabel={`Filter: ${f.label}`}
            accessibilityState={{ checked: statusFilter === f.value }}>
            <Text style={[styles.pillText, statusFilter === f.value && styles.pillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Role filter pills */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.roleRow} contentContainerStyle={styles.pillRowContent}>
        {([
          { label: 'All Users',  value: 'all'    },
          { label: '👤 Passengers', value: 'client' },
          { label: '🚗 Drivers',    value: 'driver' },
        ] as const).map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.rolePill, roleFilter === f.value && styles.rolePillActive]}
            onPress={() => setRoleFilter(f.value)}
            accessibilityRole="radio"
            accessibilityLabel={`Role filter: ${f.value === 'all' ? 'All users' : f.value === 'client' ? 'Passengers' : 'Drivers'}`}
            accessibilityState={{ checked: roleFilter === f.value }}>
            <Text style={[styles.rolePillText, roleFilter === f.value && styles.rolePillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Ticket list */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={t => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TicketCard ticket={item} onPress={() => openTicket(item.id)} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🎫</Text>
              <Text style={styles.emptyText}>{t('admin.support.emptyMsg')}</Text>
            </View>
          }
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => load()}
                accessibilityRole="button"
                accessibilityLabel="Load more tickets">
                {loadingMore
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={styles.loadMoreText}>{t('common.loadMore')}</Text>}
              </TouchableOpacity>
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true, true)} />
          }
        />
      )}

      {/* Ticket detail modal */}
      <TicketDetailModal
        ticketId={activeId}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onTicketUpdated={handleTicketUpdated}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:  { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: Sizes.screenPadding, paddingTop: 16, paddingBottom: 8,
      backgroundColor: c.white, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    title:    { fontSize: 20, fontWeight: '700', color: c.text },
    subtitle: { fontSize: 11, color: c.textSecondary, marginTop: 1 },
    count:    { fontSize: 13, color: c.textSecondary },

    pillRow:     { maxHeight: 48, backgroundColor: c.white },
    pillRowContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
    pill: {
      borderRadius: 16, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 5, backgroundColor: c.white,
    },
    pillActive:     { backgroundColor: c.primary, borderColor: c.primary },
    pillText:       { fontSize: 13, color: c.textSecondary },
    pillTextActive: { color: c.white, fontWeight: '600' },

    roleRow:  { maxHeight: 40, backgroundColor: c.white, borderBottomWidth: 1, borderBottomColor: c.border },
    rolePill: {
      borderRadius: 12, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 3, backgroundColor: c.white,
    },
    rolePillActive:     { backgroundColor: c.primary + '18', borderColor: c.primary },
    rolePillText:       { fontSize: 12, color: c.textSecondary },
    rolePillTextActive: { color: c.primary, fontWeight: '600' },

    list:       { padding: 12 },
    empty:      { alignItems: 'center', marginTop: 60 },
    emptyIcon:  { fontSize: 48, marginBottom: 12 },
    emptyText:  { fontSize: 16, color: c.textSecondary },
    loadMoreBtn:  { alignItems: 'center', padding: 14 },
    loadMoreText: { color: c.primary, fontWeight: '600', fontSize: 14 },
  });
}
