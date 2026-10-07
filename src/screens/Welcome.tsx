import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Button} from '../components/Button';
import {Logo} from '../components/Logo';
import {PreviewCard} from '../components/PreviewCard';
import type {RootStackParamList} from '../navigations/types';
import {spacing, useColors} from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

export function Welcome({navigation}: Props) {
  const colors = useColors();

  return (
    <SafeAreaView style={[styles.screen, {backgroundColor: colors.background}]}>
      <View style={styles.content}>
        <Logo />

        <View style={styles.hero}>
          <Text style={[styles.headline, {color: colors.text}]}>
            Everything about living together, in one place.
          </Text>

          <View
            style={styles.previews}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            <PreviewCard title="Internet · £40" meta="due 15 Oct" />
            <PreviewCard title="Clean kitchen" meta="today" indent={spacing.lg} />
            <PreviewCard
              title="Milk, eggs"
              meta="shopping"
              indent={spacing.xl + spacing.sm}
            />
          </View>
        </View>

        <View style={styles.spacer} />

        <View style={styles.actions}>
          <Button label="Create account" onPress={() => navigation.navigate('SignUp')} />
          <Button
            label="I already have an account"
            variant="ghost"
            onPress={() => navigation.navigate('SignIn')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1},
  content: {flex: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg},
  hero: {marginTop: spacing.xxl, gap: spacing.xl},
  headline: {fontSize: 34, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6},
  previews: {gap: spacing.sm},
  spacer: {flex: 1},
  actions: {gap: spacing.sm},
});