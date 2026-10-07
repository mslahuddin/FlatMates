import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {spacing, useColors} from '../theme';

const SIZE = 40;

/** App mark (a door) drawn with plain Views, so no SVG library is needed. */
export function Logo() {
  const colors = useColors();

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Flatmate">
      <View style={[styles.mark, {backgroundColor: colors.accent}]}>
        <View style={[styles.door, {borderColor: colors.onAccent}]}>
          <View style={[styles.knob, {backgroundColor: colors.onAccent}]} />
        </View>
        <View style={[styles.floor, {backgroundColor: colors.onAccent}]} />
      </View>
      <Text style={[styles.wordmark, {color: colors.text}]}>Flatmate</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  mark: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE * 0.3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  door: {
    width: 15,
    height: 18,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  knob: {width: 3, height: 3, borderRadius: 1.5, marginRight: 2},
  floor: {width: 23, height: 2},
  wordmark: {fontSize: 24, fontWeight: '700', letterSpacing: -0.3},
});
