import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  getFirestore,
  doc,
  getDoc,
} from '@react-native-firebase/firestore';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import type {ImageLibraryOptions} from 'react-native-image-picker';
import {widthPercentageToDP as wp} from 'react-native-responsive-screen';
import Icon from 'react-native-vector-icons/MaterialIcons';
import type {ReceiptDraft} from '../../services/expense';
import {useColors} from '../../theme';

/**
 * Receipt photos: picking one (camera or gallery), loading one from Firestore,
 * and showing it as a small thumbnail or full screen.
 */

/** Longest base64 text we accept. A Firestore document can hold about 1 MB. */
const MAX_BASE64 = 700_000;

const PICKER_OPTIONS: ImageLibraryOptions = {
  mediaType: 'photo',
  includeBase64: true,
  maxWidth: 1000,
  maxHeight: 1400,
  quality: 0.5,
  selectionLimit: 1,
};

const receiptError = (code: string) => Object.assign(new Error(code), {code});

/** Opens the camera or the photo library. Resolves null if the user cancels. */
export async function pickReceipt(
  source: 'camera' | 'library',
): Promise<ReceiptDraft | null> {
  const result =
    source === 'camera'
      ? await launchCamera(PICKER_OPTIONS)
      : await launchImageLibrary(PICKER_OPTIONS);

  if (result.didCancel) {
    return null;
  }
  if (result.errorCode) {
    throw receiptError(result.errorCode);
  }
  const asset = result.assets?.[0];
  if (!asset?.base64) {
    throw receiptError('no-image');
  }
  if (asset.base64.length > MAX_BASE64) {
    throw receiptError('too-large');
  }
  return {
    base64: asset.base64,
    mime: asset.type ?? 'image/jpeg',
    width: asset.width,
    height: asset.height,
  };
}

export function receiptErrorMessage(e: unknown): string {
  switch ((e as {code?: string})?.code) {
    case 'camera_unavailable':
      return "The camera isn't available on this device. Try the gallery instead.";
    case 'permission':
      return 'Allow camera and photo access for Flatmate in Settings, then try again.';
    case 'too-large':
      return 'That photo is too big. Take it again from a little further away, or pick a smaller one.';
    default:
      return "Couldn't get that photo. Please try again.";
  }
}

/* ---------- Loading a saved receipt ---------- */

const cache = new Map<string, string>();

const toUri = (mime: string, data: string) => `data:${mime};base64,${data}`;

/** The receipt picture as an image uri, or null while loading or if it is missing. */
export function useReceipt(flatId: string, receiptId: string | null | undefined) {
  const key = receiptId ? `${flatId}/${receiptId}` : '';
  const [uri, setUri] = useState<string | null>(key ? cache.get(key) ?? null : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!receiptId) {
      setUri(null);
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      setUri(cached);
      return;
    }
    let alive = true;
    setFailed(false);
    getDoc(doc(getFirestore(), 'flats', flatId, 'receipts', receiptId))
      .then(snap => {
        const data = snap.data() as {data?: string; mime?: string} | undefined;
        if (!snap.exists() || !data?.data) {
          throw new Error('missing');
        }
        const next = toUri(data.mime ?? 'image/jpeg', data.data);
        cache.set(key, next);
        if (alive) {
          setUri(next);
        }
      })
      .catch(() => {
        if (alive) {
          setFailed(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [flatId, receiptId, key]);

  return {uri, loading: !!receiptId && !uri && !failed, failed};
}

/**
 * Small rounded picture for a list row. Shows the receipt if there is one (tap to
 * open it), otherwise a default icon.
 */
export const ReceiptThumb = ({
  flatId,
  receiptId,
  size,
  onPress,
  fallbackIcon = 'receipt-long',
}: {
  flatId: string;
  receiptId: string | null | undefined;
  size: number;
  onPress?: () => void;
  fallbackIcon?: string;
}) => {
  const colors = useColors();
  const {uri, loading} = useReceipt(flatId, receiptId);
  const box = [r.thumb, {width: size, height: size, borderRadius: size * 0.28}];

  const content = uri ? (
    <Image source={{uri}} style={r.fill} resizeMode="cover" />
  ) : loading ? (
    <ActivityIndicator color={colors.lightGreen} />
  ) : (
    <Icon name={fallbackIcon} size={size * 0.5} color={colors.textMuted} />
  );

  // No receipt: a plain picture that does nothing when tapped.
  if (!receiptId || !onPress) {
    return (
      <View style={box} accessibilityElementsHidden importantForAccessibility="no">
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel="View receipt"
      style={({pressed}) => [box, pressed && r.pressed]}>
      {content}
    </Pressable>
  );
};

/** Receipt shown in a sheet that slides up. Pinch to zoom. Swipe down or tap ✕ to close. */
export const ReceiptViewer = ({
  flatId,
  receiptId,
  onClose,
}: {
  flatId: string;
  /** Show the viewer when this is set. */
  receiptId: string | null;
  onClose: () => void;
}) => {
  const colors = useColors();
  const {uri, loading, failed} = useReceipt(flatId, receiptId);
  const [box, setBox] = useState({w: 0, h: 0});

  return (
    <Modal
      visible={!!receiptId}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={[r.sheet, {backgroundColor: colors.background}]}>
        {/* The header sits above the picture, so nothing can cover the ✕. */}
        <View style={r.header}>
          <Text style={[r.headerTitle, {color: colors.white}]}>Receipt</Text>
          <Pressable
            onPress={onClose}
            hitSlop={wp(3)}
            accessibilityRole="button"
            accessibilityLabel="Close receipt"
            style={r.close}>
            <Icon name="close" size={wp(6)} color={colors.white} />
          </Pressable>
        </View>

        <View
          style={r.body}
          onLayout={e =>
            setBox({
              w: e.nativeEvent.layout.width,
              h: e.nativeEvent.layout.height,
            })
          }>
          {uri && box.w > 0 ? (
            <ScrollView
              minimumZoomScale={1}
              maximumZoomScale={4}
              centerContent
              bouncesZoom
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}>
              <Image
                source={{uri}}
                style={{width: box.w, height: box.h}}
                resizeMode="contain"
              />
            </ScrollView>
          ) : loading ? (
            <ActivityIndicator color={colors.lightGreen} />
          ) : failed ? (
            <Text style={[r.message, {color: colors.surfaceAlt}]}>
              This receipt couldn't be loaded.
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const r = StyleSheet.create({
  fill: {width: '100%', height: '100%'},
  thumb: {
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {opacity: 0.7},
  sheet: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(6),
    paddingVertical: wp(4),
  },
  headerTitle: {fontSize: 20, fontWeight: '700'},
  close: {
    width: wp(10),
    height: wp(10),
    borderRadius: wp(5),
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  message: {fontSize: 17},
});