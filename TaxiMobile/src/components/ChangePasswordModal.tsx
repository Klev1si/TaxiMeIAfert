/**
 * ChangePasswordModal — shared across Client / Driver / Company / Admin
 * profile screens. Validates the new password locally (length + match),
 * then calls PATCH /auth/change-password and surfaces the server's error
 * message verbatim if the request fails (typically "current password
 * incorrect").
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { authApi } from '../api/auth';
import { useColors } from '../stores/themeStore';
import { useTranslation } from '../i18n';
import type { ColorPalette } from '../constants/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [current, setCurrent] = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    if (visible) { setCurrent(''); setNext(''); setConfirm(''); }
  }, [visible]);

  const handleSave = async () => {
    if (!current) {
      Alert.alert(t('common.validation'), t('profile.password.enterCurrent'));
      return;
    }
    if (next.length < 6) {
      Alert.alert(t('common.validation'), t('profile.password.tooShort'));
      return;
    }
    if (next !== confirm) {
      Alert.alert(t('common.validation'), t('profile.password.mismatch'));
      return;
    }
    setSaving(true);
    try {
      await authApi.changePassword({ currentPassword: current, newPassword: next });
      Alert.alert(t('common.success'), t('profile.password.success'));
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('profile.password.saveError');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>{t('profile.password.title')}</Text>

            <Text style={styles.label}>{t('profile.password.current')}</Text>
            <TextInput
              style={styles.input}
              value={current}
              onChangeText={setCurrent}
              placeholder={t('profile.password.currentPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              returnKeyType="next"
              accessibilityLabel="Current password"
            />

            <Text style={styles.label}>{t('profile.password.new')}</Text>
            <TextInput
              style={styles.input}
              value={next}
              onChangeText={setNext}
              placeholder={t('profile.password.newPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              returnKeyType="next"
              maxLength={64}
              accessibilityLabel="New password"
            />

            <Text style={styles.label}>{t('profile.password.confirm')}</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder={t('profile.password.confirmPlaceholder')}
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              returnKeyType="done"
              maxLength={64}
              accessibilityLabel="Confirm new password"
            />

            <View style={styles.row}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={onClose}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                accessibilityState={{ disabled: saving }}>
                <Text style={styles.btnCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSave, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Save new password"
                accessibilityState={{ disabled: saving }}>
                {saving
                  ? <ActivityIndicator color={colors.textOnPrimary} />
                  : <Text style={styles.btnSaveText}>{t('common.save')}</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1, backgroundColor: c.overlay ?? 'rgba(0,0,0,0.55)',
      justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    sheet: {
      backgroundColor: c.background, borderRadius: 20, padding: 24,
      width: '100%', maxWidth: 420,
    },
    title:  { fontSize: 18, fontWeight: '800', color: c.text, marginBottom: 12, textAlign: 'center' },
    label:  {
      fontSize: 12, fontWeight: '700', color: c.textSecondary,
      marginTop: 12, marginBottom: 6,
      textTransform: 'uppercase', letterSpacing: 0.5,
    },
    input: {
      height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: c.border,
      paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.surface,
    },
    row: { flexDirection: 'row', gap: 12, marginTop: 20 },
    btnCancel: {
      flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
    },
    btnCancelText: { fontSize: 15, fontWeight: '700', color: c.textSecondary },
    btnSave: {
      flex: 1, height: 48, borderRadius: 12, backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    btnSaveText: { fontSize: 15, fontWeight: '700', color: c.textOnPrimary },
  });
}
