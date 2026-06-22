import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useColors } from '../stores/themeStore';
import { useTranslation } from '../i18n';
import type { CompanyTabParamList } from './types';

import CompanyDashboardScreen     from '../screens/company/CompanyDashboardScreen';
import CompanyDriversScreen       from '../screens/company/CompanyDriversScreen';
import CompanyFinancesScreen      from '../screens/company/CompanyFinancesScreen';
import CompanyTariffsScreen       from '../screens/company/CompanyTariffsScreen';
import CompanySubscriptionScreen  from '../screens/company/CompanySubscriptionScreen';
import CompanyProfileScreen       from '../screens/company/CompanyProfileScreen';

const Tab = createBottomTabNavigator<CompanyTabParamList>();

export default function CompanyNavigator() {
  const colors = useColors();
  const { t } = useTranslation();
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
            CompanyFinances:     'account-balance',
            CompanyTariffs:      'attach-money',
            CompanySubscription: 'card-membership',
            CompanyProfile:      'business',
          };
          return <Icon name={icons[route.name]} size={size} color={color} />;
        },
        tabBarLabel:
          route.name === 'CompanyDashboard'    ? t('nav.dashboard')    :
          route.name === 'CompanyDrivers'      ? t('nav.drivers')      :
          route.name === 'CompanyFinances'     ? t('nav.finances')     :
          route.name === 'CompanyTariffs'      ? t('nav.tariffs')      :
          route.name === 'CompanySubscription' ? t('nav.subscription') :
                                                 t('nav.profile'),
      })}>
      <Tab.Screen name="CompanyDashboard"    component={CompanyDashboardScreen}    />
      <Tab.Screen name="CompanyDrivers"      component={CompanyDriversScreen}      />
      <Tab.Screen name="CompanyFinances"     component={CompanyFinancesScreen}     />
      <Tab.Screen name="CompanyTariffs"      component={CompanyTariffsScreen}      />
      <Tab.Screen name="CompanySubscription" component={CompanySubscriptionScreen} />
      <Tab.Screen name="CompanyProfile"      component={CompanyProfileScreen}      />
    </Tab.Navigator>
  );
}
