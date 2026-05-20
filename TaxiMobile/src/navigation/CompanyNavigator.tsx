import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useColors } from '../stores/themeStore';
import type { CompanyTabParamList } from './types';

import CompanyDashboardScreen     from '../screens/company/CompanyDashboardScreen';
import CompanyDriversScreen       from '../screens/company/CompanyDriversScreen';
import CompanyTariffsScreen       from '../screens/company/CompanyTariffsScreen';
import CompanySubscriptionScreen  from '../screens/company/CompanySubscriptionScreen';
import CompanyProfileScreen       from '../screens/company/CompanyProfileScreen';

const Tab = createBottomTabNavigator<CompanyTabParamList>();

export default function CompanyNavigator() {
  const colors = useColors();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle:             { borderTopColor: colors.border, backgroundColor: colors.background },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<keyof CompanyTabParamList, string> = {
            CompanyDashboard:    'dashboard',
            CompanyDrivers:      'people',
            CompanyTariffs:      'attach-money',
            CompanySubscription: 'card-membership',
            CompanyProfile:      'business',
          };
          return <Icon name={icons[route.name]} size={size} color={color} />;
        },
        tabBarLabel:
          route.name === 'CompanyDashboard'    ? 'Dashboard' :
          route.name === 'CompanyDrivers'      ? 'Drivers'   :
          route.name === 'CompanyTariffs'      ? 'Tariffs'   :
          route.name === 'CompanySubscription' ? 'Plan'      :
                                                 'Profile',
      })}>
      <Tab.Screen name="CompanyDashboard"    component={CompanyDashboardScreen}    />
      <Tab.Screen name="CompanyDrivers"      component={CompanyDriversScreen}      />
      <Tab.Screen name="CompanyTariffs"      component={CompanyTariffsScreen}      />
      <Tab.Screen name="CompanySubscription" component={CompanySubscriptionScreen} />
      <Tab.Screen name="CompanyProfile"      component={CompanyProfileScreen}      />
    </Tab.Navigator>
  );
}
