import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import { useColors} from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
};

export function Button({label, onPress, variant = 'primary'}: Props) {
  const colors = useColors();
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({pressed}) => [
        styles.base,
        {backgroundColor: isPrimary ? colors.lightGreen : 'transparent'},
        pressed && styles.pressed,
      ]}>
      <Text
        style={[
          styles.label,
          {color: isPrimary ? colors.onAccent : colors.accent},
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {opacity: 0.85},
  label: {fontSize: 16, fontWeight: '600'},
});
