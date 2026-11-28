/** Each stop with a team's answer, the right one and the points (P5 review, C8 team detail). */
import { scoreAnswer } from '@qualk/shared';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { Card } from '@/components/ui';
import { useAnswers } from '@/data/teams';
import { useStops } from '@/data/walks';
import { colors, spacing } from '@/theme/tokens';

export function AnswerList({ walkId, teamId }: { walkId: string; teamId: string | undefined }) {
  const stops = useStops(walkId);
  const answers = useAnswers(walkId, teamId);
  if (stops.loading || answers.loading) return <ActivityIndicator color={colors.accent} />;

  // Players number the stops still in play; a stop removed for everyone has no number.
  const numbers = new Map(
    stops.data.filter((s) => !s.skippedForAll).map((s, i) => [s.id, i + 1] as const),
  );
  return (
    <View style={styles.list}>
      {stops.data.map((stop) => {
        if (stop.skippedForAll) {
          return (
            <Card key={stop.id} style={styles.card}>
              <Txt variant="labelWalk" color={colors.muted} caps>
                Removed for everyone · {stop.placeName}
              </Txt>
              <Txt variant="callout" color={colors.muted}>
                No points on this stop for any team.
              </Txt>
            </Card>
          );
        }
        const n = numbers.get(stop.id) ?? 0;
        const a = answers.data.find((x) => x.id === stop.id);
        if (!a) {
          return (
            <Card key={stop.id} style={styles.card}>
              <Txt variant="labelWalk" color={colors.muted} caps>
                Stop {n} · {stop.placeName}
              </Txt>
              <Txt variant="callout" color={colors.muted}>
                Not reached yet
              </Txt>
            </Card>
          );
        }
        const scored = scoreAnswer(a.kind, a.choiceIndex, stop.correctIndex, a.elapsedMs);
        const points = a.points ?? scored.points;
        const right = a.correct ?? scored.correct;
        return (
          <Card key={stop.id} style={styles.card}>
            <View style={styles.row}>
              <Txt variant="labelWalk" color={colors.secondary} caps style={styles.flex}>
                Stop {n} · {stop.placeName}
              </Txt>
              <Txt variant="calloutStrong" color={right ? colors.accent : colors.errorText}>
                {points} pts
              </Txt>
            </View>
            <Txt variant="bodyStrong">{stop.question}</Txt>
            {a.kind === 'skipped' ? (
              <Line icon="skip" color={colors.secondary} text="Skipped" />
            ) : (
              <Line
                icon={right ? 'check' : 'cross'}
                color={right ? colors.accent : colors.errorText}
                text={`${a.kind === 'imHere' ? "I'm here · " : ''}Answered: ${stop.options[a.choiceIndex ?? -1] ?? '–'}`}
              />
            )}
            {!right ? (
              <Line
                icon="check"
                color={colors.accent}
                text={`Right answer: ${stop.options[stop.correctIndex]}`}
              />
            ) : null}
            {stop.explanation ? (
              <Txt variant="callout" color={colors.secondary}>
                {stop.explanation}
              </Txt>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

function Line({
  icon,
  color,
  text,
}: {
  icon: 'check' | 'cross' | 'skip';
  color: string;
  text: string;
}) {
  return (
    <View style={styles.row}>
      <Icon name={icon} size={18} color={color} strokeWidth={2.6} />
      <Txt variant="callout" color={color} style={styles.flex}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: spacing.md - 4 },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
