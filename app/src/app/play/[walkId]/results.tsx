/**
 * P6 Final results: the final leaderboard with shared ranks, a headline that fits the result,
 * and a note if answers were still unsent when the walk ended (spec §3 P6, §4).
 */
import { formatDistance, plural, resultHeadline } from '@qualk/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Leaderboard } from '@/components/Leaderboard';
import { Podium } from '@/components/Podium';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Banner, EmptyState, SectionLabel } from '@/components/ui';
import { useStops, useWalk } from '@/data/walks';
import { useStandings } from '@/features/standings';
import { rejectedAnswers } from '@/lib/storage';
import { colors, spacing } from '@/theme/tokens';

export default function FinalResults() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  const { uid } = useAuth();
  const walk = useWalk(walkId);
  const inPlay = useStops(walkId).data.filter((s) => !s.skippedForAll).length;
  const { standings, loading } = useStandings(walkId, { startedOnly: true });
  const [rejected, setRejected] = useState(0);

  useEffect(() => {
    void rejectedAnswers(walkId).then((r) => setRejected(r.length));
  }, [walkId]);

  if (walk.loading || loading) {
    return (
      <Screen back={false}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  const w = walk.data;
  if (!w) {
    return (
      <Screen>
        <EmptyState icon="blocked" title="These results are gone" text="The walk was deleted." />
      </Screen>
    );
  }
  const ended = w.status === 'ended';
  const mine = standings.find((s) => s.id === uid);
  const headline = mine
    ? resultHeadline(mine.name, mine.rank, mine.tied, standings.length)
    : `${w.title}: final results`;

  const share = () => {
    const lines = standings
      .slice(0, 5)
      .map(
        (s) => `${s.tied ? `${s.rank}=` : `${s.rank}.`} ${s.name} – ${plural(s.score, 'point')}`,
      );
    void Share.share({
      message: `${headline} on the QuizWalk “${w.title}”!\n\n${lines.join('\n')}`,
    });
  };

  return (
    <Screen
      back={false}
      footer={
        <>
          {mine && ended ? (
            <Button label="Share result" icon="share" kind="secondary" large onPress={share} />
          ) : null}
          <Button label="Done" kind="dark" large onPress={() => router.replace('/')} />
        </>
      }
    >
      <View style={styles.hero}>
        <Txt variant="label" color={colors.accent} caps center>
          {ended ? 'Final results' : 'Results so far'} · {w.title}
        </Txt>
        <Txt variant="display" center accessibilityRole="header">
          {headline}
        </Txt>
        {mine ? (
          <Txt variant="body" color={colors.secondary} center>
            {plural(mine.score, 'point')} · {mine.correctCount} right
            {mine.distanceWalkedM ? ` · ${formatDistance(mine.distanceWalkedM)} walked` : ''}
          </Txt>
        ) : null}
      </View>

      {rejected > 0 ? (
        <Banner
          kind="warning"
          icon="offline"
          text={`${plural(rejected, 'answer')} didn't reach us before the walk ended, so ${rejected === 1 ? 'it was' : 'they were'} not counted.`}
        />
      ) : null}

      {standings.length >= 3 ? <Podium rows={standings.slice(0, 3)} /> : null}

      <View style={styles.block}>
        <SectionLabel>All teams</SectionLabel>
        {standings.length === 0 ? (
          <Txt variant="callout" color={colors.secondary}>
            No team started this walk.
          </Txt>
        ) : (
          <Leaderboard rows={standings} myId={uid} stopCount={inPlay} ended={ended} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm, paddingVertical: spacing.md, alignItems: 'center' },
  block: { gap: spacing.sm },
});
