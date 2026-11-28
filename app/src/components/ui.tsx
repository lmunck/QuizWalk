/** Small building blocks: cards, rows, pills, banners, fields, steppers, segmented choices. */
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, minTouchTarget, radius, spacing, type as typeScale } from '@/theme/tokens';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

// ------------------------------------------------------------------ card

export function Card({
  children,
  style,
  dark,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const base = [styles.card, dark ? styles.cardDark : null, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        ...base,
        pressed ? { backgroundColor: dark ? colors.inkRaised : colors.tint } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function SectionLabel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <Txt variant="label" color={colors.secondary} caps accessibilityRole="header">
        {children}
      </Txt>
    </View>
  );
}

// ------------------------------------------------------------------ list rows

export function Row({
  label,
  value,
  detail,
  icon,
  onPress,
  last,
  right,
  destructive,
}: {
  label: string;
  value?: string;
  detail?: string;
  icon?: IconName;
  onPress?: () => void;
  last?: boolean;
  right?: ReactNode;
  destructive?: boolean;
}) {
  // At the largest text sizes the value goes under the label, so neither is squeezed to a
  // letter per line.
  const stacked = useWindowDimensions().fontScale > 1.6;
  const content = (
    <View style={[styles.row, !last && styles.rowDivider]}>
      {icon ? (
        <Icon name={icon} size={22} color={destructive ? colors.errorText : colors.secondary} />
      ) : null}
      <View style={styles.rowText}>
        <Txt variant="callout" color={destructive ? colors.errorText : colors.ink}>
          {label}
        </Txt>
        {value && stacked ? <Txt variant="calloutStrong">{value}</Txt> : null}
        {detail ? (
          <Txt variant="caption" color={colors.muted}>
            {detail}
          </Txt>
        ) : null}
      </View>
      {value && !stacked ? (
        <Txt variant="calloutStrong" style={styles.rowValue}>
          {value}
        </Txt>
      ) : null}
      {right}
      {onPress && !right ? <Icon name="chevronRight" size={18} color={colors.muted} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={detail}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.tint } : null)}
    >
      {content}
    </Pressable>
  );
}

export function RowGroup({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.group, style]}>{children}</View>;
}

// ------------------------------------------------------------------ pills

export function Pill({
  label,
  tone = 'plain',
  icon,
}: {
  label: string;
  tone?: 'plain' | 'accent' | 'live' | 'dark' | 'success' | 'warning' | 'error';
  icon?: IconName;
}) {
  const t = PILL[tone];
  return (
    <View
      style={[styles.pill, { backgroundColor: t.bg, borderColor: 'border' in t ? t.border : t.bg }]}
    >
      {icon ? <Icon name={icon} size={14} color={t.fg} strokeWidth={2.4} /> : null}
      <Txt variant="caption" color={t.fg} style={styles.pillText}>
        {label}
      </Txt>
    </View>
  );
}

const PILL = {
  plain: { bg: colors.surface, fg: colors.ink, border: colors.border },
  accent: { bg: colors.accent, fg: colors.white },
  live: { bg: colors.live, fg: colors.white },
  dark: { bg: colors.ink, fg: colors.white },
  success: { bg: colors.successFill, fg: colors.accentPressed },
  warning: { bg: colors.warningFill, fg: colors.warningText },
  error: { bg: colors.errorFill, fg: colors.errorText },
} as const;

// ------------------------------------------------------------------ banners

export function Banner({
  kind = 'info',
  icon,
  title,
  text,
  actionLabel,
  onAction,
}: {
  kind?: 'info' | 'warning' | 'error' | 'success' | 'dark';
  icon?: IconName;
  title?: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const t = BANNER[kind];
  return (
    <View
      style={[styles.banner, { backgroundColor: t.bg, borderColor: t.border }]}
      accessibilityRole="alert"
    >
      <View style={styles.bannerRow}>
        <Icon name={icon ?? t.icon} size={20} color={t.fg} />
        <View style={styles.flex}>
          {title ? (
            <Txt variant="calloutStrong" color={t.fg}>
              {title}
            </Txt>
          ) : null}
          <Txt variant="callout" color={t.fg}>
            {text}
          </Txt>
        </View>
      </View>
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          kind={kind === 'dark' ? 'onDark' : 'secondary'}
          style={styles.bannerAction}
        />
      ) : null}
    </View>
  );
}

const BANNER = {
  info: { bg: colors.surface, fg: colors.ink, border: colors.border, icon: 'info' as const },
  warning: {
    bg: colors.warningFill,
    fg: colors.warningText,
    border: '#E8D3A1',
    icon: 'warning' as const,
  },
  error: {
    bg: colors.errorFill,
    fg: colors.errorText,
    border: '#EBC9B8',
    icon: 'warning' as const,
  },
  success: {
    bg: colors.successFill,
    fg: colors.accentPressed,
    border: '#BFDCC9',
    icon: 'check' as const,
  },
  dark: { bg: colors.ink, fg: colors.white, border: colors.ink, icon: 'info' as const },
};

