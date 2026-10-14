import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {useColors} from '../theme';

type Option<T extends string> = {value: T; label: string};

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

/** A row of equal-width tabs with one selected. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: Props<T>) {
  const colors = useColors();

  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{selected}}
            style={[styles.segment, selected && styles.selected]}>
            <Text
              style={[
                styles.label,
                {color: selected ? colors.white : colors.surfaceAlt},
                selected && styles.labelSelected,
              ]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: wp(4),
    padding: wp(1),
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    borderRadius: wp(3.2),
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: hp(1.2),
  },
  selected: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  label: {fontSize: 17, fontWeight: '500'},
  labelSelected: {fontWeight: '700'},
});

/**
 * SegmentedControl.tsx is the Balances | Expenses | Bills switch at the top of the Money 
 * screen. It’s a reusable component, so you can use it wherever you need to switch between
 *  a few views. For example, Equal | Custom | Percent on the split screen, or Weekly | Monthly | 
 * Yearly when adding a bill. You give it the options, the selected value and an onChange,
 *  and it draws the row and highlights the active one.
 * 
 *  */