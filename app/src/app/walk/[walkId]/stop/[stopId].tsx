/**
 * C5 Edit stop. Place name, question, 2–4 answers as rows with a "correct" radio, explanation,
 * hint, radius, and the pin (tap the mini map for Move pin). Cancel with unsaved changes asks
 * first; Delete stop sits at the bottom and confirms (spec §3 C5). *Swap* (C5) and *Suggest a
 * question* (G2, a stop with no question yet) offer a question from the bank to accept or
 * discard; nothing is written until the stop is saved.
 */
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  STOP_RADII_M,
  stopProblems,
  type LatLng,
  type ProposedQuestion,
  type StopRadius,
  type StopWarning,
} from '@qualk/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { Dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { QMap, RadiusCircle, StopMarker } from '@/components/MapPieces';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Banner, Field, Segmented } from '@/components/ui';
import { swapQuestion } from '@/data/callables';
import { errorMessage } from '@/data/errors';
import { deleteStop, updateStop, useStops, useWalk, type Stop } from '@/data/walks';
import { MovePin } from '@/features/MovePin';
import { useOffline } from '@/lib/network';
import { colors, minTouchTarget, radius, spacing, type as typeScale } from '@/theme/tokens';

interface Draft {
  placeName: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  hint: string;
  radiusM: StopRadius;
  location: LatLng;
}

/** Whether the question text or answers differ: an edited bank question is no longer the bank's. */
const changedQuestion = (
  a: Pick<Draft, 'question' | 'options' | 'correctIndex'>,
  b: Pick<Draft, 'question' | 'options' | 'correctIndex'>,
) =>
  a.question !== b.question ||
  a.correctIndex !== b.correctIndex ||
  JSON.stringify(a.options) !== JSON.stringify(b.options);

const fromStop = (s: Stop): Draft => ({
  placeName: s.placeName,
  question: s.question,
  options:
    s.options.length >= MIN_OPTIONS ? [...s.options] : [...s.options, '', ''].slice(0, MIN_OPTIONS),
  correctIndex: s.correctIndex,
  explanation: s.explanation,
  hint: s.hint ?? '',
  radiusM: s.radiusM,
  location: s.location,
});