// ------------------------------------------------------------------ text field

export function Field({
  label,
  helper,
  error,
  style,
  ...input
}: TextInputProps & {
  label: string;
  helper?: string;
  error?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.field, style]}>
      <Txt variant="calloutStrong">{label}</Txt>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        accessibilityHint={error ?? helper}
        {...input}
        style={[
          styles.input,
          input.multiline ? styles.inputMulti : null,
          error ? styles.inputError : null,
        ]}
      />
      {error ? (
        <Txt variant="caption" color={colors.errorText}>
          {error}
        </Txt>
      ) : helper ? (
        <Txt variant="caption" color={colors.muted}>
          {helper}
        </Txt>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ stepper

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  format = String,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <View style={styles.stepperRow}>
      <Txt variant="callout" style={styles.flexShrinkText}>
        {label}
      </Txt>
      <View
        style={styles.stepper}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: format(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + 1));
          if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - 1));
        }}
      >
        <StepButton icon="minus" disabled={value <= min} onPress={() => onChange(value - 1)} />
        <Txt variant="subheading" style={styles.stepperValue}>
          {format(value)}
        </Txt>
        <StepButton icon="plus" disabled={value >= max} onPress={() => onChange(value + 1)} />
      </View>
    </View>
  );
}

function StepButton({
  icon,
  disabled,
  onPress,
}: {
  icon: IconName;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={({ pressed }) => [
        styles.stepButton,
        { opacity: disabled ? 0.35 : 1, backgroundColor: pressed ? colors.tint : colors.surface },
      ]}
    >
      <Icon name={icon} size={20} />
    </Pressable>
  );
}

// ------------------------------------------------------------------ segmented choice

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  // At the largest text sizes the choices go one under the other instead of breaking words.
  const stacked = useWindowDimensions().fontScale > 1.6;
  return (
    <View
      style={[styles.segmented, stacked ? styles.segmentedStacked : null]}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            style={[styles.segment, selected ? styles.segmentSelected : null]}
          >
            <Txt variant="calloutStrong" color={selected ? colors.white : colors.ink} center>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ choice cards (radio)

export function ChoiceCard({
  title,
  text,
  selected,
  onPress,
  icon,
}: {
  title: string;
  text?: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={text ? `${title}. ${text}` : title}
      style={({ pressed }) => [
        styles.choice,
        selected ? styles.choiceSelected : null,
        pressed && !selected ? { backgroundColor: colors.tint } : null,
      ]}
    >
      {icon ? (
        <View style={[styles.choiceIcon, selected ? { backgroundColor: colors.accent } : null]}>
          <Icon name={icon} size={20} color={selected ? colors.white : colors.accent} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <Txt variant="bodyStrong">{title}</Txt>
        {text ? (
          <Txt variant="caption" color={colors.secondary}>
            {text}
          </Txt>
        ) : null}
      </View>
      <View style={[styles.radio, selected ? styles.radioOn : null]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

// ------------------------------------------------------------------ empty state

export function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon: IconName;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={30} color={colors.accent} />
      </View>
      <Txt variant="heading" center>
        {title}
      </Txt>
      {text ? (
        <Txt variant="callout" color={colors.secondary} center>
          {text}
        </Txt>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardDark: { backgroundColor: colors.ink, borderColor: colors.ink },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    minHeight: 52,
    paddingVertical: spacing.sm,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowText: { flex: 1, gap: 2 },
  rowValue: { textAlign: 'right', maxWidth: '55%' },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pillText: { fontFamily: fonts.bodySemiBold },
  banner: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md - 2, gap: spacing.sm + 2 },
  bannerRow: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'flex-start' },
  bannerAction: { alignSelf: 'flex-start' },
  field: { gap: 6 },
  input: {
    ...typeScale.body,
    minHeight: minTouchTarget + 4,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    borderRadius: radius.sm + 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  inputMulti: { minHeight: 96, textAlignVertical: 'top' },
  inputError: { borderColor: colors.error },
  stepperRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 56,
  },
  flexShrinkText: { flexShrink: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepButton: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: minTouchTarget / 2,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: minTouchTarget - 6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  segmentSelected: { backgroundColor: colors.ink },
  segmentedStacked: { flexDirection: 'column', borderRadius: radius.lg },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    padding: spacing.md,
    borderRadius: radius.md + 2,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
    minHeight: 64,
  },
  choiceSelected: { borderColor: colors.accent, borderWidth: 2, backgroundColor: '#F3F9F5' },
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.successFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent },
  empty: {
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.successFill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
});
