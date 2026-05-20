import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { adminApi, type AdminAuditLog } from '../../api/admin';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import type { AdminProfileStackScreenProps } from '../../navigation/types';
import { useTranslation } from '../../i18n';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Action icon map ───────────────────────────────────────────────────────────

function actionIcon(action: string): string {
  if (action.startsWith('driver.approve'))   return '✅';
  if (action.startsWith('driver.reject'))    return '❌';
  if (action.startsWith('company.approve'))  return '🏢';
  if (action.startsWith('company.reject'))   return '🚫';
  if (action.startsWith('wallet.payout'))    return '💳';
  if (action.startsWith('plan.'))            return '📋';
  if (action.startsWith('tariff.'))          return '💸';
  if (action.startsWith('promo.'))           return '🎟️';
  return '🔧';
}

function actionLabel(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\./g, ' › ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ── Filter options ────────────────────────────────────────────────────────────

type ActionFilter = '' | 'driver' | 'company' | 'wallet' | 'plan' | 'tariff' | 'promo';

const ACTION_FILTERS: { label: string; value: ActionFilter }[] = [
  { label: 'All',      value: ''        },
  { label: '🚗 Driver',  value: 'driver'  },
  { label: '🏢 Company', value: 'company' },
  { label: '💳 Payouts', value: 'wallet'  },
  { label: '📋 Plans',   value: 'plan'    },
  { label: '💸 Tariffs', value: 'tariff'  },
  { label: '🎟️ Promos',  value: 'promo'   },
];

// ── Log Entry Card ────────────────────────────────────────────────────────────

function LogCard({ log }: { log: AdminAuditLog }) {
  const colors = useColors();
  const card = useMemo(() => getCardStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

  return (
    <TouchableOpacity
      style={card.wrap}
      activeOpacity={hasMetadata ? 0.75 : 1}
      onPress={() => hasMetadata && setExpanded(v => !v)}
      accessibilityRole="button"
      accessibilityLabel={`${actionLabel(log.action)}, ${fmtDate(log.createdAt)}${hasMetadata ? (expanded ? ', expanded' : ', tap to expand') : ''}`}>
      {/* Top row */}
      <View style={card.topRow}>
        <Text style={card.icon}>{actionIcon(log.action)}</Text>
        <View style={card.middle}>
          <Text style={card.action}>{actionLabel(log.action)}</Text>
          <View style={card.metaRow}>
            {log.targetType ? (
              <View style={card.targetBadge}>
                <Text style={card.targetText}>{log.targetType}</Text>
              </View>
            ) : null}
            {log.adminPhone && (
              <Text style={card.adminPhone} numberOfLines={1}>
                by {log.adminPhone}
              </Text>
            )}
          </View>
        </View>
        <View style={card.right}>
          <Text style={card.date}>{fmtDate(log.createdAt)}</Text>
          <Text style={card.time}>{fmtTime(log.createdAt)}</Text>
          {hasMetadata && (
            <Text style={card.chevron}>{expanded ? '▲' : '▼'}</Text>
          )}
        </View>
      </View>

      {/* Expandable metadata */}
      {expanded && hasMetadata && (
        <View style={card.meta}>
          {Object.entries(log.metadata!).map(([k, v]) => (
            <View key={k} style={card.metaLine}>
              <Text style={card.metaKey}>{k}: </Text>
              <Text style={card.metaVal} numberOfLines={2}>
                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </Text>
            </View>
          ))}
          {log.targetId && (
            <View style={card.metaLine}>
              <Text style={card.metaKey}>targetId: </Text>
              <Text style={card.metaVal}>{log.targetId.slice(-12)}…</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function getCardStyles(c: ColorPalette) { return StyleSheet.create({
  wrap: {
    backgroundColor: c.surface, borderRadius: 12,
    padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.border,
  },
  topRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon:    { fontSize: 20, width: 28, textAlign: 'center', marginTop: 1 },
  middle:  { flex: 1 },
  action:  { fontSize: 14, fontWeight: '600', color: c.text, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  targetBadge: {
    backgroundColor: c.primary + '18', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  targetText:  { fontSize: 10, fontWeight: '700', color: c.primary, textTransform: 'uppercase' },
  adminPhone:  { fontSize: 11, color: c.textSecondary },
  right:       { alignItems: 'flex-end', gap: 1 },
  date:        { fontSize: 11, color: c.textSecondary },
  time:        { fontSize: 11, color: c.textSecondary },
  chevron:     { fontSize: 10, color: c.textSecondary, marginTop: 4 },

  meta:        { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border, gap: 4 },
  metaLine:    { flexDirection: 'row', flexWrap: 'wrap' },
  metaKey:     { fontSize: 11, fontWeight: '700', color: c.textSecondary },
  metaVal:     { fontSize: 11, color: c.text, flex: 1 },
}); }

// ── Main Screen ───────────────────────────────────────────────────────────────

type Props = AdminProfileStackScreenProps<'AdminAuditLogs'>;

const LIMIT = 30;

export default function AdminAuditLogsScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [logs,        setLogs]        = useState<AdminAuditLog[]>([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('');

  const load = useCallback(async (reset = false, isRefresh = false) => {
    const p = reset ? 1 : page;
    if (isRefresh)  setRefreshing(true);
    else if (reset) setLoading(true);
    else            setLoadingMore(true);

    try {
      const res = await adminApi.getAuditLogs({
        page:   p,
        limit:  LIMIT,
        action: actionFilter || undefined,
      });
      const { logs: newLogs, total: newTotal } = res.data;
      setLogs(reset ? newLogs : prev => [...prev, ...newLogs]);
      setTotal(newTotal);
      setPage(reset ? 2 : p + 1);
    } catch {
      Alert.alert(t('common.error'), t('admin.auditLogs.loadError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [page, actionFilter]);

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter]);

  const hasMore = logs.length < total;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backText}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('admin.auditLogs.title')}</Text>
        <Text style={styles.count}>{loading ? '—' : total}</Text>
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.pillRow} contentContainerStyle={styles.pillContent}>
        {ACTION_FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.pill, actionFilter === f.value && styles.pillActive]}
            onPress={() => setActionFilter(f.value)}
            accessibilityRole="radio"
            accessibilityLabel={`Filter: ${f.value === '' ? 'All' : f.label.replace(/[^\w\s]/g, '').trim()}`}
            accessibilityState={{ checked: actionFilter === f.value }}>
            <Text style={[styles.pillText, actionFilter === f.value && styles.pillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={l => l.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <LogCard log={item} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true, true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          onEndReached={() => { if (!loadingMore && hasMore) load(); }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
              : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>{t('admin.auditLogs.emptyMsg')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Sizes.screenPadding, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  backBtn:  { marginRight: 8 },
  backText: { fontSize: 16, color: c.primary, fontWeight: '600' },
  title:    { flex: 1, fontSize: 20, fontWeight: '800', color: c.text },
  count:    { fontSize: 13, color: c.textSecondary, fontWeight: '600' },

  pillRow:    { maxHeight: 48, backgroundColor: c.white, borderBottomWidth: 1, borderBottomColor: c.border },
  pillContent:{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  pill:       {
    borderRadius: 16, borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 12, paddingVertical: 5, backgroundColor: c.white,
  },
  pillActive:     { backgroundColor: c.primary, borderColor: c.primary },
  pillText:       { fontSize: 12, color: c.textSecondary, fontWeight: '500' },
  pillTextActive: { color: c.white, fontWeight: '700' },

  list:       { padding: Sizes.screenPadding, paddingBottom: 32 },
  empty:      { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 48, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8 },
  emptyText:  { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20 },
}); }
