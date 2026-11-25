import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, minTouchTarget, radius, spacing, type as typeScale } from '@/theme/tokens';

import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

export type ButtonKind =
  /** The one main action on a screen. */
  | 'primary'
  /** Main action on map screens and after answering ("Next stop"). */
  | 'dark'
  /** Outlined, for the second action. */
  | 'secondary'
  /** Destructive actions are never the accent colour and always confirm (§14). */
  | 'destructive'
  /** Light button on the dark walk card. */
  | 'onDark'
  /** Outlined on the dark walk card. */
  | 'onDarkOutline'
  /** Text-only. */
  | 'ghost';

interface Props {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  /** 56 pt for the main bottom action, 48 pt otherwise. */
  large?: boolean;
  /** Read by screen readers when the label alone is not enough. */
  hint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const KIND: Record<ButtonKind, { bg: string; pressed: string; fg: string; border?: string }> = {
  primary: { bg: colors.accent, pressed: colors.accentPressed, fg: colors.white },
  dark: { bg: colors.ink, pressed: colors.inkRaised, fg: colors.white },
  secondary: { bg: colors.surface, pressed: colors.tint, fg: colors.ink, border: colors.ink },
  destructive: {
    bg: colors.surface,
    pressed: colors.errorFill,
    fg: colors.errorText,
    border: colors.error,
  },
  onDark: { bg: colors.white, pressed: colors.tint, fg: colors.ink },
  onDarkOutline: {
    bg: 'transparent',
    pressed: colors.inkRaised,
    fg: colors.white,
    border: colors.inkBorder,
  },
  ghost: { bg: 'transparent', pressed: colors.tint, fg: colors.accent },
};

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  large,
  hint,
  style,
  testID,
}: Props) {
  const k = KIND[kind];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: large ? 56 : minTouchTarget,
          backgroundColor: pressed && !inactive ? k.pressed : k.bg,
          borderColor: k.border ?? 'transparent',
          borderWidth: k.border ? 1.5 : 0,
          opacity: disabled ? 0.45 : 1,
          paddingHorizontal: kind === 'ghost' ? spacing.sm : spacing.lg,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={k.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={20} color={k.fg} strokeWidth={2.2} /> : null}
          <Txt
            variant="button"
            color={k.fg}
            style={kind === 'ghost' ? styles.ghostText : undefined}
            numberOfLines={2}
            center
          >
            {label}
          </Txt>
        </View>
      )}
    </Pressable>
  );
}

/** A round 48 pt icon button (back, close, menu). Always labelled for screen readers. */
export function IconButton({
  icon,
  label,
  onPress,
  tone = 'plain',
  size = 48,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'surface' | 'dark';
  size?: number;
}) {
  const bg = tone === 'surface' ? colors.surface : tone === 'dark' ? colors.ink : 'transparent';
  const fg = tone === 'dark' ? colors.white : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.icon,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: pressed ? colors.tint : bg,
        },
        tone === 'surface' ? styles.iconShadow : null,
      ]}
    >
      <Icon name={icon} color={fg} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ghostText: { ...typeScale.calloutStrong },
  icon: { alignItems: 'center', justifyContent: 'center' },
  iconShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
