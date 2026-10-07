import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {widthPercentageToDP as wp} from 'react-native-responsive-screen';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useNavigation} from '@react-navigation/native';
import {useColors} from '../theme';

type Props = {
  /** Text next to the arrow. Defaults to "Back". */
  title?: string;
  /** Custom action. Defaults to going back one screen. */
  onPress?: () => void;
  /** Override the arrow and text colour. Defaults to the accent green. */
  color?: string;
};

export const Back = ({title = 'Back', onPress, color}: Props) => {
  const colors = useColors();
  const navigation = useNavigation();
  const tint = color ?? colors.lightGreen;

  return (
    <Pressable
      onPress={onPress ?? (() => navigation.goBack())}
      hitSlop={wp(3)}
      accessibilityRole="button"
      accessibilityLabel={title === 'Back' ? 'Go back' : `Go back, ${title}`}
      style={({pressed}) => [styles.row, pressed && styles.pressed]}>
      <Icon name="chevron-left" size={wp(7)} color={tint} />
      <Text style={[styles.title, {color: tint}]}>{title}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start'},
  pressed: {opacity: 0.6},
  title: {fontSize: 17, fontWeight: '600'},
});