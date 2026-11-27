/**
 * G1 Welcome: first run without a link. Two equal choices; sign-in appears only after
 * Create a walk (spec §2, §3 G1).
 */
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { WalkIllustration } from '@/components/Illustration';
import { Txt } from '@/components/Txt';
import { markWelcomeSeen } from '@/lib/storage';
import { colors, spacing } from '@/theme/tokens';

export default function Welcome() {
  const insets = useSafeAreaInsets();

  // Saved before leaving, so Home does not send the person straight back here.
  const join = async () => {
    await markWelcomeSeen();
    router.replace('/');
    router.push('/join');
  };
  const create = async () => {
    await markWelcomeSeen();
    router.replace('/');
    router.push({ pathname: '/sign-in', params: { next: 'create' } });
  };

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.lg) },
      ]}
    >
      <View style={styles.hero}>
        <WalkIllustration />
      </View>
      <View style={styles.copy}>
        <Txt variant="display" accessibilityRole="header">
          Turn any walk into a quiz
        </Txt>
        <Txt variant="body" color={colors.secondary}>
          Walk to each stop, answer a question when you get there, and see how your team does
          against the others.
        </Txt>
      </View>
      <View style={styles.actions}>
        <Button label="Join a walk" icon="key" kind="dark" large onPress={join} />
        <Button label="Create a walk" icon="plus" kind="secondary" large onPress={create} />
        <Txt variant="caption" color={colors.muted} center>
          Friends join with a code – no account needed.
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  hero: { alignItems: 'center', flexShrink: 1 },
  copy: { gap: spacing.sm + 2, flex: 1, justifyContent: 'center' },
  actions: { gap: spacing.sm + 4 },
});
