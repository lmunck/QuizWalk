/** "Review our answers": each stop with the team's answer, the right one and the points. */
import { scoreAnswer } from '@qualk/shared';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card } from '@/components/ui';
import { useAnswers } from '@/data/teams';
import { useStops } from '@/data/walks';
import { colors, spacing } from '@/theme/tokens';

export default function Answers() {
  const { walkId, teamId } = useLocalSearchParams<{ walkId: string; teamId?: string }>();
  const { uid } = useAuth();
  const stops = useStops(walkId);
  const answers = useAnswers(walkId, teamId ?? uid);

  if (stops.loading || answers.loading) {
    return (
      <Screen title="Our answers">
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  const inPlay = stops.data.filter((s) => !s.skippedForAll);

  return (
    <Screen title="Our answers">
      {inPlay.map((stop, i) => {
        const a = answers.data.find((x) => x.id === stop.id);
        if (!a) {
          return (
            <Card key={stop.id} style={styles.card}>
              <Txt variant="label" color={colors.muted} caps>
                Stop {i + 1} · {stop.placeName}
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
              <Txt variant="label" color={colors.secondary} caps style={styles.flex}>
                Stop {i + 1} · {stop.placeName}
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
                text={`You answered: ${stop.options[a.choiceIndex ?? -1] ?? '–'}`}
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
    </Screen>
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
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
