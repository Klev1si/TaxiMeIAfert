import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { supportApi, SupportMessage, TicketDetail } from '../../api/support';
import { useAuthStore } from '../../stores/authStore';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';

// ── Types ─────────────────────────────────────────────────────────────────────

type RouteParams = { ticketId: string };

const STATUS_COLOR: Record<string, string> = {
  open:        '#F59E0B',
  in_progress: '#3B82F6',
  resolved:    '#10B981',
  closed:      '#9CA3AF',
};
// STATUS_LABEL rendered at runtime with t() inside SupportTicketScreen

// ── Message bubble ────────────────────────────────────────────────────────────

function Bubble({ msg, isOwn }: { msg: SupportMessage; isOwn: boolean }) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const isAdmin = msg.authorRole === 'admin';
  return (
    <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
      {isAdmin && <Text style={styles.adminLabel}>{t('shared.supportTicket.supportTeamLabel')}</Text>}
      <Text style={[styles.bubbleText, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
        {msg.body}
      </Text>
      <Text style={[styles.bubbleTime, isOwn ? styles.bubbleTimeOwn : styles.bubbleTimeOther]}>
        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        {'  '}
        {new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SupportTicketScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route      = useRoute<RouteProp<{ SupportTicket: RouteParams }, 'SupportTicket'>>();
  const { user }   = useAuthStore();
  const { ticketId } = route.params;

  const [ticket,  setTicket]  = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply,   setReply]   = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    try {
      const data = await supportApi.getTicket(ticketId);
      setTicket(data);
    } catch {
      Alert.alert(t('common.error'), t('shared.supportTicket.loadError'));
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [ticketId, navigation]);

  useEffect(() => { load(); }, [load]);

  const sendReply = async () => {
    if (!reply.trim() || reply.trim().length < 2) return;
    setSending(true);
    try {
      const msg = await supportApi.addMessage(ticketId, reply.trim());
      setReply('');
      setTicket(prev => prev ? { ...prev, messages: [...prev.messages, msg] } : prev);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert(t('common.error'), t('shared.supportTicket.sendError'));
    } finally {
      setSending(false);
    }
  };

  if (loading || !ticket) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const isClosed  = ticket.status === 'closed';
  const statusClr = STATUS_COLOR[ticket.status] ?? '#9CA3AF';

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
        <View style={styles.headerCenter}>
          <Text style={styles.headerSubject} numberOfLines={1}>{ticket.subject}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusClr + '22' }]}>
            <Text style={[styles.statusPillText, { color: statusClr }]}>
              {ticket.status === 'open' ? t('shared.support.statusOpen')
                : ticket.status === 'in_progress' ? t('shared.support.statusInProgress')
                : ticket.status === 'resolved' ? t('shared.support.statusResolved')
                : t('shared.support.statusClosed')}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <FlatList
          ref={listRef}
          data={ticket.messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => (
            <Bubble msg={item} isOwn={item.authorId === user?.id} />
          )}
          contentContainerStyle={styles.msgList}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text style={styles.noMsg}>{t('shared.supportTicket.noMessages')}</Text>
          }
        />

        {/* Reply bar */}
        {!isClosed ? (
          <View style={styles.replyBar}>
            <TextInput
              style={styles.replyInput}
              value={reply}
              onChangeText={setReply}
              placeholder={t('shared.supportTicket.replyPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={3000}
              accessibilityLabel="Write a reply"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!reply.trim() || sending) && styles.sendBtnDim]}
              onPress={sendReply}
              disabled={!reply.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send reply"
              accessibilityState={{ disabled: !reply.trim() || sending }}
            >
              <Text style={styles.sendBtnText}>{sending ? '…' : '➤'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.closedBanner}>
            <Text style={styles.closedBannerText}>{t('shared.supportTicket.closedBanner')}</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 12, paddingVertical: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn:      { padding: 4, marginRight: 8 },
    backArrow:    { fontSize: 22, color: c.primary },
    headerCenter: { flex: 1 },
    headerSubject:{ fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 2 },
    statusPill:   { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
    statusPillText:{ fontSize: 11, fontWeight: '700' },

    msgList: { padding: 12, paddingBottom: 8 },
    noMsg:   { textAlign: 'center', color: c.textSecondary, marginTop: 40 },

    bubble: { maxWidth: '80%', borderRadius: 14, padding: 10, marginVertical: 4 },
    bubbleOwn:   { alignSelf: 'flex-end',   backgroundColor: c.primary },
    bubbleOther: { alignSelf: 'flex-start', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },

    adminLabel:       { fontSize: 10, fontWeight: '700', color: c.textSecondary, marginBottom: 2 },
    bubbleText:       { fontSize: 14, lineHeight: 20 },
    bubbleTextOwn:    { color: c.white },
    bubbleTextOther:  { color: c.text },
    bubbleTime:       { fontSize: 10, marginTop: 4 },
    bubbleTimeOwn:    { color: 'rgba(255,255,255,0.65)', textAlign: 'right' },
    bubbleTimeOther:  { color: c.textSecondary },

    replyBar: {
      flexDirection: 'row', alignItems: 'flex-end',
      padding: 10, backgroundColor: c.surface,
      borderTopWidth: 1, borderTopColor: c.border,
    },
    replyInput: {
      flex: 1, maxHeight: 120, borderRadius: 20,
      backgroundColor: c.background, paddingHorizontal: 14, paddingVertical: 8,
      fontSize: 14, color: c.text, marginRight: 8,
    },
    sendBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    sendBtnDim: { opacity: 0.4 },
    sendBtnText:{ color: c.white, fontSize: 16, fontWeight: '700' },

    closedBanner:     { padding: 14, backgroundColor: c.surfaceAlt, alignItems: 'center' },
    closedBannerText: { fontSize: 13, color: c.textSecondary, fontStyle: 'italic' },
  });
}
