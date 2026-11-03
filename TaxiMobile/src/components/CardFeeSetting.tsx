/**
 * Super-admin: the card fee — % the platform keeps from every card-paid ride
 * (all drivers and contracts; company drivers keep their agreed %, the fee
 * comes out of the company's share). Past rides keep the fee they were paid with.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import apiClient from '../api/client';
import { useColors } from '../stores/themeStore';
import type { ColorPalette } from '../constants/colors';
import { useTranslation } from '../i18n';

export default function CardFeeSetting() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [saved, setSaved]   = useState<number | null>(null);
  const [value, setValue]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get<{ cardFeePct: number }>('/admin/platform-fees')
      .then(({ data }) => { setSaved(data.cardFeePct); setValue(String(data.cardFeePct)); })
      .catch(() => { /* hidden until it loads */ });
  }, []);

  const num   = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && num >= 0 && num <= 50;
  const dirty = saved != null && num !== saved;

  const save = () => {
    if (!valid || !dirty) return;
    Alert.alert(t('contract.cardFeeTitle'), t('contract.cardFeeConfirm', { from: saved ?? 0, to: num }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.ok'),
        onPress: async () => {
          setSaving(true);
          try {
            const { data } = await apiClient.put<{ cardFeePct: number }>('/admin/platform-fees', { cardFeePct: num });
            setSaved(data.cardFeePct); setValue(String(data.cardFeePct));
            Alert.alert(t('contract.saved'));
          } catch {
            Alert.alert(t('common.error'), t('contract.saveError'));
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  if (saved == null) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>💳 {t('contract.cardFeeTitle')}</Text>
      <Text style={styles.hint}>{t('contract.cardFeeHint')}</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          accessibilityLabel={t('contract.cardFeeTitle')}
        />
        <Text style={styles.pct}>%</Text>
        <TouchableOpacity
          style={[styles.btn, (!valid || !dirty || saving) && styles.btnDisabled]}
          onPress={save}
          disabled={!valid || !dirty || saving}
          accessibilityRole="button">
          {saving ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={styles.btnText}>{t('common.save')}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    card:  { backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 14 },
    title: { fontSize: 15, fontWeight: '800', color: c.text },
    hint:  { fontSize: 12, color: c.textSecondary, marginTop: 4, lineHeight: 17 },
    row:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    input: { width: 80, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: c.text, backgroundColor: c.background },
    pct:   { fontSize: 15, fontWeight: '700', color: c.textSecondary },
    btn:   { marginLeft: 'auto', backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
    btnDisabled: { opacity: 0.45 },
    btnText: { color: c.textOnPrimary, fontWeight: '800' },
  });
}
