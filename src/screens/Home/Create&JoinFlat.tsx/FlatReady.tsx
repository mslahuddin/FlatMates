import React, {useEffect, useRef, useState} from 'react';
import {Platform, Pressable, Share, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import Clipboard from '@react-native-clipboard/clipboard';
import QRCode from 'react-native-qrcode-svg';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import {useColors , MONO} from '../../../theme';

/* ---------- Helpers ---------- */


const CHIP_FILL = 'rgba(255,255,255,0.07)';
const QR_SIZE = wp(34);
const QR_FOREGROUND = '#0F1A17';
const QR_BACKGROUND = '#E8F0EC';

type Params = {FlatCreated: {flatName: string; inviteCode: string}};

const inviteMessage = (flatName: string, code: string) =>
  `Join ${flatName} on Flatmate. Invite code: ${code}`;

/* ---------- Screen ---------- */

const FlatCreated = () => {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const {params} = useRoute<RouteProp<Params, 'FlatCreated'>>();
  const {flatName, inviteCode} = params;

  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const onCopy = () => {
    Clipboard.setString(inviteCode);
    setCopied(true);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  const onShare = async () => {
    try {
      await Share.share({message: inviteMessage(flatName, inviteCode)});
    } catch {
      // The user closed the share sheet or sharing is unavailable.
    }
  };

  const onDone = () => navigation.popToTop();

  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={[styles.screen, {backgroundColor: colors.background}]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, {color: colors.text}]}>
            {flatName} is ready
          </Text>
          <Text style={[styles.subtitle, {color: colors.textSecondary}]}>
            Share this code with your flatmates. It works for 7 days.
          </Text>
        </View>

        <View style={styles.ticketWrap}>
          <View style={[styles.ticket, {borderColor: colors.accent}]}>
            <View
              style={[
                StyleSheet.absoluteFill,
                {backgroundColor: colors.accent, opacity: 0.16},
              ]}
            />
            <Text
              selectable
              style={[styles.code, {color: colors.accent}]}
              accessibilityLabel={`Invite code ${inviteCode}`}>
              {inviteCode}
            </Text>
          </View>
          <View
            style={[
              styles.notch,
              styles.notchLeft,
              {
                borderColor: colors.accent,
                backgroundColor: colors.background,
              },
            ]}
          />
          <View
            style={[
              styles.notch,
              styles.notchRight,
              {
                borderColor: colors.accent,
                backgroundColor: colors.background,
              },
            ]}
          />
        </View>

       

        <View style={styles.actions}>
          <Pressable
            onPress={onCopy}
            accessibilityRole="button"
            accessibilityLabel={`Copy invite code ${inviteCode}`}
            style={({pressed}) => [styles.action , {backgroundColor: colors.chip}, pressed && styles.pressed]}>
            <Text style={[styles.actionText, {color: colors.text}]}>
              {copied ? 'Copied' : 'Copy code'}
            </Text>
          </Pressable>
         
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Go to dashboard"
          style={({pressed}) => [
            styles.cta,
            {backgroundColor: colors.accent},
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.ctaText, {color: colors.black}]}>
            Go to dashboard
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

export default FlatCreated;

const styles = StyleSheet.create({
  screen: {flex: 1},
  content: {
    flex: 1,
    paddingHorizontal: wp(6),
    paddingTop: hp(3),
    gap: hp(2.4),
  },
  footer: {
    paddingHorizontal: wp(6),
    paddingTop: hp(1),
    paddingBottom: hp(1),
  },
  pressed: {opacity: 0.7},

  header: {gap: hp(1.2)},
  title: {fontSize: 34, lineHeight: 39, fontWeight: '700', letterSpacing: -0.8},
  subtitle: {fontSize: 18, lineHeight: 25},

  ticketWrap: {justifyContent: 'center'},
  ticket: {
    overflow: 'hidden',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: wp(8),
    paddingVertical: hp(1.8),
  },
  code: {
    fontFamily: MONO,
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: 2,
  },
  notch: {
    position: 'absolute',
    width: wp(5),
    height: wp(5),
    borderRadius: wp(2.5),
    borderWidth: 2,
  },
  notchLeft: {left: -wp(2.5)},
  notchRight: {right: -wp(2.5)},

  qr: {alignSelf: 'center'},

  actions: {flexDirection: 'row', gap: wp(3)},
  action: {
    flex: 1,
    alignItems: 'center',
    borderRadius: wp(4),
    paddingVertical: hp(1.7),
  },
  actionText: {fontSize: 17, fontWeight: '600'},

  cta: {
    height: hp(8),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: wp(8),
  },
  ctaText: {fontSize: 20, fontWeight: '700'},
});