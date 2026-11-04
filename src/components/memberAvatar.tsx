import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {widthPercentageToDP as wp} from 'react-native-responsive-screen';
import {useColors, AVATAR_COLORS} from '../theme';



const initials = (name: string) =>
  name.trim().slice(0, 1).toUpperCase() + name.trim().slice(1, 2).toLowerCase();

type Props = {
  name: string;
  /** Position in the flat's member list, so each person keeps one colour everywhere. */
  index: number;
  size?: number;
};

/** A round avatar with the person's initials. */
export const MemberAvatar = ({name, index, size = wp(12)}: Props) => {
  const colors = useColors();
  return (
    <View
      accessible
      accessibilityLabel={name}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
        },
      ]}>
      <Text style={[styles.text, {color: colors.text, fontSize: size * 0.34}]}>
        {initials(name)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  avatar: {alignItems: 'center', justifyContent: 'center'},
  text: {fontWeight: '700'},
});