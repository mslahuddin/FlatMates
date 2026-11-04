import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import MapView, {Marker} from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import {getAuth} from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  onSnapshot,
} from '@react-native-firebase/firestore';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {EmptyState} from '../../components/emptyState';
import { MemberAvatar} from '../../components/memberAvatar';
import {useFlat} from '../../hooks/useFlat';
import {
  askForAlways,
  askForPermission,
  getPermission,
  publishLocation,
  stopSharing,
} from '../../services/location';
import type {LocPermission, StoredLocation} from '../../services/location';
import {useColors , MONO , AVATAR_COLORS} from '../../theme';


const GREEN = '#7BC98F';
const ORANGE = '#EBA24F';
const CARD_BORDER = 'rgba(255,255,255,0.12)';

/** "Always" people count as live while their last update is newer than this. */
const LIVE_MINUTES = 10;
/** Write to Firestore at most this often (the free plan has daily write limits). */
const PUBLISH_EVERY_MS = 60_000;
/** Ignore tiny movements. Metres. */
const DISTANCE_FILTER = 30;


/* ---------- Live data ---------- */

const toDate = (v: unknown): Date | null => {
  const t = v as {toDate?: () => Date} | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate() : null;
};

/** Everyone's latest location document, by uid. */
function useLocations(flatId: string | undefined) {
  const [locs, setLocs] = useState<Record<string, StoredLocation>>({});
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!flatId) {
      setLocs({});
      setReady(false);
      return;
    }
    return onSnapshot(
      collection(getFirestore(), 'flats', flatId, 'locations'),
      snap => {
        const next: Record<string, StoredLocation> = {};
        snap.docs.forEach(d => {
          const x = d.data() as Record<string, any>;
          next[d.id] = {
            permission: (x.permission ?? 'undetermined') as LocPermission,
            sharing: x.sharing === true,
            lat: typeof x.lat === 'number' ? x.lat : null,
            lng: typeof x.lng === 'number' ? x.lng : null,
            updatedAt: toDate(x.updatedAt),
          };
        });
        setLocs(next);
        setError(false);
        setReady(true);
      },
      () => setError(true),
    );
  }, [flatId]);

  return {locs, error, ready};
}

/* ---------- Time and status ---------- */

const clock = (d: Date) =>
  d.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});

const ago = (d: Date, now: Date) => {
  const mins = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60000));
  if (mins < 1) {
    return 'just now';
  }
  if (mins < 60) {
    return `${mins} min ago`;
  }
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs} h ago` : `${Math.floor(hrs / 24)} d ago`;
};

/** "14:32", or "Yesterday 14:32" / "3 Nov 14:32" when it is not today. */
const lastSeenAt = (d: Date, now: Date) => {
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return clock(d);
  }
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) {
    return `Yesterday ${clock(d)}`;
  }
  return `${d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'})} ${clock(d)}`;
};

type Kind = 'live' | 'lastSeen' | 'disabled' | 'waiting';

type Status = {kind: Kind; color: string; title: string; detail: string};
const statusOf = (
  loc: StoredLocation | undefined,
  now: Date,
  colors: ReturnType<typeof useColors>,
): Status => {
  if (!loc) {
    return {
      kind: 'waiting',
      color: '#72837C',
      title: 'Not shared yet',
      detail: "Hasn't opened the map yet",
    };
  }
  if (loc.permission === 'denied' || !loc.sharing) {
    return {
      kind: 'disabled',
      color: '#72837C',
      title: 'Location disabled',
      detail:
        loc.permission === 'denied'
          ? 'Location access is turned off'
          : 'Sharing is switched off',
    };
  }
  if (loc.lat === null || loc.lng === null || !loc.updatedAt) {
    return {
      kind: 'waiting',
      color: '#72837C',
      title: 'Finding location…',
      detail: 'Waiting for a first position',
    };
  }
  const fresh =
    (now.getTime() - loc.updatedAt.getTime()) / 60000 <= LIVE_MINUTES;
  if (loc.permission === 'always' && fresh) {
    return {
      kind: 'live',
      color: colors.success,
      title: 'Live',
      detail: `Updated ${ago(loc.updatedAt, now)}`,
    };
  }
  return {
    kind: 'lastSeen',
    color: colors.warning,
    title: `Last seen ${lastSeenAt(loc.updatedAt, now)}`,
    detail:
      loc.permission === 'always'
        ? ago(loc.updatedAt, now)
        : `${ago(loc.updatedAt, now)} · shares while using the app`,
  };
};

