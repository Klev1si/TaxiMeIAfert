import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useColors } from '../stores/themeStore';
import type {
  AdminTabParamList,
  AdminDriverStackParamList,
  AdminProfileStackParamList,
} from './types';

import AdminDashboardScreen         from '../screens/admin/AdminDashboardScreen';
import AdminDriversScreen           from '../screens/admin/AdminDriversScreen';
import AdminDriverDocumentsScreen   from '../screens/admin/AdminDriverDocumentsScreen';
import AdminClientsScreen           from '../screens/admin/AdminClientsScreen';
import AdminCompaniesScreen         from '../screens/admin/AdminCompaniesScreen';
import AdminPromoCodesScreen        from '../screens/admin/AdminPromoCodesScreen';
import AdminSupportScreen           from '../screens/admin/AdminSupportScreen';
import AdminProfileScreen           from '../screens/admin/AdminProfileScreen';
import AdminSubscriptionPlansScreen from '../screens/admin/AdminSubscriptionPlansScreen';
import AdminGlobalTariffsScreen     from '../screens/admin/AdminGlobalTariffsScreen';
import AdminPayoutsScreen           from '../screens/admin/AdminPayoutsScreen';
import AdminAuditLogsScreen         from '../screens/admin/AdminAuditLogsScreen';
import AdminFraudEventsScreen       from '../screens/admin/AdminFraudEventsScreen';

const Tab          = createBottomTabNavigator<AdminTabParamList>();
const DriversStack = createNativeStackNavigator<AdminDriverStackParamList>();
const ProfileStack = createNativeStackNavigator<AdminProfileStackParamList>();

/** Stack navigator for the Drivers tab — allows drilling into document review */
function AdminDriversNavigator() {
  return (
    <DriversStack.Navigator screenOptions={{ headerShown: false }}>
      <DriversStack.Screen name="AdminDriversMain"     component={AdminDriversScreen}         />
      <DriversStack.Screen name="AdminDriverDocuments" component={AdminDriverDocumentsScreen} />
    </DriversStack.Navigator>
  );
}

/** Stack navigator for the Profile tab — allows drilling into plans management */
function AdminProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="AdminProfileMain"   component={AdminProfileScreen}           />
      <ProfileStack.Screen name="AdminPlans"         component={AdminSubscriptionPlansScreen} />
      <ProfileStack.Screen name="AdminGlobalTariffs" component={AdminGlobalTariffsScreen}     />
      <ProfileStack.Screen name="AdminPayouts"       component={AdminPayoutsScreen}           />
      <ProfileStack.Screen name="AdminAuditLogs"    component={AdminAuditLogsScreen}         />
      <ProfileStack.Screen name="AdminFraudEvents"  component={AdminFraudEventsScreen}       />
    </ProfileStack.Navigator>
  );
}

export default function AdminNavigator() {
  const colors = useColors();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle:             { borderTopColor: colors.border, backgroundColor: colors.background },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<keyof AdminTabParamList, string> = {
            AdminDashboard:  'bar-chart',
            AdminDrivers:    'directions-car',
            AdminClients:    'people',
            AdminCompanies:  'business',
            AdminPromos:     'local-offer',
            AdminSupport:    'headset-mic',
            AdminProfile:    'shield',
          };
          return <Icon name={icons[route.name]} size={size} color={color} />;
        },
        tabBarLabel:
          route.name === 'AdminDashboard'  ? 'Dashboard' :
          route.name === 'AdminDrivers'    ? 'Drivers'   :
          route.name === 'AdminClients'    ? 'Passengers':
          route.name === 'AdminCompanies'  ? 'Companies' :
          route.name === 'AdminPromos'     ? 'Promos'    :
          route.name === 'AdminSupport'    ? 'Support'   :
                                             'Profile',
      })}>
      <Tab.Screen name="AdminDashboard"  component={AdminDashboardScreen}    />
      <Tab.Screen name="AdminDrivers"    component={AdminDriversNavigator}   />
      <Tab.Screen name="AdminClients"    component={AdminClientsScreen}      />
      <Tab.Screen name="AdminCompanies"  component={AdminCompaniesScreen}    />
      <Tab.Screen name="AdminPromos"     component={AdminPromoCodesScreen}   />
      <Tab.Screen name="AdminSupport"    component={AdminSupportScreen}      />
      <Tab.Screen name="AdminProfile"    component={AdminProfileNavigator}   />
    </Tab.Navigator>
  );
}
