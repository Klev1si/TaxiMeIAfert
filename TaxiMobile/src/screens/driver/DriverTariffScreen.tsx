/**
 * DriverTariffScreen
 *
 * Solo drivers (no company) can set their own taximeter rates here:
 *   - Base fare      (initial drop charge)
 *   - Per-km rate    (cost per kilometer driven)
 *   - Per-minute rate (cost per minute elapsed)
 *   - Minimum fare   (floor — ride can never cost less than this)
 *
 * Drivers attached to a company see a read-only notice that the company
 * controls their tariff. The backend returns 403 if a company-driver POSTs.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { driverTariffApi, DriverTariff } from '../../api/driver-tariff';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { useTranslation } from '../../i18n';
import type { DriverProfileStackScreenProps } from '../../navigation/types';

type Props = DriverProfileStackScreenProps<'DriverTariff'>;

interface FormState {
  name:          string;
  baseFare:      string;
  perKmRate:     string;
  perMinuteRate: string;
  minimumFare:   string;
}

const EMPTY_FORM: FormState = {
  name:          'My Tariff',
  baseFare:      '2.00',
  perKmRate:     '0.80',
  perMinuteRate: '0.20',
  minimumFare:   '3.00',
};

export default function DriverTariffScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [companyLock, setCompanyLock] = useState(false);
  const [tariffId,    setTariffId]    = useState<string | null>(null);
  const [form,        setForm]        = useState<FormState>(EMPTY_FORM);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await driverTariffApi.list();
        if (cancelled) return;
        const existing: DriverTariff | undefined = data[0];
        if (existing) {
          setTariffId(existing.id);
          setForm({
            name:          existing.name,
            baseFare:      String(existing.baseFare),
            perKmRate:     String(existing.perKmRate),
            perMinuteRate: String(existing.perMinuteRate),
            minimumFare:   String(existing.minimumFare),
          });
        }
      } catch {
        // 200 with [] is the empty case — only network errors land here, ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    const baseFare      = parseFloat(form.baseFare);
    const perKmRate     = parseFloat(form.perKmRate);
    const perMinuteRate = parseFloat(form.perMinuteRate);
    const minimumFare   = parseFloat(form.minimumFare);

    if (!form.name.trim())            { Alert.alert(t('common.validation'), 'Tariff name is required.'); return; }
    if (!Number.isFinite(baseFare)      || baseFare      < 0) { Alert.alert(t('common.validation'), 'Base fare must be 0 or higher.'); return; }
    if (!Number.isFinite(perKmRate)     || perKmRate     < 0) { Alert.alert(t('common.validation'), 'Per-km rate must be 0 or higher.'); return; }
    if (!Number.isFinite(perMinuteRate) || perMinuteRate < 0) { Alert.alert(t('common.validation'), 'Per-minute rate must be 0 or higher.'); return; }
    if (!Number.isFinite(minimumFare)   || minimumFare   < 0) { Alert.alert(t('common.validation'), 'Minimum fare must be 0 or higher.'); return; }

    setSaving(true);
    try {
      const { data } = await driverTariffApi.upsert({
        name: form.name.trim(),
        baseFare,
        perKmRate,
        perMinuteRate,
        minimumFare,
      });
      setTariffId(data.id);
      Alert.alert(t('common.success'), 'Your tariff has been saved. It will apply to your next ride.');
    } catch (err: any) {
      // Company driver — backend returns 403 with a helpful message
      if (err?.response?.status === 403) {
        setCompanyLock(true);
        Alert.alert(
          'Company-managed',
          err?.response?.data?.message ?? 'Your tariff is managed by your company. Contact your company admin to change it.',
        );
      } else {
        Alert.alert(t('common.error'), err?.response?.data?.message ?? 'Failed to save tariff.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // ── Live preview — show a sample fare so the driver sees what their tariff means
  const preview = (km: number, min: number): string => {
    const b = parseFloat(form.baseFare)      || 0;
    const k = parseFloat(form.perKmRate)     || 0;
    const m = parseFloat(form.perMinuteRate) || 0;
    const f = parseFloat(form.minimumFare)   || 0;
    return `$${Math.max(b + km * k + min * m, f).toFixed(2)}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Text style={styles.headerBack}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Tariff</Text>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {companyLock && (
            <View style={styles.lockCard}>
              <Text style={styles.lockTitle}>🔒 Company-managed</Text>
              <Text style={styles.lockText}>
                Your tariff is set by your company. Only the company admin can change it.
              </Text>
            </View>
          )}

          <Text style={styles.hint}>
            Set your own taximeter rates. The fare is computed as:{'\n'}
            <Text style={styles.formula}>
              fare = max(baseFare + km × perKmRate + min × perMinuteRate, minimumFare)
            </Text>
          </Text>

          <Field label="Name"             value={form.name}
            onChangeText={v => setForm(f => ({ ...f, name: v }))}
            placeholder="e.g. My Tariff" />
          <Field label="Base fare ($)"    value={form.baseFare}
            onChangeText={v => setForm(f => ({ ...f, baseFare: v }))} keyboardType="decimal-pad" />
          <Field label="Per km ($)"       value={form.perKmRate}
            onChangeText={v => setForm(f => ({ ...f, perKmRate: v }))} keyboardType="decimal-pad" />
          <Field label="Per minute ($)"   value={form.perMinuteRate}
            onChangeText={v => setForm(f => ({ ...f, perMinuteRate: v }))} keyboardType="decimal-pad" />
          <Field label="Minimum fare ($)" value={form.minimumFare}
            onChangeText={v => setForm(f => ({ ...f, minimumFare: v }))} keyboardType="decimal-pad" />

          {/* Live preview */}
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Example fares</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>2 km · 5 min</Text>
              <Text style={styles.previewValue}>{preview(2, 5)}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>5 km · 12 min</Text>
              <Text style={styles.previewValue}>{preview(5, 12)}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>10 km · 25 min</Text>
              <Text style={styles.previewValue}>{preview(10, 25)}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || companyLock}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('common.save')}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>{tariffId ? 'Update Tariff' : 'Save Tariff'}</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────
function Field({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'decimal-pad' | 'default';
}) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
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

    scroll: { padding: 16, paddingBottom: 48 },

    hint: { fontSize: 13, color: c.textSecondary, marginBottom: 16, lineHeight: 18 },
    formula: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: c.text },

    lockCard: {
      backgroundColor: c.warningLight ?? '#FEF3C7',
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: c.warning ?? '#F59E0B',
    },
    lockTitle: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 4 },
    lockText:  { fontSize: 13, color: c.textSecondary, lineHeight: 18 },

    fieldWrap: { marginBottom: 14 },
    fieldLabel: {
      fontSize: 12, color: c.textSecondary, fontWeight: '600',
      textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
    },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
    },

    previewCard: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      marginTop: 8,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: c.border,
    },
    previewTitle: {
      fontSize: 12, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
    },
    previewRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    previewLabel: { fontSize: 13, color: c.text },
    previewValue: { fontSize: 14, fontWeight: '700', color: c.primary, fontVariant: ['tabular-nums'] },

    saveBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
