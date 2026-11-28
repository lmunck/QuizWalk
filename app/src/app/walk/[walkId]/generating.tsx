/**
 * C3 Generating (spec §3 C3, m4-generation-design §11). Driven live by generationJobs/{walkId}:
 * Naming stops, Picking questions and, when a Local place is new, Writing local questions. It
 * can be left; the work carries on and Home shows the draft as "Generating…". No question text
 * is shown, so *Play it myself* has no spoilers.
 */
import {
  clampQuestionCount,
  defaultQuestionCount,
  formatDistance,
  GENERATION_STEP_LABELS,
  MIN_STOP_SPACING_M,
  plural,
  walkProblems,
  type GenerationStep,
} from '@qualk/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { Banner } from '@/components/ui';
import { openWalk, publishWalk } from '@/data/callables';
import { errorMessage } from '@/data/errors';
import {
  generationRun,
  isStale,
  onGenerationRunChange,
  startGeneration,
  useGenerationJob,
} from '@/data/generation';
import { joinWalk } from '@/data/teams';
import { useStops, useWalk, type Walk } from '@/data/walks';
import { getLocationAccess, requestLocationAccess } from '@/location/position';
import { colors, spacing } from '@/theme/tokens';

type State = 'running' | 'done' | 'failed';

/** This phone's generateWalk call for the walk, kept up to date. */
function useRun(walkId: string) {
  return useSyncExternalStore(onGenerationRunChange, () => generationRun(walkId));
}

/** Try again without the count C2 passed (opened from Home): what the route was long enough for. */
function fallbackCount(walk: Walk): number {
  if (walk.stopCount > 0) return walk.stopCount;
  const length = walk.route?.distanceM ?? 0;
  return clampQuestionCount(
    Math.min(defaultQuestionCount(length), Math.floor(length / MIN_STOP_SPACING_M)),
  );
}

