import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigations/types';
import {spacing, useColors} from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SignUp' | 'SignIn'>;

/** Temporary screen for routes that are not built yet. */
export function ComingSoon({route}: Props) {
  const colors = useColors();

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <Text style={[styles.title, {color: colors.text}]}>{route.name}</Text>
      <Text style={{color: colors.textSecondary}}>
        This screen is built in the next step.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: spacing.xl, gap: spacing.sm},
  title: {fontSize: 24, fontWeight: '700'},
});