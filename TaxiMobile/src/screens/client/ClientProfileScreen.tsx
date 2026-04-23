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
import { authApi } from '../../api/auth';
import { Colors, Sizes } from '../../constants';

type Profile = {
  phone: string; role: string;
  firstName: string | null; lastName: string | null; rating: number | null;
};

export default function ClientProfileScreen() {
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    authApi.getMe()
      .then(({ data }) => setProfile(data as Profile))
      .catch(() => {/* show whatever we have from the store */})
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
          // RootNavigator redirects to Auth automatically
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

        {/* Avatar */}
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(profile?.firstName?.[0] ?? user?.phone?.[0] ?? '?').toUpperCase()}
            </Text>
          </View>
          {loading
            ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 12 }} />
            : <Text style={styles.name}>{displayName}</Text>}
          {profile?.rating != null && (
            <View style={styles.ratingRow}>
              <Text style={styles.ratingStar}>⭐</Text>
              <Text style={styles.ratingValue}>{profile.rating.toFixed(1)}</Text>
              <Text style={styles.ratingLabel}> passenger rating</Text>
            </View>
          )}
        </View>

        {/* Info card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <InfoRow label="Phone"   value={user?.phone ?? '—'} />
          <InfoRow label="Role"    value="Passenger" />
          {profile?.firstName && (
            <InfoRow label="Name" value={`${profile.firstName} ${profile.lastName ?? ''}`.trim()} />
          )}
        </View>

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
      <Text style={rowStyles.value}>{value}</Text>
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
  name: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 6 },
  ratingRow: { flexDirection: 'row', alignItems: 'center' },
  ratingStar: { fontSize: 16 },
  ratingValue: { fontSize: 16, fontWeight: '700', color: Colors.text, marginLeft: 4 },
  ratingLabel: { fontSize: 13, color: Colors.textSecondary },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
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
  },
  logoutBtnDisabled: { opacity: 0.5 },
  logoutText: { fontSize: 16, fontWeight: '700', color: Colors.error },
});
