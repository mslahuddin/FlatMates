import {useColorScheme} from 'react-native';

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
  surfaceAlt: string;
  /** Translucent card fill and its outline. */
  card: string;
  cardBorder: string;
  border: string;
  /** Main text. Use this instead of white. */
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  /** Text or icons placed on top of accent. */
  onAccent: string;
};

export const lightColors: Colors = {
  ...shared,
  background: '#F2F4F1',
  surface: '#FFFFFF',
  surfaceAlt: '#E8ECE7',
  card: '#FFFFFF',
  cardBorder: '#D2DAD4',
  border: '#D2DAD4',
  text: '#13201C',
  textSecondary: '#435650',
  textMuted: '#5E6F68',
  accent: '#0E6F5C',
  onAccent: '#FFFFFF',
};

export const darkColors: Colors = {
  ...shared,
  background: '#0F1816',
  surface: '#17231F',
  surfaceAlt: '#abb1af',
  card: 'rgba(0,0,0,0.28)',
  cardBorder: 'rgba(255,255,255,0.12)',
  border: '#2C3D37',
  text: '#E6EEEA',
  textSecondary: '#A5B5AE',
  textMuted: '#8A9B94',
  accent: '#4FC3A5',
  onAccent: '#0A1713',
};

/** Returns the light or dark palette to match the phone's setting. */
export function useColors(): Colors {
  return useColorScheme() === 'dark' ? darkColors : lightColors;
}