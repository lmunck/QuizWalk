/**
 * P3's walk menu: live standings, answers so far, the rules, Leave walk (spec §3 P3).
 * Leaving keeps the points and stops tracking at once.
 */
import { plural } from '@qualk/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { Button, IconButton } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Leaderboard } from '@/components/Leaderboard';
import { Txt } from '@/components/Txt';
import { Row, RowGroup, SectionLabel } from '@/components/ui';
import { leaveWalk } from '@/data/teams';
import type { Walk } from '@/data/walks';
import { useOffline } from '@/lib/network';
import { stopPocketMode } from '@/location/pocket';
import { colors, spacing } from '@/theme/tokens';

import { useStandings } from './standings';

export function WalkMenu({
  visible,
  onDismiss,
  walk,
  myTeamId,
  score,
  radiusM,
}: {
  visible: boolean;
  onDismiss: () => void;
  walk: Walk;
  myTeamId: string;
  score: number;
  radiusM: number;
}) {
  const insets = useSafeAreaInsets();
  const { uid } = useAuth();
  const { standings } = useStandings(visible ? walk.id : undefined, { startedOnly: true });
  const offline = useOffline();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [rules, setRules] = useState(false);

  const leave = () => {
    if (uid) leaveWalk(walk.id, uid, true);
    void stopPocketMode();
    setConfirmLeave(false);
    onDismiss();
    router.replace('/');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={[styles.root, { paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Txt variant="heading" accessibilityRole="header" style={styles.flex} numberOfLines={1}>
            {walk.title}
          </Txt>
          <IconButton icon="close" label="Close" onPress={onDismiss} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.block}>
            <SectionLabel>Standings so far</SectionLabel>
            {offline ? (
              <Txt variant="caption" color={colors.muted}>
                Offline: standings update when you are back online.
              </Txt>
            ) : null}
            <Leaderboard rows={standings} myId={myTeamId} stopCount={walk.stopCount} compact />
          </View>
          <RowGroup>
            <Row
              icon="list"
              label="Our answers so far"
              onPress={() => {
                onDismiss();
                router.push(`/play/${walk.id}/answers`);
              }}
            />
            <Row icon="info" label="How it works" onPress={() => setRules(true)} />
            <Row
              icon="logout"
              label="Leave walk"
              destructive
              onPress={() => setConfirmLeave(true)}
              last
            />
          </RowGroup>
          <Button label="Back to the walk" kind="dark" large onPress={onDismiss} />
        </ScrollView>
      </View>

      <Dialog
        visible={confirmLeave}
        title="Leave the walk?"
        text={`You keep your ${plural(score, 'point')}. You can come back with the same code.`}
        onDismiss={() => setConfirmLeave(false)}
        actions={[
          { label: 'Leave walk', kind: 'destructive', onPress: leave },
          { label: 'Keep walking', kind: 'ghost', onPress: () => setConfirmLeave(false) },
        ]}
      />
      <Dialog
        visible={rules}
        title="How it works"
        onDismiss={() => setRules(false)}
        actions={[{ label: 'Got it', onPress: () => setRules(false) }]}
      >
        <Txt variant="callout">
          • Walk to the stops in order. The next one is revealed when you answer or skip.{'\n'}• The
          question opens within {radiusM} m of the stop. With weak GPS the circle widens a little.
          {'\n'}• A right answer is 10 points, plus up to 5 for speed. The bonus clock starts when
          you tap Show question.{'\n'}• {"Can't reach a stop? Use I'm here (no speed bonus),"}
          skip it, or report the way as blocked.{'\n'}• Ties are split by right answers, then by
          walk time.
        </Txt>
      </Dialog>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  content: { padding: spacing.lg, gap: spacing.lg },
  block: { gap: spacing.sm },
});
