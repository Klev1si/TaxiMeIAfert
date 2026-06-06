/**
 * ManageCardsScreen
 *
 * Lets the client view, add and remove saved payment cards.
 * Uses the Stripe payment sheet in "setup" mode (no charge) to tokenise
 * the card and attach it to the client's Stripe Customer.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePaymentSheet } from '@stripe/stripe-react-native';
import { paymentsApi, type SavedPaymentMethod } from '../../api/payments';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import { useTranslation } from '../../i18n';
import { isStripeConfigured, cardPaymentsEnabled } from '../../config';
import type { ColorPalette } from '../../constants/colors';

const BRAND_ICONS: Record<string, string> = {
  visa:       '💳',
  mastercard: '💳',
  amex:       '💳',
  discover:   '💳',
  unionpay:   '💳',
  jcb:        '💳',
  diners:     '💳',
  unknown:    '💳',
};

function brandLabel(brand: string) {
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

export default function ManageCardsScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const [cards,     setCards]     = useState<SavedPaymentMethod[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [adding,    setAdding]    = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  // ── Load saved cards ────────────────────────────────────────────────────────
  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await paymentsApi.getPaymentMethods();
      setCards(data);
    } catch {
      // silently ignore — user sees empty list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCards(); }, [loadCards]);

  // ── Add a new card ──────────────────────────────────────────────────────────
  const handleAddCard = useCallback(async () => {
    setAdding(true);
    try {
      // 1. Get SetupIntent + EphemeralKey from our server
      const { data } = await paymentsApi.createSetupIntent();

      // 2. Initialise the Stripe sheet in "setup" mode (no charge)
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName:     'TaxiApp',
        setupIntentClientSecret: data.setupIntentClientSecret,
        customerId:              data.customerId,
        customerEphemeralKeySecret: data.ephemeralKey,
        style: 'automatic',
      });

      if (initError) {
        Alert.alert(t('common.error'), initError.message);
        return;
      }

      // 3. Present the sheet — user enters card details
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert(t('common.error'), presentError.message);
        }
        return;
      }

      // 4. Card saved successfully — reload list
      Alert.alert(t('client.manageCards.cardSavedTitle'), t('client.manageCards.cardSavedMsg'));
      await loadCards();

    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('client.manageCards.addFailMsg');
      Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setAdding(false);
    }
  }, [initPaymentSheet, presentPaymentSheet, loadCards]);

  // ── Remove a card ───────────────────────────────────────────────────────────
  const handleRemove = useCallback((card: SavedPaymentMethod) => {
    Alert.alert(
      t('client.manageCards.removeTitle'),
      t('client.manageCards.removeMsg', { brand: brandLabel(card.brand), last4: card.last4 }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: async () => {
            setDeletingId(card.id);
            try {
              await paymentsApi.detachPaymentMethod(card.id);
              setCards(prev => prev.filter(c => c.id !== card.id));
            } catch (err: any) {
              const msg = err?.response?.data?.message ?? t('client.manageCards.removeFailMsg');
              Alert.alert(t('common.error'), Array.isArray(msg) ? msg.join('\n') : msg);
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  }, [t]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('client.manageCards.title')}</Text>
        <Text style={styles.subtitle}>{t('client.manageCards.subtitle')}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} size="large" />
      ) : (
        <FlatList
          data={cards}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>💳</Text>
              <Text style={styles.emptyText}>{t('client.manageCards.emptyTitle')}</Text>
              <Text style={styles.emptyHint}>{t('client.manageCards.emptyHint')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.cardRow}>
              <View style={styles.cardLeft}>
                <Text style={styles.cardIcon}>{BRAND_ICONS[item.brand] ?? '💳'}</Text>
                <View>
                  <Text style={styles.cardBrand}>
                    {brandLabel(item.brand)} •••• {item.last4}
                  </Text>
                  <Text style={styles.cardExp}>
                    {t('client.manageCards.expires', { month: String(item.expMonth).padStart(2, '0'), year: item.expYear })}
                  </Text>
                </View>
              </View>

              {deletingId === item.id ? (
                <ActivityIndicator color={colors.error} size="small" />
              ) : (
                <TouchableOpacity
                  onPress={() => handleRemove(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${brandLabel(item.brand)} card ending in ${item.last4}`}>
                  <Text style={styles.removeText}>{t('client.manageCards.removeBtn')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      {/* Add Card button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.addBtn, (adding || !isStripeConfigured) && styles.addBtnDisabled]}
          onPress={handleAddCard}
          disabled={adding || !isStripeConfigured || !cardPaymentsEnabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Add new card"
          accessibilityState={{ disabled: adding || !isStripeConfigured }}>
          {adding
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.addBtnText}>＋  {t('client.manageCards.addCardBtn')}</Text>}
        </TouchableOpacity>
        {(!isStripeConfigured || !cardPaymentsEnabled) && (
          <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 8, paddingHorizontal: 16 }}>
            💳 Card payments are coming soon. For now, all rides are paid in cash directly to the driver.
          </Text>
        )}
      </View>

    </SafeAreaView>
  );
}

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },

    header: {
      paddingHorizontal: Sizes.screenPadding,
      paddingTop: 32,
      paddingBottom: 16,
    },
    title: { fontSize: 24, fontWeight: '800', color: c.text, marginBottom: 6 },
    subtitle: { fontSize: 14, color: c.textSecondary, lineHeight: 20 },

    list: { paddingHorizontal: Sizes.screenPadding, paddingTop: 8, paddingBottom: 24 },

    emptyBox: { alignItems: 'center', paddingVertical: 56 },
    emptyIcon: { fontSize: 52, marginBottom: 16 },
    emptyText: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 6 },
    emptyHint: { fontSize: 14, color: c.textSecondary, textAlign: 'center', paddingHorizontal: 32 },

    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      marginBottom: 12,
    },
    cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardIcon: { fontSize: 32 },
    cardBrand: { fontSize: 15, fontWeight: '700', color: c.text },
    cardExp:   { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    removeText: { fontSize: 14, fontWeight: '600', color: c.error },

    footer: {
      paddingHorizontal: Sizes.screenPadding,
      paddingBottom: 32,
      paddingTop: 8,
    },
    addBtn: {
      height: 52,
      backgroundColor: c.primary,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnDisabled: { opacity: 0.55 },
    addBtnText: { fontSize: 16, fontWeight: '700', color: c.textOnPrimary },
  });
}
