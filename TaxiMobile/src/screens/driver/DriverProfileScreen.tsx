import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { useDriverStore } from '../../stores/driverStore';
import { authApi } from '../../api/auth';
import { Colors, Sizes } from '../../constants';

type DriverProfile = {
  phone: string; role: string;
  firstName: string | null; lastName: string | null; rating: number | null;
  isApproved: boolean;
  licenseNumber: string | null;
  vehicleMake: string | null; vehicleModel: string | null;
  vehiclePlate: string | null; vehicleColor: string | null;
  vehicleYear: number | null;
};

export default function DriverProfileScreen() {
  const { user, logout } = useAuthStore();
  const { isOnline } = useDriverStore();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    authApi.getMe()
      .then(({ data }) => setProfile(data as DriverProfile))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try { await logout(); } finally { setLoggingOut(false); }
        },
      },
    ]);
  };

  const displayName = profile?.firstName
    ? `${profile.firstName} ${profile.lastName ?? ''}`.trim()
    : user?.phone ?? '—';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Avatar + name */}
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(profile?.firstName?.[0] ?? user?.phone?.[0] ?? '?').toUpperCase()}
            </Text>
          </View>
          {loading
            ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 12 }} />
            : <Text style={styles.name}>{displayName}</Text>}

          {/* Online badge */}
          <View style={[styles.onlineBadge, { backgroundColor: isOnline ? Colors.success + '22' : Colors.surfaceAlt }]}>
            <View style={[styles.onlineDot, { backgroundColor: isOnline ? Colors.success : Colors.textDisabled }]} />
            <Text style={[styles.onlineText, { color: isOnline ? Colors.success : Colors.textSecondary }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>

          {profile?.rating != null && (
            <View style={styles.ratingRow}>
              <Text style={styles.ratingStar}>⭐</Text>
              <Text style={styles.ratingValue}>{profile.rating.toFixed(1)}</Text>
              <Text style={styles.ratingLabel}> driver rating</Text>
            </View>
          )}
        </View>

        {/* Approval status */}
        {profile && !profile.isApproved && (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingText}>
              ⏳ Your account is pending admin approval. You will not receive ride requests until approved.
            </Text>
          </View>
        )}

        {/* Account info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <InfoRow label="Phone" value={user?.phone ?? '—'} />
          <InfoRow label="Role"  value="Driver" />
          <InfoRow label="Status" value={profile?.isApproved ? '✅ Approved' : '⏳ Pending'} />
          {profile?.licenseNumber && (
            <InfoRow label="License" value={profile.licenseNumber} />
          )}
        </View>

        {/* Vehicle info */}
        {profile && (profile.vehicleMake || profile.vehicleModel) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Vehicle</Text>
            {profile.vehicleMake && profile.vehicleModel && (
              <InfoRow
                label="Car"
                value={`${profile.vehicleMake} ${profile.vehicleModel}${profile.vehicleYear ? ` (${profile.vehicleYear})` : ''}`}
              />
            )}
            {profile.vehiclePlate && (
              <InfoRow label="Plate"  value={profile.vehiclePlate} />
            )}
            {profile.vehicleColor && (
              <InfoRow label="Color"  value={profile.vehicleColor} />
            )}
          </View>
        )}

        {/* Sign out */}
        <TouchableOpacity
          style={[styles.logoutBtn, loggingOut && styles.logoutBtnDisabled]}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.8}>
          {loggingOut
            ? <ActivityIndicator color={Colors.error} />
            : <Text style={styles.logoutText}>Sign Out</Text>}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  label: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  value: { fontSize: 14, color: Colors.text, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Sizes.screenPadding },

  avatarWrap: { alignItems: 'center', paddingVertical: 32 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText: { fontSize: 36, fontWeight: '800', color: Colors.textOnPrimary },
  name: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 8 },

  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 8,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  onlineText: { fontSize: 13, fontWeight: '700' },

  ratingRow: { flexDirection: 'row', alignItems: 'center' },
  ratingStar: { fontSize: 16 },
  ratingValue: { fontSize: 16, fontWeight: '700', color: Colors.text, marginLeft: 4 },
  ratingLabel: { fontSize: 13, color: Colors.textSecondary },

  pendingBox: {
    backgroundColor: Colors.warningLight,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.warning,
    marginBottom: 20,
  },
  pendingText: { fontSize: 13, color: Colors.text, lineHeight: 20 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },

  logoutBtn: {
    height: 50,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  logoutBtnDisabled: { opacity: 0.5 },
  logoutText: { fontSize: 16, fontWeight: '700', color: Colors.error },
});
