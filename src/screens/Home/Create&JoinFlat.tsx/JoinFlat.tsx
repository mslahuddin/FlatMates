import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import {joinFlat, flatErrorMessage} from '../../../services/flat';
import {useColors} from '../../../theme';

/* ---------- Helpers ---------- */

const MONO = Platform.select({ios: 'Menlo', default: 'monospace'});
const CARD_BORDER = 'rgba(255,255,255,0.12)';
const CARD_FILL = 'rgba(0,0,0,0.28)';
const CHIP_FILL = 'rgba(255,255,255,0.07)';

type Params = {JoinFlat: {scannedCode?: string} | undefined};

// Codes look like DUNDEE-4821: letters, digits and a hyphen only.
const cleanCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9-]/g, '');

/* ---------- Screen ---------- */

const JoinFlat = () => {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<Params, 'JoinFlat'>>();

  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = code.length > 0 && !submitting;

  // A QR scanner screen can navigate back here with `scannedCode`.
  const scannedCode = route.params?.scannedCode;
  useEffect(() => {
    if (scannedCode) {
      setCode(cleanCode(scannedCode));
      setError('');
    }
  }, [scannedCode]);

  const onChange = (value: string) => {
    setCode(cleanCode(value));
    if (error) {
      setError('');
    }
  };

  const onJoin = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await joinFlat(code);
      // useFlat picks up the new flat from Firestore, so the dashboard updates itself.
      navigation.popToTop();
    } catch (e) {
      setError(flatErrorMessage(e));
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
            <Text style={[styles.backText, {color: colors.lightGreen}]}>
              ‹ Back
            </Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={[styles.title, {color: colors.white}]}>
              Join a flat
            </Text>
            <Text style={[styles.subtitle, {color: colors.surfaceAlt}]}>
              Type the code a flatmate sent you, or scan their QR.
            </Text>
          </View>

          <View
            style={[
              styles.field,
              focused && {borderColor: colors.lightGreen, borderWidth: 1.5},
              !!error && !focused && styles.fieldError,
            ]}>
            <Text style={[styles.label, {color: colors.textMuted}]}>
              INVITE CODE
            </Text>
            <TextInput
              value={code}
              onChangeText={onChange}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={onJoin}
              placeholder="DUNDEE-4821"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              returnKeyType="go"
              maxLength={16}
              accessibilityLabel="Invite code"
              style={[styles.input, {color: colors.white}]}
            />
          </View>

          <Pressable
            onPress={() => navigation.navigate('ScanQR')}
            accessibilityRole="button"
            accessibilityLabel="Scan QR code"
            style={({pressed}) => [styles.scan, pressed && styles.pressed]}>
            <Text style={[styles.scanText, {color: colors.white}]}>
              Scan QR code
            </Text>
          </Pressable>

          {error ? (
            <Text
              accessibilityRole="alert"
              style={[styles.error, {color: colors.surfaceAlt}]}>
              {error}
            </Text>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={onJoin}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Find flat"
            accessibilityState={{disabled: !canSubmit, busy: submitting}}
            style={({pressed}) => [
              styles.cta,
              {backgroundColor: colors.lightGreen},
              pressed && styles.pressed,
              !canSubmit && styles.disabled,
            ]}>
            {submitting ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={[styles.ctaText, {color: colors.black}]}>
                Find flat
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default JoinFlat;

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
  header: {gap: hp(1.2)},
  title: {fontSize: 34, lineHeight: 39, fontWeight: '700', letterSpacing: -0.8},
  subtitle: {fontSize: 18, lineHeight: 25},

  field: {
    borderRadius: wp(5),
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_FILL,
    paddingHorizontal: wp(5),
    paddingVertical: hp(1.8),
    gap: hp(0.6),
  },
  fieldError: {borderColor: 'rgba(255,255,255,0.35)'},
  label: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1.6,
  },
  input: {
    fontFamily: MONO,
    fontSize: 22,
    fontWeight: '600',
    padding: 0,
    margin: 0,
  },

  scan: {
    alignItems: 'center',
    borderRadius: wp(5),
    paddingVertical: hp(2),
    backgroundColor: CHIP_FILL,
  },
  scanText: {fontSize: 18, fontWeight: '600'},

  error: {fontSize: 16, lineHeight: 22},

  cta: {
    height: hp(8),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: wp(8),
  },
  ctaText: {fontSize: 20, fontWeight: '700'},
});