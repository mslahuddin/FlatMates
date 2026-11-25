import {Platform, useColorScheme} from 'react-native';

/** Font for the small uppercase labels. */
export const MONO = Platform.select({ios: 'Menlo', default: 'monospace'});

/** One colour per flatmate, by position in the flat. Same in light and dark. */
export const AVATAR_COLORS = [
  '#3B7A68',
  '#4A6FA5',
  '#A0661C',
  '#8B4A7B',
  '#5C6BC0',
];

/** Same in light and dark. */
const shared = {
  lightGreen: '#50C2A5',
  lightGreen2: '#97E1CE',
  black: '#000000',
  white: '#FFFFFF',
};

export type Colors = typeof shared & {
  /** Screen background. */
  background: string;
  /** Raised surfaces (sheets, inputs). */
  surface: string;
  /** A fill, for chips and inset tiles. Never use it as a text colour. */
  surfaceAlt: string;
  /** Card fill and outline. */
  card: string;
  cardBorder: string;
  /** Fill for chips, tiles and disabled buttons. */
  chip: string;
  /** Thin line between list rows. */
  divider: string;
  border: string;
  /** Main text. */
  text: string;
  /** Descriptions and secondary lines. */
  textSecondary: string;
  /** Small labels and hints. */
  textMuted: string;
  accent: string;
  /** Text or icons placed on top of accent. */
  onAccent: string;
  /** Tab bar background. */
  tabBar: string;
  /** Status colours: text, line and icon. */
  danger: string;
  warning: string;
  success: string;
  /** Soft tints behind status cards. */
  dangerBg: string;
  warningBg: string;
  successBg: string;
};

export const lightColors: Colors = {
  ...shared,
  background: '#F2F4F1',
  surface: '#FFFFFF',
  surfaceAlt: '#E8ECE7',
  card: '#FFFFFF',
  cardBorder: '#D8E0DA',
  chip: '#E8ECE7',
  divider: '#D8E0DA',
  border: '#D8E0DA',
  text: '#13201C',
  textSecondary: '#435650',
  textMuted: '#5E6F68',
  accent: '#0E6F5C',
  onAccent: '#FFFFFF',
  tabBar: 'rgba(255,255,255,0.92)',
  danger: '#C8463A',
  warning: '#B8730F',
  success: '#2E8B4B',
  dangerBg: '#FBEAE8',
  warningBg: '#FBF1DF',
  successBg: '#E6F3EA',
};

export const darkColors: Colors = {
  ...shared,
  background: '#0F1816',
  surface: '#17231F',
  surfaceAlt: '#243630',
  card: 'rgba(255,255,255,0.045)',
  cardBorder: 'rgba(255,255,255,0.10)',
  chip: 'rgba(255,255,255,0.07)',
  divider: 'rgba(255,255,255,0.18)',
  border: '#2C3D37',
  text: '#E6EEEA',
  textSecondary: '#A5B5AE',
  textMuted: '#8A9B94',
  accent: '#4FC3A5',
  onAccent: '#0A1713',
  tabBar: 'rgba(15,24,22,0.92)',
  danger: '#E5675B',
  warning: '#EBA24F',
  success: '#7BC98F',
  dangerBg: 'rgba(229,103,91,0.12)',
  warningBg: 'rgba(235,162,79,0.10)',
  successBg: 'rgba(123,201,143,0.08)',
};

/** Returns the light or dark palette to match the phone's setting. */
export function useColors(): Colors {
  return useColorScheme() === 'dark' ? darkColors : lightColors;
}
export const useIsDark = () => useColorScheme() === 'dark';