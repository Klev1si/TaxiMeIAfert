/**
 * AvatarPicker — tap-to-change profile photo component.
 *
 * Requires react-native-image-picker:
 *   npm install react-native-image-picker
 *   cd ios && pod install    (iOS only)
 *   # Android permissions are handled automatically by the library
 *
 * Displays:
 *   • The user's current photo (from avatarUrl) if available
 *   • A coloured initials circle as fallback
 *   • A small camera badge in the bottom-right corner
 *
 * On tap shows an Alert with three options:
 *   • Take photo    → camera
 *   • Choose photo  → gallery
 *   • Remove photo  → DELETE /auth/avatar  (only when avatarUrl is set)
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useColors } from '../stores/themeStore';
import type { ColorPalette } from '../constants/colors';
import { authApi } from '../api/auth';
import Config from '../config';
import { useTranslation } from '../i18n';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  /** Current relative avatar path from the server (e.g. "uploads/avatars/x.jpg") */
  avatarUrl:   string | null;
  /** Single character used for the initials fallback (e.g. first letter of name) */
  initial:     string;
  /** Avatar circle diameter in px (default 88) */
  size?:       number;
  /** Called with the new relative URL after a successful upload, or null after removal */
  onChanged:   (newAvatarUrl: string | null) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the full URL to display in <Image> */
function buildImageUrl(relativePath: string): string {
  const base = Config.API_BASE_URL.replace(/\/$/, '');
  return `${base}/${relativePath}`;
}

/** Dynamically import react-native-image-picker to avoid hard crash when not installed */
async function getLauncher() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-image-picker') as typeof import('react-native-image-picker');
  } catch {
    return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AvatarPicker({ avatarUrl, initial, size = 88, onChanged }: Props) {
  const { t }  = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [uploading, setUploading] = useState(false);

  const radius   = size / 2;
  const fontSize = size * 0.41;

  // ── Upload helper ────────────────────────────────────────────────────────────
  const upload = async (uri: string, type: string, name: string) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', { uri, type, name } as any);
      const { data } = await authApi.uploadAvatar(formData);
      onChanged(data.avatarUrl);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Upload failed. Please try again.';
      Alert.alert(t('components.avatarPicker.uploadErrorTitle'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setUploading(false);
    }
  };

  // ── Remove helper ────────────────────────────────────────────────────────────
  const remove = async () => {
    setUploading(true);
    try {
      await authApi.removeAvatar();
      onChanged(null);
    } catch {
      Alert.alert(t('common.error'), t('components.avatarPicker.removeError'));
    } finally {
      setUploading(false);
    }
  };

  // ── Picker ───────────────────────────────────────────────────────────────────
  const openPicker = async (source: 'camera' | 'library') => {
    const lib = await getLauncher();
    if (!lib) {
      Alert.alert(
        t('components.avatarPicker.libNotInstalled'),
        t('components.avatarPicker.libNotInstalledMsg'),
      );
      return;
    }

    const options = { mediaType: 'photo' as const, quality: 0.85 as any, maxWidth: 800, maxHeight: 800 };
    const result  =
      source === 'camera'
        ? await lib.launchCamera(options)
        : await lib.launchImageLibrary(options);

    if (result.didCancel || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await upload(
      asset.uri!,
      asset.type ?? 'image/jpeg',
      asset.fileName ?? 'avatar.jpg',
    );
  };

  // ── Action sheet ─────────────────────────────────────────────────────────────
  const handleTap = () => {
    const buttons: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
      { text: `📷  ${t('components.avatarPicker.takePhoto')}`,     onPress: () => openPicker('camera')  },
      { text: `🖼️  ${t('components.avatarPicker.chooseLibrary')}`, onPress: () => openPicker('library') },
    ];

    if (avatarUrl) {
      buttons.push({
        text: `🗑️  ${t('components.avatarPicker.removePhoto')}`,
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('components.avatarPicker.removeConfirmTitle'), t('components.avatarPicker.removeConfirmMsg'), [
            { text: t('components.avatarPicker.cancelBtn'), style: 'cancel' },
            { text: t('components.avatarPicker.removeBtn'), style: 'destructive', onPress: remove },
          ]),
      });
    }

    buttons.push({ text: t('components.avatarPicker.cancelBtn'), style: 'cancel' });

    Alert.alert(t('components.avatarPicker.profilePhotoTitle'), t('components.avatarPicker.chooseOption'), buttons);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <TouchableOpacity
      onPress={handleTap}
      activeOpacity={0.8}
      disabled={uploading}
      style={[styles.wrapper, { width: size, height: size }]}
      accessibilityRole="button"
      accessibilityLabel={uploading ? 'Uploading photo' : avatarUrl ? 'Change profile photo' : 'Add profile photo'}
      accessibilityState={{ disabled: uploading }}>

      {/* Avatar circle */}
      {avatarUrl ? (
        <Image
          source={{ uri: buildImageUrl(avatarUrl) }}
          style={[styles.image, { width: size, height: size, borderRadius: radius }]}
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            { width: size, height: size, borderRadius: radius },
          ]}>
          <Text style={[styles.initial, { fontSize }]}>{initial.toUpperCase()}</Text>
        </View>
      )}

      {/* Upload spinner overlay */}
      {uploading && (
        <View style={[styles.overlay, { borderRadius: radius }]}>
          <ActivityIndicator color="#fff" />
        </View>
      )}

      {/* Camera badge */}
      {!uploading && (
        <View style={[styles.badge, { bottom: size * 0.04, right: size * 0.04 }]}>
          <Text style={styles.badgeIcon}>📷</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    resizeMode: 'cover',
  },
  placeholder: {
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontWeight: '800',
    color: c.textOnPrimary,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: c.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: c.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  badgeIcon: { fontSize: 13 },
}); }
