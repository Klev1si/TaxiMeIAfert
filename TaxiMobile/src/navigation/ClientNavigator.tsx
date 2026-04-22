import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../constants';
import type { ClientTabParamList, ClientStackParamList } from './types';

// Screens (implemented in Steps 25–30)
import ClientHomeScreen from '../screens/client/ClientHomeScreen';
import RideRequestScreen from '../screens/client/RideRequestScreen';
import ActiveRideScreen from '../screens/client/ActiveRideScreen';
import PayCashScreen from '../screens/client/PayCashScreen';
import RateRideScreen from '../screens/shared/RateRideScreen';
import RideHistoryScreen from '../screens/shared/RideHistoryScreen';
import ClientProfileScreen from '../screens/client/ClientProfileScreen';

const Tab = createBottomTabNavigator<ClientTabParamList>();
const Stack = createNativeStackNavigator<ClientStackParamList>();

/** Stack navigator nested inside the Home tab */
function ClientHomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClientHomeMain" component={ClientHomeScreen} />
      <Stack.Screen name="RideRequest" component={RideRequestScreen} />
      <Stack.Screen name="ActiveRide" component={ActiveRideScreen} />
      <Stack.Screen name="PayCash" component={PayCashScreen} />
      <Stack.Screen name="RateRide" component={RateRideScreen} />
      <Stack.Screen name="RideHistory" component={RideHistoryScreen} />
    </Stack.Navigator>
  );
}

export default function ClientNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: { borderTopColor: Colors.border },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<keyof ClientTabParamList, string> = {
            ClientHome: 'home',
            ClientRideHistory: 'history',
            ClientProfile: 'person',
          };
          return <Icon name={icons[route.name]} size={size} color={color} />;
        },
        tabBarLabel:
          route.name === 'ClientHome'
            ? 'Home'
            : route.name === 'ClientRideHistory'
              ? 'History'
              : 'Profile',
      })}>
      <Tab.Screen name="ClientHome" component={ClientHomeStack} />
      <Tab.Screen name="ClientRideHistory" component={RideHistoryScreen} />
      <Tab.Screen name="ClientProfile" component={ClientProfileScreen} />
    </Tab.Navigator>
  );
}
