/**
 * C7 Live monitor: each team's last known position and the leaderboard in a sheet. Teams not
 * heard from for 2 minutes are dimmed ("seen 6 min ago"). An Invite pill shows the code for
 * late-comers; an alerts strip carries "Way blocked" reports with Skip stop for everyone. End
 * walk is secondary and its confirm says how many teams are still walking. When everyone who
 * started has finished, a banner offers to end the walk (not in a week-long walk). Spec §3 C7.
 */
import {
  everyoneFinished,
  formatAgo,
  isWalking,
  openUntilLabel,
  plural,
  type LatLng,
} from '@qualk/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { Button, IconButton } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { Leaderboard, type LeaderRow } from '@/components/Leaderboard';
import {
  QMap,
  RouteLine,
  StartMarker,
  StopMarker,
  TeamMapMarker,
  type QMapRef,
} from '@/components/MapPieces';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { Banner, Pill, SectionLabel } from '@/components/ui';
import { errorMessage } from '@/data/errors';
import { resolveAlert, useAlerts, usePositions } from '@/data/teams';
import { endWalk, skipStopForEveryone, useStops, useWalk } from '@/data/walks';
import { shareInvite } from '@/features/Invite';
import { useStandings } from '@/features/standings';
import { colors, radius, spacing } from '@/theme/tokens';

const STALE_MS = 2 * 60_000;

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

