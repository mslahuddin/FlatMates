import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {View, ActivityIndicator} from 'react-native';
import {useAuth} from '../hooks/useAuth';

import Welcome from '../screens/Auth/Welcome';
import SignUp from '../screens/Auth/SignUp';
import SignIn from '../screens/Auth/SignIn';
import CreateFlat from '../screens/Home/Create&JoinFlat.tsx/CreateFlat';
import FlatReady from '../screens/Home/Create&JoinFlat.tsx/FlatReady';
import JoinFlat from '../screens/Home/Create&JoinFlat.tsx/JoinFlat';
import {MainTabs} from './MainTabs';
import {useColors} from '../theme';

// Navigation types
export type RootStackParamList = {
  Welcome: undefined;
  SignUp: undefined;
  SignIn: undefined;
  MainTabs: undefined;
  CreateFlat: undefined;
  FlatReady: {flatName: string ,  inviteCode: string;};
  JoinFlat: {scannedCode?: string} | undefined;
};

// Create Stack Navigator
const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const colors = useColors();
  const {user, initializing} = useAuth();



   if (initializing) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: 'center',
        }}>
        <ActivityIndicator color={colors.lightGreen} />
      </View>
    );
  }


   return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShadowVisible: false,
          headerTintColor: colors.accent,
          headerStyle: {backgroundColor: colors.background},
          headerTitle: '',
          headerBackTitle: 'Back',
        }}>
        {user ? (
          <>
          <Stack.Screen
            name="MainTabs"
            component={MainTabs}
            options={{headerShown: false}}
          />

            <Stack.Screen name="CreateFlat" component={CreateFlat} />
            <Stack.Screen name="FlatReady" component={FlatReady} />
          <Stack.Screen name="JoinFlat" component={JoinFlat} />
            </>
        ) : (
          <>
            <Stack.Screen
              name="Welcome"
              component={Welcome}
              options={{headerShown: false}}
            />
            <Stack.Screen name="SignUp" component={SignUp} />
            <Stack.Screen name="SignIn" component={SignIn} />
          

          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}