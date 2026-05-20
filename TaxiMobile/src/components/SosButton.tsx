/**
 * SosButton — floating emergency button shown during an active ride.
 *
 * Tapping opens an Alert with two options:
 *   1. Call emergency services (opens the dialler at 112 / 911)
 *   2. Dismiss
 *
 * The button is intentionally small and non-intrusive (bottom-right corner)
 * but large enough to tap reliably in a stressful situation.
 */
import React, { useMemo, useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  Linking,
  Modal,
  View,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useColors } from '../stores/themeStore';
import type { ColorPalette } from '../constants/colors';
import { useTranslation } from '../i18n';

interface Props {
  rideId: string;
  /** Optional: POST to server so dispatchers are alerted. Pass undefined to skip. */
  onServerAlert?: (rideId: string) => Promise<void>;
}

export default function SosButton({ rideId, onServerAlert }: Props) {
  const { t }  = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [modalVisible, setModalVisible] = useState(false);
  const [alerting,     setAlerting]     = useState(false);

  const callEmergency = () => {
    setModalVisible(false);
    // Short delay so the modal closes before the dialler opens
    setTimeout(() => {
      Linking.openURL('tel:112').catch(() => {
        Linking.openURL('tel:911');
      });
    }, 200);
  };

  const alertDispatcher = async () => {
    if (!onServerAlert) { return; }
    setAlerting(true);
    try {
      await onServerAlert(rideId);
      setModalVisible(false);
      Alert.alert(
        t('components.sosButton.alertSentTitle'),
        t('components.sosButton.alertSentMsg'),
        [{ text: t('common.ok') }],
      );
    } catch {
      Alert.alert(t('common.error'), t('components.sosButton.alertErrorMsg'));
    } finally {
      setAlerting(false);
    }
  };

  return (
    <>
      {/* Floating SOS button */}
      <TouchableOpacity
        style={styles.sos}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="SOS emergency button"
        accessibilityHint="Opens emergency options including calling emergency services">
        <Text style={styles.sosText}>{t('components.sosButton.label')}</Text>
      </TouchableOpacity>

      {/* Confirmation modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>

            <Text style={styles.title}>{t('components.sosButton.emergencyTitle')}</Text>
            <Text style={styles.subtitle}>
              {t('components.sosButton.emergencySubtitle')}
            </Text>

            {/* Call 112 */}
            <TouchableOpacity
              style={styles.callBtn}
              onPress={callEmergency}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Call emergency services 112 or 911">
              <Text style={styles.callIcon}>📞</Text>
              <View>
                <Text style={styles.callTitle}>{t('components.sosButton.callEmergencyTitle')}</Text>
                <Text style={styles.callSub}>{t('components.sosButton.callEmergencySub')}</Text>
              </View>
            </TouchableOpacity>

            {/* Alert dispatcher (only if onServerAlert provided) */}
            {onServerAlert && (
              <TouchableOpacity
                style={[styles.alertBtn, alerting && { opacity: 0.6 }]}
                onPress={alertDispatcher}
                disabled={alerting}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Alert TaxiApp support team"
                accessibilityState={{ disabled: alerting }}>
                {alerting
                  ? <ActivityIndicator color={colors.error} size="small" />
                  : <>
                      <Text style={styles.alertIcon}>🚨</Text>
                      <View>
                        <Text style={styles.alertTitle}>{t('components.sosButton.alertSupportTitle')}</Text>
                        <Text style={styles.alertSub}>{t('components.sosButton.alertSupportSub')}</Text>
                      </View>
                    </>}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setModalVisible(false)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Cancel, close emergency panel">
              <Text style={styles.cancelText}>{t('components.sosButton.cancelBtn')}</Text>
            </TouchableOpacity>

          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function getStyles(c: ColorPalette) { return StyleSheet.create({
  sos: {
    position: 'absolute',
    bottom: 140,        // above the info panel
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: c.error,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 6,
    shadowColor: c.error,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
  },
  sosText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },

  title: { fontSize: 22, fontWeight: '800', color: c.error, marginBottom: 8 },
  subtitle: {
    fontSize: 14,
    color: c.textSecondary,
    lineHeight: 20,
    marginBottom: 24,
  },

  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.error,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    marginBottom: 12,
  },
  callIcon: { fontSize: 28 },
  callTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  callSub: { fontSize: 12, color: '#FFFFFF', opacity: 0.85, marginTop: 2 },

  alertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: c.error,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    marginBottom: 20,
    minHeight: 68,
  },
  alertIcon: { fontSize: 28 },
  alertTitle: { fontSize: 15, fontWeight: '700', color: c.error },
  alertSub: { fontSize: 12, color: c.textSecondary, marginTop: 2 },

  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
}); }
