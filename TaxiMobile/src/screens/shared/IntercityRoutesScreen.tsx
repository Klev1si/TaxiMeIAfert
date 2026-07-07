/**
 * IntercityRoutesScreen
 *
 * Lets solo drivers and companies manage their fixed intercity fares
 * (e.g. Prizren → Prishtina = €50). When a rider requests a trip whose
 * pickup and dropoff fall inside the from/to city radii, the flat fare
 * overrides the tariff formula.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { intercityRoutesApi, type IntercityRoute } from '../../api/intercityRoutes';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';

interface Draft {
  id?:           string;
  fromCity:      string;
  fromLat:       string;
  fromLng:       string;
  fromRadiusKm:  string;
  toCity:        string;
  toLat:         string;
  toLng:         string;
  toRadiusKm:    string;
  flatFare:      string;
  bidirectional: boolean;
}

const emptyDraft = (): Draft => ({
  fromCity: '', fromLat: '', fromLng: '', fromRadiusKm: '8',
  toCity:   '', toLat:   '', toLng:   '', toRadiusKm:   '8',
  flatFare: '', bidirectional: true,
});

export default function IntercityRoutesScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();

  const [routes,   setRoutes]   = useState<IntercityRoute[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState<Draft | null>(null);
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await intercityRoutesApi.listMine();
      setRoutes(data);
    } catch {
      /* silent — show empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => setModal(emptyDraft());
  const openEdit   = (r: IntercityRoute) => setModal({
    id: r.id,
    fromCity: r.fromCity,
    fromLat:  String(r.fromLat),
    fromLng:  String(r.fromLng),
    fromRadiusKm: String(r.fromRadiusKm),
    toCity:   r.toCity,
    toLat:    String(r.toLat),
    toLng:    String(r.toLng),
    toRadiusKm: String(r.toRadiusKm),
    flatFare: String(r.flatFare),
    bidirectional: r.bidirectional,
  });

  const handleSave = async () => {
    if (!modal) return;
    const dto = {
      fromCity: modal.fromCity.trim(),
      fromLat:  Number(modal.fromLat),
      fromLng:  Number(modal.fromLng),
      fromRadiusKm: Number(modal.fromRadiusKm) || 8,
      toCity:   modal.toCity.trim(),
      toLat:    Number(modal.toLat),
      toLng:    Number(modal.toLng),
      toRadiusKm: Number(modal.toRadiusKm) || 8,
      flatFare: Number(modal.flatFare),
      bidirectional: modal.bidirectional,
    };
    if (!dto.fromCity || !dto.toCity) {
      Alert.alert(t('common.error'), 'Enter both city names.');
      return;
    }
    if (!dto.flatFare || dto.flatFare <= 0) {
      Alert.alert(t('common.error'), 'Flat fare must be positive.');
      return;
    }
    if (![dto.fromLat, dto.fromLng, dto.toLat, dto.toLng].every(Number.isFinite)) {
      Alert.alert(t('common.error'), 'City coordinates must be valid numbers.');
      return;
    }
    setSaving(true);
    try {
      if (modal.id) await intercityRoutesApi.update(modal.id, dto);
      else          await intercityRoutesApi.create(dto);
      setModal(null);
      await load();
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.response?.data?.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (r: IntercityRoute) => {
    Alert.alert(
      'Delete route?',
      `${r.fromCity} → ${r.toCity} · $${Number(r.flatFare).toFixed(2)}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive',
          onPress: async () => {
            try { await intercityRoutesApi.remove(r.id); load(); }
            catch { Alert.alert(t('common.error'), 'Delete failed.'); }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Intercity Fares</Text>
        <TouchableOpacity onPress={openCreate}>
          <Text style={styles.addBtn}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        Fixed prices for popular routes (e.g. Prizren → Prishtina). When a
        rider's pickup and dropoff both fall inside the city radii, this
        flat fare replaces the normal per-km calculation.
      </Text>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>
      ) : routes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🚙</Text>
          <Text style={styles.emptyText}>No intercity routes yet.</Text>
          <Text style={styles.emptySub}>Tap "+ Add" to create your first fixed-fare route.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {routes.map(r => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.route}>{r.fromCity} → {r.toCity}</Text>
                  <Text style={styles.meta}>
                    {r.bidirectional ? '↔ both directions' : '→ one-way'} ·
                    {' '}from {r.fromRadiusKm}km · to {r.toRadiusKm}km
                  </Text>
                </View>
                <Text style={styles.fare}>${Number(r.flatFare).toFixed(2)}</Text>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => openEdit(r)}>
                  <Text style={styles.editBtn}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(r)}>
                  <Text style={styles.deleteBtn}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── Create / Edit modal ─────────────────────────────────────── */}
      <Modal visible={modal !== null} animationType="slide" onRequestClose={() => setModal(null)}>
        {modal && (
          <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.header}>
                <TouchableOpacity onPress={() => setModal(null)}>
                  <Text style={styles.back}>‹ {t('common.cancel')}</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{modal.id ? 'Edit Route' : 'New Route'}</Text>
                <View style={{ width: 60 }} />
              </View>

              <ScrollView contentContainerStyle={styles.form}>
                <Text style={styles.section}>From city</Text>
                <Field label="City name" value={modal.fromCity}
                  onChange={v => setModal({ ...modal, fromCity: v })} placeholder="Prizren" />
                <Row>
                  <Field label="Latitude" value={modal.fromLat}
                    onChange={v => setModal({ ...modal, fromLat: v })} keyboardType="numbers-and-punctuation"
                    placeholder="42.2139" />
                  <Field label="Longitude" value={modal.fromLng}
                    onChange={v => setModal({ ...modal, fromLng: v })} keyboardType="numbers-and-punctuation"
                    placeholder="20.7397" />
                </Row>
                <Field label="Radius (km)" value={modal.fromRadiusKm}
                  onChange={v => setModal({ ...modal, fromRadiusKm: v })} keyboardType="numeric"
                  placeholder="8" />

                <Text style={styles.section}>To city</Text>
                <Field label="City name" value={modal.toCity}
                  onChange={v => setModal({ ...modal, toCity: v })} placeholder="Prishtina" />
                <Row>
                  <Field label="Latitude" value={modal.toLat}
                    onChange={v => setModal({ ...modal, toLat: v })} keyboardType="numbers-and-punctuation"
                    placeholder="42.6629" />
                  <Field label="Longitude" value={modal.toLng}
                    onChange={v => setModal({ ...modal, toLng: v })} keyboardType="numbers-and-punctuation"
                    placeholder="21.1655" />
                </Row>
                <Field label="Radius (km)" value={modal.toRadiusKm}
                  onChange={v => setModal({ ...modal, toRadiusKm: v })} keyboardType="numeric"
                  placeholder="8" />

                <Text style={styles.section}>Fare</Text>
                <Field label="Flat fare ($)" value={modal.flatFare}
                  onChange={v => setModal({ ...modal, flatFare: v })} keyboardType="numeric"
                  placeholder="50" />

                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>Both directions</Text>
                    <Text style={styles.switchSub}>
                      Also apply this fare for the return trip ({modal.toCity || 'B'} → {modal.fromCity || 'A'}).
                    </Text>
                  </View>
                  <Switch
                    value={modal.bidirectional}
                    onValueChange={v => setModal({ ...modal, bidirectional: v })}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.5 }]}
                  onPress={handleSave}
                  disabled={saving}>
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.saveBtnText}>{modal.id ? t('common.save') : 'Create'}</Text>}
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

