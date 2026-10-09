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

type Errors = {email?: string; password?: string};

const SignUp = () => {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const passwordRef = useRef<TextFieldRef>(null);
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const validate = () => {
    const next: Errors = {};
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
  if (!validate()) return;           // your existing email/password checks
  try {
    setLoading(true);
    await signUp(email, password);
  } catch (e) {
    const msg = authErrorMessage(e);
    if (msg.toLowerCase().includes('email')) setEmailError(msg);
    else setFormError(msg);
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
            <Text style={[styles.title, {color: colors.white}]}>
              Create your account
            </Text>
            <Text style={[styles.subtitle, {color: colors.surfaceAlt}]}>
              Use an email you check. You can add a photo next.
            </Text>
          </View>

          <View style={styles.form}>
            <TextField
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
            <Text style={[styles.switchText, {color: colors.surfaceAlt}]}>
              Already have an account?{' '}
              <Text style={[styles.switchLink, {color: colors.lightGreen}]}>
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
});