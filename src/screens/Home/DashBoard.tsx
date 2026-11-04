import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Clipboard from '@react-native-clipboard/clipboard';
import {useNavigation} from '@react-navigation/native';
import {getAuth} from '@react-native-firebase/auth';
import {signOut} from '../../services/auth';
import type {Member} from '../../services/flat';
import {useFlat} from '../../hooks/useFlat';
import {useColors , AVATAR_COLORS , MONO} from '../../theme';
import Money from '../../screens/Money/Money';
/* ---------- Helpers ---------- */



const MAX_AVATARS = 5;



const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  return hour < 18 ? 'Good afternoon' : 'Good evening';
};

const initials = (name: string) =>
  name.trim().slice(0, 1).toUpperCase() + name.trim().slice(1, 2).toLowerCase();

/* ---------- Small building blocks ---------- */

const Card = ({
  children,
  dashed,
  style,
}: {
  children: React.ReactNode;
  dashed?: boolean;
  style?: StyleProp<ViewStyle>;
}) => {
  const colors = useColors();

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: colors.cardBorder,
          backgroundColor: dashed ? 'transparent' : colors.card,
        },
        dashed && styles.cardDashed,
        style,
      ]}>
      {children}
    </View>
  );
};

const Label = ({text}: {text: string}) => {
  const colors = useColors();
  return <Text style={[styles.label, {color: colors.textMuted}]}>{text}</Text>;
};

const Pill = ({
  label,
  tint,
  textColor,
}: {
  label: string;
  tint: string;
  textColor: string;
}) => (
  <View style={styles.pill}>
    <View
      style={[StyleSheet.absoluteFill, {backgroundColor: tint, opacity: 0.16}]}
    />
    <Text style={[styles.pillText, {color: textColor}]}>{label}</Text>
  </View>
);

/* ---------- Flat cards ---------- */

const FlatmatesCard = ({
  members,
  maxMembers,
  onInvite,
}: {
  members: Member[];
  maxMembers: number;
  onInvite: () => void;
}) => {
  const colors = useColors();
  const visible = members.slice(0, MAX_AVATARS);
  const extra = members.length - visible.length;
  const hasOpenSlot = members.length < maxMembers;

  return (
    <Card>
      <View style={styles.rowBetween}>
        <Label text="FLATMATES" />
        <Pill
          label={`${members.length} of ${maxMembers} joined`}
          tint={colors.text}
          textColor={colors.textSecondary}
        />
      </View>

      <View style={styles.avatars}>
        {visible.map((member, index) => (
          <View
            key={member.id}
            accessible
            accessibilityLabel={member.name}
            style={[
              styles.avatar,
              {
                backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
                borderColor: colors.background,
                marginLeft: index === 0 ? 0 : -wp(2.5),
              },
            ]}>
            <Text style={[styles.avatarText, {color: colors.text}]}>
              {initials(member.name)}
            </Text>
          </View>
        ))}

        {extra > 0 ? (
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: colors.chip,
                borderColor: colors.background,
                marginLeft: -wp(2.5),
              },
            ]}>
            <Text style={[styles.avatarText, {color: colors.text}]}>
              +{extra}
            </Text>
          </View>
        ) : null}

        {hasOpenSlot ? (
          <Pressable
            onPress={onInvite}
            accessibilityRole="button"
            accessibilityLabel="Invite a flatmate"
            style={[
              styles.avatar,
              styles.avatarOpen,
              {borderColor: colors.textMuted, marginLeft: -wp(1)},
            ]}>
            <Icon name="add" size={wp(4.5)} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
};

const InviteCard = ({code, flatName}: {code: string; flatName: string}) => {
  const colors = useColors();
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
    Clipboard.setString(code);
    setCopied(true);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  const onShare = async () => {
    try {
      await Share.share({
        message: `Join ${flatName} on Flatmate. Invite code: ${code}`,
      });
    } catch {
      // The user closed the share sheet or sharing is unavailable.
    }
  };

  return (
    <Card>
      <Label text="INVITE CODE" />

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
            accessibilityLabel={`Invite code ${code}`}>
            {code}
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
          accessibilityLabel={`Copy invite code ${code}`}
          style={({pressed}) => [styles.action, {backgroundColor: colors.chip}, pressed && styles.pressed]}>
          <Text style={[styles.actionText, {color: colors.text}]}>
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onShare}
          accessibilityRole="button"
          accessibilityLabel="Share invite code"
          style={({pressed}) => [styles.action, {backgroundColor: colors.chip}, pressed && styles.pressed]}>
          <Text style={[styles.actionText, {color: colors.text}]}>Share</Text>
        </Pressable>
      </View>
    </Card>
  );
};

/* ---------- No-flat cards ---------- */

const CreateFlatCard = ({onPress}: {onPress: () => void}) => {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Create a flat"
      style={({pressed}) => pressed && styles.pressed}>
      <Card style={[styles.choiceCard, {borderColor: colors.accent}]}>
        <View
          style={[styles.addCircle, {backgroundColor: colors.accent}]}>
          <Icon name="home" size={wp(8)} color={colors.black} />
        </View>
        <Text style={[styles.choiceTitle, {color: colors.text}]}>
          Create a flat
        </Text>
        <Text style={[styles.choiceSub, {color: colors.textSecondary}]}>
          Set up your place and invite your flatmates.
        </Text>
      </Card>
    </Pressable>
  );
};

