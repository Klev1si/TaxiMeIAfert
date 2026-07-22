import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, ScrollView, Modal, TextInput, KeyboardAvoidingView,
  Platform, Pressable, PermissionsAndroid,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { savedLocationsApi, type SavedLocation } from '../../api/saved-locations';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import { useTranslation } from '../../i18n';
import { searchPlaces, type PlaceResult } from '../../services/geocoding';
import type { ColorPalette } from '../../constants/colors';

// ── Label quick-suggestions ───────────────────────────────────────────────────

// Suffixes of the i18n keys client.savedLocations.suggest<Name>
const SUGGESTIONS = ['Home', 'Work', 'Gym', 'School', 'Airport', 'Other'];

function labelEmoji(label: string): string {
  const l = label.toLowerCase();
  // Match the label in any supported language (en / sq / es / fr)
  if (['home', 'shtëpi', 'shtepi', 'casa', 'maison'].some(w => l.includes(w)))            return '🏠';
  if (['work', 'punë', 'pune', 'trabajo', 'travail'].some(w => l.includes(w)))            return '💼';
  if (['gym', 'palestër', 'palester', 'gimnasio', 'salle de sport'].some(w => l.includes(w))) return '🏋️';
  if (['school', 'shkollë', 'shkolle', 'escuela', 'école', 'ecole'].some(w => l.includes(w))) return '🎓';
  if (['airport', 'aeroport', 'aeropuerto', 'aéroport'].some(w => l.includes(w)))         return '✈️';
  return '📍';
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

interface EditModalProps {
  visible: boolean;
  initial?: SavedLocation | null;
  onClose: () => void;
  onSaved: (loc: SavedLocation) => void;
}

function EditModal({ visible, initial, onClose, onSaved }: EditModalProps) {
  const isEdit = !!initial;
  const colors = useColors();
  const modal = useMemo(() => getModalStyles(colors), [colors]);
  const { t } = useTranslation();
  const [label,    setLabel]    = useState('');
  const [address,  setAddress]  = useState('');
  const [lat,      setLat]      = useState<number | null>(null);
  const [lng,      setLng]      = useState<number | null>(null);
  const [gpsState, setGpsState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (isEdit && initial) {
      setLabel(initial.label);
      setAddress(initial.address ?? '');
      setLat(initial.lat);
      setLng(initial.lng);
      setGpsState('done');
    } else {
      setLabel('');
      setAddress('');
      setLat(null);
      setLng(null);
      setGpsState('idle');
    }
    setSaving(false);
  }, [visible]);

  const fetchGps = async () => {
    setGpsState('loading');

    if (Platform.OS === 'android') {
      try {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location permission',
            message: 'Allow access to your current location to save it.',
            buttonPositive: 'OK',
          },
        );
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          setGpsState('error');
          return;
        }
      } catch {
        setGpsState('error');
        return;
      }
    }

    const onSuccess = (pos: { coords: { latitude: number; longitude: number } }) => {
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
      setGpsState('done');
    };

    // Try high-accuracy first; fall back to low-accuracy if it times out
    // (mirrors the pattern used in ClientHomeScreen).
    Geolocation.getCurrentPosition(
      onSuccess,
      () => {
        Geolocation.getCurrentPosition(
          onSuccess,
          () => setGpsState('error'),
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  // ── Address-search fallback (for when GPS fails / is denied) ──────────────
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [searching,     setSearching]     = useState(false);

  const doAddressSearch = async () => {
    const q = address.trim();
    if (q.length < 2) {
      Alert.alert(t('common.validation'), t('client.savedLocations.typeMoreChars'));
      return;
    }
    setSearching(true);
    const results = await searchPlaces(q);
    setSearching(false);
    setSearchResults(results);
    if (results.length === 0) {
      Alert.alert(t('client.savedLocations.noMatchesTitle'), t('client.savedLocations.noMatchesMsg'));
    }
  };

  const pickSearchResult = (r: PlaceResult) => {
    setLat(r.lat);
    setLng(r.lng);
    setAddress(r.shortLabel);
    setGpsState('done');
    setSearchResults([]);
  };

  const handleSave = async () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel)  { Alert.alert(t('common.validation'), t('client.savedLocations.labelRequired')); return; }
    if (lat == null || lng == null) { Alert.alert(t('common.validation'), t('client.savedLocations.locationRequired')); return; }

    setSaving(true);
    try {
      const payload = {
        label:   trimmedLabel,
        address: address.trim() || undefined,
        lat,
        lng,
      };
      if (isEdit && initial) {
        const { data } = await savedLocationsApi.update(initial.id, payload);
        onSaved(data);
      } else {
        const { data } = await savedLocationsApi.create(payload);
        onSaved(data);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('client.savedLocations.saveErrorMsg');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modal.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <Pressable style={modal.sheet} onPress={() => {}}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Text style={modal.title}>{isEdit ? t('client.savedLocations.editTitle') : t('client.savedLocations.addTitle')}</Text>

            {/* Label suggestions */}
            <Text style={modal.fieldLabel}>{t('client.savedLocations.labelField')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={modal.chipRow}>
              {SUGGESTIONS.map(s => {
                const sugLabel = t(`client.savedLocations.suggest${s}`);
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setLabel(sugLabel)}
                    style={[modal.chip, label === sugLabel && modal.chipActive]}
                    accessibilityRole="radio"
                    accessibilityLabel={`Label: ${sugLabel}`}
                    accessibilityState={{ checked: label === sugLabel }}>
                    <Text style={[modal.chipText, label === sugLabel && modal.chipTextActive]}>
                      {labelEmoji(sugLabel)} {sugLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TextInput
              style={modal.input}
              value={label}
              onChangeText={setLabel}
              placeholder={t('client.savedLocations.customLabelPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              maxLength={40}
              returnKeyType="next"
              accessibilityLabel="Custom location label"
            />

            {/* Address (display name) */}
            <Text style={[modal.fieldLabel, { marginTop: 12 }]}>{t('client.savedLocations.addressField')}</Text>
            <TextInput
              style={modal.input}
              value={address}
              onChangeText={setAddress}
              placeholder={t('client.savedLocations.addressPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              maxLength={200}
              returnKeyType="done"
              accessibilityLabel="Address or notes, optional"
            />

            {/* GPS */}
            <Text style={[modal.fieldLabel, { marginTop: 12 }]}>{t('client.savedLocations.coordsField')}</Text>
            {gpsState === 'done' && lat != null ? (
              <View style={modal.gpsRow}>
                <Text style={modal.gpsCoords}>
                  📍 {lat.toFixed(5)}, {lng!.toFixed(5)}
                </Text>
                <TouchableOpacity
                  onPress={fetchGps}
                  accessibilityRole="button"
                  accessibilityLabel="Update GPS coordinates">
                  <Text style={modal.gpsRetry}>↻ Update</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[modal.gpsBtn, gpsState === 'loading' && { opacity: 0.6 }]}
                onPress={fetchGps}
                disabled={gpsState === 'loading'}
                accessibilityRole="button"
                accessibilityLabel={gpsState === 'error' ? 'Retry GPS location' : 'Use current GPS location'}
                accessibilityState={{ disabled: gpsState === 'loading' }}>
                {gpsState === 'loading'
                  ? <ActivityIndicator color={colors.primary} size="small" />
                  : <Text style={modal.gpsBtnText}>
                      {gpsState === 'error' ? `⚠️ ${t('client.savedLocations.retryGpsBtn')}` : `📍 ${t('client.savedLocations.useCurrentBtn')}`}
                    </Text>}
              </TouchableOpacity>
            )}
            {gpsState === 'error' && (
              <Text style={modal.gpsError}>{t('client.savedLocations.gpsErrorMsg')}</Text>
            )}

            {/* Address-search fallback — works when GPS is off / denied */}
            <TouchableOpacity
              style={[modal.gpsBtn, { marginTop: 8, opacity: searching ? 0.6 : 1 }]}
              onPress={doAddressSearch}
              disabled={searching}
              accessibilityRole="button"
              accessibilityLabel="Find this address on the map">
              {searching
                ? <ActivityIndicator color={colors.primary} size="small" />
                : <Text style={modal.gpsBtnText}>🔍 Find address on the map</Text>}
            </TouchableOpacity>
            {searchResults.length > 0 && (
              <View style={{
                marginTop: 6, borderRadius: 10,
                borderWidth: 1, borderColor: colors.border,
                backgroundColor: colors.surface,
                maxHeight: 200,
              }}>
                <ScrollView keyboardShouldPersistTaps="handled">
                  {searchResults.map((r, idx) => (
                    <TouchableOpacity
                      key={`${r.lat},${r.lng},${idx}`}
                      style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                      onPress={() => pickSearchResult(r)}
                      activeOpacity={0.7}>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                        📍 {r.shortLabel}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                        {r.displayName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={modal.actions}>
              <TouchableOpacity
                style={modal.btnCancel}
                onPress={onClose}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                accessibilityState={{ disabled: saving }}>
                <Text style={modal.btnCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modal.btnSave, (saving || lat == null) && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={saving || lat == null}
                accessibilityRole="button"
                accessibilityLabel="Save location"
                accessibilityState={{ disabled: saving || lat == null }}>
                {saving
                  ? <ActivityIndicator color={colors.textOnPrimary} />
                  : <Text style={modal.btnSaveText}>{t('common.save')}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SavedLocationsScreen() {
  const navigation = useNavigation();
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState<SavedLocation | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await savedLocationsApi.list();
      setLocations(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (loc: SavedLocation) => {
    Alert.alert(t('client.savedLocations.deleteTitle'), t('client.savedLocations.deleteMsg', { label: loc.label }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          try {
            await savedLocationsApi.remove(loc.id);
            setLocations(prev => prev.filter(l => l.id !== loc.id));
          } catch {
            Alert.alert(t('common.error'), t('client.savedLocations.deleteErrorMsg'));
          }
        },
      },
    ]);
  };

  const handleSaved = (saved: SavedLocation) => {
    setLocations(prev => {
      const exists = prev.findIndex(l => l.id === saved.id);
      if (exists >= 0) {
        const next = [...prev];
        next[exists] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setModalOpen(false);
    setEditing(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('client.savedLocations.title')}</Text>
        <TouchableOpacity
          onPress={() => { setEditing(null); setModalOpen(true); }}
          style={styles.addBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Add new saved location">
          <Text style={styles.addBtnText}>{t('client.savedLocations.addBtn')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {locations.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📍</Text>
              <Text style={styles.emptyTitle}>{t('client.savedLocations.emptyTitle')}</Text>
              <Text style={styles.emptySub}>
                {t('client.savedLocations.emptyHint')}
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => { setEditing(null); setModalOpen(true); }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Add first saved location">
                <Text style={styles.emptyBtnText}>{t('client.savedLocations.addFirstBtn')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.list}>
              {locations.map(loc => (
                <View key={loc.id} style={styles.card}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.cardEmoji}>{labelEmoji(loc.label)}</Text>
                    <View style={styles.cardText}>
                      <Text style={styles.cardLabel}>{loc.label}</Text>
                      {loc.address ? (
                        <Text style={styles.cardAddr} numberOfLines={1}>{loc.address}</Text>
                      ) : (
                        <Text style={styles.cardCoords}>
                          {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      onPress={() => { setEditing(loc); setModalOpen(true); }}
                      style={styles.iconBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${loc.label}`}>
                      <Text style={styles.editIcon}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(loc)}
                      style={styles.iconBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${loc.label}`}>
                      <Text style={styles.deleteIcon}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <EditModal
        visible={modalOpen}
        initial={editing}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSaved={handleSaved}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Sizes.screenPadding,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 64 },
  backArrow: { fontSize: 28, color: c.text, lineHeight: 32, marginRight: 2 },
  backLabel: { fontSize: 15, color: c.text, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: c.text },
  addBtn: { width: 64, alignItems: 'flex-end' },
  addBtnText: { fontSize: 15, fontWeight: '700', color: c.primary },

  scroll: { padding: Sizes.screenPadding },

  empty: { alignItems: 'center', paddingTop: 64 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: c.text, marginBottom: 8 },
  emptySub: {
    fontSize: 14, color: c.textSecondary, textAlign: 'center',
    lineHeight: 20, paddingHorizontal: 24, marginBottom: 28,
  },
  emptyBtn: {
    height: 48, paddingHorizontal: 24, borderRadius: 14,
    backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: c.textOnPrimary },

  list: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardEmoji: { fontSize: 28, marginRight: 14 },
  cardText: { flex: 1 },
  cardLabel: { fontSize: 16, fontWeight: '700', color: c.text },
  cardAddr: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
  cardCoords: { fontSize: 12, color: c.textDisabled, marginTop: 2, fontFamily: 'monospace' },
  cardActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 4 },
  editIcon: { fontSize: 18 },
  deleteIcon: { fontSize: 18 },
}); }

function getModalStyles(c: ColorPalette) { return StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: c.overlay,
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sheet: {
    backgroundColor: c.background, borderRadius: 20,
    padding: 24, width: '100%', maxWidth: 420,
    maxHeight: '85%',
  },
  title: {
    fontSize: 18, fontWeight: '800', color: c.text,
    marginBottom: 16, textAlign: 'center',
  },
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: c.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
  },
  chipRow: { marginBottom: 10 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8,
    backgroundColor: c.surfaceAlt, borderWidth: 1.5, borderColor: c.border,
  },
  chipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  chipTextActive: { color: c.textOnPrimary },
  input: {
    height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: c.border,
    paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.surface,
  },
  gpsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  gpsCoords: { fontSize: 13, color: c.text, fontWeight: '500' },
  gpsRetry: { fontSize: 13, color: c.primary, fontWeight: '700' },
  gpsBtn: {
    height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: c.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  gpsBtnText: { fontSize: 14, fontWeight: '600', color: c.primary },
  gpsError: { fontSize: 12, color: c.error, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btnCancel: {
    flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5,
    borderColor: c.border, alignItems: 'center', justifyContent: 'center',
  },
  btnCancelText: { fontSize: 15, fontWeight: '700', color: c.textSecondary },
  btnSave: {
    flex: 1, height: 48, borderRadius: 12,
    backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
  },
  btnSaveText: { fontSize: 15, fontWeight: '700', color: c.textOnPrimary },
}); }
