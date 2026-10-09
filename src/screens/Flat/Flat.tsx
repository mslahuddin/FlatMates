import React, {useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
import {getAuth} from '@react-native-firebase/auth';
import {
  leaveFlat,
  removeMember,
  flatErrorMessage,
  type Member,
} from '../../services/flat';
import {useFlat} from '../../hooks/useFlat';
import {useColors} from '../../theme';

/* ---------- Helpers ---------- */

const MONO = Platform.select({ios: 'Menlo', default: 'monospace'});
const AVATAR_COLORS = ['#3B7A68', '#4A6FA5', '#A0661C', '#8B4A7B', '#5C6BC0'];
const CARD_BORDER = 'rgba(255,255,255,0.12)';
const CARD_FILL = 'rgba(0,0,0,0.28)';
const CHIP_FILL = 'rgba(255,255,255,0.07)';
const DANGER = '#E5705F';

const initials = (name: string) =>
  name.trim().slice(0, 1).toUpperCase() + name.trim().slice(1, 2).toLowerCase();

const avatarColor = (index: number) =>
  AVATAR_COLORS[Math.max(index, 0) % AVATAR_COLORS.length];

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/* ---------- Small building blocks ---------- */

const Card = ({
  children,
  dashed,
  style,
}: {
  children: React.ReactNode;
  dashed?: boolean;
  style?: StyleProp<ViewStyle>;
}) => (
  <View style={[styles.card, dashed && styles.cardDashed, style]}>
    {children}
  </View>
);

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

const RolePill = ({role}: {role: Member['role']}) => {
  const colors = useColors();
  return role === 'owner' ? (
    <Pill label="Owner" tint={colors.lightGreen} textColor={colors.lightGreen} />
  ) : (
    <Pill label="Flatmate" tint={colors.white} textColor={colors.surfaceAlt} />
  );
};

const Avatar = ({
  name,
  color,
  size,
}: {
  name: string;
  color: string;
  size: number;
}) => {
  const colors = useColors();
  return (
    <View
      accessible
      accessibilityLabel={name}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}>
      <Text
        style={[
          styles.avatarText,
          {color: colors.white, fontSize: size * 0.34},
        ]}>
        {initials(name)}
      </Text>
    </View>
  );
};

/* ---------- Flat cards ---------- */

const MemberRow = ({
  member,
  color,
  isMe,
  onPress,
}: {
  member: Member;
  color: string;
  isMe: boolean;
  onPress: () => void;
}) => {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={isMe}
      accessibilityRole={isMe ? undefined : 'button'}
      accessibilityLabel={isMe ? `${member.name}, you` : `View ${member.name}`}
      style={({pressed}) => [styles.memberRow, pressed && styles.pressed]}>
      <Avatar name={member.name} color={color} size={wp(12)} />
      <Text style={[styles.memberName, {color: colors.white}]} numberOfLines={1}>
        {member.name}
        {isMe ? (
          <Text style={[styles.memberYou, {color: colors.textMuted}]}>
            {' '}
            (you)
          </Text>
        ) : null}
      </Text>
      <RolePill role={member.role} />
      <View style={styles.chevronSlot}>
        {isMe ? null : (
          <Icon name="chevron-right" size={wp(5.5)} color={colors.textMuted} />
        )}
      </View>
    </Pressable>
  );
};

const ProfileCard = ({
  name,
  email,
  color,
  role,
}: {
  name: string;
  email: string;
  color: string;
  role?: Member['role'];
}) => {
  const colors = useColors();
  return (
    <Card>
      <Label text="YOUR PROFILE" />
      <View style={styles.profileRow}>
        <Avatar name={name} color={color} size={wp(15)} />
        <View style={styles.profileCopy}>
          <Text style={[styles.profileName, {color: colors.white}]}>{name}</Text>
          {email ? (
            <Text
              style={[styles.profileEmail, {color: colors.surfaceAlt}]}
              numberOfLines={1}>
              {email}
            </Text>
          ) : null}
        </View>
        {role ? <RolePill role={role} /> : null}
      </View>
    </Card>
  );
};

/* ---------- Member modal ---------- */