/* ---------- Screen ---------- */

const Location = () => {
 
  const scheme = useColorScheme();
  const mapRef = useRef<MapView>(null);
  const fittedRef = useRef(false);
  const colors = useColors();

  const {loading, error: flatError, flat, members} = useFlat();
  const {locs, error: locError, ready} = useLocations(flat?.id);
  const me = getAuth().currentUser?.uid ?? '';

  const [permission, setPermission] = useState<LocPermission | null>(null);
  const [wantShare, setWantShare] = useState(true);
  const [now, setNow] = useState(new Date());
  const [active, setActive] = useState(AppState.currentState === 'active');

  // Keeps "2 min ago" fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Re-check the phone's setting whenever the app comes back to the front,
  // because the person may have changed it in Settings.
  const refreshPermission = useCallback(async () => {
    setPermission(await getPermission());
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      setActive(s === 'active');
      if (s === 'active') {
        refreshPermission();
      }
    });
    return () => sub.remove();
  }, [refreshPermission]);

  // First time on this screen: ask for permission.
  useEffect(() => {
    if (!flat) {
      return;
    }
    (async () => {
      const current = await getPermission();
      setPermission(
        current === 'undetermined' ? await askForPermission() : current,
      );
    })();
  }, [flat]);

  // Use my saved "sharing" choice once it loads. Nothing is published before that,
  // so opening the screen never overrides a "sharing off" choice.
  const myDoc = locs[me];
  const [choiceReady, setChoiceReady] = useState(false);
  useEffect(() => {
    if (ready && !choiceReady) {
      setWantShare(!myDoc || myDoc.permission === 'denied' ? true : myDoc.sharing);
      setChoiceReady(true);
    }
  }, [ready, choiceReady, myDoc]);

  // Tell flatmates when I have no access (so they see "Location disabled").
  const flatId = flat?.id;
  useEffect(() => {
    if (!flatId || !choiceReady || permission === null || permission === 'undetermined') {
      return;
    }
    if (permission === 'denied') {
      if (myDoc?.permission !== 'denied' || myDoc?.sharing) {
        stopSharing(flatId, 'denied').catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatId, permission, choiceReady]);

  // Watch my position and publish it.
  const lastWrite = useRef(0);
  useEffect(() => {
    const allowed = permission === 'always' || permission === 'whenInUse';
    if (!flatId || !allowed || !wantShare || !choiceReady) {
      return;
    }
    // While using the app: only watch while the app is open.
    // Always: keep going in the background.
    if (permission === 'whenInUse' && !active) {
      return;
    }
    const level = permission === 'always' ? 'always' : 'whenInUse';
    Geolocation.setRNConfiguration({
      skipPermissionRequests: true,
      authorizationLevel: level,
      enableBackgroundLocationUpdates: permission === 'always',
    });
    const id = Geolocation.watchPosition(
      pos => {
        const t = Date.now();
        if (t - lastWrite.current < PUBLISH_EVERY_MS) {
          return;
        }
        lastWrite.current = t;
        publishLocation(
          flatId,
          permission,
          pos.coords.latitude,
          pos.coords.longitude,
        ).catch(() => {});
      },
      () => {},
      {
        enableHighAccuracy: false,
        distanceFilter: DISTANCE_FILTER,
        interval: 60000,
        fastestInterval: 30000,
      },
    );
    // Publish straight away when the screen opens, instead of waiting for movement.
    lastWrite.current = 0;
    Geolocation.getCurrentPosition(
      pos => {
        lastWrite.current = Date.now();
        publishLocation(
          flatId,
          permission,
          pos.coords.latitude,
          pos.coords.longitude,
        ).catch(() => {});
      },
      () => {},
      {enableHighAccuracy: false, timeout: 15000, maximumAge: 60000},
    );
    return () => Geolocation.clearWatch(id);
  }, [flatId, permission, wantShare, active, choiceReady]);

  /* ----- Actions ----- */

  const toggleShare = async (value: boolean) => {
    if (!flatId) {
      return;
    }
    if (value && (permission === 'denied' || permission === 'undetermined')) {
      if (permission === 'undetermined') {
        setPermission(await askForPermission());
        setWantShare(true);
      } else {
        Linking.openSettings();
      }
      return;
    }
    setWantShare(value);
    if (!value && permission) {
      stopSharing(flatId, permission).catch(() => {});
    }
  };

  const upgradeToAlways = async () => {
    const next = await askForAlways();
    setPermission(next);
    if (next !== 'always') {
      // iOS only asks once. After that, it has to be changed in Settings.
      Linking.openSettings();
    }
  };

  /* ----- Map ----- */

  const pins = useMemo(
    () =>
      members
        .map((m, index) => ({m, index, loc: locs[m.id]}))
        .filter(
          x =>
            x.loc &&
            x.loc.sharing &&
            x.loc.lat !== null &&
            x.loc.lng !== null &&
            x.loc.permission !== 'denied',
        ),
    [members, locs],
  );

  // Zoom to fit everyone the first time pins appear.
  useEffect(() => {
    if (pins.length === 0 || fittedRef.current) {
      return;
    }
    fittedRef.current = true;
    const coords = pins.map(p => ({
      latitude: p.loc!.lat as number,
      longitude: p.loc!.lng as number,
    }));
    setTimeout(
      () =>
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: {top: 80, right: 80, bottom: 80, left: 80},
          animated: true,
        }),
      300,
    );
  }, [pins]);

  const focusOn = (uid: string) => {
    const loc = locs[uid];
    if (!loc || loc.lat === null || loc.lng === null) {
      return;
    }
    mapRef.current?.animateToRegion(
      {
        latitude: loc.lat,
        longitude: loc.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      400,
    );
  };

  /* ----- Render ----- */

  if (loading) {
    return (
      <SafeAreaView style={[s.screen, {backgroundColor: colors.background}]}>
        <ActivityIndicator color={colors.accent} style={s.loader} />
      </SafeAreaView>
    );
  }
  if (flatError || locError || !flat) {
    return (
      <SafeAreaView style={[s.screen, {backgroundColor: colors.background}]}>
        <EmptyState
          icon={flat ? 'cloud-off' : 'home'}
          title={flat ? "Couldn't load locations" : 'No flat yet'}
          description={
            flat
              ? 'Check your connection and try again.'
              : 'Create or join a flat to see where your flatmates are.'
          }
        />
      </SafeAreaView>
    );
  }

  const sharingNow =
    wantShare && (permission === 'always' || permission === 'whenInUse');
  const others = members.filter(m => m.id !== me).length;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[s.screen, {backgroundColor: colors.background}]}>
      <View style={s.header}>
        <Text style={[s.title, {color: colors.text}]}>Location</Text>
      </View>

      <View style={s.mapWrap}>
        <MapView
          ref={mapRef}
          style={s.map}
          userInterfaceStyle={scheme === 'dark' ? 'dark' : 'light'}
          showsPointsOfInterests={false}
          initialRegion={{
            latitude: 56.462,
            longitude: -2.971,
            latitudeDelta: 0.2,
            longitudeDelta: 0.2,
          }}>
          {pins.map(({m, index, loc}) => {
           const st = statusOf(loc, now, colors);
            return (
              <Marker
                key={`${m.id}-${loc!.updatedAt?.getTime() ?? 0}-${st.kind}`}
                coordinate={{latitude: loc!.lat!, longitude: loc!.lng!}}
                title={m.id === me ? `${m.name} (you)` : m.name}
                description={`${st.title} · ${st.detail}`}
                tracksViewChanges={false}>
                <View
                  style={[
                    s.pin,
                    {
                      backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
                      borderColor: st.color,
                      opacity: st.kind === 'live' ? 1 : 0.75,
                    },
                  ]}>
                  <Text style={s.pinText}>{m.name.trim().slice(0, 1).toUpperCase()}</Text>
                </View>
              </Marker>
            );
          })}
        </MapView>
        {pins.length === 0 ? (
          <View style={s.mapNote} pointerEvents="none">
            <Text style={s.mapNoteText}>
              No one is sharing a location yet
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={s.screen}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}>
        {/* My own sharing settings */}
      <View style={[s.card, {backgroundColor: colors.card , borderColor: colors.cardBorder}]}>
          <View style={s.row}>
            <View style={s.flex}>
              <Text style={[s.cardTitle, {color: colors.text}]}>
                Share my location
              </Text>
              <Text style={[s.sub, {color: colors.textMuted}]}>
                {permission === 'always'
                  ? 'Allowed: always'
                  : permission === 'whenInUse'
                  ? 'Allowed: while using the app'
                  : permission === 'denied'
                  ? 'Location access is off for Flatmate'
                  : 'Checking…'}
              </Text>
            </View>
            <Switch
              value={sharingNow}
              onValueChange={toggleShare}
              trackColor={{true: colors.accent}}
              accessibilityLabel="Share my location"
            />
          </View>

          {sharingNow ? (
            <View style={s.banner}>
              <Icon name="location-on" size={wp(4.6)} color={colors.success} />
              <Text style={[s.bannerText, {color: colors.success}]}>
                {others > 0
                  ? `Sharing with ${others} flatmate${others === 1 ? '' : 's'}`
                  : 'Sharing with your flat'}
              </Text>
            </View>
          ) : null}

          {permission === 'whenInUse' ? (
            <Pressable
              onPress={upgradeToAlways}
              accessibilityRole="button"
              style={({pressed}) => [s.linkBtn, pressed && s.pressed]}>
              <Text style={[s.linkText, {color: colors.accent}]}>
                Allow always, so flatmates see you when the app is closed
              </Text>
            </Pressable>
          ) : null}

          {permission === 'denied' ? (
            <Pressable
              onPress={() => Linking.openSettings()}
              accessibilityRole="button"
              style={({pressed}) => [s.linkBtn, pressed && s.pressed]}>
              <Text style={[s.linkText, {color: colors.accent}]}>
                Open Settings to allow location
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={[s.label, {color: colors.textMuted}]}>FLATMATES</Text>

        {members.map((m, index) => {
         const st = statusOf(locs[m.id], now, colors);
          const canFocus = st.kind === 'live' || st.kind === 'lastSeen';
          return (
            <Pressable
              key={m.id}
              onPress={() => focusOn(m.id)}
              disabled={!canFocus}
              accessibilityRole="button"
              accessibilityLabel={`${m.name}. ${st.title}. ${st.detail}`}
              style={({pressed}) => [s.card,  s.memberRow,   {backgroundColor: colors.card, borderColor: colors.cardBorder},pressed && s.pressed]}>
              <MemberAvatar name={m.name} index={index} size={wp(11)} />
              <View style={s.flex}>
                <Text style={[s.cardTitle, {color: colors.text}]}>
                  {m.name}
                  {m.id === me ? ' (you)' : ''}
                </Text>
                <View style={s.statusLine}>
                  <View style={[s.dot, {backgroundColor: st.color}]} />
                  <Text style={[s.statusTitle, {color: st.color}]}>
                    {st.title}
                  </Text>
                </View>
                <Text style={[s.sub, {color: colors.textMuted}]}>
                  {st.detail}
                </Text>
              </View>
              {canFocus ? (
                <Icon name="my-location" size={wp(5.5)} color={colors.textMuted} />
              ) : (
                <Icon name="location-off" size={wp(5.5)} color={colors.textMuted} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
};

export default Location;

const s = StyleSheet.create({
  screen: {flex: 1},
  flex: {flex: 1},
  pressed: {opacity: 0.7},
  loader: {marginTop: hp(8)},
  header: {paddingHorizontal: wp(6), paddingTop: hp(2), paddingBottom: hp(1.2)},
  title: {fontSize: 34, lineHeight: 39, fontWeight: '700', letterSpacing: -0.8},

  mapWrap: {
    height: hp(33),
    marginHorizontal: wp(6),
    borderRadius: wp(5),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  map: {flex: 1},
  mapNote: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: wp(3),
    alignItems: 'center',
  },
  mapNoteText: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: wp(3),
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  pin: {
    width: wp(10),
    height: wp(10),
    borderRadius: wp(5),
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinText: {color: '#fff', fontWeight: '700', fontSize: 16},

  content: {
    paddingHorizontal: wp(6),
    paddingTop: hp(2),
    paddingBottom: hp(4),
    gap: hp(1.4),
  },
  label: {fontFamily: MONO, fontSize: 13, fontWeight: '500', letterSpacing: 1.6},
  card: {
    borderRadius: wp(5),
    borderWidth: 1,    
    padding: wp(4.5),
    gap: hp(1),
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: wp(3)},
  cardTitle: {fontSize: 19, fontWeight: '700'},
  sub: {fontSize: 15, lineHeight: 21},
  banner: {flexDirection: 'row', alignItems: 'center', gap: wp(2)},
  bannerText: {fontSize: 16, fontWeight: '600'},
  linkBtn: {paddingVertical: 4},
  linkText: {fontSize: 16, fontWeight: '600'},
  memberRow: {flexDirection: 'row', alignItems: 'center', gap: wp(3.5)},
  statusLine: {flexDirection: 'row', alignItems: 'center', gap: wp(1.8)},
  dot: {width: 9, height: 9, borderRadius: 5},
  statusTitle: {fontSize: 16, fontWeight: '600'},
});