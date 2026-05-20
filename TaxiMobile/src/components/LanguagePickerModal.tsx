/**
 * LanguagePickerModal — bottom-sheet style picker for switching app language.
 *
 * Reads available languages from i18n's AVAILABLE_LANGUAGES list, shows the
 * current selection with a check mark, and persists the choice to AsyncStorage
 * via setLang().
 *
 * Usage:
 *   const [visible, setVisible] = useState(false);
 *   <LanguagePickerModal visible={visible} onClose={() => setVisible(false)} />
 */

import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useColors } from '../stores/themeStore';
import type { ColorPalette } from '../constants/colors';

import {
  useTranslation,
  AVAILABLE_LANGUAGES,
  Lang,
} from '../i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function LanguagePickerModal({ visible, onClose }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t, lang, setLang } = useTranslation();

  const choose = (code: Lang) => {
    setLang(code);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => { /* swallow */ }}>
          <Text style={styles.title}>{t('language.title')}</Text>
          <Text style={styles.subtitle}>{t('language.description')}</Text>

          {AVAILABLE_LANGUAGES.map(opt => {
            const selected = opt.code === lang;
            return (
              <TouchableOpacity
                key={opt.code}
                style={[styles.row, selected && styles.rowSelected]}
                onPress={() => choose(opt.code)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityLabel={opt.label}
                accessibilityState={{ checked: selected }}>
                <Text style={styles.flag}>{opt.flag}</Text>
                <Text style={[styles.label, selected && styles.labelSelected]}>
                  {opt.label}
                </Text>
                {selected && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Cancel">
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) { return StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: c.background,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 420,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: c.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: c.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.border,
    marginBottom: 10,
    backgroundColor: c.surface,
  },
  rowSelected: {
    borderColor: c.primary,
    backgroundColor: c.primaryLight,
  },
  flag: {
    fontSize: 22,
    marginRight: 12,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: c.text,
  },
  labelSelected: {
    fontWeight: '800',
  },
  check: {
    fontSize: 18,
    color: c.primary,
    fontWeight: '800',
  },

  cancelBtn: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: c.textSecondary,
  },
}); }