const MemberModal = ({
  member,
  color,
  canRemove,
  busy,
  onClose,
  onRemove,
}: {
  member: Member | null;
  color: string;
  canRemove: boolean;
  busy: boolean;
  onClose: () => void;
  onRemove: () => void;
}) => {
  const colors = useColors();
  return (
    <Modal
      visible={!!member}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        {member ? (
          <SafeAreaView
            edges={['bottom']}
            style={[styles.sheet, {backgroundColor: colors.background}]}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <Avatar name={member.name} color={color} size={wp(20)} />
              <Text style={[styles.sheetName, {color: colors.white}]}>
                {member.name}
              </Text>
              <RolePill role={member.role} />
            </View>

            <Card>
              <View style={styles.detailRow}>
                <Label text="ROLE" />
                <Text style={[styles.detailValue, {color: colors.white}]}>
                  {member.role === 'owner' ? 'Owner' : 'Flatmate'}
                </Text>
              </View>
              {member.joinedAt ? (
                <View style={styles.detailRow}>
                  <Label text="JOINED" />
                  <Text style={[styles.detailValue, {color: colors.white}]}>
                    {formatDate(member.joinedAt)}
                  </Text>
                </View>
              ) : null}
            </Card>

            {canRemove ? (
              <Pressable
                onPress={onRemove}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${member.name} from flat`}
                accessibilityState={{disabled: busy, busy}}
                style={({pressed}) => [
                  styles.danger,
                  pressed && styles.pressed,
                  busy && styles.disabled,
                ]}>
                {busy ? (
                  <ActivityIndicator color={DANGER} />
                ) : (
                  <Text style={[styles.dangerText, {color: DANGER}]}>
                    Remove {member.name} from flat
                  </Text>
                )}
              </Pressable>
            ) : null}

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({pressed}) => [styles.action, pressed && styles.pressed]}>
              <Text style={[styles.actionText, {color: colors.white}]}>
                Close
              </Text>
            </Pressable>
          </SafeAreaView>
        ) : null}
      </View>
    </Modal>
  );
};

/* ---------- Screen ---------- */

const Flat = () => {
  const colors = useColors();
  const {loading, error, flat, members} = useFlat();

  const authUser = getAuth().currentUser;
  const myId = authUser?.uid;
  const isOwner = !!flat && flat.ownerId === myId;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Derived from live data, so the modal closes itself if the member is removed.
  const selected = members.find(m => m.id === selectedId) ?? null;
  const selectedIndex = members.findIndex(m => m.id === selectedId);

  const me = members.find(m => m.id === myId);
  const myIndex = members.findIndex(m => m.id === myId);
  const myName =
    me?.name ||
    authUser?.displayName ||
    authUser?.email?.split('@')[0] ||
    'Flatmate';

  const confirmRemove = () => {
    if (!selected) {
      return;
    }
    Alert.alert(
      `Remove ${selected.name}?`,
      `${selected.name} will lose access to ${flat?.name ?? 'this flat'}. They can rejoin with a new invite code.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            try {
              await removeMember(selected.id);
              setSelectedId(null);
            } catch (e) {
              Alert.alert("Couldn't remove flatmate", flatErrorMessage(e));
            } finally {
              setRemoving(false);
            }
          },
        },
      ],
    );
  };

  const confirmLeave = () => {
    Alert.alert(
      'Leave this flat?',
      isOwner
        ? 'As the owner, you can only leave once you are the last flatmate. The flat and its invite code will be deleted.'
        : 'You will lose access to this flat. You can rejoin with a new invite code.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Leave flat',
          style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            try {
              await leaveFlat();
              // useFlat sees flatId cleared and the dashboard returns to its empty state.
            } catch (e) {
              Alert.alert("Couldn't leave flat", flatErrorMessage(e));
              setLeaving(false);
            }
          },
        },
      ],
    );
  };

  const renderBody = () => {
    if (loading) {
      return (
        <ActivityIndicator color={colors.lightGreen} style={styles.loader} />
      );
    }
    if (error) {
      return (
        <Card dashed>
          <Text style={[styles.hint, {color: colors.surfaceAlt}]}>
            We couldn't load your flat. Check your connection and try again.
          </Text>
        </Card>
      );
    }
    if (!flat) {
      return (
        <Card dashed>
          <Text style={[styles.hint, {color: colors.surfaceAlt}]}>
            You're not in a flat yet. Create one or join with a code from the
            dashboard.
          </Text>
        </Card>
      );
    }
    return (
      <>
        <Card style={styles.flatCard}>
          <Text style={[styles.flatName, {color: colors.white}]}>
            {flat.name}
          </Text>
          {flat.address ? (
            <Text style={[styles.flatAddress, {color: colors.surfaceAlt}]}>
              {flat.address}
            </Text>
          ) : null}
        </Card>

        <View style={styles.section}>
          <Label text={`FLATMATES · ${members.length}`} />
          <View style={styles.memberList}>
            {members.map((member, index) => (
              <MemberRow
                key={member.id}
                member={member}
                color={avatarColor(index)}
                isMe={member.id === myId}
                onPress={() => setSelectedId(member.id)}
              />
            ))}
          </View>
        </View>

        <ProfileCard
          name={myName}
          email={authUser?.email ?? ''}
          color={avatarColor(myIndex)}
          role={me?.role}
        />

        <Pressable
          onPress={confirmLeave}
          disabled={leaving}
          accessibilityRole="button"
          accessibilityLabel="Leave flat"
          accessibilityState={{disabled: leaving, busy: leaving}}
          style={({pressed}) => [
            styles.danger,
            pressed && styles.pressed,
            leaving && styles.disabled,
          ]}>
          {leaving ? (
            <ActivityIndicator color={DANGER} />
          ) : (
            <Text style={[styles.dangerText, {color: DANGER}]}>Leave flat</Text>
          )}
        </Pressable>
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
        <Text style={[styles.title, {color: colors.white}]}>Flat</Text>
        {renderBody()}
      </ScrollView>

      <MemberModal
        member={selected}
        color={avatarColor(selectedIndex)}
        canRemove={isOwner && !!selected && selected.id !== myId}
        busy={removing}
        onClose={() => setSelectedId(null)}
        onRemove={confirmRemove}
      />
    </SafeAreaView>
  );
};

