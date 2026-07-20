/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

// Single source of truth for the app-wide surface color and header metrics.
// Used by ScreenShell, PageHeader and AppHeader so the status-bar area, header
// band and page body never differ in color, and header action buttons line up
// at the same vertical level on every screen.
/** Square hit-target for header action buttons (back, history, etc.). */
export const HEADER_ACTION = 40;
/** Header content row height, excluding the status-bar inset. */
export const HEADER_ROW = 56;

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/**
 * Semantic colors used throughout the app. Screen code should reference the
 * purpose of a color (surface, textSecondary, dangerSurface, etc.) rather than
 * embed light-only literals.
 */
export const Colors = {
  light: {
    background: '#F8FAFF',
    backgroundSecondary: '#F1F5F9',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    surfaceMuted: '#F6F8FB',
    surfacePressed: '#F1F3F4',
    surfaceSelected: '#E8F0FE',
    text: '#202124',
    textPrimary: '#202124',
    textSecondary: '#5F6368',
    textMuted: '#80868B',
    textInverse: '#FFFFFF',
    link: '#1A73E8',
    primary: '#1A73E8',
    primaryPressed: '#1558B0',
    primaryMuted: '#E8F0FE',
    onPrimary: '#FFFFFF',
    tint: '#1A73E8',
    icon: '#5F6368',
    iconMuted: '#9AA0A6',
    border: '#E8EAED',
    borderStrong: '#CBD5E1',
    divider: '#EEF0F3',
    focusRing: '#1A73E8',
    inputBackground: '#FFFFFF',
    inputBorder: '#DDE3EC',
    placeholder: '#94A3B8',
    selection: '#1A73E8',
    headerBackground: '#F8FAFF',
    tabBackground: '#FFFFFF',
    tabActive: '#1A73E8',
    tabInactive: '#5F6368',
    scrim: 'rgba(15,23,42,0.45)',
    shadow: '#000000',
    success: '#1E8E3E',
    successSurface: '#E6F4EA',
    successBorder: '#B7E1C0',
    warning: '#B06000',
    warningText: '#5F4400',
    warningSurface: '#FEF7E0',
    warningBorder: '#FCE8B2',
    danger: '#EA4335',
    dangerText: '#B91C1C',
    dangerSurface: '#FDECEA',
    dangerBorder: '#FAD2CF',
    info: '#1A73E8',
    infoText: '#174EA6',
    infoSurface: '#E8F0FE',
    infoBorder: '#C6DAFC',
    userBubble: '#1A73E8',
    assistantBubble: '#FFFFFF',
    codeBackground: '#F1F5F9',
    quoteBorder: '#94A3B8',
    skeletonBase: '#E8EDF5',
    skeletonHighlight: '#F5F7FB',
    tabIconDefault: '#5F6368',
    tabIconSelected: '#1A73E8',
  },
  dark: {
    background: '#0B1220',
    backgroundSecondary: '#0F172A',
    surface: '#111827',
    surfaceElevated: '#172033',
    surfaceMuted: '#182235',
    surfacePressed: '#1E293B',
    surfaceSelected: '#1E3A5F',
    text: '#F8FAFC',
    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    textInverse: '#0B1220',
    link: '#8AB4F8',
    primary: '#2563EB',
    primaryPressed: '#3B82F6',
    primaryMuted: '#17345C',
    onPrimary: '#FFFFFF',
    tint: '#6EA8FE',
    icon: '#CBD5E1',
    iconMuted: '#94A3B8',
    border: '#263244',
    borderStrong: '#3A475B',
    divider: '#243044',
    focusRing: '#8AB4F8',
    inputBackground: '#0F172A',
    inputBorder: '#334155',
    placeholder: '#7F8EA3',
    selection: '#8AB4F8',
    headerBackground: '#0B1220',
    tabBackground: '#111827',
    tabActive: '#8AB4F8',
    tabInactive: '#94A3B8',
    scrim: 'rgba(2,6,23,0.72)',
    shadow: '#000000',
    success: '#68D391',
    successSurface: '#123222',
    successBorder: '#285C3D',
    warning: '#F6C453',
    warningText: '#FDE68A',
    warningSurface: '#3A2B10',
    warningBorder: '#6B4F1D',
    danger: '#FF8178',
    dangerText: '#FCA5A5',
    dangerSurface: '#3B171B',
    dangerBorder: '#6B2A30',
    info: '#8AB4F8',
    infoText: '#BFDBFE',
    infoSurface: '#132B4A',
    infoBorder: '#28558A',
    userBubble: '#285EA8',
    assistantBubble: '#172033',
    codeBackground: '#0F172A',
    quoteBorder: '#64748B',
    skeletonBase: '#1E293B',
    skeletonHighlight: '#334155',
    tabIconDefault: '#94A3B8',
    tabIconSelected: '#8AB4F8',
  },
} as const;

export type ThemeColors = {
  [K in keyof typeof Colors.light]: string;
};

/** @deprecated Use useAppTheme().colors.background in rendered components. */
export const APP_BG = Colors.light.background;
/** @deprecated Use useAppTheme().colors.border in rendered components. */
export const BORDER = Colors.light.border;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
