import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {radius, spacing, useColors} from '../theme';

type Props = {
  title: string;
  meta: string;
  /** Left offset, used to stagger a stack of cards. */
  indent?: number;
};

export function PreviewCard({title, meta, indent = 0}: Props) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          marginLeft: indent,
        },
      ]}>
      <Text style={[styles.title, {color: colors.text}]}>{title}</Text>
      <Text style={[styles.meta, {color: colors.textMuted}]}>{meta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderBottomWidth: 3,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {fontSize: 16, fontWeight: '600'},
  meta: {fontSize: 13},
});