export default function EditStop() {
  const { walkId, stopId, isNew } = useLocalSearchParams<{
    walkId: string;
    stopId: string;
    isNew?: string;
  }>();
  const walk = useWalk(walkId);
  const stops = useStops(walkId);
  const stop = stops.data.find((s) => s.id === stopId);

  if (walk.loading || stops.loading) {
    return (
      <Screen title="Stop">
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (!walk.data || !stop) return <Redirect href={`/walk/${walkId}/route`} />;
  return (
    <Editor key={stop.id} walkId={walkId} stop={stop} stops={stops.data} isNew={isNew === '1'} />
  );
}

function Editor({
  walkId,
  stop,
  stops,
  isNew,
}: {
  walkId: string;
  stop: Stop;
  stops: Stop[];
  isNew: boolean;
}) {
  const walk = useWalk(walkId).data;
  const [draft, setDraft] = useState<Draft>(() => fromStop(stop));
  const [movingPin, setMovingPin] = useState(false);
  const offline = useOffline();
  const [confirm, setConfirm] = useState<'discard' | 'delete'>();
  const toast = useToast();
  const [proposal, setProposal] = useState<ProposedQuestion>();
  const [offered, setOffered] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [accepted, setAccepted] = useState<ProposedQuestion>();
  // G2: a stop with no question yet gets *Suggest a question*, which can find a Local one for
  // the pin; a stop with a question gets *Swap*.
  const suggesting = stop.question.trim() === '' && !stop.bankQuestionId && !accepted;
  const number = stops.findIndex((s) => s.id === stop.id) + 1;
  const original = fromStop(stop);
  const dirty = JSON.stringify(original) !== JSON.stringify(draft);
  const problems = stopProblems({ id: stop.id, order: stop.order, ...draft }, number).blocking;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setOption = (i: number, text: string) =>
    setDraft((d) => ({ ...d, options: d.options.map((o, j) => (j === i ? text : o)) }));
  const addOption = () => setDraft((d) => ({ ...d, options: [...d.options, ''] }));
  const removeOption = (i: number) =>
    setDraft((d) => ({
      ...d,
      options: d.options.filter((_, j) => j !== i),
      correctIndex:
        d.correctIndex === i ? 0 : d.correctIndex > i ? d.correctIndex - 1 : d.correctIndex,
    }));

  const ask = async () => {
    setAsking(true);
    try {
      const res = await swapQuestion({
        walkId,
        ...(suggesting ? { location: draft.location } : { stopId: stop.id }),
        exclude: offered,
      });
      if (!res.proposal) {
        setProposal(undefined);
        toast(
          offered.length > 0
            ? 'No more questions to offer for this stop.'
            : 'No question to offer for this stop right now.',
        );
        return;
      }
      setOffered((o) => [...o, res.proposal!.bankQuestionId]);
      setProposal(res.proposal);
    } catch (err) {
      setProposal(undefined);
      toast(errorMessage(err, 'Could not get a question. Check your connection.'), 'error');
    } finally {
      setAsking(false);
    }
  };

  const accept = (p: ProposedQuestion) => {
    setDraft((d) => ({
      ...d,
      question: p.question,
      options: [...p.options],
      correctIndex: p.correctIndex,
      explanation: p.explanation,
      placeName: suggesting && p.placeName ? p.placeName : d.placeName,
    }));
    setAccepted(p);
    setProposal(undefined);
  };

  /** What the stop's bank fields become on save (m4-generation-design §11). */
  const bankFields = (q: Pick<Draft, 'question' | 'options' | 'correctIndex'>) => {
    if (accepted) {
      const kept: StopWarning[] = stop.warnings.filter((w) => w !== 'unverified');
      return {
        origin: 'ai' as const,
        source: accepted.source ?? null,
        bankQuestionId: changedQuestion(q, accepted) ? null : accepted.bankQuestionId,
        warnings: [...kept, ...accepted.warnings.filter((w) => !kept.includes(w))],
      };
    }
    if (stop.bankQuestionId && changedQuestion(q, stop)) return { bankQuestionId: null };
    return {};
  };

  const save = () => {
    if (!walk) return;
    const q = {
      question: draft.question.trim(),
      options: draft.options.map((o) => o.trim()),
      correctIndex: draft.correctIndex,
    };
    updateStop(walk, stops, stop.id, {
      placeName: draft.placeName.trim(),
      ...q,
      ...bankFields(q),
      explanation: draft.explanation.trim(),
      hint: draft.hint.trim(),
      radiusM: draft.radiusM,
      ...(draft.location.latitude !== stop.location.latitude ||
      draft.location.longitude !== stop.location.longitude
        ? { location: draft.location }
        : {}),
    });
    router.back();
  };

  const close = () => (dirty ? setConfirm('discard') : router.back());

  return (
    <Screen
      back="close"
      onBack={close}
      title={isNew ? `New stop ${number}` : `Stop ${number}`}
      headerRight={
        <Pressable
          onPress={save}
          accessibilityRole="button"
          accessibilityLabel="Save stop"
          style={styles.saveTop}
          hitSlop={6}
        >
          <Txt variant="bodyStrong" color={colors.accent}>
            Save
          </Txt>
        </Pressable>
      }
      footer={<Button label="Save stop" large onPress={save} />}
    >
      {offline ? (
        <Banner
          kind="warning"
          icon="offline"
          text="You're offline. Saved changes are sent when you're back online."
        />
      ) : null}
      <Pressable
        onPress={() => setMovingPin(true)}
        accessibilityRole="button"
        accessibilityLabel="Move the pin"
        style={styles.miniMapWrap}
      >
        <View pointerEvents="none" style={styles.flex}>
          <QMap
            style={styles.miniMap}
            region={{ ...draft.location, latitudeDelta: 0.0025, longitudeDelta: 0.0025 }}
            scrollEnabled={false}
            zoomEnabled={false}
          >
            <RadiusCircle center={draft.location} radiusM={draft.radiusM} />
            <StopMarker coordinate={draft.location} number={number} />
          </QMap>
        </View>
        <View style={styles.movePill}>
          <Icon name="crosshair" size={16} />
          <Txt variant="calloutStrong">Move pin</Txt>
        </View>
      </Pressable>

      <Field
        label="Place name"
        value={draft.placeName}
        onChangeText={(t) => set('placeName', t)}
        placeholder="Nyhavn"
        maxLength={80}
        helper="Shown to players when they arrive."
      />
      <Button
        label={suggesting ? 'Suggest a question' : 'Swap question'}
        icon={suggesting ? 'sparkle' : 'swap'}
        kind="secondary"
        loading={asking && !proposal}
        disabled={offline}
        hint={
          suggesting
            ? 'Offers a question from the question bank, to use or discard.'
            : 'Offers another question from the question bank, to use or discard.'
        }
        onPress={() => void ask()}
      />
      <Field
        label="Question"
        value={draft.question}
        onChangeText={(t) => set('question', t)}
        placeholder="When was the canal dug?"
        multiline
        maxLength={300}
        autoFocus={isNew}
      />

      <View style={styles.answers}>
        <Txt variant="calloutStrong">Answers</Txt>
        <Txt variant="caption" color={colors.muted}>
          Write {MIN_OPTIONS}–{MAX_OPTIONS} answers and mark the right one.
        </Txt>
        {draft.options.map((o, i) => {
          const correct = draft.correctIndex === i;
          return (
            <View key={i} style={[styles.answerRow, correct ? styles.answerCorrect : null]}>
              <Pressable
                onPress={() => set('correctIndex', i)}
                accessibilityRole="radio"
                accessibilityState={{ selected: correct }}
                accessibilityLabel={`Mark answer ${i + 1} as the right one`}
                style={styles.radioHit}
              >
                <View style={[styles.radio, correct ? styles.radioOn : null]}>
                  {correct ? (
                    <Icon name="check" size={14} color={colors.white} strokeWidth={3} />
                  ) : null}
                </View>
              </Pressable>
              <TextInput
                value={o}
                onChangeText={(t) => setOption(i, t)}
                placeholder={correct ? 'The right answer' : `Answer ${i + 1}`}
                placeholderTextColor={colors.muted}
                style={styles.answerInput}
                maxLength={120}
                accessibilityLabel={`Answer ${i + 1}${correct ? ', marked right' : ''}`}
              />
              {draft.options.length > MIN_OPTIONS ? (
                <IconButton
                  icon="close"
                  label={`Remove answer ${i + 1}`}
                  onPress={() => removeOption(i)}
                  size={44}
                />
              ) : null}
            </View>
          );
        })}
        {draft.options.length < MAX_OPTIONS ? (
          <Button
            label="Add an answer"
            icon="plus"
            kind="ghost"
            onPress={addOption}
            style={styles.addAnswer}
          />
        ) : null}
      </View>

      <Field
        label="Explanation (optional)"
        value={draft.explanation}
        onChangeText={(t) => set('explanation', t)}
        placeholder="Shown after answering, right or wrong."
        multiline
        maxLength={600}
      />
      <Field
        label="Hint (optional)"
        value={draft.hint}
        onChangeText={(t) => set('hint', t)}
        placeholder="Shown on arrival, before the question: “Look for the big anchor.”"
        maxLength={200}
      />

      <View style={styles.answers}>
        <Txt variant="calloutStrong">Unlock radius</Txt>
        <Segmented
          label="Unlock radius"
          value={String(draft.radiusM)}
          onChange={(v) => set('radiusM', Number(v) as StopRadius)}
          options={STOP_RADII_M.map((r) => ({ value: String(r), label: `${r} m` }))}
        />
        <Txt variant="caption" color={colors.muted}>
          Bigger is easier to trigger in tight streets.
        </Txt>
      </View>

      {problems.length > 0 ? (
        <Banner
          kind="warning"
          title="Needed before publishing"
          text={problems.map((p) => p.message.replace(`Stop ${number} `, '…')).join('\n')}
        />
      ) : null}

      <Button
        label="Delete stop"
        icon="trash"
        kind="destructive"
        onPress={() => setConfirm('delete')}
      />

      <MovePin
        visible={movingPin}
        start={draft.location}
        onDismiss={() => setMovingPin(false)}
        onDone={(p) => {
          set('location', p);
          setMovingPin(false);
        }}
      />
      <Dialog
        visible={proposal !== undefined}
        title={suggesting ? 'Suggested question' : 'Another question'}
        onDismiss={() => setProposal(undefined)}
        actions={[
          { label: 'Use this question', onPress: () => proposal && accept(proposal) },
          {
            label: 'Show another',
            kind: 'secondary',
            loading: asking,
            onPress: () => void ask(),
          },
          {
            label: suggesting ? 'Discard' : 'Keep mine',
            kind: 'ghost',
            onPress: () => setProposal(undefined),
          },
        ]}
      >
        {proposal ? <ProposalView proposal={proposal} /> : null}
      </Dialog>
      <Dialog
        visible={confirm === 'discard'}
        title="Discard your changes?"
        text="The changes to this stop are not saved."
        onDismiss={() => setConfirm(undefined)}
        actions={[
          {
            label: 'Save stop',
            onPress: () => {
              setConfirm(undefined);
              save();
            },
          },
          {
            label: 'Discard changes',
            kind: 'destructive',
            onPress: () => {
              setConfirm(undefined);
              router.back();
            },
          },
          { label: 'Keep editing', kind: 'ghost', onPress: () => setConfirm(undefined) },
        ]}
      />
      <Dialog
        visible={confirm === 'delete'}
        title={`Delete stop ${number}?`}
        text="The stop and its question are removed. Later stops move up one."
        onDismiss={() => setConfirm(undefined)}
        actions={[
          {
            label: 'Delete stop',
            kind: 'destructive',
            onPress: () => {
              if (walk) deleteStop(walk, stops, stop.id);
              setConfirm(undefined);
              router.back();
            },
          },
          { label: 'Keep it', kind: 'ghost', onPress: () => setConfirm(undefined) },
        ]}
      />
    </Screen>
  );
}

function ProposalView({ proposal }: { proposal: ProposedQuestion }) {
  return (
    <View style={styles.proposal}>
      {proposal.placeName ? (
        <Txt variant="caption" color={colors.secondary}>
          About {proposal.placeName}
        </Txt>
      ) : null}
      <Txt variant="bodyStrong">{proposal.question}</Txt>
      {proposal.options.map((o, i) => {
        const right = i === proposal.correctIndex;
        return (
          <View
            key={i}
            style={styles.proposalOption}
            accessible
            accessibilityLabel={right ? `${o}, the right answer` : o}
          >
            <Icon
              name={right ? 'check' : 'minus'}
              size={18}
              color={right ? colors.accent : colors.controlBorder}
              strokeWidth={right ? 2.8 : 2}
            />
            <Txt variant="callout" style={styles.flex}>
              {o}
            </Txt>
          </View>
        );
      })}
      {proposal.explanation ? (
        <Txt variant="caption" color={colors.secondary}>
          {proposal.explanation}
        </Txt>
      ) : null}
      {proposal.warnings.includes('unverified') ? (
        <Txt variant="caption" color={colors.warningText}>
          Written from {proposal.source?.title ?? 'Wikipedia'}. Check the answer before you publish.
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  proposal: { gap: spacing.sm },
  proposalOption: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  saveTop: { minHeight: minTouchTarget, justifyContent: 'center', paddingHorizontal: spacing.sm },
  miniMapWrap: {
    height: 150,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.mapBase,
  },
  miniMap: { flex: 1 },
  movePill: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md - 4,
    minHeight: 40,
  },
  answers: { gap: spacing.sm },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingRight: 2,
  },
  answerCorrect: { borderColor: colors.accent, borderWidth: 2, backgroundColor: '#F3F9F5' },
  radioHit: {
    width: minTouchTarget,
    height: minTouchTarget + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  answerInput: {
    ...typeScale.body,
    flex: 1,
    minHeight: minTouchTarget + 4,
    color: colors.ink,
    paddingVertical: 10,
  },
  addAnswer: { alignSelf: 'flex-start' },
});
