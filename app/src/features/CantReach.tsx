/**
 * G6 Can't reach: I'm here (no speed bonus; disabled with the reason when too far), Skip
 * (0 points, confirm), Way blocked (reports and moves on in one step). A team is never left
 * waiting for the creator (spec §3 G6).
 */
import { formatDistance, IM_HERE_MAX_DISTANCE_M } from '@qualk/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { reportBlocked, submitAnswer } from '@/data/teams';
import type { Stop, Walk } from '@/data/walks';
import type { Arrival } from '@/location/arrival';
import { colors, radius, spacing } from '@/theme/tokens';

export function CantReach({
  visible,
  onDismiss,
  walk,
  uid,
  stop,
  stopNumber,
  isLast,
  arrival,
}: {
  visible: boolean;
  onDismiss: () => void;
  walk: Walk;
  uid: string;
  stop: Stop;
  stopNumber: number;
  isLast: boolean;
  arrival: Arrival;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<'skip' | 'blocked'>();
  const owner = walk.ownerName || 'the creator';
  const next = isLast ? 'the finish' : `stop ${stopNumber + 1}`;

  const imHere = () => {
    onDismiss();
    router.push({
      pathname: '/play/[walkId]/question',
      params: { walkId: walk.id, stopId: stop.id, imHere: '1' },
    });
  };

  const skip = () => {
    const now = Date.now();
    submitAnswer(walk.id, uid, stop.id, { kind: 'skipped', openedAtMs: now, answeredAtMs: now });
    setConfirm(undefined);
    onDismiss();
    toast(`Stop ${stopNumber} skipped. On to ${next}.`);
  };

  const blocked = () => {
    reportBlocked(walk.id, uid, stop.id, Date.now());
    setConfirm(undefined);
    onDismiss();
    toast(`We told ${owner}. Carry on to ${next}.`);
  };

  const far = arrival.distanceM !== undefined && !arrival.canImHere;
  const imHereReason =
    arrival.distanceM === undefined
      ? 'Waiting for your position.'
      : far
        ? `Only within about ${IM_HERE_MAX_DISTANCE_M} m of the stop. You are ${formatDistance(arrival.distanceM)} away.`
        : 'Opens the question now, without the speed bonus.';

  return (
    <>
      <Dialog
        visible={visible && confirm === undefined}
        title={`Can't reach stop ${stopNumber}?`}
        text="Pick what fits. You keep going either way."
        onDismiss={onDismiss}
        actions={[
          { label: "I'm here", onPress: imHere, disabled: !arrival.canImHere },
          { label: 'Skip this stop', kind: 'secondary', onPress: () => setConfirm('skip') },
          { label: 'The way is blocked', kind: 'secondary', onPress: () => setConfirm('blocked') },
          { label: 'Cancel', kind: 'ghost', onPress: onDismiss },
        ]}
      >
        <Option icon="pin" title="I'm here" text={imHereReason} />
        <Option icon="skip" title="Skip this stop" text="0 points for this stop." />
        <Option
          icon="blocked"
          title="The way is blocked"
          text={`Skips the stop and tells ${owner}. If it is removed for everyone, nobody loses points.`}
        />
      </Dialog>
      <Dialog
        visible={visible && confirm === 'skip'}
        title={`Skip stop ${stopNumber}?`}
        text="You get 0 points for it and go straight on to the next stop. This can't be undone."
        onDismiss={() => setConfirm(undefined)}
        actions={[
          { label: 'Skip stop', kind: 'destructive', onPress: skip },
          { label: 'Back', kind: 'ghost', onPress: () => setConfirm(undefined) },
        ]}
      />
      <Dialog
        visible={visible && confirm === 'blocked'}
        title="Report the way as blocked?"
        text={`We tell ${owner} and you carry on to ${next}. If ${owner} removes the stop for everyone, nobody loses points.`}
        onDismiss={() => setConfirm(undefined)}
        actions={[
          { label: 'Report and move on', kind: 'destructive', onPress: blocked },
          { label: 'Back', kind: 'ghost', onPress: () => setConfirm(undefined) },
        ]}
      />
    </>
  );
}

function Option({
  icon,
  title,
  text,
}: {
  icon: 'pin' | 'skip' | 'blocked';
  title: string;
  text: string;
}) {
  return (
    <View style={styles.option}>
      <View style={styles.optionIcon}>
        <Icon name={icon} size={20} color={colors.accent} />
      </View>
      <View style={styles.flex}>
        <Txt variant="calloutStrong">{title}</Txt>
        <Txt variant="callout" color={colors.secondary}>
          {text}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  option: { flexDirection: 'row', gap: spacing.md - 4, alignItems: 'flex-start' },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.successFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
