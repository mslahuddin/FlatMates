import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import DashBoard from '../screens/Home/DashBoard';
import FlatScreen from '../screens/Flat/Flat';
import MoneyScreen from '../screens/Money/Money';
import {useColors} from '../theme';

/* ---------- Types ---------- */

export type MainTabParamList = {
  Home: undefined;
  Money: undefined;
  Duties: undefined;
  Shared: undefined;
  Flat: undefined;
};

/* ---------- Custom tab bar ---------- */

const TabBar = ({state, descriptors, navigation}: BottomTabBarProps) => {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.background,
          paddingBottom: Math.max(insets.bottom, hp(1)),
        },
      ]}>
      {state.routes.map((route, index) => {
        const {options} = descriptors[route.key];
        const focused = state.index === index;
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : (options.title ?? route.name);
        const color = focused ? colors.lightGreen : colors.textMuted;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={() =>
              navigation.emit({type: 'tabLongPress', target: route.key})
            }
            accessibilityRole="tab"
            accessibilityState={{selected: focused}}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            style={({pressed}) => [styles.tab, pressed && styles.pressed]}>
            {options.tabBarIcon?.({focused, color, size: wp(7)})}
            <Text
              style={[styles.label, {color}, focused && styles.labelFocused]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

/* ---------- Temporary screens (replace each when you build it) ---------- */

const Placeholder = ({
  title,
  icon,
  message,
}: {
  title: string;
  icon: string;
  message: string;
}) => {
  const colors = useColors();

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.screen, {backgroundColor: colors.background}]}>
      <View style={styles.content}>
        <Text style={[styles.title, {color: colors.white}]}>{title}</Text>

        <View style={styles.center}>
          <View style={[styles.circle, {borderColor: colors.lightGreen}]}>
            <Icon name={icon} size={wp(8)} color={colors.lightGreen} />
          </View>
          <Text style={[styles.headline, {color: colors.white}]}>
            Coming soon
          </Text>
          <Text style={[styles.message, {color: colors.surfaceAlt}]}>
            {message}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};


const Duties = () => (
  <Placeholder
    title="Duties"
    icon="check-box"
    message="Chores, rotations and who is up next will live here."
  />
);
const Shared = () => (
  <Placeholder
    title="Shared"
    icon="shopping-basket"
    message="Groceries, repairs and flat info will live here."
  />
);
const Flat = () => (
  <Placeholder
    title="Flat"
    icon="people"
    message="Flatmates, who is home, polls and settings will live here."
  />
);

/* ---------- Navigator ---------- */

const Tab = createBottomTabNavigator<MainTabParamList>();

// To change an icon, change its name here.
const tabIcon =
  (name: string) =>
  ({color, size}: {color: string; size: number}) => (
    <Icon name={name} size={size} color={color} />
  );

export function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={props => <TabBar {...props} />}
      screenOptions={{headerShown: false}}>
      <Tab.Screen
        name="Home"
        component={DashBoard}
        options={{tabBarIcon: tabIcon('home')}}
      />
      <Tab.Screen
        name="Money"
        component={MoneyScreen}
        options={{tabBarIcon: tabIcon('paid')}}
      />
      <Tab.Screen
        name="Duties"
        component={Duties}
        options={{tabBarIcon: tabIcon('check-box')}}
      />
      <Tab.Screen
        name="Shared"
        component={Shared}
        options={{tabBarIcon: tabIcon('shopping-basket')}}
      />
      <Tab.Screen
        name="Flat"
        component={FlatScreen}
        options={{tabBarIcon: tabIcon('people')}}
      />
    </Tab.Navigator>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  // Tab bar
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    paddingTop: hp(1.2),
  },
  tab: {flex: 1, alignItems: 'center', gap: hp(0.4)},
  pressed: {opacity: 0.6},
  label: {fontSize: 13, fontWeight: '500'},
  labelFocused: {fontWeight: '700'},

  // Placeholder screens
  screen: {flex: 1},
  content: {flex: 1, paddingHorizontal: wp(6), paddingTop: hp(2)},
  title: {fontSize: 34, lineHeight: 39, fontWeight: '700', letterSpacing: -0.8},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: hp(1.4),
    paddingBottom: hp(8),
  },
  circle: {
    width: wp(18),
    height: wp(18),
    borderRadius: wp(9),
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {fontSize: 22, fontWeight: '700'},
  message: {fontSize: 16, lineHeight: 22, textAlign: 'center'},
});