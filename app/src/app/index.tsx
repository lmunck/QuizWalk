/**
 * C1 Home. Playing comes first, then the creator's Live / Ready / Drafts / Finished. Someone
 * who has not signed in sees Playing and the two actions (spec §3 C1).
 */
import {
  formatDistance,
  openUntilLabel,
  plural,
  rankTeams,
  walkTimeMs,
  type WalkStatus,
} from '@qualk/shared';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { Card, EmptyState, Pill, SectionLabel } from '@/components/ui';
import { deleteWalk, duplicateWalk } from '@/data/callables';
import { errorMessage } from '@/data/errors';
import { useTeam, useTeams } from '@/data/teams';
import { deleteDraft, useMyWalks, useStops, useWalksById, type Walk } from '@/data/walks';
import { creatorHref, playerHref } from '@/lib/routes';
import { hasSeenWelcome } from '@/lib/storage';
import { colors, radius, spacing } from '@/theme/tokens';

export default function Home() {
  const insets = useSafeAreaInsets();
  const { uid, isCreator, displayName, playing, userLoaded } = useAuth();
  const [welcomeChecked, setWelcomeChecked] = useState(false);

  const playingWalks = useWalksById(playing);
  const mine = useMyWalks(uid, isCreator);

  // First run without a link: Welcome (G1). Anyone who has joined or created skips it.
  useEffect(() => {
    if (!userLoaded) return;
    void hasSeenWelcome().then((seen) => {
      if (!seen && !isCreator && playing.length === 0) router.replace('/welcome');
      else setWelcomeChecked(true);
    });
  }, [userLoaded, isCreator, playing.length]);

  const sections = useMemo(() => {
    const by = (s: WalkStatus) => mine.data.filter((w) => w.status === s);
    return { live: by('open'), ready: by('ready'), drafts: by('draft'), finished: by('ended') };
  }, [mine.data]);

  const newWalk = () =>
    router.push(
      isCreator && displayName ? '/create' : { pathname: '/sign-in', params: { next: 'create' } },
    );
  const loading = !welcomeChecked || playingWalks.loading || (isCreator && mine.loading);
  const nothing = playingWalks.data.length === 0 && mine.data.length === 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Txt variant="heading" accessibilityRole="header" style={styles.wordmark}>
          QuizWalk
        </Txt>
        <View style={styles.topActions}>
          <Pressable
            onPress={() => router.push('/join')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.joinPill, pressed && { backgroundColor: colors.tint }]}
          >
            <Txt variant="calloutStrong">Join with code</Txt>
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={({ pressed }) => [styles.avatar, pressed && { backgroundColor: colors.tint }]}
          >
            {isCreator && displayName ? (
              <Txt variant="calloutStrong">{initialsOf(displayName)}</Txt>
            ) : (
              <Icon name="user" size={20} />
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Txt variant="display" style={styles.title}>
          {isCreator ? 'My walks' : 'Your walks'}
        </Txt>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : nothing ? (
          <EmptyState
            icon="walk"
            title="Turn any walk into a quiz"
            text="Join a walk with the 5-letter code you were sent, or make one for friends, family or a class."
          />
        ) : null}

        {playingWalks.data.length > 0 ? (
          <Section label="Playing">
            {playingWalks.data.map((w) => (
              <PlayingCard key={w.id} walk={w} uid={uid!} />
            ))}
          </Section>
        ) : null}

        {sections.live.length > 0 ? (
          <Section label="Live now">
            {sections.live.map((w) => (
              <LiveCard key={w.id} walk={w} />
            ))}
          </Section>
        ) : null}
        {sections.ready.length > 0 ? (
          <Section label="Ready to open">
            {sections.ready.map((w) => (
              <CreatorCard key={w.id} walk={w} />
            ))}
          </Section>
        ) : null}
        {sections.drafts.length > 0 ? (
          <Section label="Drafts">
            {sections.drafts.map((w) => (
              <CreatorCard key={w.id} walk={w} />
            ))}
          </Section>
        ) : null}
        {sections.finished.length > 0 ? (
          <Section label="Finished">
            {sections.finished.map((w) => (
              <CreatorCard key={w.id} walk={w} />
            ))}
          </Section>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        {nothing && !loading ? (
          <Button
            label="Join with code"
            kind="secondary"
            icon="key"
            large
            onPress={() => router.push('/join')}
          />
        ) : null}
        <Button label="New quiz walk" icon="plus" large onPress={newWalk} />
      </View>
    </View>
  );
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </View>
  );
}

