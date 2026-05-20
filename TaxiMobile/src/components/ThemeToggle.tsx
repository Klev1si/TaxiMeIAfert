/**
 * ThemeToggle — three-way mode selector: System / Light / Dark.
 *
 * Usage (drop into any profile/settings screen):
 *   <ThemeToggle />
 */
import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme, useColors } from '../stores/themeStore';
import type { ThemeMode } from '../stores/themeStore';
import type { ColorPalette } from '../constants/colors';
import { useTranslation } from '../i18n';

const THEME_OPTIONS: { key: string; icon: string; value: ThemeMode }[] = [
  { key: 'system', icon: '⚙️', value: 'system' },
  { key: 'light',  icon: '☀️',  value: 'light'  },
  { key: 'dark',   icon: '🌙', value: 'dark'   },
];

export default function ThemeToggle() {
  const { t }          = useTranslation();
  const { mode, setMode } = useTheme();
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      {THEME_OPTIONS.map(opt => {
        const active = mode === opt.value;
        const label  = t(`components.themeToggle.${opt.key}` as any);
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.btn, active && styles.btnActive]}
            onPress={() => setMode(opt.value)}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityLabel={`Theme: ${label}`}
            accessibilityState={{ checked: active }}>
            <Text style={styles.icon}>{opt.icon}</Text>
            <Text style={[styles.label, active && styles.labelActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      backgroundColor: c.surfaceAlt,
      borderRadius: 12,
      padding: 4,
      gap: 2,
    },
    btn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 4,
      borderRadius: 9,
      gap: 4,
    },
    btnActive: {
      backgroundColor: c.surface,
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 2,
      elevation: 2,
    },
    icon:        { fontSize: 14 },
    label:       { fontSize: 12, fontWeight: '500', color: c.textSecondary },
    labelActive: { fontWeight: '700', color: c.text },
  });
}
