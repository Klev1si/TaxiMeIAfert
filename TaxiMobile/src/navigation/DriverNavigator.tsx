import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../constants';
import type { DriverTabParamList, DriverStackParamList } from './types';

// Screens (implemented in Steps 31–34)
import DriverHomeScreen from '../screens/driver/DriverHomeScreen';
import IncomingRequestScreen from '../screens/driver/IncomingRequestScreen';
import ActiveDriverRideScreen from '../screens/driver/ActiveDriverRideScreen';
import RateRideScreen from '../screens/shared/RateRideScreen';
import RideHistoryScreen from '../screens/shared/RideHistoryScreen';
import DriverProfileScreen from '../screens/driver/DriverProfileScreen';

const Tab = createBottomTabNavigator<DriverTabParamList>();
const Stack = createNativeStackNavigator<DriverStackParamList>();

function DriverHomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DriverHomeMain" component={DriverHomeScreen} />
      <Stack.Screen name="IncomingRequest" component={IncomingRequestScreen} />
      <Stack.Screen name="ActiveDriverRide" component={ActiveDriverRideScreen} />
      <Stack.Screen name="RateClient" component={RateRideScreen} />
    </Stack.Navigator>
  );
}

export default function DriverNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: { borderTopColor: Colors.border },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<keyof DriverTabParamList, string> = {
            DriverHome: 'directions-car',
            DriverRideHistory: 'history',
            DriverProfile: 'person',
          };
          return <Icon name={icons[route.name]} size={size} color={color} />;
        },
        tabBarLabel:
          route.name === 'DriverHome'
            ? 'Home'
            : route.name === 'DriverRideHistory'
              ? 'History'
              : 'Profile',
      })}>
      <Tab.Screen name="DriverHome" component={DriverHomeStack} />
      <Tab.Screen name="DriverRideHistory" component={RideHistoryScreen} />
      <Tab.Screen name="DriverProfile" component={DriverProfileScreen} />
    </Tab.Navigator>
  );
}
