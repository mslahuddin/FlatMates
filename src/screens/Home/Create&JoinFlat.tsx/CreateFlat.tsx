import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {useNavigation} from '@react-navigation/native';
import {createFlat} from '../../../services/flat';
import {useColors , MONO} from '../../../theme';
/* ---------- Helpers ---------- */



const MIN_MEMBERS = 2;
const MAX_MEMBERS = 10;
const DEFAULT_MEMBERS = 4;

/* ---------- Small building blocks ---------- */

const Label = ({text}: {text: string}) => {
  const colors = useColors();
  return <Text style={[styles.label, {color: colors.textMuted}]}>{text}</Text>;
};

const Field = ({
  label,
  focused,
  style,
  children,
}: {
  label: string;
  focused?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) => {
  const colors = useColors();
  return (
    <View
    style={[
        styles.field,
        {
          borderColor: focused ? colors.accent : colors.cardBorder,
          backgroundColor: colors.card,
          borderWidth: focused ? 1.5 : 1,
        },
        style,
      ]}>
      <Label text={label} />
      {children}
    </View>
  );
};

const StepButton = ({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) => {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      hitSlop={wp(2)}
     style={({pressed}) => [
  styles.step,
  {backgroundColor: colors.card},
  pressed && styles.pressed,
  disabled && styles.disabled,
]}>
      <Text style={[styles.stepText, {color: colors.text}]}>{icon}</Text>
    </Pressable>
  );
};

/* ---------- Screen ---------- */

const CreateFlat = () => {
  const colors = useColors();
  const navigation = useNavigation<any>();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [maxMembers, setMaxMembers] = useState(DEFAULT_MEMBERS);
  const [focused, setFocused] = useState<'name' | 'address' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const addressRef = useRef<TextInput>(null);

  const canSubmit = name.trim().length > 0 && !submitting;

  const onCreate = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const flat = await createFlat({
        name: name.trim(),
        address: address.trim(),
        maxMembers,
      });
      navigation.replace('FlatReady', {
        flatName: flat.name,
        inviteCode: flat.inviteCode,
      });
    } catch {
      setError("We couldn't create your flat. Check your connection and try again.");
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={[styles.screen, {backgroundColor: colors.background}]}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={wp(3)}
            style={({pressed}) => [styles.back, pressed && styles.pressed]}>
            <Text style={[styles.backText, {color: colors.accent}]}>
              ‹ Back
            </Text>
          </Pressable>

          <Text style={[styles.title, {color: colors.text}]}>
            Create your flat
          </Text>

          <View style={styles.fields}>
            <Field label="FLAT NAME" focused={focused === 'name'}>
              <TextInput
                value={name}
                onChangeText={setName}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused(null)}
                onSubmitEditing={() => addressRef.current?.focus()}
                placeholder="Dundee Student Flat"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                returnKeyType="next"
                maxLength={40}
                accessibilityLabel="Flat name"
                style={[styles.input, {color: colors.text}]}
              />
            </Field>

            <Field label="ADDRESS (OPTIONAL)" focused={focused === 'address'}>
              <TextInput
                ref={addressRef}
                value={address}
                onChangeText={setAddress}
                onFocus={() => setFocused('address')}
                onBlur={() => setFocused(null)}
                onSubmitEditing={onCreate}
                placeholder="Street, town"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                returnKeyType="done"
                maxLength={80}
                accessibilityLabel="Address, optional"
                style={[styles.input, {color: colors.text}]}
              />
            </Field>

            <View
  style={[
    styles.field,
    styles.stepperField,
    {
      backgroundColor: colors.card,
      borderColor: colors.cardBorder,
    },
  ]}>
              <View style={styles.stepperCopy}>
                <Label text="MAXIMUM FLATMATES" />
                <Text style={[styles.hint, {color: colors.textMuted}]}>
                  You can change this later.
                </Text>
              </View>
              <View style={styles.stepper}>
                <StepButton
                  icon="−"
                  label="Decrease maximum flatmates"
                  disabled={maxMembers <= MIN_MEMBERS}
                  onPress={() => setMaxMembers(n => n - 1)}
                />
                <Text
                  style={[styles.count, {color: colors.text}]}
                  accessibilityLabel={`${maxMembers} flatmates`}>
                  {maxMembers}
                </Text>
                <StepButton
                  icon="+"
                  label="Increase maximum flatmates"
                  disabled={maxMembers >= MAX_MEMBERS}
                  onPress={() => setMaxMembers(n => n + 1)}
                />
              </View>
            </View>
          </View>

          {error ? (
            <Text
              accessibilityRole="alert"
              style={[styles.error, {color: colors.textSecondary}]}>
              {error}
            </Text>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={onCreate}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Create flat"
            accessibilityState={{disabled: !canSubmit, busy: submitting}}
            style={({pressed}) => [
              styles.cta,
              {backgroundColor: colors.accent},
              pressed && styles.pressed,
              !canSubmit && styles.disabled,
            ]}>
            {submitting ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={[styles.ctaText, {color: colors.black}]}>
                Create flat
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default CreateFlat;

const styles = StyleSheet.create({
  screen: {flex: 1},
  content: {
    flex: 1,
    paddingHorizontal: wp(6),
    paddingTop: hp(1),
    gap: hp(2),
  },
  footer: {
    paddingHorizontal: wp(6),
    paddingTop: hp(1),
    paddingBottom: hp(1),
  },
  pressed: {opacity: 0.7},
  disabled: {opacity: 0.4},

  back: {alignSelf: 'flex-start'},
  backText: {fontSize: 18, fontWeight: '600'},
  title: {fontSize: 34, lineHeight: 39, fontWeight: '700', letterSpacing: -0.8},

  fields: {gap: hp(1.6)},
  field: {
    borderRadius: wp(5),
    borderWidth: 1,
    
    paddingHorizontal: wp(5),
    paddingVertical: hp(1.8),
    gap: hp(0.6),
  },
  label: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1.6,
  },
  input: {
    fontSize: 22,
    fontWeight: '600',
    padding: 0,
    margin: 0,
  },

  stepperField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: wp(3),
  },
  stepperCopy: {flex: 1, gap: hp(0.6)},
  hint: {fontSize: 17, lineHeight: 23},
  stepper: {flexDirection: 'row', alignItems: 'center', gap: wp(3)},
  step: {
    width: wp(12),
    height: wp(12),
    borderRadius: wp(6),
    alignItems: 'center',
    justifyContent: 'center',
  
  },
  stepText: {fontSize: 22, fontWeight: '700'},
  count: {
    minWidth: wp(7),
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
  },

  error: {fontSize: 16, lineHeight: 22},

  cta: {
    height: hp(8),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: wp(8),
  },
  ctaText: {fontSize: 20, fontWeight: '700'},
});