/**
 * C9 Results: podium and stats. Tapping a team opens C8. Reuse walk duplicates it as a new
 * draft; Share results shares an image card of the standings (spec §3 C9).
 */
import {
  cardRows,
  formatDayDate,
  leadersHeadline,
  moreTeamsLabel,
  plural,
  resultsLabel,
} from '@qualk/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Leaderboard } from '@/components/Leaderboard';
import { Podium } from '@/components/Podium';
import { Screen } from '@/components/Screen';
import { OffscreenCard, ResultCard } from '@/components/ShareCard';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { Card, SectionLabel } from '@/components/ui';
import { duplicateWalk } from '@/data/callables';
import { errorMessage } from '@/data/errors';
import { useStops, useWalk } from '@/data/walks';
import { useShareCard } from '@/features/shareCard';
import { useStandings } from '@/features/standings';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function Results() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  const { uid } = useAuth();
  const toast = useToast();
  const walk = useWalk(walkId);
  const inPlay = useStops(walkId).data.filter((s) => !s.skippedForAll).length;
  const { standings, loading } = useStandings(walkId, { startedOnly: true });
  const [copying, setCopying] = useState(false);
  const card = useShareCard('Share results');

  if (walk.loading || loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  const w = walk.data;
  if (!w || w.ownerUid !== uid) return <Redirect href="/" />;

  const finished = standings.filter((t) => t.finishedAt).length;
  const avg = standings.length
    ? Math.round(standings.reduce((s, t) => s + t.score, 0) / standings.length)
    : 0;

  const reuse = async () => {
    setCopying(true);
    try {
      const res = await duplicateWalk(w.id);
      toast('Copied as a new draft');
      router.replace(`/walk/${res.walkId}/route`);
    } catch (err) {
      toast(errorMessage(err, 'Could not copy the walk. Try again.'), 'error');
    } finally {
      setCopying(false);
    }
  };

  const final = w.status === 'ended';
  const rows = cardRows(standings, 5);
  const day = (w.endedAt ?? w.openedAt)?.toMillis();

  return (
    <Screen
      title="Results"
      onBack={() => router.replace('/')}
      footer={
        <View style={styles.footer}>
          <OffscreenCard shotRef={card.shotRef}>
            <ResultCard
              kicker={`${resultsLabel(final)} · ${w.title}`}
              headline={leadersHeadline(
                standings.filter((s) => s.rank === 1).map((s) => s.name),
                final,
              )}
              subline={`${plural(standings.length, 'team')} · ${plural(inPlay, 'stop')}`}
              rows={rows}
              more={moreTeamsLabel(standings.length, rows.length)}
              note={day !== undefined ? formatDayDate(day) : undefined}
            />
          </OffscreenCard>
          <Button
            label="Reuse walk"
            icon="copy"
            kind="secondary"
            loading={copying}
            style={styles.flex}
            onPress={() => void reuse()}
          />
          <Button
            label="Share results"
            icon="share"
            style={styles.flex}
            loading={card.sharing}
            onPress={() => void card.share()}
            disabled={standings.length === 0}
          />
        </View>
      }
    >
      <Txt variant="label" color={colors.accent} caps>
        {w.status === 'ended' ? 'Final results' : 'Results so far'}
      </Txt>
      <Txt variant="title" accessibilityRole="header">
        {w.title}
      </Txt>
      {standings.length >= 3 ? <Podium rows={standings.slice(0, 3)} /> : null}
      <View style={styles.stats}>
        <Stat label="Teams" value={String(standings.length)} />
        <Stat label="Finished" value={String(finished)} />
        <Stat label="Avg. points" value={String(avg)} />
      </View>
      <View style={styles.block}>
        <SectionLabel>Leaderboard</SectionLabel>
        {standings.length === 0 ? (
          <Txt variant="callout" color={colors.secondary}>
            No team started this walk.
          </Txt>
        ) : (
          <Leaderboard
            rows={standings}
            stopCount={inPlay}
            ended={w.status === 'ended'}
            onPress={(id) => router.push(`/walk/${w.id}/team/${id}`)}
          />
        )}
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.stat}>
      <Txt style={styles.statValue}>{value}</Txt>
      <Txt variant="caption" color={colors.secondary}>
        {label}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { flexDirection: 'row', gap: spacing.sm + 2 },
  stats: { flexDirection: 'row', gap: spacing.sm + 2 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: fonts.heading, fontSize: 24, color: colors.ink },
  block: { gap: spacing.sm },
});