// ── Field helpers ───────────────────────────────────────────────────────────

function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 10 }}>{children}</View>;
}

function Field({
  label, value, onChange, placeholder, keyboardType,
}: {
  label:       string;
  value:       string;
  onChange:    (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'numbers-and-punctuation';
}) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={keyboardType === 'default' ? 'words' : 'none'}
      />
    </View>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:     { flex: 1, backgroundColor: c.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header:   {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    back:     { color: c.primary, fontSize: 16 },
    title:    { color: c.text, fontSize: 17, fontWeight: '700' },
    addBtn:   { color: c.primary, fontSize: 15, fontWeight: '600' },
    hint:     { color: c.textSecondary, fontSize: 13, paddingHorizontal: 16, paddingVertical: 12, lineHeight: 18 },
    empty:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    emptyIcon:{ fontSize: 48, marginBottom: 12 },
    emptyText:{ color: c.text, fontSize: 16, fontWeight: '600', textAlign: 'center' },
    emptySub: { color: c.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 6 },
    list:     { padding: 16, gap: 12 },
    card:     { backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border },
    cardHeader:{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    route:    { color: c.text, fontSize: 16, fontWeight: '700' },
    meta:     { color: c.textSecondary, fontSize: 12, marginTop: 4 },
    fare:     { color: c.primary, fontSize: 18, fontWeight: '800' },
    cardActions:{ flexDirection: 'row', gap: 20, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border },
    editBtn:  { color: c.primary, fontWeight: '600' },
    deleteBtn:{ color: c.error, fontWeight: '600' },
    form:     { padding: 16, gap: 12 },
    section:  { color: c.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 10 },
    fieldLabel:{ color: c.textSecondary, fontSize: 12, marginBottom: 4 },
    input:    { backgroundColor: c.surface, color: c.text, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: c.border },
    switchRow:{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
    switchLabel:{ color: c.text, fontSize: 15, fontWeight: '600' },
    switchSub:{ color: c.textSecondary, fontSize: 12, marginTop: 2 },
    saveBtn:  { backgroundColor: c.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
    saveBtnText:{ color: '#fff', fontWeight: '700', fontSize: 16 },
  });
}
