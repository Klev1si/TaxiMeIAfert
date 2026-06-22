import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useColors } from '../stores/themeStore';
import { useTranslation } from '../i18n';
import type {
  ClientTabParamList,
  ClientStackParamList,
  ClientHistoryStackParamList,
  ClientProfileStackParamList,
} from './types';

// Screens (implemented in Steps 25–30)
import ClientHomeScreen from '../screens/client/ClientHomeScreen';
import RideRequestScreen from '../screens/client/RideRequestScreen';
import ActiveRideScreen from '../screens/client/ActiveRideScreen';
import PayCashScreen from '../screens/client/PayCashScreen';
import RateRideScreen from '../screens/shared/RateRideScreen';
import RideHistoryScreen from '../screens/shared/RideHistoryScreen';
import RideDetailScreen from '../screens/shared/RideDetailScreen';
import SavedLocationsScreen from '../screens/client/SavedLocationsScreen';
import FavoriteDriversScreen from '../screens/client/FavoriteDriversScreen';
import ClientProfileScreen from '../screens/client/ClientProfileScreen';
import ManageCardsScreen from '../screens/client/ManageCardsScreen';
import SupportScreen from '../screens/shared/SupportScreen';
import SupportTicketScreen from '../screens/shared/SupportTicketScreen';

const Tab = createBottomTabNavigator<ClientTabParamList>();
const Stack = createNativeStackNavigator<ClientStackParamList>();
const HistoryStack = createNativeStackNavigator<ClientHistoryStackParamList>();
const ProfileStack = createNativeStackNavigator<ClientProfileStackParamList>();

/** Stack navigator nested inside the Home tab */
function ClientHomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClientHomeMain" component={ClientHomeScreen} />
      <Stack.Screen name="RideRequest"    component={RideRequestScreen} />
      <Stack.Screen name="ActiveRide"     component={ActiveRideScreen} />
      <Stack.Screen name="PayCash"        component={PayCashScreen} />
      <Stack.Screen name="RateRide"       component={RateRideScreen} />
      <Stack.Screen name="RideHistory"      component={RideHistoryScreen} />
      <Stack.Screen name="RideDetail"       component={RideDetailScreen} />
      <Stack.Screen name="SavedLocations"   component={SavedLocationsScreen} />
    </Stack.Navigator>
  );
}

/** Stack navigator nested inside the History tab */
function ClientHistoryStack() {
  return (
    <HistoryStack.Navigator screenOptions={{ headerShown: false }}>
      <HistoryStack.Screen name="RideHistoryMain" component={RideHistoryScreen} />
      <HistoryStack.Screen name="RideDetail"      component={RideDetailScreen} />
    </HistoryStack.Navigator>
  );
}

/** Stack navigator nested inside the Profile tab */
function ClientProfileStack() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ClientProfileMain" component={ClientProfileScreen} />
      <ProfileStack.Screen name="SavedLocations"    component={SavedLocationsScreen} />
      <ProfileStack.Screen name="FavoriteDrivers"   component={FavoriteDriversScreen} />
      <ProfileStack.Screen name="ManageCards"       component={ManageCardsScreen} />
      <ProfileStack.Screen name="Support"           component={SupportScreen} />
      <ProfileStack.Screen name="SupportTicket"     component={SupportTicketScreen} />
    </ProfileStack.Navigator>
  );
}

export default function ClientNavigator() {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.background },
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
            ? t('nav.home')
            : route.name === 'ClientRideHistory'
              ? t('nav.history')
              : t('nav.profile'),
      })}>
      <Tab.Screen name="ClientHome" component={ClientHomeStack} />
      <Tab.Screen name="ClientRideHistory" component={ClientHistoryStack} />
      <Tab.Screen name="ClientProfile" component={ClientProfileStack} />
    </Tab.Navigator>
  );
}
