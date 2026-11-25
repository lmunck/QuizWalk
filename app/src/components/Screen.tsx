/**
 * Screen layout. Every screen scrolls rather than clips at large text sizes, and the bottom
 * actions stay pinned (§14 "Layouts scroll").
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme/tokens';

import { IconButton } from './Button';
import { Txt } from './Txt';

interface ScreenProps {
  title?: string;
  /** Large title in the content instead of a small one in the header bar. */
  largeTitle?: string;
  /** Back by default; 'close' for modal screens; false for none. */
  back?: 'back' | 'close' | false;
  onBack?: () => void;
  headerRight?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  background?: string;
}

export function Screen({
  title,
  largeTitle,
  back = 'back',
  onBack,
  headerRight,
  footer,
  children,
  scroll = true,
  contentStyle,
  background = colors.background,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  const hasHeader = back !== false || !!title || !!headerRight;

  const body = (
    <View style={[styles.content, contentStyle]}>
      {largeTitle ? (
        <Txt variant="title" accessibilityRole="header" style={styles.largeTitle}>
          {largeTitle}
        </Txt>
      ) : null}
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top }}>
        {hasHeader ? (
          <View style={styles.header}>
            <View style={styles.side}>
              {back ? (
                <IconButton
                  icon={back === 'close' ? 'close' : 'back'}
                  label={back === 'close' ? 'Close' : 'Back'}
                  onPress={goBack}
                />
              ) : null}
            </View>
            {title ? (
              <Txt
                variant="bodyStrong"
                accessibilityRole="header"
                numberOfLines={1}
                style={styles.title}
              >
                {title}
              </Txt>
            ) : (
              <View style={styles.title} />
            )}
            <View style={[styles.side, styles.right]}>{headerRight}</View>
          </View>
        ) : null}
      </View>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{body}</View>
      )}
      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, spacing.md), backgroundColor: background },
          ]}
        >
          {footer}
        </View>
      ) : (
        <View style={{ height: insets.bottom }} />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.sm,
  },
  side: { minWidth: 48, flexDirection: 'row', alignItems: 'center' },
  right: { justifyContent: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
  scrollContent: { flexGrow: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
  },
  largeTitle: { marginTop: spacing.xs },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 4,
    gap: spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
});
