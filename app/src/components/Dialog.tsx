/**
 * A confirm dialog drawn as a bottom card. Destructive actions always confirm (§14), and some
 * confirms carry a choice (Open walk: Today / This week), which the system alert cannot.
 */
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/theme/tokens';

import { Button, type ButtonKind } from './Button';
import { Txt } from './Txt';

export interface DialogAction {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  loading?: boolean;
  disabled?: boolean;
}

export function Dialog({
  visible,
  title,
  text,
  children,
  actions,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  text?: string;
  children?: ReactNode;
  actions: DialogAction[];
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityLabel="Close"
          accessibilityRole="button"
        />
        <View
          style={[styles.card, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm }]}
          accessibilityViewIsModal
        >
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <Txt variant="heading" accessibilityRole="header">
              {title}
            </Txt>
            {text ? (
              <Txt variant="callout" color={colors.secondary}>
                {text}
              </Txt>
            ) : null}
            {children}
          </ScrollView>
          <View style={styles.actions}>
            {actions.map((a) => (
              <Button
                key={a.label}
                label={a.label}
                onPress={a.onPress}
                kind={a.kind ?? 'primary'}
                loading={a.loading}
                disabled={a.disabled}
                large
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  card: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.lg,
    maxHeight: '88%',
  },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md - 4, paddingBottom: spacing.md },
  actions: { paddingHorizontal: spacing.lg, gap: spacing.sm + 2 },
});
