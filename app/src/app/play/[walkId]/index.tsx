/**
 * P1 Join: walk summary, Solo/Team, team name, players, and the location explainer. The button
 * reads "Allow location & join" only while permission is still needed (spec §3 P1).
 */
import {
  distanceM as distanceBetween,
  ENDS_AWAY_MIN_M,
  estimateWalkMinutes,
  formatDistance,
  formatMinutes,
  isTeamNameTaken,
  openUntilLabel,
  pickColorIndex,
  plural,
  suggestTeamName,
  type PlayMode,
} from '@qualk/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { LocationNotice } from '@/components/LocationNotice';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { Banner, Card, EmptyState, Field, Segmented, Stepper } from '@/components/ui';
import { errorMessage } from '@/data/errors';
import { joinWalk, useTeams } from '@/data/teams';
import { useStops, useWalk } from '@/data/walks';
import { useLocationAccess } from '@/location/position';
import { playerHref } from '@/lib/routes';
import { markWelcomeSeen } from '@/lib/storage';
import { colors, radius, spacing } from '@/theme/tokens';

export default function JoinWalk() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  const { uid } = useAuth();
  const walk = useWalk(walkId);
  const stops = useStops(walk.data && walk.data.status !== 'draft' ? walkId : undefined);
  const teams = useTeams(walkId);
  const [access, requestAccess] = useLocationAccess();
  const toast = useToast();

  const bothModes = !!walk.data?.modes.solo && !!walk.data?.modes.team;
  const [chosenMode, setMode] = useState<PlayMode>();
  const [typedName, setName] = useState<string>();
  const [players, setPlayers] = useState(2);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  // One random seed per visit, so the suggested name does not change on every render.
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));

  // The mode defaults to what the creator allows; the name to a suggestion for teams.
  const mode: PlayMode = chosenMode ?? (walk.data && !walk.data.modes.team ? 'solo' : 'team');
  const suggested = useMemo(() => {
    return suggestTeamName(seededRandom(seed), teams.data);
    // Suggest once the teams are known; later joins do not rename someone mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, teams.loading]);
  const name = typedName ?? (mode === 'team' ? suggested : '');

  const me = teams.data.find((t) => t.id === uid);
  const others = teams.data.filter((t) => t.id !== uid);
  const taken = name.trim().length > 0 && isTeamNameTaken(name, others);

  const summary = useMemo(() => {
    const w = walk.data;
    if (!w) return undefined;
    const minutes = estimateWalkMinutes(w.distanceM, w.stopCount);
    const last = stops.data[stops.data.length - 1];
    const endsAway = last ? distanceBetween(last.location, w.start) : 0;
    return { minutes, endsAway };
  }, [walk.data, stops.data]);

  if (walk.loading || (walk.data && teams.loading)) {
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  const w = walk.data;
  if (!w || w.status === 'draft') {
    return (
      <Screen>
        <EmptyState
          icon="blocked"
          title="This walk isn't available"
          text="The code may be wrong, or the walk was deleted. Ask the person who invited you for a new code."
        />
      </Screen>
    );
  }
  if (w.status === 'ended') {
    return (
      <Screen
        footer={
          <Button
            label="See the results"
            large
            onPress={() => router.replace(`/play/${w.id}/results`)}
          />
        }
      >
        <EmptyState
          icon="flag"
          title={`${w.title} has ended`}
          text="You can still see how the teams did."
        />
      </Screen>
    );
  }
  // Already in: go where the team is.
  if (me && !me.leftAt) return <Redirect href={playerHref(w, me)} />;

  const needsPermission = access?.status === 'undetermined';
  const finalName = mode === 'solo' && name.trim().length === 0 ? '' : name.trim();

  const join = async () => {
    if (!uid) return;
    if (finalName.length === 0) {
      setTouched(true);
      return;
    }
    if (taken) return;
    setBusy(true);
    try {
      if (needsPermission) await requestAccess();
      await markWelcomeSeen();
      // Not awaited beyond the local write: offline it is queued like every player write.
      joinWalk({
        walkId: w.id,
        uid,
        name: finalName,
        mode,
        players: mode === 'solo' ? 1 : players,
        colorIndex: pickColorIndex(teams.data.map((t) => t.colorIndex)),
      }).catch((err: unknown) => toast(errorMessage(err, 'Could not join. Try again.'), 'error'));
      router.replace(`/play/${w.id}/lobby`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <Button
          label={needsPermission ? 'Allow location & join' : 'Join'}
          icon={needsPermission ? 'gps' : undefined}
          large
          loading={busy}
          disabled={taken}
          onPress={() => void join()}
        />
      }
    >
      <View style={styles.head}>
        <Txt variant="label" color={colors.secondary} caps>
          {w.ownerName ? `${w.ownerName} invited you` : 'You are invited'}
        </Txt>
        <Txt variant="title" accessibilityRole="header">
          {w.title}
        </Txt>
      </View>

      <Card style={styles.summary}>
        <Fact
          icon="flag"
          text={`${plural(w.stopCount, 'stop')} · ${formatDistance(w.distanceM)}`}
        />
        <Fact icon="clock" text={summary ? formatMinutes(summary.minutes) : ''} />
        {summary && summary.endsAway > ENDS_AWAY_MIN_M ? (
          <Fact icon="pin" text={`Ends ${formatDistance(summary.endsAway)} from the start`} />
        ) : null}
        {w.whenText ? <Fact icon="users" text={`When: ${w.whenText}`} /> : null}
        {w.status === 'open' && w.openedAt ? (
          <Fact
            icon="play"
            text={
              w.openFor === 'week'
                ? `Open now. ${openUntilLabel(w.openedAt.toMillis(), 'week')}. Walk it when it suits you.`
                : `Open now · ${openUntilLabel(w.openedAt.toMillis(), 'day').toLowerCase()}`
            }
          />
        ) : null}
        <Fact icon="pin" text={`Starts at ${w.startLabel || 'the start pin'}`} />
      </Card>

      {bothModes ? (
        <Segmented
          label="Play as"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setName(undefined);
            setTouched(false);
          }}
          options={[
            { value: 'team', label: 'Team' },
            { value: 'solo', label: 'Solo' },
          ]}
        />
      ) : null}

      <Field
        label={mode === 'solo' ? 'Your name' : 'Team name'}
        value={name}
        placeholder={mode === 'solo' ? 'Your name' : 'Team name'}
        onChangeText={(t) => {
          setName(t);
          setTouched(true);
        }}
        maxLength={30}
        autoCapitalize="words"
        error={
          taken
            ? 'Another team already has this name. Pick another.'
            : touched && finalName.length === 0
              ? `Add ${mode === 'solo' ? 'your' : 'a team'} name.`
              : undefined
        }
        helper="Shown on the leaderboard."
      />

      {mode === 'team' ? (
        <Stepper
          label="Players on this phone"
          value={players}
          min={1}
          max={Math.max(1, w.maxPlayers)}
          onChange={setPlayers}
        />
      ) : null}

      <View style={styles.locationCard}>
        <Icon name="gps" color={colors.accent} />
        <View style={styles.flex}>
          <Txt variant="calloutStrong">Your location unlocks the questions</Txt>
          <Txt variant="caption" color={colors.secondary}>
            Each question opens when you reach its stop. Nothing about where you are is shared until
            you tap Start walk, and only with {w.ownerName || 'the creator'}.
          </Txt>
        </View>
      </View>
      <LocationNotice access={access} />
      {w.status === 'ready' ? (
        <Banner
          kind="info"
          icon="clock"
          text={`${w.ownerName || 'The creator'} hasn't opened the walk yet. You can join now and wait in the lobby.`}
        />
      ) : null}
    </Screen>
  );
}

/** A small repeatable random sequence, so a suggestion is stable for one visit. */
function seededRandom(seed: number): () => number {
  let n = seed;
  return () => {
    n = (n * 9301 + 49297) % 233280;
    return n / 233280;
  };
}

function Fact({ icon, text }: { icon: 'flag' | 'clock' | 'pin' | 'users' | 'play'; text: string }) {
  if (!text) return null;
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={18} color={colors.accent} />
      <Txt variant="callout" style={styles.flex}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { gap: spacing.xs, marginTop: spacing.xs },
  summary: { gap: spacing.sm + 2 },
  fact: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'center' },
  locationCard: {
    flexDirection: 'row',
    gap: spacing.md - 4,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.successFill,
  },
});
