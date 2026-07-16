import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

/**
 * Navigate to a screen from outside the React component tree
 * (e.g. from a push-notification tap handler).
 *
 * Nested-navigator paths:
 *   Driver ride request        → DriverApp > DriverHome > IncomingRequest
 *   Driver ride message        → DriverApp > DriverHome > ActiveDriverRide
 *   Client ride accepted       → ClientApp > ClientHome  > ActiveRide
 *   Client ride complete       → ClientApp > ClientHome  > PayCash
 *   Client ride message        → ClientApp > ClientHome  > ActiveRide
 *   Client scheduled reminder  → ClientApp > ClientRideHistory > RideHistoryMain
 */
export function notificationNavigate(event: string, rideId?: string, role?: string) {
  if (!navigationRef.isReady()) return;

  switch (event) {
    // ── Admin events ─────────────────────────────────────────────────────────
    case 'admin_user_registered':
      // New user signed up — open the admin tab that lists their role
      navigationRef.dispatch(
        CommonActions.navigate('AdminApp', {
          screen:
            role === 'driver'  ? 'AdminDrivers'   :
            role === 'company' ? 'AdminCompanies' :
                                 'AdminClients',
        }),
      );
      break;

    // ── Driver events ────────────────────────────────────────────────────────
    case 'ride_request':
      navigationRef.dispatch(
        CommonActions.navigate('DriverApp', {
          screen: 'DriverHome',
          params: { screen: 'IncomingRequest', params: { rideId } },
        }),
      );
      break;

    case 'ride_message_driver':
      // Driver received a chat message — navigate to the active ride screen
      if (rideId) {
        navigationRef.dispatch(
          CommonActions.navigate('DriverApp', {
            screen: 'DriverHome',
            params: { screen: 'ActiveDriverRide', params: { rideId } },
          }),
        );
      }
      break;

    // ── Client events ────────────────────────────────────────────────────────
    case 'ride_accepted':
      navigationRef.dispatch(
        CommonActions.navigate('ClientApp', {
          screen: 'ClientHome',
          params: { screen: 'ActiveRide', params: { rideId } },
        }),
      );
      break;

    case 'ride_completed':
      navigationRef.dispatch(
        CommonActions.navigate('ClientApp', {
          screen: 'ClientHome',
          params: { screen: 'PayCash', params: { rideId } },
        }),
      );
      break;

    case 'payment_confirmed':
      navigationRef.dispatch(
        CommonActions.navigate('ClientApp', {
          screen: 'ClientHome',
          params: { screen: 'RateRide', params: { rideId, rateTarget: 'driver' } },
        }),
      );
      break;

    case 'ride_message_client':
      // Client received a chat message — navigate to the active ride screen
      if (rideId) {
        navigationRef.dispatch(
          CommonActions.navigate('ClientApp', {
            screen: 'ClientHome',
            params: { screen: 'ActiveRide', params: { rideId } },
          }),
        );
      }
      break;

    case 'scheduled_reminder':
      // Scheduled ride reminder — open ride history so they can see the booking
      navigationRef.dispatch(
        CommonActions.navigate('ClientApp', {
          screen: 'ClientRideHistory',
        }),
      );
      break;

    default:
      break;
  }
}
