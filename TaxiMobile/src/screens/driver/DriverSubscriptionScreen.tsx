import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  type DriverSubscription,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '../../api/subscriptions';
import { useTranslation } from '../../i18n';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(price: string | number): string {
  return `$${Number(price).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function statusLabel(status: SubscriptionStatus): string {
  switch (status) {
    case 'active':    return '● Active';
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
  const planName    = sub.plan?.name         ?? '—';
  const planPrice   = sub.plan?.priceMonthly ?? 0;

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
          <Text style={banStyles.perMonth}> /mo</Text>
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
  onSelect,
  loading,
}: {
  plan:      SubscriptionPlan;
  isCurrent: boolean;
  onSelect:  (plan: SubscriptionPlan) => void;
  loading:   boolean;
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
          <Text style={planStyles.price}>{formatPrice(plan.priceMonthly)}</Text>
          <Text style={planStyles.perMonth}>/month</Text>
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

      <TouchableOpacity
        style={[planStyles.selectBtn, isCurrent && planStyles.selectBtnCurrent]}
        onPress={() => onSelect(plan)}
        disabled={isCurrent || loading}
        accessibilityRole="button"
        accessibilityLabel={isCurrent ? `${plan.name} – current plan` : `Select ${plan.name} plan`}
        accessibilityState={{ disabled: isCurrent || loading }}>
        {loading && !isCurrent
          ? <ActivityIndicator size="small" color={colors.white} />
          : <Text style={[
              planStyles.selectBtnText,
              isCurrent && planStyles.selectBtnTextCurrent,
            ]}>
              {isCurrent ? t('driver.subscription.currentPlanBadge') : t('driver.subscription.selectPlanBtn')}
            </Text>}
      </TouchableOpacity>
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
    selectBtn: {
      backgroundColor: c.primary, borderRadius: 12,
      paddingVertical: 12, alignItems: 'center',
    },
    selectBtnCurrent:     { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.primary },
    selectBtnText:        { color: c.white, fontSize: 15, fontWeight: '700' },
    selectBtnTextCurrent: { color: c.primary },
  });
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function DriverSubscriptionScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();
  const [plans, setPlans]               = useState<SubscriptionPlan[]>([]);
  const [subscription, setSub]          = useState<DriverSubscription | null>(null);
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
      setSub(subRes.data);
    } catch {
      Alert.alert(t('common.error'), t('driver.subscription.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSelect = (plan: SubscriptionPlan) => {
    const isSwitch = subscription &&
      subscription.status !== 'cancelled' &&
      subscription.planId !== plan.id;

    const msg = isSwitch
      ? t('driver.subscription.switchMsg', { name: plan.name, price: formatPrice(plan.priceMonthly) })
      : t('driver.subscription.startMsg', { name: plan.name, price: formatPrice(plan.priceMonthly) });

    Alert.alert(isSwitch ? t('driver.subscription.switchTitle') : t('driver.subscription.startTitle'), msg, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: isSwitch ? t('driver.subscription.switchBtn') : t('driver.subscription.subscribeBtn'),
        onPress: async () => {
          setSubscribingId(plan.id);
          try {
            const res = await subscriptionsApi.driverSubscribe(plan.id);
            setSub(res.data);
            Alert.alert(t('common.success'), isSwitch ? t('driver.subscription.planSwitched') : t('driver.subscription.trialStarted'));
          } catch (err: any) {
            Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('driver.subscription.subscribeError')));
          } finally {
            setSubscribingId(null);
          }
        },
      },
    ]);
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
                  onSelect={handleSelect}
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
  });
}
