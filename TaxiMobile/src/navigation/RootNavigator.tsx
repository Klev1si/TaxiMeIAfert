import React, { useEffect, useRef, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/authStore';
import type { RootStackParamList } from './types';
import AuthNavigator from './AuthNavigator';
import ClientNavigator from './ClientNavigator';
import DriverNavigator from './DriverNavigator';
import CompanyNavigator from './CompanyNavigator';
import AdminNavigator from './AdminNavigator';
import AppLoadingScreen from '../components/AppLoadingScreen';
import AddEmailScreen from '../screens/auth/AddEmailScreen';
import { authApi } from '../api/auth';
import { setupFcm, clearFcmToken } from '../services/fcm';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user, isInitialized, initialize } = useAuthStore();
  const fcmCleanupRef = useRef<(() => void) | null>(null);

  // null = not yet checked, true = needs email, false = OK
  const [needsEmail, setNeedsEmail] = useState<boolean | null>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Whenever the logged-in user changes, fetch their full profile and decide
  // whether to force the "add your email" prompt (for legacy accounts).
  useEffect(() => {
    if (!user) { setNeedsEmail(null); return; }
    let cancelled = false;
    authApi.getMe()
      .then(({ data }) => { if (!cancelled) setNeedsEmail(!data.email); })
      .catch(() => { if (!cancelled) setNeedsEmail(false); /* fail open */ });
    return () => { cancelled = true; };
  }, [user?.id]);

  // Set up FCM when the user logs in; tear it down on logout
  useEffect(() => {
    if (user) {
      // User just authenticated — register token and attach listeners
      setupFcm().then((cleanup) => {
        fcmCleanupRef.current = cleanup;
      });
    } else {
      // User logged out — remove listeners and clear the token from the server
      if (fcmCleanupRef.current) {
        fcmCleanupRef.current();
        fcmCleanupRef.current = null;
      }
      clearFcmToken();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);     // only re-run when the logged-in user actually changes

  if (!isInitialized) {
    // Show a branded JS loading screen while AsyncStorage rehydrates auth
    // state. Keeps the yellow brand colour on screen so there is no white
    // flash between the native splash and the first real navigator screen.
    return <AppLoadingScreen />;
  }

  // Legacy account without email — force them to add one before they can
  // reach any role's home screen. They can only continue once setEmail
  // succeeds. We don't render the role navigator until the prompt clears.
  if (user && needsEmail === true) {
    return <AddEmailScreen onCompleted={() => setNeedsEmail(false)} />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {!user ? (
        <Stack.Screen name="Auth"       component={AuthNavigator}    />
      ) : user.role === 'driver' ? (
        <Stack.Screen name="DriverApp"  component={DriverNavigator}  />
      ) : user.role === 'company' ? (
        <Stack.Screen name="CompanyApp" component={CompanyNavigator} />
      ) : user.role === 'super_admin' ? (
        <Stack.Screen name="AdminApp"   component={AdminNavigator}   />
      ) : (
        <Stack.Screen name="ClientApp"  component={ClientNavigator}  />
      )}
    </Stack.Navigator>
  );
}
