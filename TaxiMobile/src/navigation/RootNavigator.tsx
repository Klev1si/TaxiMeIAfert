import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/authStore';
import type { RootStackParamList } from './types';
import AuthNavigator from './AuthNavigator';
import ClientNavigator from './ClientNavigator';
import DriverNavigator from './DriverNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user, isInitialized, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!isInitialized) {
    // Splash / loading state — navigators will render nothing until ready
    return null;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {!user ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : user.role === 'driver' ? (
        <Stack.Screen name="DriverApp" component={DriverNavigator} />
      ) : (
        <Stack.Screen name="ClientApp" component={ClientNavigator} />
      )}
    </Stack.Navigator>
  );
}
