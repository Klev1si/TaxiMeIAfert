import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';

// Screens (implemented in Step 24)
import LoginScreen from '../screens/auth/LoginScreen';
import OtpScreen from '../screens/auth/OtpScreen';
import RegisterClientScreen from '../screens/auth/RegisterClientScreen';
import RegisterDriverScreen from '../screens/auth/RegisterDriverScreen';
import RegisterCompanyScreen from '../screens/auth/RegisterCompanyScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName="Login">
      <Stack.Screen name="Login"           component={LoginScreen} />
      <Stack.Screen name="Otp"             component={OtpScreen} />
      <Stack.Screen name="RegisterClient"  component={RegisterClientScreen} />
      <Stack.Screen name="RegisterDriver"  component={RegisterDriverScreen} />
      <Stack.Screen name="RegisterCompany" component={RegisterCompanyScreen} />
      <Stack.Screen name="ForgotPassword"  component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword"   component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
}
