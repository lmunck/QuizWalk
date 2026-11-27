/**
 * P6 Final results: the final leaderboard with shared ranks, a headline that fits the result,
 * a result card to share as an image, and a note if answers were still unsent when the walk
 * ended (spec §3 P6, §4).
 */
import {
  cardRows,
  cardStats,
  formatDayDate,
  formatDistance,
  moreTeamsLabel,
  plural,
  resultHeadline,
  resultsLabel,
} from '@qualk/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Leaderboard } from '@/components/Leaderboard';
import { Podium } from '@/components/Podium';
import { Screen } from '@/components/Screen';
import { OffscreenCard, ResultCard } from '@/components/ShareCard';
import { Txt } from '@/components/Txt';
import { Banner, EmptyState, SectionLabel } from '@/components/ui';
import { useStops, useWalk } from '@/data/walks';
import { useShareCard } from '@/features/shareCard';
import { useStandings } from '@/features/standings';
import { rejectedAnswers } from '@/lib/storage';
import { stopPocketMode } from '@/location/pocket';
import { colors, spacing } from '@/theme/tokens';

export default function FinalResults() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  const { uid } = useAuth();
  const walk = useWalk(walkId);
  const inPlay = useStops(walkId).data.filter((s) => !s.skippedForAll).length;
  const { standings, loading } = useStandings(walkId, { startedOnly: true });
  const [rejected, setRejected] = useState(0);
  const card = useShareCard('Share result');

  useEffect(() => {
    void rejectedAnswers(walkId).then((r) => setRejected(r.length));
  }, [walkId]);
  // The walk has ended: tracking stops (spec §9).
  useEffect(() => void stopPocketMode(), []);

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

  const rows = cardRows(standings, 4, mine?.id);
  const day = (w.endedAt ?? w.openedAt)?.toMillis();

  return (
    <Screen
      back={false}
      footer={
        <>
          {mine && ended ? (
            <>
              <OffscreenCard shotRef={card.shotRef}>
                <ResultCard
                  kicker={`${resultsLabel(true)} · ${w.title}`}
                  headline={headline}
                  stats={cardStats({ ...mine, stopCount: inPlay })}
                  rows={rows}
                  highlightId={mine.id}
                  gapBeforeLast={rows.at(-1) !== standings[rows.length - 1]}
                  more={moreTeamsLabel(standings.length, rows.length)}
                  note={day !== undefined ? formatDayDate(day) : undefined}
                />
              </OffscreenCard>
              <Button
                label="Share result"
                icon="share"
                kind="secondary"
                large
                loading={card.sharing}
                onPress={() => void card.share()}
              />
            </>
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
