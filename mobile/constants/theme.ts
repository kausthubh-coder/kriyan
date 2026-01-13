/**
 * Glass morphism design system based on plan.md
 */

import { Platform } from 'react-native';

// Design system colors
export const DesignColors = {
  background: '#0a0a0f',
  surface: '#12121a',
  glass: 'rgba(255, 255, 255, 0.05)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  glassHover: 'rgba(255, 255, 255, 0.08)',
  primary: '#8b5cf6',
  primaryGlow: 'rgba(139, 92, 246, 0.3)',
  accent: '#06b6d4',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  textPrimary: '#fafafa',
  textSecondary: '#a1a1aa',
  textMuted: '#52525b',
};

const tintColorLight = '#8b5cf6';
const tintColorDark = '#8b5cf6';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    surface: '#f4f4f5',
    border: '#e4e4e7',
    primary: '#8b5cf6',
    accent: '#06b6d4',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    textSecondary: '#71717a',
    textMuted: '#a1a1aa',
  },
  dark: {
    text: DesignColors.textPrimary,
    background: DesignColors.background,
    tint: tintColorDark,
    icon: DesignColors.textSecondary,
    tabIconDefault: DesignColors.textMuted,
    tabIconSelected: DesignColors.primary,
    surface: DesignColors.surface,
    border: DesignColors.glassBorder,
    primary: DesignColors.primary,
    accent: DesignColors.accent,
    success: DesignColors.success,
    warning: DesignColors.warning,
    error: DesignColors.error,
    textSecondary: DesignColors.textSecondary,
    textMuted: DesignColors.textMuted,
  },
};

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
