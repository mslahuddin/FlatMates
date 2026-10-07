import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import Welcome from '../screens/Auth/Welcome';
import SignUp from '../screens/Auth/SignUp';
import SignIn from '../screens/Auth/SignIn';
import {useColors} from '../theme';

// Navigation types
export type RootStackParamList = {
  Welcome: undefined;
  SignUp: undefined;
  SignIn: undefined;
};

// Create Stack Navigator
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
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTitle: '',
          headerBackTitle: 'Back',
        }}
      >
        <Stack.Screen
          name="Welcome"
          component={Welcome}
          options={{headerShown: false}}
        />

        <Stack.Screen
          name="SignUp"
          component={SignUp}
        />

        <Stack.Screen
          name="SignIn"
          component={SignIn}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}