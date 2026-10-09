import {useColorScheme} from 'react-native';

export const lightColors = {
  background: '#18231F',
  lightGreen:'#50C2A5',
  lightGreen2:'#97e1ce',
  black:'#000000',
  white:'#FFFFFF',
  surfaceAlt: '#E8ECE7',
  border: '#D2DAD4',
  text: '#13201C',
  textSecondary: '#435650',
  textMuted: '#7B8C85',
  accent: '#0E6F5C',
  onAccent: '#FFFFFF',
};

export const darkColors: typeof lightColors = {
  background: '#0F1816',
  surface: '#17231F',
  surfaceAlt: '#1F2E29',
  border: '#2C3D37',
  text: '#E6EEEA',
  textSecondary: '#A5B5AE',
  textMuted: '#72837C',
  accent: '#4FC3A5',
  onAccent: '#0A1713',
};

export type Colors = typeof lightColors;

/** Returns the light or dark palette to match the phone's setting. */
export function useColors(): Colors {
  return useColorScheme() === 'dark' ? darkColors : lightColors;
}

//export const spacing = {xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32};
//export const radius = {sm: 8, md: 12, lg: 16};
