import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { adminApi, type AdminClient } from '../../api/admin';
import { useTranslation } from '../../i18n';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Client Card ───────────────────────────────────────────────────────────────

function ClientCard({ client }: { client: AdminClient }) {
  const colors = useColors();
  const card = useMemo(() => getCardStyles(colors), [colors]);

  return (
    <View style={card.wrap}>
      {/* Name + rating badge */}
      <View style={card.topRow}>
        <Text style={card.name}>{client.firstName} {client.lastName}</Text>
        <View style={card.ratingBadge}>
          <Text style={card.ratingText}>⭐ {client.rating.toFixed(1)}</Text>
        </View>
      </View>

      {client.phone ? (
        <Text style={card.meta}>📞 {client.phone}</Text>
      ) : (
        <Text style={[card.meta, card.metaDim]}>📞 No phone on file</Text>
      )}
      <Text style={card.meta}>🚖 {client.totalRides} ride{client.totalRides !== 1 ? 's' : ''}</Text>
      <Text style={card.meta}>📅 Joined {formatDate(client.createdAt)}</Text>
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
    topRow: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 6,
    },
    name:        { fontSize: 16, fontWeight: '700', color: c.text, flex: 1, marginRight: 8 },
    ratingBadge: {
      backgroundColor: c.primary + '18', borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    ratingText: { fontSize: 12, fontWeight: '700', color: c.primary },

    meta:    { fontSize: 13, color: c.textSecondary, marginBottom: 2 },
    metaDim: { opacity: 0.5 },
  });
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminClientsScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [clients, setClients]         = useState<AdminClient[]>([]);
  const [total, setTotal]             = useState(0);
  const [search, setSearch]           = useState('');
  const [page, setPage]               = useState(1);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing]   = useState(false);

  const LIMIT = 20;

  const load = useCallback(async (reset = false, isRefresh = false) => {
    const p = reset ? 1 : page;
    if (isRefresh) setRefreshing(true);
    else if (reset) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await adminApi.getClients(p, LIMIT, search || undefined);
      if (reset) {
        setClients(res.data.clients);
        setPage(2);
      } else {
        setClients(prev => [...prev, ...res.data.clients]);
        setPage(p + 1);
      }
      setTotal(res.data.total);
    } catch {
      Alert.alert(t('common.error'), t('admin.clients.loadError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [search, page]);

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => load(true);

  const hasMore = clients.length < total;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('admin.clients.title')}</Text>
        <Text style={styles.count}>{total} total</Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t('admin.clients.searchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
          accessibilityLabel="Search passengers by name"
        />
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={handleSearch}
          accessibilityRole="button"
          accessibilityLabel="Search">
          <Text style={styles.searchBtnText}>{t('common.search')}</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={clients}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <ClientCard client={item} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={styles.emptyText}>{t('admin.clients.emptyMsg')}</Text>
            </View>
          }
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => load()}
                accessibilityRole="button"
                accessibilityLabel="Load more passengers">
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

    searchRow: {
      flexDirection: 'row', gap: 8,
      paddingHorizontal: 12, paddingVertical: 8,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    searchInput: {
      flex: 1, backgroundColor: c.background,
      borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 8,
      fontSize: 14, color: c.text,
    },
    searchBtn: {
      backgroundColor: c.primary, borderRadius: 10,
      paddingHorizontal: 16, justifyContent: 'center',
    },
    searchBtnText: { color: c.white, fontWeight: '700', fontSize: 14 },

    list:       { padding: 12 },
    empty:      { alignItems: 'center', marginTop: 60 },
    emptyIcon:  { fontSize: 48, marginBottom: 12 },
    emptyText:  { fontSize: 16, color: c.textSecondary },
    loadMoreBtn:  { alignItems: 'center', padding: 14 },
    loadMoreText: { color: c.primary, fontWeight: '600', fontSize: 14 },
  });
}
