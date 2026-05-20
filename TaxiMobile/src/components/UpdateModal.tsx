/**
 * UpdateModal
 *
 * Shown on app startup when the API reports a newer (or required) version.
 *
 * Two modes:
 *  • force  — the user's version is below the API minimum. Modal is non-dismissible.
 *             The only action is "Update Now" which opens the store.
 *  • soft   — the user's version is below the latest but above the minimum.
 *             The user can dismiss the modal and continue using the app.
 */
import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
  BackHandler,
} from 'react-native';
import { Sizes } from '../constants';
import { useColors } from '../stores/themeStore';
import type { ColorPalette } from '../constants/colors';
import { useTranslation } from '../i18n';

interface Props {
  visible: boolean;
  /** 'force' = non-dismissible; 'soft' = user can skip */
  mode: 'force' | 'soft';
  latestVersion: string;
  storeUrl: string;
  onDismiss: () => void;   // only called in soft mode
}

export default function UpdateModal({
  visible,
  mode,
  latestVersion,
  storeUrl,
  onDismiss,
}: Props) {
  const { t }   = useTranslation();
  const colors  = useColors();
  const styles  = useMemo(() => getStyles(colors), [colors]);
  const isForce = mode === 'force';

  const openStore = () => {
    Linking.openURL(storeUrl).catch(() => {
      // If the store URL fails (dev environment), do nothing
    });
  };

  // Prevent Android hardware back button from closing a forced update modal
  React.useEffect(() => {
    if (!visible || !isForce) { return; }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [visible, isForce]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Force mode: don't let the user dismiss by tapping outside or hardware back
      onRequestClose={isForce ? undefined : onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Icon */}
          <Text style={styles.icon}>🚀</Text>

          {/* Heading */}
          <Text style={styles.title}>
            {isForce ? t('components.updateModal.titleForce') : t('components.updateModal.title')}
          </Text>

          {/* Body */}
          <Text style={styles.body}>
            {isForce
              ? t('components.updateModal.bodyForce', { version: latestVersion })
              : t('components.updateModal.bodySoft', { version: latestVersion })}
          </Text>

          {/* Platform badge */}
          <Text style={styles.platform}>
            {Platform.OS === 'ios' ? t('components.updateModal.appStore') : t('components.updateModal.playStore')}
          </Text>

          {/* Actions */}
          <TouchableOpacity
            style={styles.btnUpdate}
            onPress={openStore}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('components.updateModal.updateBtn')}>
            <Text style={styles.btnUpdateText}>{t('components.updateModal.updateBtn')}</Text>
          </TouchableOpacity>

          {!isForce && (
            <TouchableOpacity
              style={styles.btnSkip}
              onPress={onDismiss}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t('components.updateModal.laterBtn')}>
              <Text style={styles.btnSkipText}>{t('components.updateModal.laterBtn')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function getStyles(c: ColorPalette) { return StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Sizes.screenPadding,
  },
  card: {
    backgroundColor: c.background,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },

  icon: {
    fontSize: 52,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: c.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: c.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
  },
  platform: {
    fontSize: 13,
    color: c.textDisabled,
    marginBottom: 24,
  },

  btnUpdate: {
    width: '100%',
    height: 52,
    backgroundColor: c.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnUpdateText: {
    fontSize: 16,
    fontWeight: '700',
    color: c.textOnPrimary,
  },

  btnSkip: {
    width: '100%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSkipText: {
    fontSize: 15,
    fontWeight: '600',
    color: c.textSecondary,
  },
}); }
