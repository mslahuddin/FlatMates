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
import {signUp, authErrorMessage} from '../../services/auth';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {useNavigation} from '@react-navigation/native';
import {Back} from '../../components/back';
import {Button} from '../../components/button';
import {TextField, type TextFieldRef} from '../../components/textFeild';
import {useColors} from '../../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MIN_NAME = 2;
const MAX_NAME = 30;

type Errors = {name?: string; email?: string; password?: string};

const SignUp = () => {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const emailRef = useRef<TextFieldRef>(null);
  const passwordRef = useRef<TextFieldRef>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const validate = () => {
    const next: Errors = {};
    const trimmed = name.trim();
    if (trimmed.length < MIN_NAME || trimmed.length > MAX_NAME) {
      next.name = `Enter the name your flatmates will see (${MIN_NAME}-${MAX_NAME} characters).`;
    }
    if (!EMAIL_RE.test(email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (password.length < MIN_PASSWORD) {
      next.password = `Use at least ${MIN_PASSWORD} characters.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onContinue = async () => {
    if (loading || !validate()) {
      return;
    }
    setFormError(null);
    try {
      setLoading(true);
      await signUp(email, password, name);
    } catch (e) {
      const msg = authErrorMessage(e);
      if (msg.toLowerCase().includes('email')) {
        setErrors(prev => ({...prev, email: msg}));
      } else {
        setFormError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, {backgroundColor: colors.background}]}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Top section: always starts at the top and scrolls if it is too tall. */}
        <ScrollView
          style={styles.top}
          contentContainerStyle={styles.topContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Back title="Back" />

          <View style={styles.header}>
            <Text style={[styles.title, {color: colors.text}]}>
              Create your account
            </Text>
            <Text style={[styles.subtitle, {color: colors.textSecondary}]}>
              Use an email you check. You can add a photo next.
            </Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Display name"
              value={name}
              onChangeText={text => {
                setName(text);
                if (errors.name) {
                  setErrors(e => ({...e, name: undefined}));
                }
              }}
              error={errors.name}
              hint="This is the name your flatmates will see."
              placeholder="Ahmed"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              maxLength={MAX_NAME}
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
            <TextField
              ref={emailRef}
              label="Email"
              value={email}
              onChangeText={text => {
                setEmail(text);
                if (errors.email) {
                  setErrors(e => ({...e, email: undefined}));
                }
              }}
              error={errors.email}
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
                if (errors.password) {
                  setErrors(e => ({...e, password: undefined}));
                }
              }}
              error={errors.password}
              hint={`At least ${MIN_PASSWORD} characters.`}
              placeholder="Choose a password"
              secureTextEntry
              autoComplete="password-new"
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={onContinue}
            />
            {formError ? (
              <Text
                style={[styles.formError, {color: colors.warning}]}
                accessibilityLiveRegion="polite">
                {formError}
              </Text>
            ) : null}
          </View>
        </ScrollView>

        {/* Bottom section: stays pinned above the keyboard. */}
        <View style={styles.footer}>
          {/* //<Button label="Continue" onPress={onContinue} loading={loading} /> */}
          <Button label="Continue" onPress={onContinue}  />
          <Pressable
            onPress={() => navigation.replace('SignIn')}
            accessibilityRole="button"
            accessibilityLabel="Already have an account? Sign in"
            style={styles.switchRow}>
            <Text style={[styles.switchText, {color: colors.textSecondary}]}>
              Already have an account?{' '}
              <Text style={[styles.switchLink, {color: colors.accent}]}>
                Sign in
              </Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SignUp;

const styles = StyleSheet.create({
  screen: {flex: 1},

  top: {flex: 1},
  topContent: {
    paddingHorizontal: wp(6),
    paddingTop: hp(1),
    paddingBottom: hp(2),
  },

  header: {marginTop: hp(3)},
  title: {fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6},
  subtitle: {fontSize: 17, lineHeight: 24, marginTop: hp(1.2)},

  form: {marginTop: hp(3.5), gap: hp(1.6)},

  footer: {paddingHorizontal: wp(6), paddingBottom: hp(1)},
  switchRow: {alignItems: 'center', paddingVertical: hp(1.6)},
  switchText: {fontSize: 16},
  switchLink: {fontWeight: '700'},
  formError: {fontSize: 16, lineHeight: 22},
});