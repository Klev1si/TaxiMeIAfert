/**
 * CancelRideModal
 *
 * Bottom-sheet style modal that lets the user pick a predefined cancel reason
 * or type a custom one before confirming cancellation.
 *
 * For CLIENT role, it fetches the cancellation-fee preview from the API and
 * shows a warning banner if a fee applies before the user confirms.
 *
 * Used by both ActiveRideScreen (client) and ActiveDriverRideScreen (driver).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Sizes } from '../constants';
import { useColors } from '../stores/themeStore';
import type { ColorPalette } from '../constants/colors';
import { ridesApi } from '../api/rides';
import { useTranslation } from '../i18n';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  role: 'client' | 'driver';
  /** Required for clients so the fee preview can be fetched. */
  rideId?: string;
  onClose: () => void;
  /** Called with the chosen reason string when user confirms */
  onConfirm: (reason: string) => Promise<void>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CancelRideModal({ visible, role, rideId, onClose, onConfirm }: Props) {
  const { t }  = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [selected, setSelected] = useState<string | null>(null);
  const [custom,   setCustom]   = useState('');
  const [loading,  setLoading]  = useState(false);

  const CLIENT_REASONS = [
    t('components.cancelRideModal.clientReason1'),
    t('components.cancelRideModal.clientReason2'),
    t('components.cancelRideModal.clientReason3'),
    t('components.cancelRideModal.clientReason4'),
    t('components.cancelRideModal.clientReason5'),
  ];

  const DRIVER_REASONS = [
    t('components.cancelRideModal.driverReason1'),
    t('components.cancelRideModal.driverReason2'),
    t('components.cancelRideModal.driverReason3'),
    t('components.cancelRideModal.driverReason4'),
    t('components.cancelRideModal.driverReason5'),
  ];

  // Cancellation fee state (clients only)
  const [feeInfo, setFeeInfo]     = useState<{ fee: number; isFree: boolean; reason: string } | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);

  // Reset state every time the modal opens
  useEffect(() => {
    if (visible) {
      setSelected(null);
      setCustom('');
      setLoading(false);
      setFeeInfo(null);

      // Fetch fee preview for clients only
      if (role === 'client' && rideId) {
        setFeeLoading(true);
        ridesApi.getCancellationFee(rideId)
          .then(res => setFeeInfo(res.data))
          .catch(() => setFeeInfo(null))
          .finally(() => setFeeLoading(false));
      }
    }
  }, [visible, role, rideId]);

  const presets = role === 'client' ? CLIENT_REASONS : DRIVER_REASONS;

  // The effective reason: a preset if chosen, otherwise whatever was typed
  const effectiveReason = selected === 'Other' ? custom.trim() : (selected ?? custom.trim());
  const canConfirm = effectiveReason.length > 0;

  const handleConfirm = async () => {
    if (!canConfirm || loading) { return; }
    setLoading(true);
    try {
      await onConfirm(effectiveReason);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      {/* Dim backdrop — tap to dismiss */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.avoidWrap}>
          {/* Sheet itself — stop touch propagation so tapping inside doesn't close */}
          <Pressable style={styles.sheet} onPress={() => {}}>

            {/* Handle bar */}
            <View style={styles.handle} />

            <Text style={styles.title}>{t('components.cancelRideModal.title')}</Text>
            <Text style={styles.subtitle}>{t('components.cancelRideModal.subtitle')}</Text>

            {/* ── Cancellation fee banner (clients only) ── */}
            {role === 'client' && (
              feeLoading ? (
                <View style={styles.feeBanner}>
                  <ActivityIndicator size="small" color={colors.warning} />
                  <Text style={styles.feeBannerText}>{t('components.cancelRideModal.checkingFee')}</Text>
                </View>
              ) : feeInfo && !feeInfo.isFree ? (
                <View style={[styles.feeBanner, styles.feeBannerWarning]}>
                  <Text style={styles.feeWarningIcon}>⚠️</Text>
                  <View style={styles.feeBannerBody}>
                    <Text style={styles.feeBannerTitle}>
                      {t('components.cancelRideModal.cancellationFee', { amount: feeInfo.fee.toFixed(2) })}
                    </Text>
                    <Text style={styles.feeBannerReason}>{feeInfo.reason}</Text>
                  </View>
                </View>
              ) : feeInfo?.isFree ? (
                <View style={[styles.feeBanner, styles.feeBannerFree]}>
                  <Text style={styles.feeWarningIcon}>✅</Text>
                  <Text style={styles.feeBannerFreeText}>{t('components.cancelRideModal.freeCancellation')}</Text>
                </View>
              ) : null
            )}

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.reasonList}>

              {presets.map((reason) => {
                const active = selected === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.reasonRow, active && styles.reasonRowActive]}
                    onPress={() => {
                      setSelected(reason);
                      setCustom('');
                    }}
                    activeOpacity={0.75}
                    accessibilityRole="radio"
                    accessibilityLabel={reason}
                    accessibilityState={{ checked: active }}>
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active && <View style={styles.radioDot} />}
                    </View>
                    <Text style={[styles.reasonText, active && styles.reasonTextActive]}>
                      {reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* "Other" option with free-text input */}
              <TouchableOpacity
                style={[styles.reasonRow, selected === 'Other' && styles.reasonRowActive]}
                onPress={() => setSelected('Other')}
                activeOpacity={0.75}
                accessibilityRole="radio"
                accessibilityLabel={t('components.cancelRideModal.otherReason')}
                accessibilityState={{ checked: selected === 'Other' }}>
                <View style={[styles.radio, selected === 'Other' && styles.radioActive]}>
                  {selected === 'Other' && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.reasonText, selected === 'Other' && styles.reasonTextActive]}>
                  {t('components.cancelRideModal.otherReason')}
                </Text>
              </TouchableOpacity>

              {selected === 'Other' && (
                <TextInput
                  style={styles.customInput}
                  value={custom}
                  onChangeText={setCustom}
                  placeholder={t('components.cancelRideModal.reasonPlaceholder')}
                  placeholderTextColor={colors.textDisabled}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  maxLength={200}
                  autoFocus
                  accessibilityLabel={t('components.cancelRideModal.reasonPlaceholder')}
                />
              )}

            </ScrollView>

            {/* Action buttons */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.btnKeep}
                onPress={onClose}
                disabled={loading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Keep ride, go back">
                <Text style={styles.btnKeepText}>{t('components.cancelRideModal.cancelBtn')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.btnCancel,
                  (!canConfirm || loading) && styles.btnCancelDisabled,
                ]}
                onPress={handleConfirm}
                disabled={!canConfirm || loading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={
                  feeInfo && !feeInfo.isFree
                    ? `Cancel ride and pay $${feeInfo.fee.toFixed(2)}`
                    : 'Confirm cancel ride'
                }
                accessibilityState={{ disabled: !canConfirm || loading }}>
                {loading
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.btnCancelText}>
                      {feeInfo && !feeInfo.isFree
                        ? t('components.cancelRideModal.cancelAndPay', { amount: feeInfo.fee.toFixed(2) })
                        : t('components.cancelRideModal.cancelRideBtn')}
                    </Text>}
              </TouchableOpacity>
            </View>

          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'flex-end',
  },
  avoidWrap: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: c.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Sizes.screenPadding,
    paddingBottom: 32,
    paddingTop: 12,
    maxHeight: '90%',
  },

  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    alignSelf: 'center',
    marginBottom: 20,
  },

  title: {
    fontSize: 20,
    fontWeight: '800',
    color: c.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: c.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },

  // ── Fee banner ────────────────────────────────────────────────────────────
  feeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 10,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  feeBannerWarning: {
    backgroundColor: c.warningLight ?? '#FFF8E1',
    borderColor: c.warning ?? '#F59E0B',
  },
  feeBannerFree: {
    backgroundColor: c.successLight ?? '#F0FDF4',
    borderColor: c.success ?? '#22C55E',
  },
  feeWarningIcon: { fontSize: 20 },
  feeBannerBody: { flex: 1 },
  feeBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: c.text,
    marginBottom: 2,
  },
  feeBannerReason: {
    fontSize: 12,
    color: c.textSecondary,
    lineHeight: 16,
  },
  feeBannerText: {
    fontSize: 13,
    color: c.textSecondary,
    marginLeft: 8,
  },
  feeBannerFreeText: {
    fontSize: 14,
    fontWeight: '600',
    color: c.success ?? '#22C55E',
  },

  reasonList: { maxHeight: 300 },

  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.border,
  },
  reasonRowActive: {
    borderColor: c.error,
    backgroundColor: c.error + '0D',
  },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioActive: { borderColor: c.error },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.error,
  },

  reasonText: {
    fontSize: 15,
    color: c.text,
    fontWeight: '500',
    flex: 1,
  },
  reasonTextActive: { fontWeight: '700', color: c.error },

  customInput: {
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: c.text,
    backgroundColor: c.surface,
    minHeight: 80,
    marginBottom: 8,
    marginHorizontal: 2,
  },

  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  btnKeep: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnKeepText: {
    fontSize: 15,
    fontWeight: '700',
    color: c.textSecondary,
  },
  btnCancel: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: c.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelDisabled: { opacity: 0.45 },
  btnCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: c.white,
  },
}); }
