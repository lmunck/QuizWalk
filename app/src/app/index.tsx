import { JOIN_CODE_LENGTH, joinLink } from '@qualk/shared';
import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme/tokens';

/**
 * M0 placeholder. Proves the dev build runs, routing works and @qualk/shared resolves.
 * C1 Home replaces it in M1.
 */
export default function Index() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Text accessibilityRole="header" style={styles.title}>
          QuizWalk
        </Text>
        <Text style={styles.text}>Development build is running.</Text>
        <Text style={styles.muted}>
          Join codes have {JOIN_CODE_LENGTH} characters, e.g. {joinLink('K72QX')}
        </Text>
        <Text style={styles.muted}>Version {Constants.expoConfig?.version}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: 32, fontWeight: '700', color: colors.accent },
  text: { fontSize: 17, color: colors.ink },
  muted: { fontSize: 15, color: colors.muted },
});
