/** C8 Team detail: read-only stats and per-stop results (spec §3 C8). */
import { formatDistance, formatWalkTime, plural, rankLabel } from '@qualk/shared';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card } from '@/components/ui';
import { useWalk } from '@/data/walks';
import { AnswerList } from '@/features/AnswerList';
import { useStandings } from '@/features/standings';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function TeamDetail() {
  const { walkId, teamId } = useLocalSearchParams<{ walkId: string; teamId: string }>();
  const walk = useWalk(walkId);
  const { standings, loading } = useStandings(walkId);
  const team = standings.find((t) => t.id === teamId);

  if (walk.loading || loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (!team) {
    return (
      <Screen>
        <Txt variant="body">This team has left the walk.</Txt>
      </Screen>
    );
  }
  const status = team.finishedAt
    ? 'Finished'
    : team.leftAt
      ? 'Left the walk'
      : team.startedAt
        ? 'Walking'
        : 'In the lobby';

  return (
    <Screen title={team.name}>
      <View style={styles.head}>
        <TeamBadge name={team.name} colorIndex={team.colorIndex} size={56} />
        <View style={styles.flex}>
          <Txt variant="title">{team.name}</Txt>
          <Txt variant="callout" color={colors.secondary}>
            {status} · {team.mode === 'solo' ? 'solo' : plural(team.players, 'player')}
          </Txt>
        </View>
      </View>
      <View style={styles.stats}>
        <Stat label="Place" value={rankLabel(team.rank, team.tied)} />
        <Stat label="Points" value={String(team.score)} />
        <Stat label="Right" value={`${team.correctCount}/${walk.data?.stopCount ?? 0}`} />
      </View>
      <View style={styles.stats}>
        <Stat
          label="Walk time"
          value={team.walkTimeMs !== undefined ? formatWalkTime(team.walkTimeMs) : '–'}
        />
        <Stat label="Walked" value={formatDistance(team.distanceWalkedM)} />
      </View>
      <AnswerList walkId={walkId} teamId={teamId} />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.stat}>
      <Txt style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
      <Txt variant="caption" color={colors.secondary}>
        {label}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm + 2 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: fonts.heading, fontSize: 22, color: colors.ink },
});