// ------------------------------------------------------------------ playing

function PlayingCard({ walk, uid }: { walk: Walk; uid: string }) {
  const team = useTeam(walk.id, uid).data;
  const live = walk.status === 'open' && !!team?.startedAt && !team.finishedAt && !team.leftAt;
  const href = playerHref(walk, team);

  let line: string;
  if (walk.status === 'ended') line = 'Final results are in';
  else if (!team) line = 'Tap to join';
  else if (team.finishedAt) line = `Finished · ${plural(team.score, 'point')}`;
  else if (walk.status === 'ready')
    line = `Waiting for ${walk.ownerName || 'the creator'} to open it`;
  else if (!team.startedAt) line = 'Open · tap Start walk at the start';
  else
    line = `Stop ${Math.min(team.stopsDone + 1, walk.stopCount)} of ${walk.stopCount} · ${plural(team.score, 'point')}`;

  const week =
    walk.status === 'open' && walk.openFor === 'week' && walk.openedAt
      ? openUntilLabel(walk.openedAt.toMillis(), 'week')
      : undefined;

  return (
    <Card
      dark={live}
      onPress={() => router.push(href)}
      accessibilityLabel={`${walk.title}. ${line}${week ? `. ${week}` : ''}`}
      style={styles.walkCard}
    >
      <View style={styles.cardTop}>
        <Txt
          variant="subheading"
          color={live ? colors.white : colors.ink}
          style={styles.flex}
          numberOfLines={2}
        >
          {walk.title}
        </Txt>
        {walk.status === 'ended' ? (
          <Pill label="Results" tone="success" icon="trophy" />
        ) : live ? (
          <Pill label="Walking" tone="live" />
        ) : null}
      </View>
      <Txt variant="callout" color={live ? colors.onInkMuted : colors.secondary}>
        {line}
      </Txt>
      {week ? (
        <Txt variant="caption" color={live ? colors.onInkMuted : colors.muted}>
          {week}
        </Txt>
      ) : null}
      {live ? (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${walk.stopCount ? (100 * team!.stopsDone) / walk.stopCount : 0}%` },
            ]}
          />
        </View>
      ) : null}
    </Card>
  );
}

// ------------------------------------------------------------------ creator

function LiveCard({ walk }: { walk: Walk }) {
  const teams = useTeams(walk.id).data;
  const walking = teams.filter((t) => t.startedAt && !t.finishedAt && !t.leftAt).length;
  const finished = teams.filter((t) => t.finishedAt).length;
  const ends = walk.openedAt ? openUntilLabel(walk.openedAt.toMillis(), walk.openFor) : '';
  const progress = teams.length ? finished / teams.length : 0;
  return (
    <Card dark onPress={() => router.push(creatorHref(walk))} style={styles.walkCard}>
      <View style={styles.cardTop}>
        <Txt variant="heading" color={colors.white} style={styles.flex} numberOfLines={2}>
          {walk.title}
        </Txt>
        <Pill label="LIVE" tone="live" />
      </View>
      <Txt variant="callout" color={colors.onInkMuted}>
        {[plural(walking, 'team') + ' walking', finished ? `${finished} finished` : null, ends]
          .filter(Boolean)
          .join(' · ')}
      </Txt>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </Card>
  );
}

function CreatorCard({ walk }: { walk: Walk }) {
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<'duplicate' | 'delete'>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toast = useToast();
  const stops = useStops(walk.status === 'draft' && confirmDelete ? walk.id : undefined).data;

  const icon = walk.status === 'ended' ? 'trophy' : walk.status === 'ready' ? 'share' : 'edit';
  const tint = walk.status === 'ended' ? colors.errorFill : colors.successFill;
  const iconColor = walk.status === 'ended' ? colors.error : colors.accent;

  const duplicate = async () => {
    setMenu(false);
    setBusy('duplicate');
    try {
      const res = await duplicateWalk(walk.id);
      toast('Copied as a new draft');
      router.push(`/walk/${res.walkId}/route`);
    } catch (err) {
      toast(errorMessage(err, 'Could not copy the walk. Try again.'), 'error');
    } finally {
      setBusy(undefined);
    }
  };

  const remove = async () => {
    setBusy('delete');
    try {
      if (walk.status === 'draft') await deleteDraft(walk.id, stops);
      else await deleteWalk(walk.id);
      setConfirmDelete(false);
      toast('Walk deleted');
    } catch (err) {
      toast(errorMessage(err, 'Could not delete the walk. Try again.'), 'error');
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <>
      <Card onPress={() => router.push(creatorHref(walk) as Href)} style={styles.rowCard}>
        <View style={[styles.cardIcon, { backgroundColor: tint }]}>
          <Icon name={icon} size={22} color={iconColor} />
        </View>
        <View style={styles.flex}>
          <Txt variant="bodyStrong" numberOfLines={2}>
            {walk.title}
          </Txt>
          <CreatorLine walk={walk} />
        </View>
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Pressable
            onPress={() => setMenu(true)}
            accessibilityRole="button"
            accessibilityLabel={`More for ${walk.title}`}
            style={styles.more}
            hitSlop={6}
          >
            <Icon name="more" size={22} color={colors.secondary} />
          </Pressable>
        )}
      </Card>
      <Dialog
        visible={menu}
        title={walk.title}
        onDismiss={() => setMenu(false)}
        actions={[
          { label: 'Duplicate as new draft', kind: 'secondary', onPress: duplicate },
          {
            label: 'Delete walk',
            kind: 'destructive',
            onPress: () => {
              setMenu(false);
              setConfirmDelete(true);
            },
          },
          { label: 'Cancel', kind: 'ghost', onPress: () => setMenu(false) },
        ]}
      />
      <Dialog
        visible={confirmDelete}
        title="Delete this walk?"
        text={
          walk.status === 'draft'
            ? 'The walk and its questions are deleted. This cannot be undone.'
            : 'The walk, its questions, teams and results are deleted, and its join code stops working. This cannot be undone.'
        }
        onDismiss={() => setConfirmDelete(false)}
        actions={[
          {
            label: 'Delete walk',
            kind: 'destructive',
            onPress: remove,
            loading: busy === 'delete',
          },
          { label: 'Keep it', kind: 'ghost', onPress: () => setConfirmDelete(false) },
        ]}
      />
    </>
  );
}

function CreatorLine({ walk }: { walk: Walk }) {
  const needsTeams = walk.status === 'ready' || walk.status === 'ended';
  const teams = useTeams(needsTeams ? walk.id : undefined).data;
  let line: string;
  if (walk.status === 'draft') {
    line = `${plural(walk.stopCount, 'stop')} · ${formatDistance(walk.distanceM)}`;
  } else if (walk.status === 'ready') {
    line = `Code ${walk.joinCode ?? '…'} · ${plural(teams.length, 'team')} joined`;
  } else {
    const ranked = rankTeams(
      teams.map((t) => ({
        ...t,
        walkTimeMs: walkTimeMs(t.startedAt?.toMillis(), t.finishedAt?.toMillis()),
      })),
    );
    const winner = ranked[0];
    line = winner
      ? `${plural(teams.length, 'team')} · won by ${winner.tied ? `${winner.name} and others` : winner.name}`
      : 'No teams played';
  }
  return (
    <Txt variant="caption" color={colors.secondary} numberOfLines={1}>
      {line}
    </Txt>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  wordmark: { letterSpacing: -0.6, color: colors.accent },
  topActions: { flexDirection: 'row', gap: spacing.sm },
  joinPill: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  title: { marginTop: spacing.md },
  loader: { marginTop: spacing.xl },
  section: { gap: spacing.sm + 2 },
  walkCard: { gap: spacing.sm, borderRadius: radius.lg + 2, padding: spacing.md + 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2E4136',
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: { height: 6, backgroundColor: '#5DBB8A' },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 2,
    paddingVertical: spacing.md - 2,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm + 4, gap: spacing.sm + 2 },
});