const JoinFlatCard = ({onPress}: {onPress: () => void}) => {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Join a flat"
      style={({pressed}) => pressed && styles.pressed}>
      <Card dashed style={styles.choiceCard}>
        <View
          style={[
            styles.addCircle,
            styles.addCircleDashed,
            {borderColor: colors.accent},
          ]}>
          <Icon name="add" size={wp(8)} color={colors.accent} />
        </View>
        <Text style={[styles.choiceTitle, {color: colors.text}]}>
          Join a flat
        </Text>
        <Text style={[styles.choiceSub, {color: colors.textSecondary}]}>
          Enter a code or scan a QR from a flatmate.
        </Text>
      </Card>
    </Pressable>
  );
};

const ComingNextCard = () => {
  const colors = useColors();
  return (
    <Card dashed>
      <Label text="COMING NEXT" />
      <View style={styles.chips}>
        {['Money', 'Duties', 'Shopping'].map(item => (
          <View key={item}  style={[styles.chip, {backgroundColor: colors.chip}]}>
            <Text style={[styles.chipText, {color: colors.textMuted}]}>
              {item}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
};

/* ---------- Screen ---------- */

const Dashboard = () => {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const {loading, error, profileName, flat, members} = useFlat();

  const authUser = getAuth().currentUser;
  const name =
    profileName ||
    authUser?.displayName ||
    authUser?.email?.split('@')[0] ||
    'there';
  const isOwner = !!flat && flat.ownerId === authUser?.uid;

  const shareInvite = async () => {
    if (!flat) {
      return;
    }
    try {
      await Share.share({
        message: `Join ${flat.name} on Flatmate. Invite code: ${flat.inviteCode}`,
      });
    } catch {
      // The user closed the share sheet or sharing is unavailable.
    }
  };

  const renderBody = () => {
    if (loading) {
      return (
        <ActivityIndicator
          color={colors.accent}
          style={styles.loader}
        />
      );
    }
    if (error) {
      return (
        <Card dashed>
          <Text style={[styles.choiceSub, {color: colors.textSecondary}]}>
            We couldn't load your flat. Check your connection and try again.
          </Text>
        </Card>
      );
    }
    if (flat) {
      return (
        <>
          <FlatmatesCard
            members={members}
            maxMembers={flat.maxMembers}
            onInvite={shareInvite}
          />
          <InviteCard code={flat.inviteCode} flatName={flat.name} />
          <ComingNextCard />
        </>
      );
    }
    return (
      <>
        <CreateFlatCard onPress={() => navigation.navigate('CreateFlat')} />
        <JoinFlatCard onPress={() => navigation.navigate('JoinFlat')} />
      </>
    );
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.screen, {backgroundColor: colors.background}]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View>
          <Text style={[styles.title, {color: colors.text}]}>
            {greeting()}, {name}
          </Text>
          <Pressable onPress={signOut}>
            <Text style={{color: colors.accent}}>Sign out</Text>
          </Pressable>

          {flat ? (
            <View style={styles.flatRow}>
              <Text style={[styles.flatName, {color: colors.textSecondary}]}>
                {flat.name}
              </Text>
              {isOwner ? (
                <>
                  <Text style={[styles.flatName, {color: colors.textSecondary}]}>
                    ·
                  </Text>
                  <Pill
                    label="Owner"
                    tint={colors.accent}
                    textColor={colors.accent}
                  />
                </>
              ) : null}
            </View>
          ) : !loading && !error ? (
            <Text style={[styles.flatName, {color: colors.textSecondary}]}>
              You're not in a flat yet.
            </Text>
          ) : null}
        </View>

        {renderBody()}
      </ScrollView>
    </SafeAreaView>
  );
};

export default Dashboard;

const styles = StyleSheet.create({
  screen: {flex: 1},
  content: {
    paddingHorizontal: wp(6),
    paddingTop: hp(2),
    paddingBottom: hp(4),
    gap: hp(2),
  },
  pressed: {opacity: 0.7},
  loader: {marginTop: hp(8)},

  title: {fontSize: 34, lineHeight: 39, fontWeight: '700', letterSpacing: -0.8},
  flatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: wp(2),
    marginTop: hp(1),
  },
  flatName: {fontSize: 18, marginTop: hp(0.2)},

  card: {
    borderRadius: wp(5),
    borderWidth: 1,
   
    padding: wp(5),
    gap: hp(1.6),
  },
  cardDashed: {borderStyle: 'dashed', backgroundColor: 'transparent'},
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1.6,
  },

  pill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: wp(3),
    paddingVertical: hp(0.5),
  },
  pillText: {fontFamily: MONO, fontSize: 13, fontWeight: '600'},

  avatars: {flexDirection: 'row', alignItems: 'center'},
  avatar: {
    width: wp(11.5),
    height: wp(11.5),
    borderRadius: wp(6),
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {fontSize: 16, fontWeight: '700'},
  avatarOpen: {borderStyle: 'dashed', borderWidth: 1.5},

  ticketWrap: {justifyContent: 'center'},
  ticket: {
    overflow: 'hidden',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: wp(8),
    paddingVertical: hp(1.6),
  },
  code: {
    fontFamily: MONO,
    fontSize: 26,
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

  actions: {flexDirection: 'row', gap: wp(3)},
  action: {
    flex: 1,
    alignItems: 'center',
    borderRadius: wp(4),
    paddingVertical: hp(1.5),
  },
  actionText: {fontSize: 17, fontWeight: '600'},

  choiceCard: {alignItems: 'center', paddingVertical: hp(4)},
  addCircle: {
    width: wp(16),
    height: wp(16),
    borderRadius: wp(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCircleDashed: {borderWidth: 1.5, borderStyle: 'dashed'},
  choiceTitle: {fontSize: 22, fontWeight: '700'},
  choiceSub: {fontSize: 16, lineHeight: 22, textAlign: 'center'},

  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: wp(2.5)},
  chip: {
    borderRadius: 999,

    paddingHorizontal: wp(4),
    paddingVertical: hp(1),
  },
  chipText: {fontSize: 17},
});