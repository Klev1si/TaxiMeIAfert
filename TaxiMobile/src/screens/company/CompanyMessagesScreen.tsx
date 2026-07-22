/**
 * CompanyMessagesScreen
 *
 * Drivers list with unread badges + last-message preview. Tapping a driver
 * opens a per-driver chat thread. Rendered as a fullscreen modal from
 * CompanyProfileScreen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, RefreshControl, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  companyMessagesApi,
  type CompanyMessage,
  type CompanyThread,
} from '../../api/company-messages';
import { useColors } from '../../stores/themeStore';
import { socketService } from '../../services/socket';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Per-driver chat thread (inner modal) ─────────────────────────────────────

function CompanyChatThread({
  driver, onClose,
}: {
  driver: CompanyThread;
  onClose: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => getThreadStyles(colors), [colors]);
  const { t } = useTranslation();

  const [messages, setMessages] = useState<CompanyMessage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [draft,    setDraft]    = useState('');
  const [sending,  setSending]  = useState(false);
  const listRef = useRef<FlatList<CompanyMessage>>(null);

  useEffect(() => {
    setLoading(true);
    companyMessagesApi.getThread(driver.driverId)
      .then(({ data }) => setMessages(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [driver.driverId]);

  // Live updates while open
  useEffect(() => {
    const unsub = socketService.on<CompanyMessage>('company_message', msg => {
      if (msg.driverId !== driver.driverId) return;
      setMessages(prev =>
        prev.some(m => m.id === msg.id) ? prev : [...prev, msg],
      );
    });
    return unsub;
  }, [driver.driverId]);

  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      const { data } = await companyMessagesApi.send(driver.driverId, text);
      setMessages(prev => [...prev, data]);
    } catch (err: any) {
      setDraft(text);
      const status   = err?.response?.status;
      const apiMsg   = err?.response?.data?.message;
      const fallback = err?.message ?? t('company.messages.sendFailTitle');
      let msg = apiMsg ?? fallback;
      if (Array.isArray(msg)) msg = msg.join('\n');
      Alert.alert(
        t('company.messages.sendFailTitle'),
        status ? `${msg}\n\n(HTTP ${status})` : String(msg),
      );
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: CompanyMessage }) => {
    const fromMe = item.fromRole === 'company';
    return (
      <View style={[styles.row, fromMe ? styles.rowMe : styles.rowOther]}>
        <View style={[styles.bubble, fromMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, fromMe && styles.bubbleTextMe]}>{item.text}</Text>
          <Text style={[styles.bubbleTime, fromMe && styles.bubbleTimeMe]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.headerBtn}>‹ {t('common.back')}</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.headerTitle}>
              {driver.firstName ?? ''} {driver.lastName ?? ''}
            </Text>
            {driver.vehiclePlate && (
              <Text style={styles.headerSub}>🚖 {driver.vehiclePlate}</Text>
            )}
          </View>
          <View style={{ width: 60 }} />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={m => m.id}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <View style={styles.emptyChat}>
                  <Text style={styles.emptyChatIcon}>💬</Text>
                  <Text style={styles.emptyChatTitle}>{t('company.messages.chatEmptyTitle')}</Text>
                  <Text style={styles.emptyChatSub}>{t('company.messages.chatEmptySub')}</Text>
                </View>
              }
            />
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder={t('company.messages.typePlaceholder')}
                placeholderTextColor={colors.textDisabled}
                multiline
                maxLength={2000}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.5 }]}
                onPress={send}
                disabled={!draft.trim() || sending}>
                {sending
                  ? <ActivityIndicator color={colors.textOnPrimary} />
                  : <Text style={styles.sendBtnText}>{t('common.send')}</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function CompanyMessagesScreen({ visible, onClose }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [threads,    setThreads]    = useState<CompanyThread[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active,     setActive]     = useState<CompanyThread | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await companyMessagesApi.listThreads();
      setThreads(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [visible, load]);

  // Live: re-load the thread list whenever a message arrives.
  useEffect(() => {
    if (!visible) return;
    const unsub = socketService.on<CompanyMessage>('company_message', () => {
      load();
    });
    return unsub;
  }, [visible, load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: CompanyThread }) => {
    const last  = item.lastMessage;
    const lastFromMe = last?.fromRole === 'company';
    const preview = last
      ? `${lastFromMe ? t('company.messages.youPrefix') : ''}${last.text}`
      : t('company.messages.noMessagesPreview');
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => setActive(item)}
        activeOpacity={0.85}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(item.firstName?.[0] ?? '?').toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={styles.rowTop}>
            <Text style={styles.name} numberOfLines={1}>
              {item.firstName ?? ''} {item.lastName ?? ''}
            </Text>
            {last && (
              <Text style={styles.time}>{formatTime(last.createdAt)}</Text>
            )}
          </View>
          <View style={styles.rowBottom}>
            <Text
              style={[styles.preview, item.unreadCount > 0 && styles.previewUnread]}
              numberOfLines={1}>
              {preview}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.headerBtn}>‹ {t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('company.messages.title')}</Text>
          <View style={{ width: 60 }} />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : threads.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>{t('company.messages.emptyTitle')}</Text>
            <Text style={styles.emptySub}>
              {t('company.messages.emptySub')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={threads}
            keyExtractor={th => th.driverId}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          />
        )}

        {active && (
          <CompanyChatThread
            driver={active}
            onClose={() => {
              setActive(null);
              // Refresh thread list so unread badges reset on return.
              load();
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  headerBtn:   { fontSize: 16, color: c.primary, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: c.text },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: c.text, marginBottom: 6 },
  emptySub:   { fontSize: 14, color: c.textSecondary, textAlign: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: c.primaryLight ?? (c.primary + '22'),
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: c.primary },

  rowTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  name:      { fontSize: 15, fontWeight: '700', color: c.text, flex: 1 },
  time:      { fontSize: 11, color: c.textSecondary, marginLeft: 8 },
  preview:   { fontSize: 13, color: c.textSecondary, flex: 1 },
  previewUnread: { color: c.text, fontWeight: '600' },

  unreadBadge: {
    minWidth: 22, height: 22, paddingHorizontal: 6, marginLeft: 8,
    borderRadius: 11, backgroundColor: c.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  unreadBadgeText: { color: c.textOnPrimary, fontSize: 11, fontWeight: '800' },

  sep: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: 72 },
}); }

function getThreadStyles(c: ColorPalette) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  headerBtn:   { fontSize: 16, color: c.primary, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: c.text },
  headerSub:   { fontSize: 11, color: c.textSecondary, marginTop: 2 },

  list: { padding: 12, paddingBottom: 4, flexGrow: 1 },
  row:      { width: '100%', marginBottom: 8 },
  rowMe:    { alignItems: 'flex-end' },
  rowOther: { alignItems: 'flex-start' },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  bubbleMe:    { backgroundColor: c.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: c.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: c.border },
  bubbleText:     { fontSize: 15, color: c.text },
  bubbleTextMe:   { color: c.textOnPrimary },
  bubbleTime:     { fontSize: 10, color: c.textDisabled, marginTop: 2, textAlign: 'right' },
  bubbleTimeMe:   { color: c.textOnPrimary, opacity: 0.7 },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 10, borderTopWidth: 1, borderTopColor: c.border,
    backgroundColor: c.background,
  },
  input: {
    flex: 1, minHeight: 42, maxHeight: 120,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1, borderColor: c.border,
    backgroundColor: c.surface, color: c.text, fontSize: 15,
  },
  sendBtn: {
    height: 42, paddingHorizontal: 16, borderRadius: 21,
    backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnText: { color: c.textOnPrimary, fontSize: 14, fontWeight: '700' },

  emptyChat:      { alignItems: 'center', paddingVertical: 48 },
  emptyChatIcon:  { fontSize: 44, marginBottom: 10 },
  emptyChatTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 4 },
  emptyChatSub:   { fontSize: 13, color: c.textSecondary, textAlign: 'center', paddingHorizontal: 24 },
}); }