export default Flat;

const styles = StyleSheet.create({
  screen: {flex: 1},
  content: {
    paddingHorizontal: wp(6),
    paddingTop: hp(2),
    paddingBottom: hp(4),
    gap: hp(2.4),
  },
  pressed: {opacity: 0.7},
  disabled: {opacity: 0.4},
  loader: {marginTop: hp(8)},
  hint: {fontSize: 16, lineHeight: 22},

  title: {fontSize: 34, lineHeight: 39, fontWeight: '700', letterSpacing: -0.8},

  card: {
    borderRadius: wp(5),
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_FILL,
    padding: wp(5),
    gap: hp(1.2),
  },
  cardDashed: {borderStyle: 'dashed', backgroundColor: 'transparent'},
  label: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1.6,
  },

  flatCard: {paddingVertical: hp(2.6), gap: hp(0.8)},
  flatName: {fontSize: 26, lineHeight: 31, fontWeight: '700'},
  flatAddress: {fontSize: 18, lineHeight: 24},

  section: {gap: hp(1.2)},
  memberList: {gap: hp(0.4)},
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(3.5),
    paddingVertical: hp(1),
  },
  memberName: {flex: 1, fontSize: 20, fontWeight: '700'},
  memberYou: {fontWeight: '400'},
  chevronSlot: {width: wp(5.5), alignItems: 'center'},

  avatar: {alignItems: 'center', justifyContent: 'center'},
  avatarText: {fontWeight: '700'},

  pill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: wp(3),
    paddingVertical: hp(0.5),
  },
  pillText: {fontFamily: MONO, fontSize: 13, fontWeight: '600'},

  profileRow: {flexDirection: 'row', alignItems: 'center', gap: wp(4)},
  profileCopy: {flex: 1, gap: hp(0.3)},
  profileName: {fontSize: 20, fontWeight: '700'},
  profileEmail: {fontSize: 16},

  danger: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: wp(4),
    borderWidth: 1.5,
    borderColor: DANGER,
    paddingVertical: hp(1.7),
  },
  dangerText: {fontSize: 17, fontWeight: '600'},

  modalRoot: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)'},
  sheet: {
    borderTopLeftRadius: wp(7),
    borderTopRightRadius: wp(7),
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: CARD_BORDER,
    paddingHorizontal: wp(6),
    paddingTop: hp(1.2),
    paddingBottom: hp(1),
    gap: hp(2),
  },
  sheetHandle: {
    alignSelf: 'center',
    width: wp(10),
    height: 4,
    borderRadius: 2,
    backgroundColor: CHIP_FILL,
  },
  sheetHeader: {alignItems: 'center', gap: hp(1.2)},
  sheetName: {fontSize: 26, fontWeight: '700'},
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailValue: {fontSize: 18, fontWeight: '600'},

  action: {
    alignItems: 'center',
    borderRadius: wp(4),
    paddingVertical: hp(1.7),
    backgroundColor: CHIP_FILL,
  },
  actionText: {fontSize: 17, fontWeight: '600'},
});