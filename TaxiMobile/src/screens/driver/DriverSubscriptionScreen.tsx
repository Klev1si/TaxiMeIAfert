import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { toAlertString } from '../../utils/errorMessage';
import {
  subscriptionsApi,
  type BillingPeriod,
  type DriverSubscription,
  type SubscriptionPlan,
  type SubscriptionState,
  type SubscriptionStatus,
} from '../../api/subscriptions';
import { useTranslation } from '../../i18n';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(price: string | number): string {
  return `€${Number(price).toFixed(2)}`;
}

function periodSuffix(p: BillingPeriod): string {
  return p === 'monthly' ? '/mo' : p === 'quarterly' ? '/3mo' : '/yr';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function statusLabel(status: SubscriptionStatus): string {
  switch (status) {
    case 'active':    return '● Active';
    case 'pending':   return '⏳ Awaiting payment';
    case 'trialing':  return '○ Trial';
    case 'past_due':  return '⚠ Past Due';
    case 'cancelled': return '✕ Cancelled';
    default:          return status;
  }
}

// ── Current Subscription Banner ───────────────────────────────────────────────

function CurrentSubBanner({
  sub,
  onCancel,
  cancelling,
}: {
  sub:        DriverSubscription;
  onCancel:   () => void;
  cancelling: boolean;
}) {
  const colors = useColors();
  const banStyles = useMemo(() => getBanStyles(colors), [colors]);
  const { t } = useTranslation();

  function statusColor(status: SubscriptionStatus): string {
    switch (status) {
      case 'active':    return colors.success;
      case 'trialing':  return colors.info ?? '#3b82f6';
      case 'past_due':  return colors.warning ?? '#f59e0b';
      case 'cancelled': return colors.error;
      default:          return colors.textSecondary;
    }
  }

  const isCancelled = sub.status === 'cancelled';
  const planName    = sub.plan?.name           ?? '—';
  const planPrice   = sub.plan?.price          ?? 0;
  const planPeriod  = sub.plan?.billingPeriod  ?? 'monthly';

  return (
    <View style={banStyles.card}>
      <View style={banStyles.row}>
        <View style={{ flex: 1 }}>
          <Text style={banStyles.planName}>{planName}</Text>
          <Text style={[banStyles.status, { color: statusColor(sub.status) }]}>
            {statusLabel(sub.status)}
          </Text>
        </View>
        <Text style={banStyles.price}>
          {formatPrice(planPrice)}
          <Text style={banStyles.perMonth}> {periodSuffix(planPeriod)}</Text>
        </Text>
      </View>

      <View style={banStyles.dateRow}>
        <Text style={banStyles.dateLabel}>
          {isCancelled ? t('driver.subscription.cancelledOn') : t('driver.subscription.renewsOn')}
        </Text>
        <Text style={banStyles.dateValue}>
          {isCancelled && sub.cancelledAt
            ? formatDate(sub.cancelledAt)
            : formatDate(sub.currentPeriodEnd)}
        </Text>
      </View>

      {!isCancelled && (
        <TouchableOpacity
          style={banStyles.cancelBtn}
          onPress={onCancel}
          disabled={cancelling}
          accessibilityRole="button"
          accessibilityLabel="Cancel subscription"
          accessibilityState={{ disabled: cancelling }}>
          {cancelling
            ? <ActivityIndicator size="small" color={colors.error} />
            : <Text style={banStyles.cancelBtnText}>{t('driver.subscription.cancelSubBtn')}</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

function getBanStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface, borderRadius: 16,
      padding: 16, marginBottom: 24,
      borderWidth: 1, borderColor: c.border,
    },
    row:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
    planName:  { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 4 },
    status:    { fontSize: 13, fontWeight: '600' },
    price:     { fontSize: 22, fontWeight: '800', color: c.text },
    perMonth:  { fontSize: 13, fontWeight: '400', color: c.textSecondary },
    dateRow:   {
      flexDirection: 'row', justifyContent: 'space-between',
      borderTopWidth: 1, borderTopColor: c.border,
      paddingTop: 10, marginBottom: 12,
    },
    dateLabel: { fontSize: 13, color: c.textSecondary },
    dateValue: { fontSize: 13, fontWeight: '600', color: c.text },
    cancelBtn: {
      alignItems: 'center', paddingVertical: 10, borderRadius: 10,
      borderWidth: 1, borderColor: c.error,
    },
    cancelBtnText: { fontSize: 14, fontWeight: '700', color: c.error },
  });
}

// ── Plan Card ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isCurrent,
  onPickCard,
  onPickCash,
  loading,
}: {
  plan:        SubscriptionPlan;
  isCurrent:   boolean;
  onPickCard:  (plan: SubscriptionPlan) => void;
  onPickCash:  (plan: SubscriptionPlan) => void;
  loading:     boolean;
}) {
  const colors = useColors();
  const planStyles = useMemo(() => getPlanStyles(colors), [colors]);
  const { t } = useTranslation();

  return (
    <View style={[planStyles.card, isCurrent && planStyles.cardCurrent]}>
      {isCurrent && (
        <View style={planStyles.currentBadge}>
          <Text style={planStyles.currentBadgeText}>{t('driver.subscription.currentPlanBadge')}</Text>
        </View>
      )}

      <View style={planStyles.header}>
        <Text style={planStyles.name}>{plan.name}</Text>
        <View style={planStyles.priceRow}>
          <Text style={planStyles.price}>{formatPrice(plan.price)}</Text>
          <Text style={planStyles.perMonth}>{periodSuffix(plan.billingPeriod)}</Text>
        </View>
      </View>

      <View style={planStyles.divider} />

      <View style={planStyles.featuresList}>
        {plan.features.map((f, i) => (
          <View key={i} style={planStyles.featureItem}>
            <Text style={planStyles.featureIcon}>✓</Text>
            <Text style={planStyles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      <View style={planStyles.payRow}>
        <TouchableOpacity
          style={planStyles.payCardBtn}
          onPress={() => onPickCard(plan)}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={`Pay ${plan.name} by card`}>
          {loading
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Text style={planStyles.payCardBtnText}>Pay with card</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={planStyles.payCashBtn}
          onPress={() => onPickCash(plan)}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={`Request cash payment for ${plan.name}`}>
          <Text style={planStyles.payCashBtnText}>Pay in cash</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getPlanStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface, borderRadius: 16,
      padding: 16, marginBottom: 14,
      borderWidth: 1, borderColor: c.border,
    },
    cardCurrent:   { borderColor: c.primary, borderWidth: 2 },
    currentBadge:  {
      backgroundColor: c.primary, borderRadius: 6,
      paddingHorizontal: 8, paddingVertical: 3,
      alignSelf: 'flex-start', marginBottom: 10,
    },
    currentBadgeText: {
      color: c.white, fontSize: 11, fontWeight: '700',
      textTransform: 'uppercase', letterSpacing: 0.5,
    },
    header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    name:     { fontSize: 17, fontWeight: '700', color: c.text, flex: 1 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline' },
    price:    { fontSize: 22, fontWeight: '800', color: c.text },
    perMonth: { fontSize: 12, color: c.textSecondary, marginLeft: 2 },
    divider:  { height: 1, backgroundColor: c.border, marginBottom: 12 },
    featuresList: { gap: 8, marginBottom: 16 },
    featureItem:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
    featureIcon:  { fontSize: 14, width: 20, textAlign: 'center', color: c.success },
    featureText:  { fontSize: 14, color: c.text, flex: 1 },
    payRow:        { flexDirection: 'row', gap: 8 },
    payCardBtn:    { flex: 1, backgroundColor: c.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    payCardBtnText:{ color: c.white, fontSize: 14, fontWeight: '700' },
    payCashBtn:    { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: c.primary },
    payCashBtnText:{ color: c.primary, fontSize: 14, fontWeight: '700' },
  });
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function DriverSubscriptionScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [plans, setPlans]               = useState<SubscriptionPlan[]>([]);
  const [subscription, setSub]          = useState<DriverSubscription | null>(null);
  const [state, setState]               = useState<SubscriptionState>('inactive');
  const [coveredBy, setCoveredBy]       = useState<'driver' | 'company' | 'none'>('none');
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  const [cancelling, setCancelling]     = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [plansRes, subRes] = await Promise.all([
        subscriptionsApi.listDriverPlans(),
        subscriptionsApi.getDriverMy(),
      ]);
      setPlans(plansRes.data);
      setSub(subRes.data.subscription);
      setState(subRes.data.state);
      setCoveredBy(subRes.data.coveredBy);
    } catch {
      Alert.alert(t('common.error'), t('driver.subscription.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePickCard = (plan: SubscriptionPlan) => {
    Alert.alert(
      'Pay by card',
      `Open Paysera to pay ${formatPrice(plan.price)} for "${plan.name}"?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            setSubscribingId(plan.id);
            try {
              const res = await subscriptionsApi.startCardCheckout(plan.id);
              await Linking.openURL(res.data.url);
            } catch (err: any) {
              Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, 'Could not start card payment.'));
            } finally {
              setSubscribingId(null);
            }
          },
        },
      ],
    );
  };

  const handlePickCash = (plan: SubscriptionPlan) => {
    Alert.alert(
      'Pay in cash',
      `Request a cash payment for "${plan.name}" (${formatPrice(plan.price)})?\n\nYour subscription will activate once the admin confirms the payment.`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Request',
          onPress: async () => {
            setSubscribingId(plan.id);
            try {
              await subscriptionsApi.requestCashPayment(plan.id);
              Alert.alert(t('common.success'), 'Cash payment requested. The admin will confirm shortly.');
              await load();
            } catch (err: any) {
              Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, 'Could not request cash payment.'));
            } finally {
              setSubscribingId(null);
            }
          },
        },
      ],
    );
  };

  const handleCancel = () => {
    Alert.alert(
      t('driver.subscription.cancelSubBtn'),
      t('driver.subscription.cancelConfirmMsg'),
      [
        { text: t('driver.subscription.keepPlan'), style: 'cancel' },
        {
          text: t('driver.subscription.cancelSubBtn'),
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              const res = await subscriptionsApi.driverCancel();
              setSub(res.data);
            } catch (err: any) {
              Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('driver.subscription.cancelError')));
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

  const currentPlanId =
    subscription && subscription.status !== 'cancelled'
      ? subscription.planId
      : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
        }>
        <Text style={styles.title}>{t('driver.subscription.title')}</Text>
        <Text style={styles.subtitle}>
          {t('driver.subscription.subtitle')}
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* Grace / blocked banner — applies whether covered by own sub or company */}
            {state === 'grace' && (
              <View style={styles.graceBanner}>
                <Text style={styles.graceBannerText}>
                  ⚠ {coveredBy === 'company' ? "Your company's" : 'Your'} subscription expired. You're in the 3-day grace period — renew now to keep working.
                </Text>
              </View>
            )}
            {state === 'blocked' && (
              <View style={styles.blockedBanner}>
                <Text style={styles.blockedBannerText}>
                  ⛔ {coveredBy === 'company' ? "Your company's" : 'Your'} subscription is blocked. Renew to start accepting rides again.
                </Text>
              </View>
            )}
            {coveredBy === 'company' && state === 'active' && (
              <View style={styles.infoBanner}>
                <Text style={styles.infoBannerText}>
                  ℹ Your subscription is provided by your company.
                </Text>
              </View>
            )}

            {/* Current subscription */}
            {subscription && subscription.plan && (
              <>
                <Text style={styles.sectionLabel}>{t('driver.subscription.yourPlanLabel')}</Text>
                <CurrentSubBanner
                  sub={subscription}
                  onCancel={handleCancel}
                  cancelling={cancelling}
                />
              </>
            )}

            {/* Available plans */}
            <Text style={styles.sectionLabel}>
              {subscription ? t('driver.subscription.availablePlans') : t('driver.subscription.choosePlan')}
            </Text>

            {plans.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyText}>{t('driver.subscription.noPlansTitle')}</Text>
                <Text style={styles.emptyHint}>{t('driver.subscription.noPlansHint')}</Text>
              </View>
            ) : (
              plans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isCurrent={plan.id === currentPlanId}
                  onPickCard={handlePickCard}
                  onPickCash={handlePickCash}
                  loading={subscribingId === plan.id}
                />
              ))
            )}

            {/* Trial note */}
            <View style={styles.trialNote}>
              <Text style={styles.trialNoteText}>
                🔒 {t('driver.subscription.trialNote')}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: c.background },
    scroll: { padding: Sizes.screenPadding, paddingBottom: 40 },

    title:    { fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 6 },
    subtitle: { fontSize: 14, color: c.textSecondary, marginBottom: 24, lineHeight: 20 },

    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textSecondary,
      letterSpacing: 0.8, textTransform: 'uppercase',
      marginBottom: 10, marginLeft: 2,
    },

    emptyState: { alignItems: 'center', marginTop: 40 },
    emptyIcon:  { fontSize: 48, marginBottom: 12 },
    emptyText:  { fontSize: 17, fontWeight: '600', color: c.text, marginBottom: 6 },
    emptyHint:  { fontSize: 14, color: c.textSecondary },

    trialNote: {
      backgroundColor: c.infoLight ?? '#eff6ff',
      borderRadius: 12, padding: 14, marginTop: 8,
      borderWidth: 1, borderColor: c.info ?? '#3b82f6',
    },
    trialNoteText: {
      fontSize: 13, color: c.info ?? '#1d4ed8', lineHeight: 20,
    },
    graceBanner: {
      backgroundColor: '#fef3c7', borderRadius: 12, padding: 14, marginBottom: 16,
      borderWidth: 1, borderColor: '#f59e0b',
    },
    graceBannerText:   { fontSize: 13, color: '#92400e', lineHeight: 20 },
    blockedBanner:     { backgroundColor: '#fee2e2', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#ef4444' },
    blockedBannerText: { fontSize: 13, color: '#991b1b', lineHeight: 20 },
    infoBanner:        { backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#3b82f6' },
    infoBannerText:    { fontSize: 13, color: '#1d4ed8', lineHeight: 20 },
  });
}
