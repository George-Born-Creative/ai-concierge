import { StyleSheet } from 'react-native';

import { Colors, type ThemeColors } from '@/constants/theme';

type NamedStyles = Record<string, object>;
type StyleSheetApi = {
  create<T extends NamedStyles>(styles: T): T;
};

let activeColors: ThemeColors = Colors.light;
let installed = false;

/**
 * Keeps legacy StyleSheet color declarations theme-aware while screens are
 * migrated to semantic tokens. StyleSheet.create is an identity function in
 * React Native 0.81, so a proxy can resolve color fields each time a component
 * reads a named style. Layout values are returned unchanged.
 *
 * New UI should use useAppTheme().colors directly. This compatibility layer is
 * intentionally centralized so existing pages switch together instead of
 * shipping a partially dark application.
 */
export function installRuntimeThemeStyles() {
  if (installed) return;
  installed = true;

  const api = StyleSheet as unknown as StyleSheetApi;
  const originalCreate = api.create.bind(api);

  api.create = function createThemedStyleSheet<T extends NamedStyles>(
    definitions: T,
  ): T {
    const created = originalCreate(definitions);
    return new Proxy(created, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return value;
        }
        return resolveStyle(value as Record<string, unknown>);
      },
    });
  };
}

export function setRuntimeThemeColors(colors: ThemeColors) {
  activeColors = colors;
}

function resolveStyle(style: Record<string, unknown>) {
  let changed = false;
  const resolved: Record<string, unknown> = { ...style };

  for (const [property, value] of Object.entries(style)) {
    if (!isColorProperty(property) || typeof value !== 'string') continue;
    const next = resolveLegacyColor(property, value);
    if (next !== value) {
      resolved[property] = next;
      changed = true;
    }
  }

  return changed ? resolved : style;
}

function isColorProperty(property: string) {
  return (
    property === 'color' ||
    property === 'backgroundColor' ||
    property === 'borderColor' ||
    property === 'borderTopColor' ||
    property === 'borderBottomColor' ||
    property === 'borderLeftColor' ||
    property === 'borderRightColor' ||
    property === 'shadowColor' ||
    property === 'textDecorationColor' ||
    property === 'tintColor' ||
    property === 'overlayColor'
  );
}