export default function Generating() {
  const { walkId, n, start } = useLocalSearchParams<{
    walkId: string;
    n?: string;
    start?: string;
  }>();
  const { uid, displayName } = useAuth();
  const toast = useToast();
  const walk = useWalk(walkId);
  const stops = useStops(walkId);
  const job = useGenerationJob(walkId);
  const run = useRun(walkId);
  const [now, setNow] = useState(() => Date.now());
  const [playing, setPlaying] = useState(false);
  const count = n ? Number(n) : undefined;

  // C2's Next lands here with start=1: the job is subscribed to first, then the call starts.
  useEffect(() => {
    if (start === '1' && count && !job.loading) startGeneration(walkId, count);
    // Once per visit: startGeneration ignores a second call while one is in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, walkId, job.loading]);

  const j = job.data;
  let state: State;
  let message: string | undefined;
  if (run.inFlight) state = 'running';
  else if (j?.status === 'running' && !isStale(j, now)) state = 'running';
  else if (run.error) {
    state = 'failed';
    message = errorMessage(run.error, j?.error ?? 'Something went wrong while making the walk.');
  } else if (j?.status === 'done') state = 'done';
  else if (j?.status === 'failed') {
    state = 'failed';
    message = j.error;
  } else if (j) {
    state = 'failed';
    message = 'This took too long. Try again.';
  } else state = start === '1' ? 'running' : 'failed';

  // A job that stops updating has failed; look again now and then while waiting.
  useEffect(() => {
    if (state !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [state]);

  if (walk.loading || job.loading || stops.loading) {
    return (
      <Screen back={false}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  const w = walk.data;
  if (!w || w.ownerUid !== uid) return <Redirect href="/" />;
  if (w.status === 'open') return <Redirect href={`/walk/${walkId}/monitor`} />;
  if (w.status === 'ended') return <Redirect href={`/walk/${walkId}/results`} />;

  // While this phone's call is in flight, an older job (a New route on a generated walk) still
  // says done; show its steps only once the new run has written them.
  const current = j && (j.status === 'running' || !run.inFlight);
  const steps: GenerationStep[] = current && j.steps.length > 0 ? j.steps : ['naming', 'picking'];
  const step = current ? j.step : 1;
  const details = current ? j.stepDetail : [];
  const questionCount = state === 'done' ? w.stopCount : (count ?? fallbackCount(w));
  const routeLine = [
    plural(questionCount, 'question'),
    w.route ? `${formatDistance(w.route.distanceM)} loop` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const canPlay = state === 'done' && walkProblems(w, stops.data).blocking.length === 0;

  const review = () => router.dismissTo(`/walk/${walkId}/route`);
  const retry = () => startGeneration(walkId, count ?? fallbackCount(w));

  const playIt = async () => {
    if (!uid) return;
    setPlaying(true);
    try {
      await publishWalk(w.id);
      await openWalk(w.id, 'day');
      const access = await getLocationAccess();
      if (access.status === 'undetermined') await requestLocationAccess();
      await joinWalk({
        walkId: w.id,
        uid,
        name: (displayName || 'Me').slice(0, 30),
        mode: 'solo',
        players: 1,
        colorIndex: 0,
      });
      router.replace(`/play/${w.id}/lobby`);
    } catch (err) {
      toast(errorMessage(err, 'Could not open the walk. Check your connection.'), 'error');
    } finally {
      setPlaying(false);
    }
  };

  return (
    <Screen
      back="close"
      onBack={() => router.dismissTo('/')}
      footer={
        state === 'done' ? (
          <View style={styles.footer}>
            <Button label="Review route & questions" large onPress={review} />
            {canPlay ? (
              <>
                <Button
                  label="Play it myself — no spoilers"
                  kind="secondary"
                  icon="play"
                  loading={playing}
                  hint="Publishes and opens the walk for today, then joins you to it without showing the questions."
                  onPress={() => void playIt()}
                />
                <Txt variant="caption" color={colors.muted} center>
                  Opens the walk for today and joins you to it.
                </Txt>
              </>
            ) : null}
          </View>
        ) : state === 'failed' ? (
          <View style={styles.footer}>
            <Button label="Try again" large onPress={retry} />
            <Button label="Add stops manually" kind="secondary" onPress={review} />
          </View>
        ) : (
          <Txt variant="caption" color={colors.muted} center>
            Usually a few seconds. You can leave this screen: the walk is still made.
          </Txt>
        )
      }
    >
      <Txt variant="title" accessibilityRole="header" accessibilityLiveRegion="polite">
        {state === 'done'
          ? 'Your walk is ready'
          : state === 'failed'
            ? 'Couldn’t make the walk'
            : 'Building your walk…'}
      </Txt>
      <Txt variant="callout" color={colors.secondary}>
        {state === 'done' ? `${w.title} · ${routeLine}` : routeLine}
      </Txt>

      {state === 'failed' ? (
        <Banner kind="error" text={message ?? 'Something went wrong while making the walk.'} />
      ) : null}

      <View style={styles.steps}>
        {steps.map((s, i) => {
          const n1 = i + 1;
          const status =
            state === 'done' || n1 < step
              ? 'done'
              : n1 === step && state === 'running'
                ? 'active'
                : 'todo';
          return (
            <StepRow
              key={s}
              number={n1}
              label={GENERATION_STEP_LABELS[s]}
              detail={status === 'done' ? details[i] : undefined}
              status={status}
            />
          );
        })}
      </View>
    </Screen>
  );
}

function StepRow({
  number,
  label,
  detail,
  status,
}: {
  number: number;
  label: string;
  detail?: string;
  status: 'done' | 'active' | 'todo';
}) {
  const said = status === 'done' ? 'done' : status === 'active' ? 'in progress' : 'waiting';
  return (
    <View
      style={styles.step}
      accessible
      accessibilityLabel={`${label}, ${said}${detail ? `. ${detail}` : ''}`}
    >
      <View
        style={[
          styles.dot,
          status === 'done' ? styles.dotDone : status === 'active' ? styles.dotActive : null,
        ]}
      >
        {status === 'done' ? (
          <Icon name="check" size={16} color={colors.white} strokeWidth={3} />
        ) : status === 'active' ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Txt variant="calloutStrong" color={colors.accent}>
            {number}
          </Txt>
        )}
      </View>
      <View style={styles.flex}>
        <Txt
          variant={status === 'todo' ? 'body' : 'bodyStrong'}
          color={status === 'todo' ? colors.muted : colors.ink}
        >
          {label}
        </Txt>
        {detail ? (
          <Txt variant="caption" color={colors.secondary}>
            {detail}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { gap: spacing.sm + 2 },
  steps: { gap: spacing.md, marginTop: spacing.md },
  step: { flexDirection: 'row', gap: spacing.md - 4, alignItems: 'center', minHeight: 48 },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.accent },
  dotActive: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.accent },
});
