/**
 * P5 Finish: score, right answers, time, distance, "Review our answers". In a week-long walk it
 * also shows the standings so far, so a team that finishes on Tuesday is not left waiting until
 * Sunday (spec §3 P5).
 */
import {
  formatDistance,
  formatWalkTime,
  openUntilLabel,
  ordinal,
  walkEndsAtMs,
  walkProgress,
  formatDayDate,
} from '@qualk/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Leaderboard } from '@/components/Leaderboard';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Banner, Card, SectionLabel } from '@/components/ui';
import { useAnswers, useTeam } from '@/data/teams';
import { useStops, useWalk } from '@/data/walks';
import { useStandings } from '@/features/standings';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function Finish() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  const { uid } = useAuth();
  const walk = useWalk(walkId);
  const team = useTeam(walkId, uid);
  const stops = useStops(walkId);
  const answers = useAnswers(walkId, uid);
  const { standings, fromCache } = useStandings(walkId, { startedOnly: true });

  const progress = useMemo(
    () =>
      walkProgress(
        stops.data,
        answers.data.map((a) => ({ ...a, stopId: a.id })),
      ),
    [stops.data, answers.data],
  );

  if (walk.loading || team.loading || stops.loading || answers.loading) {
    return (
      <Screen back={false}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  const w = walk.data;
  const me = team.data;
  if (!w || !me) return <Redirect href="/" />;
  if (w.status === 'ended') return <Redirect href={`/play/${walkId}/results`} />;

  // The server's totals once synced; until then this phone's own count.
  const synced = me.finishedAt != null && (answers.pendingWrites ?? 0) === 0;
  const score = synced ? me.score : progress.localScore;
  const correct = synced ? me.correctCount : progress.correctCount;
  const lastAnswer = Math.max(0, ...answers.data.map((a) => a.answeredAtClient?.toMillis() ?? 0));
  const time = me.startedAt && lastAnswer ? lastAnswer - me.startedAt.toMillis() : undefined;
  const mine = standings.find((s) => s.id === me.id);
  const week = w.openFor === 'week';
  const endsOn = w.openedAt
    ? formatDayDate(walkEndsAtMs(w.openedAt.toMillis(), w.openFor))
    : undefined;

  return (
    <Screen
      back={false}
      footer={
        <>
          <Button
            label="Review our answers"
            kind="secondary"
            large
            onPress={() => router.push(`/play/${walkId}/answers`)}
          />
          <Button label="Done" kind="dark" large onPress={() => router.replace('/')} />
        </>
      }
    >
      <View style={styles.hero}>
        <Txt variant="label" color={colors.accent} caps center>
          {me.name} · finished
        </Txt>
        <Txt style={styles.score} center accessibilityLabel={`${score} points`}>
          {score}
        </Txt>
        <Txt variant="subheading" center>
          points
        </Txt>
      </View>

      <View style={styles.stats}>
        <Stat label="Right" value={`${correct}/${progress.stops.length}`} />
        <Stat label="Time" value={time !== undefined ? formatWalkTime(time) : '–'} />
        <Stat label="Walked" value={formatDistance(me.distanceWalkedM)} />
      </View>

      {(answers.pendingWrites ?? 0) > 0 ? (
        <Banner
          kind="warning"
          icon="offline"
          text="Some answers are still waiting to send. They go as soon as you are online – keep QuizWalk open for a moment when you are."
        />
      ) : null}

      <View style={styles.block}>
        <SectionLabel>{week ? 'Standings so far' : 'Leaderboard'}</SectionLabel>
        {mine ? (
          <Txt variant="callout" color={colors.secondary}>
            {week
              ? `${ordinal(mine.rank)} of ${standings.length} teams so far. Final results on ${endsOn ?? 'the last day'}.`
              : `${mine.tied ? 'Joint ' : ''}${ordinal(mine.rank)} of ${standings.length} so far. Final results appear when ${w.ownerName || 'the creator'} ends the walk${w.openedAt ? ` (${openUntilLabel(w.openedAt.toMillis(), w.openFor).toLowerCase()})` : ''}.`}
          </Txt>
        ) : null}
        {fromCache ? (
          <Txt variant="caption" color={colors.muted}>
            Offline: the leaderboard updates when you are back online.
          </Txt>
        ) : null}
        <Leaderboard rows={standings} myId={me.id} stopCount={progress.stops.length} />
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.stat}>
      <Txt style={styles.statValue} center numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
      <Txt variant="caption" color={colors.secondary} center>
        {label}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.lg, gap: 2 },
  score: {
    fontFamily: fonts.heading,
    fontSize: 84,
    lineHeight: 90,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  stats: { flexDirection: 'row', gap: spacing.sm + 2 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: spacing.sm },
  statValue: { fontFamily: fonts.heading, fontSize: 22, color: colors.ink },
  block: { gap: spacing.sm, marginTop: spacing.sm },
});
