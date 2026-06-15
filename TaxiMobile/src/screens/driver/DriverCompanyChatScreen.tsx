/**
 * DriverCompanyChatScreen
 *
 * Two-way chat between the driver and their company. Rendered as a fullscreen
 * modal from DriverHomeScreen's bell icon. Subscribes to socket events for
 * real-time incoming messages.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View, FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { driverMessagesApi, type CompanyMessage } from '../../api/company-messages';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { socketService } from '../../services/socket';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DriverCompanyChatScreen({ visible, onClose }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [messages,    setMessages]    = useState<CompanyMessage[]>([]);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [hasCompany,  setHasCompany]  = useState(true);
  const [loading,     setLoading]     = useState(true);
  const [draft,       setDraft]       = useState('');
  const [sending,     setSending]     = useState(false);
  const listRef = useRef<FlatList<CompanyMessage>>(null);

  // Load thread when modal opens.
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    driverMessagesApi.getThread()
      .then(({ data }) => {
        setMessages(data.messages);
        setCompanyName(data.companyName);
        setHasCompany(data.companyId != null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible]);

  // Live updates while open.
  useEffect(() => {
    if (!visible) return;
    const unsub = socketService.on<CompanyMessage>('company_message', msg => {
      setMessages(prev =>
        prev.some(m => m.id === msg.id) ? prev : [...prev, msg],
      );
      // Re-fetch once so the server marks the new message as read.
      driverMessagesApi.getThread().catch(() => {});
    });
    return unsub;
  }, [visible]);

  // Scroll to bottom whenever the list grows.
  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    // Clear input optimistically; restore it if the send fails so the user
    // doesn't have to retype.
    setDraft('');
    try {
      const { data } = await driverMessagesApi.reply(text);
      setMessages(prev => [...prev, data]);
    } catch (err: any) {
      // Restore the typed text so it's not lost.
      setDraft(text);
      const status   = err?.response?.status;
      const apiMsg   = err?.response?.data?.message;
      const fallback = err?.message ?? 'Could not send';
      let msg = apiMsg ?? fallback;
      if (Array.isArray(msg)) msg = msg.join('\n');
      Alert.alert(
        'Could not send',
        status ? `${msg}\n\n(HTTP ${status})` : String(msg),
      );
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: CompanyMessage }) => {
    const fromMe = item.fromRole === 'driver';
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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.headerBtn}>‹ Back</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.headerTitle}>{companyName ?? 'Company'}</Text>
            <Text style={styles.headerSub}>Direct chat</Text>
          </View>
          <View style={{ width: 60 }} />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : !hasCompany ? (
          <View style={styles.centered}>
            <Text style={styles.emptyIcon}>🚖</Text>
            <Text style={styles.emptyTitle}>Not in a company</Text>
            <Text style={styles.emptySub}>
              You're a solo driver, so there's no company to message.
            </Text>
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
                  <Text style={styles.emptyChatTitle}>No messages yet</Text>
                  <Text style={styles.emptyChatSub}>
                    Start a conversation with {companyName ?? 'your company'}.
                  </Text>
                </View>
              }
            />
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Type a message…"
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
                  : <Text style={styles.sendBtnText}>Send</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function getStyles(c: ColorPalette) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  headerBtn:   { fontSize: 16, color: c.primary, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: c.text },
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

  emptyIcon:  { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: c.text, marginBottom: 6 },
  emptySub:   { fontSize: 14, color: c.textSecondary, textAlign: 'center' },

  emptyChat:      { alignItems: 'center', paddingVertical: 48 },
  emptyChatIcon:  { fontSize: 44, marginBottom: 10 },
  emptyChatTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 4 },
  emptyChatSub:   { fontSize: 13, color: c.textSecondary, textAlign: 'center', paddingHorizontal: 24 },
}); }