function sameDay(a: number, b: number) {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

export default function Monitor() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  const { uid } = useAuth();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const now = useNow(20_000);
  const walk = useWalk(walkId);
  const stops = useStops(walkId);
  const isOwner = !!walk.data && walk.data.ownerUid === uid;
  const positions = usePositions(walkId, isOwner);
  const alerts = useAlerts(walkId, isOwner);
  const { standings, all } = useStandings(walkId);
  const mapRef = useRef<QMapRef>(null);
  const [ending, setEnding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skipAsk, setSkipAsk] = useState<{ alertId: string; stopId: string; number: number }>();

  const inPlay = useMemo(() => stops.data.filter((s) => !s.skippedForAll), [stops.data]);
  const numberOf = (stopId: string) => inPlay.findIndex((s) => s.id === stopId) + 1;
  const week = walk.data?.openFor === 'week';

  const rows: LeaderRow[] = useMemo(
    () =>
      standings.map((t) => {
        const pos = positions.data.find((p) => p.id === t.id);
        const at = pos?.at?.toMillis();
        const stale = t.walking && at !== undefined && now - at > STALE_MS;
        return {
          ...t,
          left: t.leftAt != null,
          dimmed: stale,
          note: t.walking && at !== undefined && stale ? `seen ${formatAgo(now - at)}` : undefined,
        };
      }),
    [standings, positions.data, now],
  );

  if (walk.loading || stops.loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  const w = walk.data;
  if (!w || !isOwner) return <Redirect href="/" />;
  if (w.status === 'ended') return <Redirect href={`/walk/${walkId}/results`} />;
  if (w.status !== 'open') return <Redirect href={`/walk/${walkId}/share`} />;

  const stillWalking = all.filter(isWalking).length;
  const allDone = !week && everyoneFinished(all);
  const openAlerts = alerts.data.filter((a) => !a.resolved);
  const ends = w.openedAt ? openUntilLabel(w.openedAt.toMillis(), w.openFor) : '';
  const pins = positions.data.filter((p) => {
    const at = p.at?.toMillis();
    const team = all.find((t) => t.id === p.id);
    if (!team || team.leftAt || at === undefined) return false;
    return week ? sameDay(at, now) : true;
  });
  const notToday = week ? all.filter((t) => !pins.some((p) => p.id === t.id) && !t.finishedAt) : [];
  const points: LatLng[] = [
    w.start,
    ...inPlay.map((s) => s.location),
    ...pins.map((p) => p.location),
  ];

  const end = async () => {
    setBusy(true);
    try {
      await endWalk(w.id);
      router.replace(`/walk/${w.id}/results`);
    } catch (err) {
      toast(
        errorMessage(err, 'Could not end the walk. Check your connection and try again.'),
        'error',
      );
    } finally {
      setBusy(false);
      setEnding(false);
    }
  };

  return (
    <View style={styles.root}>
      <QMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        onMapReady={() =>
          mapRef.current?.fitToCoordinates(points, {
            edgePadding: { top: insets.top + 80, bottom: 380, left: 50, right: 50 },
            animated: false,
          })
        }
      >
        <RouteLine
          points={[w.start, ...inPlay.map((s) => s.location)]}
          color={colors.controlBorder}
        />
        <StartMarker coordinate={w.start} />
        {inPlay.map((s, i) => (
          <StopMarker key={s.id} coordinate={s.location} number={i + 1} tone="muted" />
        ))}
        {pins.map((p) => {
          const team = all.find((t) => t.id === p.id)!;
          const at = p.at?.toMillis() ?? 0;
          const stale = now - at > STALE_MS && !team.finishedAt;
          return (
            <TeamMapMarker
              key={p.id}
              coordinate={p.location}
              name={team.name}
              colorIndex={team.colorIndex}
              dimmed={stale}
              onPress={() => router.push(`/walk/${w.id}/team/${team.id}`)}
              label={`${team.name}, ${team.finishedAt ? 'finished' : `seen ${formatAgo(now - at)}`}`}
            />
          );
        })}
      </QMap>

      <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <IconButton icon="back" label="Home" tone="surface" onPress={() => router.replace('/')} />
        <Pressable
          onPress={() => void shareInvite(w)}
          accessibilityRole="button"
          accessibilityLabel={`Invite more teams. Code ${w.joinCode?.split('').join(' ')}`}
          style={({ pressed }) => [styles.invite, pressed && { backgroundColor: colors.tint }]}
        >
          <Icon name="share" size={18} />
          <Txt variant="calloutStrong">Invite · {w.joinCode}</Txt>
        </Pressable>
      </View>

      <Sheet
        peek={230}
        initial={1}
        header={
          <View style={styles.sheetHeader}>
            <View style={styles.titleRow}>
              <Pill label="LIVE" tone="live" />
              <Txt variant="heading" numberOfLines={1} style={styles.flex}>
                {w.title}
              </Txt>
            </View>
            <Txt variant="caption" color={colors.secondary}>
              {[`${plural(stillWalking, 'team')} walking`, ends].filter(Boolean).join(' · ')}
            </Txt>
          </View>
        }
        footer={
          allDone ? (
            <Button
              label="End walk & show results"
              icon="flag"
              large
              loading={busy}
              onPress={() => void end()}
            />
          ) : (
            <Button label="End walk…" kind="destructive" large onPress={() => setEnding(true)} />
          )
        }
      >
        <ScrollView contentContainerStyle={styles.list}>
          {openAlerts.map((a) => {
            const team = all.find((t) => t.id === a.teamUid);
            const n = numberOf(a.stopId);
            const stop = stops.data.find((s) => s.id === a.stopId);
            return (
              <Banner
                key={a.id}
                kind="warning"
                icon="blocked"
                title={`${team?.name ?? 'A team'}: way to stop ${n || '?'} is blocked`}
                text={
                  stop?.skippedForAll
                    ? 'The stop is already removed for everyone.'
                    : 'They have moved on. Skip the stop for everyone, and nobody loses points for it.'
                }
                actionLabel={stop?.skippedForAll ? 'Dismiss' : `Skip stop ${n} for everyone`}
                onAction={() =>
                  stop?.skippedForAll
                    ? resolveAlert(w.id, a.id)
                    : setSkipAsk({ alertId: a.id, stopId: a.stopId, number: n })
                }
              />
            );
          })}
          {allDone ? (
            <Banner
              kind="success"
              icon="flag"
              title="Everyone has finished"
              text="End the walk to show the final results to all teams."
            />
          ) : null}
          <SectionLabel>Leaderboard</SectionLabel>
          {rows.length === 0 ? (
            <Txt variant="callout" color={colors.secondary}>
              No teams yet. Share the invite: teams can join while the walk is open.
            </Txt>
          ) : (
            <Leaderboard
              rows={rows}
              stopCount={inPlay.length}
              onPress={(id) => router.push(`/walk/${w.id}/team/${id}`)}
            />
          )}
          {notToday.length > 0 ? (
            <Txt variant="caption" color={colors.muted}>
              Not walked today: {notToday.map((t) => t.name).join(', ')}
            </Txt>
          ) : null}
        </ScrollView>
      </Sheet>

      <Dialog
        visible={ending}
        title="End the walk now?"
        text={
          stillWalking > 0
            ? `${plural(stillWalking, 'team is', 'teams are')} still walking. They keep the points they have, and answers not yet sent will not count. Everyone sees the final results.`
            : 'Everyone sees the final results. This cannot be undone.'
        }
        onDismiss={() => setEnding(false)}
        actions={[
          { label: 'End walk', kind: 'destructive', loading: busy, onPress: () => void end() },
          { label: 'Keep it open', kind: 'ghost', onPress: () => setEnding(false) },
        ]}
      />
      <Dialog
        visible={skipAsk !== undefined}
        title={`Skip stop ${skipAsk?.number ?? ''} for everyone?`}
        text="The stop is removed from the walk. Points already earned on it are taken away from every team, so nobody is behind for missing it. Scores are recalculated."
        onDismiss={() => setSkipAsk(undefined)}
        actions={[
          {
            label: 'Skip for everyone',
            kind: 'destructive',
            onPress: () => {
              if (skipAsk) {
                skipStopForEveryone(w.id, skipAsk.stopId);
                resolveAlert(w.id, skipAsk.alertId);
              }
              setSkipAsk(undefined);
            },
          },
          { label: 'Cancel', kind: 'ghost', onPress: () => setSkipAsk(undefined) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapBase },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  topBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  sheetHeader: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm + 2 },
});
