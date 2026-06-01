/**
 * FavoriteDriversScreen — list of drivers the client has saved.
 *
 * For each driver: Call (tel:) and Request Ride (preferredDriverId).
 * Pull-to-refresh updates online status.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Geolocation from '@react-native-community/geolocation';
import { clientFavoritesApi, type FavoriteDriver } from '../../api/client-favorites';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';
import type { ClientProfileStackScreenProps } from '../../navigation/types';

type Props = ClientProfileStackScreenProps<'FavoriteDrivers'>;

export default function FavoriteDriversScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [favorites,  setFavorites]  = useState<FavoriteDriver[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [loadError,  setLoadError]  = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setLoadError(null);
    try {
      const { data } = await clientFavoritesApi.list();
      setFavorites(data);
    } catch (err: any) {
      // Surface the real error to the user instead of silently leaving them
      // on a blank/spinning screen. Common cases:
      //   - 404: backend not deployed yet
      //   - 401: auth token expired — they should sign in again
      //   - network error: phone offline
      const status = err?.response?.status;
      const msg = err?.response?.data?.message ?? err?.message ?? 'Unknown error';
      setLoadError(
        status === 404
          ? 'Saved drivers is not available yet. Please update the app or try again later.'
          : status === 401
            ? 'Your session expired. Please sign in again.'
            : `Could not load saved drivers (${status ?? 'network'}): ${msg}`,
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCall = async (driver: FavoriteDriver) => {
    if (!driver.phone) {
      Alert.alert('No phone number', 'This driver doesn\'t have a phone on file.');
      return;
    }
    const url = `tel:${driver.phone}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Cannot place call', 'Your device doesn\'t support phone calls.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('common.error'), 'Could not open the dialer.');
    }
  };

  const handleRequestRide = (driver: FavoriteDriver) => {
    if (!driver.isOnline) {
      Alert.alert(
        'Driver is offline',
        `${driver.firstName} is not online right now. Would you like to request a regular ride instead?`,
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: 'Regular ride', onPress: () => goToRideRequest(driver, false) },
        ],
      );
      return;
    }
    goToRideRequest(driver, true);
  };

  const goToRideRequest = (driver: FavoriteDriver, withPreferred: boolean) => {
    // FavoriteDrivers lives in the profile stack. RideRequest lives in the
    // home stack. Hop to the Tab navigator (one getParent() from the profile
    // stack) and tell it to switch to the ClientHome tab → RideRequest screen
    // with the preferred driver id pre-loaded.
    Geolocation.getCurrentPosition(
      (pos) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tabNav = navigation.getParent() as any;
        if (!tabNav) {
          Alert.alert(t('common.error'), 'Could not open the ride request screen.');
          return;
        }
        tabNav.navigate('ClientHome', {
          screen: 'RideRequest',
          params: {
            pickupLat: pos.coords.latitude,
            pickupLng: pos.coords.longitude,
            ...(withPreferred ? { preferredDriverId: driver.driverId } : {}),
          },
        });
      },
      () => Alert.alert(
        'Location unavailable',
        'Turn on your phone\'s Location to request a ride from the home screen.',
      ),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const handleRemove = (driver: FavoriteDriver) => {
    Alert.alert(
      'Remove from favorites?',
      `${driver.firstName} ${driver.lastName} will no longer appear in your saved drivers.`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingId(driver.driverId);
            try {
              await clientFavoritesApi.remove(driver.driverId);
              setFavorites(prev => prev.filter(f => f.driverId !== driver.driverId));
            } catch {
              Alert.alert(t('common.error'), 'Could not remove driver.');
            } finally {
              setRemovingId(null);
            }
          },
        },
      ],
    );
  };

  if (loading && favorites.length === 0) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={styles.headerBack}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Drivers</Text>
        <View style={{ width: 28 }} />
      </View>

      <FlatList
        data={favorites}
        keyExtractor={item => item.driverId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} tintColor={colors.primary} />
        }
        contentContainerStyle={favorites.length === 0 ? styles.emptyWrap : styles.list}
        ListEmptyComponent={
          loadError ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>⚠️</Text>
              <Text style={styles.emptyTitle}>Could not load</Text>
              <Text style={styles.emptyText}>{loadError}</Text>
              <TouchableOpacity onPress={() => load(true)} style={{ marginTop: 16, padding: 12 }}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>⭐</Text>
              <Text style={styles.emptyTitle}>No saved drivers yet</Text>
              <Text style={styles.emptyText}>
                After a great ride, tap the heart on the rating screen to save the driver here.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              {/* Avatar */}
              {item.avatarUrl
                ? <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                : <View style={styles.avatarFallback}>
                    <Text style={styles.avatarText}>
                      {(item.firstName?.[0] ?? '?').toUpperCase()}
                    </Text>
                  </View>}

              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
                  <View style={[styles.dot, { backgroundColor: item.isOnline ? colors.success : colors.textDisabled }]} />
                </View>
                <Text style={styles.meta}>
                  {item.rating != null ? `⭐ ${item.rating.toFixed(1)}` : '⭐ —'}
                  {' · '}
                  {item.totalRides} rides
                </Text>
                <Text style={styles.vehicle}>
                  🚗 {item.vehicleMake} {item.vehicleModel}{item.vehiclePlate ? ` · ${item.vehiclePlate}` : ''}
                </Text>
              </View>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.callBtn]}
                onPress={() => handleCall(item)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Call ${item.firstName}`}>
                <Text style={styles.actionBtnText}>📞  Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.rideBtn]}
                onPress={() => handleRequestRide(item)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Request a ride from ${item.firstName}`}>
                <Text style={[styles.actionBtnText, { color: '#fff' }]}>🚕  Request Ride</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => handleRemove(item)}
              disabled={removingId === item.driverId}
              activeOpacity={0.6}>
              <Text style={styles.removeText}>
                {removingId === item.driverId ? '…' : 'Remove from saved'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerBack:  { fontSize: 30, color: c.primary, paddingHorizontal: 8 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: c.text },

    list:     { padding: 16, gap: 12 },
    emptyWrap:{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    empty:    { alignItems: 'center' },
    emptyIcon:{ fontSize: 56, marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8 },
    emptyText:  { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20 },

    card: {
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center' },

    avatar: { width: 56, height: 56, borderRadius: 28 },
    avatarFallback: {
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },

    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name:    { fontSize: 16, fontWeight: '700', color: c.text },
    dot:     { width: 8, height: 8, borderRadius: 4 },
    meta:    { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    vehicle: { fontSize: 13, color: c.textSecondary, marginTop: 2 },

    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
    },
    actionBtn: {
      flex: 1,
      height: 42,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    callBtn: {
      backgroundColor: c.surfaceAlt ?? c.surface,
      borderWidth: 1,
      borderColor: c.primary,
    },
    rideBtn: { backgroundColor: c.primary },
    actionBtnText: { fontSize: 14, fontWeight: '700', color: c.primary },

    removeBtn: { alignItems: 'center', marginTop: 8, padding: 6 },
    removeText:{ fontSize: 12, color: c.textSecondary },
  });
}
