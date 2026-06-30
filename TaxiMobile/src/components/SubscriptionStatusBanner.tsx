import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  subscriptionsApi,
  type SubscriptionState,
} from '../api/subscriptions';

type Audience = 'driver' | 'company';

interface Props {
  /** Which subscription endpoint to query. */
  audience: Audience;
  /** Called when the user taps "Renew now". Should navigate to the subscribe screen. */
  onRenewPress: () => void;
}

/**
 * Small status banner shown on driver/company home screens.
 * Hidden when the subscription is active. Shows an amber banner during the
 * 3-day grace period, and a red banner once blocked, both with a CTA that
 * jumps the user to the subscribe screen.
 */
export default function SubscriptionStatusBanner({ audience, onRenewPress }: Props) {
  const [state, setState]         = useState<SubscriptionState>('inactive');
  const [coveredBy, setCoveredBy] = useState<'driver' | 'company' | 'none'>('none');
  const [loaded, setLoaded]       = useState(false);

  const load = useCallback(async () => {
    try {
      if (audience === 'driver') {
        const res = await subscriptionsApi.getDriverMy();
        setState(res.data.state);
        setCoveredBy(res.data.coveredBy);
      } else {
        const res = await subscriptionsApi.getMy();
        setState(res.data?.state ?? 'inactive');
        setCoveredBy('company');
      }
    } catch {
      // Silent — banner just stays hidden if we can't fetch
    } finally {
      setLoaded(true);
    }
  }, [audience]);

  useEffect(() => { load(); }, [load]);

  // Only render when there's something the user needs to act on.
  if (!loaded || state === 'active' || state === 'inactive') return null;

  const isGrace = state === 'grace';
  const styles  = useMemo(() => getStyles(isGrace), [isGrace]);

  const whose = coveredBy === 'company' ? "Your company's" : 'Your';
  const message = isGrace
    ? `⚠ ${whose} subscription expired — renew within the 3-day grace period to keep working.`
    : `⛔ ${whose} subscription is blocked. Renew to start accepting rides again.`;

  // Drivers under a company can't self-renew — only their company can.
  // Hide the CTA in that case but keep the warning visible.
  const showRenew = !(audience === 'driver' && coveredBy === 'company');

  return (
    <View style={styles.wrap}>
      <Text style={styles.message}>{message}</Text>
      {showRenew && (
        <TouchableOpacity onPress={onRenewPress} style={styles.btn}>
          <Text style={styles.btnText}>Renew now →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function getStyles(isGrace: boolean) {
  const bg          = isGrace ? '#fef3c7' : '#fee2e2';
  const border      = isGrace ? '#f59e0b' : '#ef4444';
  const textColor   = isGrace ? '#92400e' : '#991b1b';
  return StyleSheet.create({
    wrap: {
      backgroundColor: bg,
      borderColor: border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      margin: 12,
      gap: 8,
    },
    message: {
      fontSize: 13,
      color: textColor,
      lineHeight: 18,
    },
    btn: {
      alignSelf: 'flex-start',
      backgroundColor: textColor,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    btnText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
    },
  });
}
