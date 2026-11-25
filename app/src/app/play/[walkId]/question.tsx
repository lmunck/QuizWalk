/**
 * P4 Question, in two steps (spec §3 P4). Arrived: "Stop 4 · Nyhavn", the hint, and Show
 * question. The 20 s bonus clock starts on that tap, is drawn as a draining bonus, never times
 * out, and cannot be restarted: backing out or restarting the app returns to the same clock.
 */
import {
  scoreAnswer,
  SPEED_BONUS_MAX,
  SPEED_BONUS_WINDOW_MS,
  speedBonus,
  walkProgress,
  type ScoredAnswer,
} from '@qualk/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { Button, IconButton } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { Card, Pill } from '@/components/ui';
import { submitAnswer, useAnswers } from '@/data/teams';
import { useStops, useWalk } from '@/data/walks';
import { tapRight, tapWrong } from '@/lib/feedback';
import { questionOpenedAt, startQuestionClock } from '@/lib/storage';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

const LETTERS = ['A', 'B', 'C', 'D'];

/** The phone's clock, read in event handlers (spec §4: answer time uses the phone's clock). */
const clock = () => Date.now();

export default function Question() {
  const { walkId, stopId, imHere } = useLocalSearchParams<{
    walkId: string;
    stopId: string;
    imHere?: string;
  }>();
  const { uid } = useAuth();
  const insets = useSafeAreaInsets();
  const walk = useWalk(walkId);
  const stops = useStops(walkId);
  const answers = useAnswers(walkId, uid);
  const noBonus = imHere === '1';

  const [openedAt, setOpenedAt] = useState<number | null | undefined>(undefined);
  const [now, setNow] = useState(clock);
  const [local, setLocal] = useState<{ choice: number; scored: ScoredAnswer }>();

  // A clock that already started (backed out, app restarted) continues where it was.
  useEffect(() => {
    void questionOpenedAt(walkId, stopId).then((t) => setOpenedAt(t ?? null));
  }, [walkId, stopId]);

  const answered = answers.data.find((a) => a.id === stopId);
  const ticking = typeof openedAt === 'number' && !answered && !local;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(clock()), 200);
    return () => clearInterval(id);
  }, [ticking]);

  const progress = useMemo(
    () =>
      walkProgress(
        stops.data,
        answers.data.map((a) => ({ ...a, stopId: a.id })),
      ),
    [stops.data, answers.data],
  );

  if (walk.loading || stops.loading || answers.loading || openedAt === undefined) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  const stop = stops.data.find((s) => s.id === stopId);
  const w = walk.data;
  if (!w || !stop) return <Redirect href={`/play/${walkId}/stop`} />;
  if (w.status === 'ended' && !answered && !local)
    return <Redirect href={`/play/${walkId}/results`} />;

  const number = progress.stops.findIndex((s) => s.id === stop.id) + 1 || stop.order + 1;
  const total = progress.stops.length;
  const isLast =
    progress.stops.filter((s) => s.id !== stop.id && !answers.data.some((a) => a.id === s.id))
      .length === 0;

  const showQuestion = async () => {
    const t = await startQuestionClock(walkId, stopId, clock());
    setNow(clock());
    setOpenedAt(t);
  };

  const answer = (choice: number) => {
    if (!uid || typeof openedAt !== 'number' || local || answered) return;
    const answeredAt = clock();
    const kind = noBonus ? 'imHere' : 'answered';
    submitAnswer(walkId, uid, stopId, {
      kind,
      choiceIndex: choice,
      openedAtMs: openedAt,
      answeredAtMs: answeredAt,
    });
    const scored = scoreAnswer(kind, choice, stop.correctIndex, answeredAt - openedAt);
    setLocal({ choice, scored });
    void (scored.correct ? tapRight() : tapWrong());
  };

  const next = () => {
    if (isLast) router.replace(`/play/${walkId}/finish`);
    else if (router.canGoBack()) router.back();
    else router.replace(`/play/${walkId}/stop`);
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pill
        label={
          stop.placeName && stop.placeName !== `Stop ${number}`
            ? `Stop ${number} of ${total} · ${stop.placeName}`
            : `Stop ${number} of ${total}`
        }
        tone="accent"
      />
    </View>
  );

  // ---------------------------------------------------------------- arrived
  if (openedAt === null && !answered) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <IconButton icon="back" label="Back to the map" onPress={() => router.back()} />
        </View>
        <ScrollView contentContainerStyle={styles.arrived}>
          <View style={styles.arrivedBadge}>
            <Icon name="flag" size={34} color={colors.white} />
          </View>
          <Txt variant="label" color={colors.accent} caps center>
            {noBonus ? `Stop ${number}` : "You're here"}
          </Txt>
          <Txt variant="display" center accessibilityRole="header">
            {stop.placeName || `Stop ${number}`}
          </Txt>
          {stop.hint ? (
            <Card style={styles.hint}>
              <Txt variant="label" color={colors.secondary} caps>
                Look around
              </Txt>
              <Txt variant="body">{stop.hint}</Txt>
            </Card>
          ) : null}
          <Txt variant="callout" color={colors.secondary} center>
            {noBonus
              ? 'Without the speed bonus, so take your time.'
              : 'Gather round. The 20-second bonus clock starts when you tap Show question.'}
          </Txt>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button label="Show question" icon="eye" large onPress={() => void showQuestion()} />
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------- question / feedback
  const choice = local?.choice ?? answered?.choiceIndex;
  const done = choice !== undefined || answered?.kind === 'skipped';
  const scored =
    local?.scored ??
    (answered
      ? scoreAnswer(answered.kind, answered.choiceIndex, stop.correctIndex, answered.elapsedMs)
      : undefined);
  const points = answered?.points ?? scored?.points ?? 0;
  const elapsed = typeof openedAt === 'number' ? now - openedAt : SPEED_BONUS_WINDOW_MS;
  const bonus = noBonus ? 0 : speedBonus(elapsed);
  const fraction = noBonus ? 0 : Math.max(0, 1 - elapsed / SPEED_BONUS_WINDOW_MS);

  return (
    <View style={styles.root}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        {!done ? (
          <View
            style={styles.bonus}
            accessible
            accessibilityLabel={
              noBonus
                ? 'No speed bonus'
                : bonus > 0
                  ? `Speed bonus: ${bonus} points`
                  : 'No bonus. Take your time.'
            }
          >
            <View style={styles.bonusRow}>
              <Txt variant="calloutStrong" color={bonus > 0 ? colors.accent : colors.secondary}>
                {noBonus
                  ? 'No speed bonus'
                  : bonus > 0
                    ? `Speed bonus +${bonus}`
                    : 'No bonus. Take your time.'}
              </Txt>
              {!noBonus && bonus > 0 ? (
                <Txt style={styles.bonusSeconds} color={colors.secondary}>
                  {Math.ceil((SPEED_BONUS_WINDOW_MS - elapsed) / 1000)} s
                </Txt>
              ) : null}
            </View>
            <View style={styles.bonusTrack}>
              <View style={[styles.bonusFill, { width: `${fraction * 100}%` }]} />
            </View>
            <Txt variant="caption" color={colors.muted}>
              Right answers score 10, plus up to {SPEED_BONUS_MAX} for speed. There is no time
              limit.
            </Txt>
          </View>
        ) : null}

        <Txt variant="title" accessibilityRole="header">
          {stop.question}
        </Txt>

        <View style={styles.options}>
          {stop.options.map((opt, i) => {
            const isChoice = choice === i;
            const isCorrect = i === stop.correctIndex;
            const state = !done ? 'idle' : isCorrect ? 'correct' : isChoice ? 'wrong' : 'other';
            return (
              <Pressable
                key={i}
                onPress={() => answer(i)}
                disabled={done}
                accessibilityRole="button"
                accessibilityState={{ disabled: done, selected: isChoice }}
                accessibilityLabel={`${LETTERS[i]}: ${opt}${state === 'correct' ? ', right answer' : state === 'wrong' ? ', your answer, wrong' : ''}`}
                style={({ pressed }) => [
                  styles.option,
                  pressed && !done ? styles.optionPressed : null,
                  state === 'correct' ? styles.optionCorrect : null,
                  state === 'wrong' ? styles.optionWrong : null,
                  state === 'other' ? styles.optionOther : null,
                ]}
              >
                <View
                  style={[
                    styles.letter,
                    state === 'correct'
                      ? { backgroundColor: colors.accent, borderColor: colors.accent }
                      : null,
                    state === 'wrong'
                      ? { backgroundColor: colors.error, borderColor: colors.error }
                      : null,
                  ]}
                >
                  {state === 'correct' ? (
                    <Icon name="check" size={16} color={colors.white} strokeWidth={3} />
                  ) : state === 'wrong' ? (
                    <Icon name="cross" size={16} color={colors.white} strokeWidth={3} />
                  ) : (
                    <Txt style={styles.letterText}>{LETTERS[i]}</Txt>
                  )}
                </View>
                <Txt variant="body" style={styles.flex}>
                  {opt}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        {done ? (
          <View style={styles.feedback} accessibilityLiveRegion="assertive">
            <View
              style={[styles.verdict, scored?.correct ? styles.verdictRight : styles.verdictWrong]}
            >
              <Icon
                name={scored?.correct ? 'check' : answered?.kind === 'skipped' ? 'skip' : 'cross'}
                size={26}
                color={scored?.correct ? colors.accentPressed : colors.errorText}
                strokeWidth={2.6}
              />
              <View style={styles.flex}>
                <Txt
                  variant="subheading"
                  color={scored?.correct ? colors.accentPressed : colors.errorText}
                >
                  {scored?.correct
                    ? 'Right!'
                    : answered?.kind === 'skipped'
                      ? 'Skipped'
                      : 'Not quite'}
                </Txt>
                <Txt
                  variant="callout"
                  color={scored?.correct ? colors.accentPressed : colors.errorText}
                >
                  {scored?.correct
                    ? `+${points} points${points > 10 ? ` (10 + ${points - 10} speed bonus)` : ''}`
                    : `0 points. The answer is ${LETTERS[stop.correctIndex]}: ${stop.options[stop.correctIndex]}.`}
                </Txt>
              </View>
            </View>
            {stop.explanation ? (
              <Card>
                <Txt variant="body">{stop.explanation}</Txt>
                {stop.source?.url ? (
                  <Pressable
                    onPress={() => void Linking.openURL(stop.source!.url)}
                    accessibilityRole="link"
                    style={styles.source}
                  >
                    <Txt variant="caption" color={colors.accent}>
                      Source: {stop.source.title}
                    </Txt>
                  </Pressable>
                ) : null}
              </Card>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      {done ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button
            label={isLast ? 'See how you did' : `Next stop →`}
            kind="dark"
            large
            onPress={next}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg - 8,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  arrived: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
  },
  arrivedBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  hint: { gap: spacing.xs, alignSelf: 'stretch' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  bonus: { gap: spacing.sm },
  bonusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bonusSeconds: { fontFamily: fonts.heading, fontSize: 17, fontVariant: ['tabular-nums'] },
  bonusTrack: { height: 10, borderRadius: 5, backgroundColor: colors.track, overflow: 'hidden' },
  bonusFill: { height: 10, borderRadius: 5, backgroundColor: colors.accent },
  options: { gap: spacing.sm + 2 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.md + 2,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  optionPressed: { backgroundColor: colors.tint, borderColor: colors.ink },
  optionCorrect: {
    borderColor: colors.accent,
    borderWidth: 2.5,
    backgroundColor: colors.successFill,
  },
  optionWrong: { borderColor: colors.error, borderWidth: 2.5, backgroundColor: colors.errorFill },
  optionOther: { opacity: 0.6 },
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
  feedback: { gap: spacing.md - 4 },
  verdict: {
    flexDirection: 'row',
    gap: spacing.md - 4,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'flex-start',
  },
  verdictRight: { backgroundColor: colors.successFill },
  verdictWrong: { backgroundColor: colors.errorFill },
  source: { marginTop: spacing.sm, minHeight: 32, justifyContent: 'center' },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
});
