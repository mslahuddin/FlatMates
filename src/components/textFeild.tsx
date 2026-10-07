import React, {forwardRef, useState, type ElementRef} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useColors} from '../theme';

const ERROR_COLOR = '#EBA24F';

/** Ref type for focusing a TextField from a parent. */
export type TextFieldRef = ElementRef<typeof TextInput>;

type Props = TextInputProps & {
  label: string;
  /** Shown under the field in the error colour. Also turns the border to the error colour. */
  error?: string;
  /** Shown under the field when there is no error. */
  hint?: string;
};

export const TextField = forwardRef<TextFieldRef, Props>(
  (
    {label, error, hint, secureTextEntry, style, onFocus, onBlur, ...rest},
    ref,
  ) => {
    const colors = useColors();
    const [focused, setFocused] = useState(false);
    const [hidden, setHidden] = useState(true);
    const isPassword = !!secureTextEntry;

    const borderColor = error
      ? ERROR_COLOR
      : focused
        ? colors.lightGreen
        : 'rgba(255,255,255,0.12)';

    return (
      <View>
        <View
          style={[
            styles.box,
            {borderColor, backgroundColor: 'rgba(0,0,0,0.28)'},
          ]}>
          <View style={styles.inputColumn}>
            <Text style={[styles.label, {color: colors.textMuted}]}>
              {label.toUpperCase()}
            </Text>
            <TextInput
              ref={ref}
              accessibilityLabel={label}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.lightGreen}
              secureTextEntry={isPassword && hidden}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, {color: colors.white}, style]}
              onFocus={e => {
                setFocused(true);
                onFocus?.(e);
              }}
              onBlur={e => {
                setFocused(false);
                onBlur?.(e);
              }}
              {...rest}
            />
          </View>

          {isPassword ? (
            <Pressable
              onPress={() => setHidden(h => !h)}
              hitSlop={wp(3)}
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
              <Icon
                name={hidden ? 'visibility' : 'visibility-off'}
                size={wp(5.5)}
                color={colors.textMuted}
              />
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <Text style={[styles.message, {color: ERROR_COLOR}]}>{error}</Text>
        ) : hint ? (
          <Text style={[styles.message, {color: colors.textMuted}]}>
            {hint}
          </Text>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: wp(4),
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.2),
  },
  inputColumn: {flex: 1},
  label: {fontSize: 11, fontWeight: '600', letterSpacing: 1},
  input: {
    fontSize: 18,
    fontWeight: '500',
    paddingVertical: 0,
    marginTop: hp(0.4),
  },
  message: {fontSize: 13, marginTop: hp(0.8), marginLeft: wp(1)},
});