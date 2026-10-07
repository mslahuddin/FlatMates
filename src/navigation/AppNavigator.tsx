import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {ComingSoon} from '../screens/ComingSoon';
import {Welcome} from '../screens/Welcome';
import {useColors} from '../theme';
import type {RootStackParamList} from './types';




const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const colors = useColors();

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Welcome"
        screenOptions={{
          headerShadowVisible: false,
          headerTintColor: colors.accent,
          headerStyle: {backgroundColor: colors.background},
          headerTitle: '',
          headerBackTitle: 'Back',
        }}>
        <Stack.Screen
          name="Welcome"
          component={Welcome}
          options={{headerShown: false}}
        />
        {/* Placeholders until the real screens are built. */}
        <Stack.Screen name="SignUp" component={ComingSoon} />
        <Stack.Screen name="SignIn" component={ComingSoon} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