function resolveLegacyColor(property: string, raw: string) {
  if (activeColors === Colors.light) return raw;

  const value = normalizeColor(raw);
  const isText = property === 'color' || property === 'textDecorationColor';
  const isBorder = property.toLowerCase().includes('border');

  // Brand mark colors intentionally stay fixed.
  if (
    value === '#4285f4' ||
    value === '#ea4335' && property === 'backgroundColor' ||
    value === '#fbbc04' ||
    value === '#34a853'
  ) {
    return raw;
  }

  if (value === '#ffffff' || value === '#fff' || value === 'white') {
    if (isText) return activeColors.onPrimary;
    if (isBorder) return activeColors.border;
    return activeColors.surface;
  }
  if (value === '#000000' || value === '#000' || value === 'black') {
    return isText ? activeColors.textPrimary : activeColors.shadow;
  }

  const semantic: Record<string, string> = {
    '#f8faff': activeColors.background,
    '#f8fafc': activeColors.background,
    '#f1f5f9': activeColors.backgroundSecondary,
    '#202124': activeColors.textPrimary,
    '#11181c': activeColors.textPrimary,
    '#111827': activeColors.textPrimary,
    '#0f172a': isText ? activeColors.textPrimary : activeColors.codeBackground,
    '#263238': activeColors.textPrimary,
    '#37474f': activeColors.textSecondary,
    '#374151': activeColors.textSecondary,
    '#3c4043': activeColors.textPrimary,
    '#5f6368': activeColors.textSecondary,
    '#5b6b82': activeColors.textSecondary,
    '#64748b': activeColors.textMuted,
    '#687076': activeColors.textSecondary,
    '#6b7280': activeColors.textSecondary,
    '#80868b': activeColors.textMuted,
    '#94a3b8': activeColors.placeholder,
    '#9aa0a6': activeColors.iconMuted,
    '#9ba1a6': activeColors.iconMuted,
    '#bdc1c6': activeColors.iconMuted,
    '#1a73e8': activeColors.primary,
    '#1f49e0': activeColors.primary,
    '#0a7ea4': activeColors.primary,
    '#1558d6': activeColors.primaryPressed,
    '#7c3aed': activeColors.info,
    '#5e35b1': activeColors.info,
    '#8b5cf6': activeColors.info,
    '#06b6d4': activeColors.info,
    '#174ea6': activeColors.infoText,
    '#e8f0fe': activeColors.primaryMuted,
    '#edf4ff': activeColors.infoSurface,
    '#eef3ff': activeColors.infoSurface,
    '#f1f6ff': activeColors.infoSurface,
    '#e0f7fb': activeColors.infoSurface,
    '#ede9fe': activeColors.infoSurface,
    '#ede7ff': activeColors.infoSurface,
    '#c6dafc': activeColors.infoBorder,
    '#bdd7ff': activeColors.infoBorder,
    '#d2e3fc': activeColors.infoBorder,
    '#d7e6ff': activeColors.infoBorder,
    '#a8c7fa': activeColors.infoBorder,
    '#e8eaed': activeColors.border,
    '#e5e7eb': activeColors.border,
    '#e5eaf5': activeColors.border,
    '#e4ebf7': activeColors.border,
    '#e4e8ee': activeColors.skeletonBase,
    '#e6edf8': activeColors.border,
    '#e6ecff': activeColors.border,
    '#e1e5ea': activeColors.border,
    '#dadce0': activeColors.border,
    '#e0e3e7': activeColors.border,
    '#dde3ec': activeColors.inputBorder,
    '#cbd5e1': activeColors.borderStrong,
    '#eef0f3': activeColors.divider,
    '#f1f3f4': activeColors.surfaceMuted,
    '#f6f8fb': activeColors.surfacePressed,
    '#f6f9fe': activeColors.surfaceMuted,
    '#f0f1f3': activeColors.surfaceMuted,
    '#e6f4ea': activeColors.successSurface,
    '#f1f8f4': activeColors.successSurface,
    '#b7e1c0': activeColors.successBorder,
    '#b7e4c7': activeColors.successBorder,
    '#cde6d5': activeColors.successBorder,
    '#ceead6': activeColors.successBorder,
    '#1e8e3e': activeColors.success,
    '#1e8449': activeColors.success,
    '#1a5c33': activeColors.success,
    '#137333': activeColors.success,
    '#188038': activeColors.success,
    '#fef7e0': activeColors.warningSurface,
    '#fffbec': activeColors.warningSurface,
    '#fef3c7': activeColors.warningSurface,
    '#fce8b2': activeColors.warningBorder,
    '#ffe082': activeColors.warningBorder,
    '#b06000': activeColors.warning,
    '#b7860b': activeColors.warning,
    '#f59e0b': activeColors.warning,
    '#5f4400': activeColors.warningText,
    '#7d5a00': activeColors.warningText,
    '#fdecea': activeColors.dangerSurface,
    '#fff0f0': activeColors.dangerSurface,
    '#fdeded': activeColors.dangerSurface,
    '#fce8e6': activeColors.dangerSurface,
    '#fee2e2': activeColors.dangerSurface,
    '#fff1f2': activeColors.dangerSurface,
    '#fad2cf': activeColors.dangerBorder,
    '#ffbcbc': activeColors.dangerBorder,
    '#f5c2c7': activeColors.dangerBorder,
    '#fecdd3': activeColors.dangerBorder,
    '#b91c1c': activeColors.dangerText,
    '#c0392b': activeColors.danger,
    '#ea4335': activeColors.danger,
    '#7b241c': activeColors.dangerText,
    '#7f1d1d': activeColors.dangerText,
    '#5f2120': activeColors.dangerText,
  };

  if (semantic[value]) return semantic[value];
  if (value === 'rgba(15,23,42,0.45)') return activeColors.scrim;
  return raw;
}

function normalizeColor(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

installRuntimeThemeStyles();
