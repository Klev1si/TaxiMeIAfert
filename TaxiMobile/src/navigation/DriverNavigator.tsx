import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useColors } from '../stores/themeStore';
import type {
  DriverTabParamList,
  DriverStackParamList,
  DriverHistoryStackParamList,
  DriverProfileStackParamList,
} from './types';

// Screens (implemented in Steps 31–34)
import DriverHomeScreen from '../screens/driver/DriverHomeScreen';
import IncomingRequestScreen from '../screens/driver/IncomingRequestScreen';
import ActiveDriverRideScreen from '../screens/driver/ActiveDriverRideScreen';
import RateRideScreen from '../screens/shared/RateRideScreen';
import RideHistoryScreen from '../screens/shared/RideHistoryScreen';
import RideDetailScreen from '../screens/shared/RideDetailScreen';
import EarningsScreen from '../screens/driver/EarningsScreen';
import DriverExpensesScreen from '../screens/driver/DriverExpensesScreen';
import DriverProfileScreen from '../screens/driver/DriverProfileScreen';
import WalletScreen from '../screens/driver/WalletScreen';
import DriverSubscriptionScreen from '../screens/driver/DriverSubscriptionScreen';
import SupportScreen from '../screens/shared/SupportScreen';
import SupportTicketScreen from '../screens/shared/SupportTicketScreen';

const Tab = createBottomTabNavigator<DriverTabParamList>();
const Stack = createNativeStackNavigator<DriverStackParamList>();
const HistoryStack = createNativeStackNavigator<DriverHistoryStackParamList>();
const ProfileStack = createNativeStackNavigator<DriverProfileStackParamList>();

function DriverHomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DriverHomeMain"   component={DriverHomeScreen} />
      <Stack.Screen name="IncomingRequest"  component={IncomingRequestScreen} />
      <Stack.Screen name="ActiveDriverRide" component={ActiveDriverRideScreen} />
      <Stack.Screen name="RateClient"       component={RateRideScreen} />
    </Stack.Navigator>
  );
}

function DriverHistoryStack() {
  return (
    <HistoryStack.Navigator screenOptions={{ headerShown: false }}>
      <HistoryStack.Screen name="RideHistoryMain" component={RideHistoryScreen} />
      <HistoryStack.Screen name="RideDetail"      component={RideDetailScreen} />
    </HistoryStack.Navigator>
  );
}

function DriverProfileStack() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="DriverProfileMain"  component={DriverProfileScreen}       />
      <ProfileStack.Screen name="DriverSubscription" component={DriverSubscriptionScreen}  />
      <ProfileStack.Screen name="Support"            component={SupportScreen}             />
      <ProfileStack.Screen name="SupportTicket"      component={SupportTicketScreen}       />
    </ProfileStack.Navigator>
  );
}

export default function DriverNavigator() {
  const colors = useColors();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.background },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<keyof DriverTabParamList, string> = {
            DriverHome:        'directions-car',
            DriverRideHistory: 'history',
            DriverEarnings:    'bar-chart',
            DriverWallet:      'account-balance-wallet',
            DriverExpenses:    'receipt-long',
            DriverProfile:     'person',
          };
          return <Icon name={icons[route.name]} size={size} color={color} />;
        },
        tabBarLabel:
          route.name === 'DriverHome'        ? 'Home'     :
          route.name === 'DriverRideHistory' ? 'History'  :
          route.name === 'DriverEarnings'    ? 'Earnings' :
          route.name === 'DriverWallet'      ? 'Wallet'   :
          route.name === 'DriverExpenses'    ? 'Expenses' :
                                               'Profile',
      })}>
      <Tab.Screen name="DriverHome"        component={DriverHomeStack}      />
      <Tab.Screen name="DriverRideHistory" component={DriverHistoryStack}  />
      <Tab.Screen name="DriverEarnings"    component={EarningsScreen}       />
      <Tab.Screen name="DriverWallet"      component={WalletScreen}         />
      <Tab.Screen name="DriverExpenses"    component={DriverExpensesScreen}  />
      <Tab.Screen name="DriverProfile"     component={DriverProfileStack}    />
    </Tab.Navigator>
  );
}
