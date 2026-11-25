import React, {useRef, useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {signIn, authErrorMessage} from '../../services/auth';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {useNavigation} from '@react-navigation/native';
import {Back} from '../../components/back';
import {Button} from '../../components/button';
import {TextField, type TextFieldRef} from '../../components/textFeild';
import {useColors} from '../../theme';

const ERROR_COLOR = '#EBA24F';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = {email?: string; password?: string};

const SignIn = () => {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const passwordRef = useRef<TextFieldRef>(null);
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  // Set when the server rejects the sign-in. Marks both fields and shows one message.
  const [formError, setFormError] = useState<string | null>(null);

  const validate = () => {
    const next: Errors = {};
    if (!EMAIL_RE.test(email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (password.length === 0) {
      next.password = 'Enter your password.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

const onSignIn = async () => {
  if (!validate()) return;
  try {
    setLoading(true);
    await signIn(email, password);
  } catch (e) {
    setFormError(authErrorMessage(e));  // marks both fields invalid, orange message
  } finally {
    setLoading(false);
  }
};

  return (
    <SafeAreaView style={[styles.screen, {backgroundColor: colors.background}]}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.top}
          contentContainerStyle={styles.topContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Back title="Back" />

          <Text style={[styles.title, {color: colors.text}]}>
            Welcome back
          </Text>

          <View style={styles.form}>
            <TextField
              label="Email"
              value={email}
              onChangeText={text => {
                setEmail(text);
                setFormError(null);
                if (errors.email) {
                  setErrors(e => ({...e, email: undefined}));
                }
              }}
              error={errors.email}
              invalid={!!formError}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <TextField
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={text => {
                setPassword(text);
                setFormError(null);
                if (errors.password) {
                  setErrors(e => ({...e, password: undefined}));
                }
              }}
              error={errors.password}
              invalid={!!formError}
              placeholder="Your password"
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={onSignIn}
            />
          </View>

          {formError ? (
            <Text
              style={[styles.formError, {color: ERROR_COLOR}]}
              accessibilityRole="alert">
              {formError}
            </Text>
          ) : null}

          <Pressable
            onPress={() => navigation.navigate('ResetPassword')}
            hitSlop={wp(3)}
            accessibilityRole="button"
            accessibilityLabel="Forgot password"
            style={styles.forgot}>
            <Text style={[styles.forgotText, {color: colors.accent}]}>
              Forgot password?
            </Text>
          </Pressable>
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Sign in" onPress={onSignIn} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SignIn;

const styles = StyleSheet.create({
  screen: {flex: 1},

  top: {flex: 1},
  topContent: {
    paddingHorizontal: wp(6),
    paddingTop: hp(1),
    paddingBottom: hp(2),
  },

  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.6,
    marginTop: hp(3),
  },

  form: {marginTop: hp(3), gap: hp(1.6)},

  formError: {fontSize: 16, lineHeight: 23, marginTop: hp(2)},

  forgot: {alignSelf: 'flex-start', marginTop: hp(2.4)},
  forgotText: {fontSize: 16, fontWeight: '700'},

  footer: {paddingHorizontal: wp(6), paddingBottom: hp(1)},
});