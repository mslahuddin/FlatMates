import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {Button} from './button';
import {useColors} from '../theme';

type Props = {
  /** A MaterialIcons name, e.g. "paid". */
  icon: string;
  title: string;
  description: string;
  /** Button label. The button only shows when both label and onAction are given. */
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Icon tile, title, description and an optional button, centred in the space it is given. */
export const EmptyState = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  style,
}: Props) => {
  const colors = useColors();

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.tile}>
        <View
          style={[
            StyleSheet.absoluteFill,
            {backgroundColor: colors.lightGreen, opacity: 0.16},
          ]}
        />
        <Icon name={icon} size={wp(9)} color={colors.lightGreen} />
      </View>

      <Text style={[styles.title, {color: colors.white}]}>{title}</Text>
      <Text style={[styles.description, {color: colors.surfaceAlt}]}>
        {description}
      </Text>

      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp(4),
    paddingBottom: hp(6),
  },
  tile: {
    width: wp(20),
    height: wp(20),
    borderRadius: wp(6),
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: hp(2.4),
  },
  description: {
    fontSize: 18,
    lineHeight: 26,
    textAlign: 'center',
    marginTop: hp(1.2),
  },
  action: {alignSelf: 'stretch', marginTop: hp(3)},
});