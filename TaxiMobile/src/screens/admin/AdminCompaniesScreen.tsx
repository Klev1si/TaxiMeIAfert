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
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { adminApi, type AdminCompany } from '../../api/admin';
import { toAlertString } from '../../utils/errorMessage';
import { useTranslation } from '../../i18n';

type Filter = 'all' | 'pending' | 'approved';

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All',      value: 'all'      },
  { label: 'Pending',  value: 'pending'  },
  { label: 'Approved', value: 'approved' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Company Card ──────────────────────────────────────────────────────────────

function CompanyCard({
  company,
  onApprove,
  onReject,
  actionLoading,
}: {
  company: AdminCompany;
  onApprove: (id: string) => void;
  onReject: (id: string, name: string) => void;
  actionLoading: string | null;
}) {
  const colors = useColors();
  const card = useMemo(() => getCardStyles(colors), [colors]);
  const { t } = useTranslation();
  const busy = actionLoading === company.id;

  return (
    <View style={card.wrap}>
      <View style={[card.badge, company.isApproved ? card.badgeApproved : card.badgePending]}>
        <Text style={[card.badgeText, company.isApproved ? card.badgeTextApproved : card.badgeTextPending]}>
          {company.isApproved ? t('admin.companies.filterApproved') : t('admin.companies.filterPending')}
        </Text>
      </View>

      <Text style={card.name}>{company.name}</Text>
      {company.phone ? (
        <Text style={card.meta}>📞 {company.phone}</Text>
      ) : (
        <Text style={[card.meta, card.metaDim]}>📞 No phone on file</Text>
      )}
      {company.city || company.address ? (
        <Text style={card.meta}>
          📍 {[company.city, company.address].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      <Text style={card.meta}>📅 Applied {formatDate(company.createdAt)}</Text>
      {company.isApproved && company.approvedAt ? (
        <Text style={card.meta}>✅ Approved {formatDate(company.approvedAt)}</Text>
      ) : null}

      {/* Actions — only for pending */}
      {!company.isApproved && (
        <View style={card.actions}>
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <TouchableOpacity
                style={card.approveBtn}
                onPress={() => onApprove(company.id)}
                accessibilityRole="button"
                accessibilityLabel={`Approve company ${company.name}`}>
                <Text style={card.approveBtnText}>{t('admin.companies.approveBtn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={card.rejectBtn}
                onPress={() => onReject(company.id, company.name)}
                accessibilityRole="button"
                accessibilityLabel={`Reject company ${company.name}`}>
                <Text style={card.rejectBtnText}>{t('admin.companies.rejectBtn')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function getCardStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.surface, borderRadius: 14,
      padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: c.border,
    },
    badge: {
      alignSelf: 'flex-start', borderRadius: 6,
      paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8,
    },
    badgeApproved:     { backgroundColor: c.success + '22' },
    badgePending:      { backgroundColor: (c.warning ?? '#f59e0b') + '22' },
    badgeText:         { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    badgeTextApproved: { color: c.success },
    badgeTextPending:  { color: c.warning ?? '#f59e0b' },

    name:    { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 4 },
    meta:    { fontSize: 13, color: c.textSecondary, marginBottom: 2 },
    metaDim: { opacity: 0.5 },

    actions:      { flexDirection: 'row', gap: 10, marginTop: 12 },
    approveBtn:   { flex: 1, backgroundColor: c.success, borderRadius: 10, padding: 10, alignItems: 'center' },
    rejectBtn:    { flex: 1, borderWidth: 1, borderColor: c.error, borderRadius: 10, padding: 10, alignItems: 'center' },
    approveBtnText: { color: c.white, fontWeight: '700', fontSize: 14 },
    rejectBtnText:  { color: c.error, fontWeight: '700', fontSize: 14 },
  });
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminCompaniesScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [companies, setCompanies]   = useState<AdminCompany[]>([]);
  const [total, setTotal]           = useState(0);
  const [filter, setFilter]         = useState<Filter>('pending');
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const LIMIT = 20;

  const load = useCallback(async (reset = false, isRefresh = false) => {
    const p = reset ? 1 : page;
    if (isRefresh) setRefreshing(true);
    else if (reset) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await adminApi.getCompanies(filter, p, LIMIT);
      if (reset) {
        setCompanies(res.data.companies);
        setPage(2);
      } else {
        setCompanies(prev => [...prev, ...res.data.companies]);
        setPage(p + 1);
      }
      setTotal(res.data.total);
    } catch {
      Alert.alert(t('common.error'), t('admin.companies.loadError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [filter, page]);

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleApprove = async (companyId: string) => {
    setActionLoading(companyId);
    try {
      await adminApi.approveCompany(companyId);
      setCompanies(prev =>
        prev.map(c => c.id === companyId
          ? { ...c, isApproved: true, approvedAt: new Date().toISOString() }
          : c,
        ),
      );
    } catch (err: any) {
      Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('admin.companies.approveError')));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = (companyId: string, name: string) => {
    Alert.alert(
      t('admin.companies.rejectTitle'),
      t('admin.companies.rejectMsg', { name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.companies.rejectBtn'),
          style: 'destructive',
          onPress: async () => {
            setActionLoading(companyId);
            try {
              await adminApi.rejectCompany(companyId);
              setCompanies(prev => prev.filter(c => c.id !== companyId));
            } catch (err: any) {
              Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('admin.companies.rejectError')));
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  const hasMore = companies.length < total;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('admin.companies.title')}</Text>
        <Text style={styles.count}>{total} total</Text>
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.pillRow} contentContainerStyle={styles.pillRowContent}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.pill, filter === f.value && styles.pillActive]}
            onPress={() => setFilter(f.value)}
            accessibilityRole="radio"
            accessibilityLabel={`Filter: ${f.label}`}
            accessibilityState={{ checked: filter === f.value }}>
            <Text style={[styles.pillText, filter === f.value && styles.pillTextActive]}>
              {f.value === 'all' ? t('admin.companies.filterAll') : f.value === 'pending' ? t('admin.companies.filterPending') : t('admin.companies.filterApproved')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={companies}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <CompanyCard
              company={item}
              onApprove={handleApprove}
              onReject={handleReject}
              actionLoading={actionLoading}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🏢</Text>
              <Text style={styles.emptyText}>{t('admin.companies.emptyMsg')}</Text>
            </View>
          }
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => load()}
                accessibilityRole="button"
                accessibilityLabel="Load more companies">
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
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    title: { fontSize: 20, fontWeight: '700', color: c.text },
    count: { fontSize: 13, color: c.textSecondary },

    pillRow: { maxHeight: 48, backgroundColor: c.surface },
    pillRowContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
    pill: {
      borderRadius: 16, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 5, backgroundColor: c.surface,
    },
    pillActive:    { backgroundColor: c.primary, borderColor: c.primary },
    pillText:      { fontSize: 13, color: c.textSecondary },
    pillTextActive: { color: c.white, fontWeight: '600' },

    list:      { padding: 12 },
    empty:     { alignItems: 'center', marginTop: 60 },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyText: { fontSize: 16, color: c.textSecondary },

    loadMoreBtn:  { alignItems: 'center', padding: 14 },
    loadMoreText: { color: c.primary, fontWeight: '600', fontSize: 14 },
  });
}
