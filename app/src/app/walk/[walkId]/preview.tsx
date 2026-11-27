/**
 * C4 Preview: steps through every question as players will see it, with no location and
 * nothing saved (spec §3 C4).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Banner, Card, Pill } from '@/components/ui';
import { useStops } from '@/data/walks';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function Preview() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  const stops = useStops(walkId);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number>();

  if (stops.loading) {
    return (
      <Screen title="Preview">
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  const list = stops.data;
  const stop = list[index];
  if (!stop) {
    return (
      <Screen title="Preview">
        <Banner kind="info" text="Add a stop to preview its question." />
      </Screen>
    );
  }
  const go = (i: number) => {
    setIndex(i);
    setPicked(undefined);
  };
  const last = index === list.length - 1;

  return (
    <Screen
      title="Preview"
      back="close"
      footer={
        <View style={styles.nav}>
          <Button
            label="Previous"
            kind="secondary"
            disabled={index === 0}
            style={styles.flex}
            onPress={() => go(index - 1)}
          />
          <Button
            label={last ? 'Done' : 'Next stop'}
            kind="dark"
            style={styles.flex}
            onPress={() => (last ? router.back() : go(index + 1))}
          />
        </View>
      }
    >
      <Banner
        kind="info"
        icon="eye"
        text="As players see it. Nothing is saved and no location is needed."
      />
      <Pill
        label={`Stop ${index + 1} of ${list.length} · ${stop.placeName || 'Unnamed'}`}
        tone="accent"
      />
      {stop.hint ? (
        <Card>
          <Txt variant="label" color={colors.secondary} caps>
            Hint on arrival
          </Txt>
          <Txt variant="body">{stop.hint}</Txt>
        </Card>
      ) : null}
      <Txt variant="title">{stop.question || 'No question yet'}</Txt>
      <View style={styles.options}>
        {stop.options.map((o, i) => {
          const done = picked !== undefined;
          const right = i === stop.correctIndex;
          return (
            <Pressable
              key={i}
              onPress={() => setPicked(i)}
              accessibilityRole="button"
              style={[
                styles.option,
                done && right ? styles.right : null,
                done && picked === i && !right ? styles.wrong : null,
              ]}
            >
              <View style={styles.letter}>
                {done && right ? (
                  <Icon name="check" size={16} color={colors.accent} strokeWidth={3} />
                ) : (
                  <Txt style={styles.letterText}>{LETTERS[i]}</Txt>
                )}
              </View>
              <Txt variant="body" style={styles.flex}>
                {o || '(empty)'}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      {picked !== undefined && stop.explanation ? (
        <Card>
          <Txt variant="body">{stop.explanation}</Txt>
        </Card>
      ) : null}
      <Txt variant="caption" color={colors.muted}>
        Tap an answer to see the feedback. Unlock radius: {stop.radiusM} m.
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  nav: { flexDirection: 'row', gap: spacing.sm + 2 },
  options: { gap: spacing.sm + 2 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    minHeight: 56,
    padding: spacing.md - 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  right: { borderColor: colors.accent, borderWidth: 2.5, backgroundColor: colors.successFill },
  wrong: { borderColor: colors.error, borderWidth: 2.5, backgroundColor: colors.errorFill },
  letter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  letterText: { fontFamily: fonts.heading, fontSize: 14, color: colors.ink },
});
