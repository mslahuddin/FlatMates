import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {Button} from '../../components/button';
import {useNavigation} from '@react-navigation/native';
import {useColors} from '../../theme';


const FEATURES = [
  {icon: 'payments', label: 'Money'},
  {icon: 'cleaning-services', label: 'Duties'},
  {icon: 'shopping-cart', label: 'Shopping'},
  {icon: 'build', label: 'Repairs'},
  {icon: 'how-to-vote', label: 'Polls'},
];

const Welcome = () => {
  const colors = useColors();
const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={[styles.screen, {backgroundColor: colors.background}]}>
      <View style={styles.content}>
        {/* Logo */}
        <View
          style={styles.logoRow}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Flatmate">
          <View style={[styles.logoMark, {backgroundColor: colors.accent}]}>
            <Icon name="flatware" size={wp(7)} color={colors.black} />
          </View>
          <Text style={[styles.wordmark, {color: colors.text}]}>Flatmate</Text>
        </View>

        {/* Headline */}
        <View style={styles.hero}>
          <Text style={[styles.headline, {color: colors.text}]}>
            Everything about living together,{' '}
            <Text style={{color: colors.accent}}>in one place.</Text>
          </Text>
          <Text style={[styles.subtitle, {color: colors.textSecondary}]}>
            Bills, chores, groceries and repairs for your whole flat.
          </Text>
        </View>

        {/* What the app covers */}
        <View
          style={styles.features}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {FEATURES.map(item => (
            <View key={item.label} style={styles.feature}>
              <View
                style={[
                  styles.featureIcon,
                  { borderColor: colors.text},
                ]}>
                <Icon name={item.icon} size={wp(6.5)} color={colors.accent} />
              </View>
              <Text style={[styles.featureLabel, {color: colors.textMuted}]}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.spacer} />

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            label="Create account"
            onPress={() => navigation.navigate('SignUp')}
          />
          <Button
            label="I already have an account"
            variant="ghost"
            onPress={() => navigation.navigate('SignIn')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

export default Welcome;
const styles = StyleSheet.create({
  screen: {flex: 1},
  content: {
    flex: 1,
    paddingHorizontal: wp(6),
    paddingTop: hp(2),
    paddingBottom: hp(1),
  },

  logoRow: {flexDirection: 'row', alignItems: 'center'},
  logoMark: {
    width: wp(12),
    height: wp(12),
    borderRadius: wp(3.5),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: wp(3),
  },
  wordmark: {fontSize: 24, fontWeight: '700', letterSpacing: -0.3},

  hero: {marginTop: hp(6)},
  headline: {fontSize: 36, lineHeight: 41, fontWeight: '700', letterSpacing: -0.8},
  subtitle: {fontSize: 16, lineHeight: 23, marginTop: hp(2)},

  features: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: hp(5),
  },
  feature: {alignItems: 'center', width: wp(16)},
  featureIcon: {
    width: wp(14),
    height: wp(14),
    borderRadius: wp(4),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {fontSize: 12, fontWeight: '500', marginTop: hp(0.8)},

  spacer: {flex: 1},
  actions: {marginBottom: hp(1)},
});