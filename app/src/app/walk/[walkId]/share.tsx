/**
 * C6 Share: join code, QR, link, Play as, players per team, an optional "When" line, the live
 * list of joined teams, Share invite (message, link and a picture of the code), and Open walk
 * behind a confirm (spec §3 C6).
 */
import { plural } from '@qualk/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { TeamBadge } from '@/components/game';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Field, Row, RowGroup, SectionLabel, Segmented, Stepper } from '@/components/ui';
import { useTeams } from '@/data/teams';
import { updateWalk, useWalk, type Walk } from '@/data/walks';
import { CodeCard, useInvite } from '@/features/Invite';
import { OpenWalkDialog } from '@/features/OpenWalkDialog';
import { colors, radius, spacing } from '@/theme/tokens';

type PlayAs = 'both' | 'team' | 'solo';

export default function ShareWalk() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  const { uid } = useAuth();
  const walk = useWalk(walkId);
  const teams = useTeams(walkId);
  const invite = useInvite(walk.data);
  const [opening, setOpening] = useState(false);

  if (walk.loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  const w = walk.data;
  if (!w || w.ownerUid !== uid) return <Redirect href="/" />;
  if (w.status === 'draft') return <Redirect href={`/walk/${walkId}/route`} />;
  // While the Open walk dialog is up it finishes its own flow (the notification question).
  if (w.status === 'open' && !opening) return <Redirect href={`/walk/${walkId}/monitor`} />;
  if (w.status === 'ended') return <Redirect href={`/walk/${walkId}/results`} />;

  const joined = teams.data.filter((t) => !t.leftAt);

  return (
    <Screen
      title="Share walk"
      onBack={() => router.replace('/')}
      footer={
        <>
          {invite.card}
          <Button
            label="Share invite"
            icon="share"
            large
            loading={invite.busy === 'invite'}
            onPress={() => void invite.invite()}
          />
          <Button label="Open walk…" kind="secondary" large onPress={() => setOpening(true)} />
        </>
      }
    >
      <CodeCard walk={w} />

      <RowGroup>
        <Row
          icon="share"
          label="Share as a picture"
          detail="Title, code and QR, to post or print"
          onPress={() => void invite.image()}
        />
        <Row
          icon="edit"
          label="Edit route and questions"
          onPress={() => router.push(`/walk/${w.id}/route`)}
        />
        <Row
          icon="eye"
          label="Preview the questions"
          onPress={() => router.push(`/walk/${w.id}/preview`)}
          last
        />
      </RowGroup>

      <Settings walk={w} />

      <View style={styles.block}>
        <SectionLabel>
          {joined.length === 0 ? 'No teams yet' : `${plural(joined.length, 'team')} joined`}
        </SectionLabel>
        {joined.length === 0 ? (
          <Txt variant="callout" color={colors.secondary}>
            Teams appear here as they join. They wait in a lobby until you open the walk.
          </Txt>
        ) : (
          <View style={styles.chips}>
            {joined.map((t) => (
              <View key={t.id} style={styles.chip}>
                <TeamBadge name={t.name} colorIndex={t.colorIndex} size={26} />
                <Txt variant="callout">
                  {t.name}
                  {t.mode === 'team' ? ` · ${t.players}` : ''}
                </Txt>
              </View>
            ))}
          </View>
        )}
      </View>

      <OpenWalkDialog
        visible={opening}
        walkId={w.id}
        onDismiss={() => setOpening(false)}
        onOpened={() => {
          setOpening(false);
          router.replace(`/walk/${w.id}/monitor`);
        }}
      />
    </Screen>
  );
}

function Settings({ walk }: { walk: Walk }) {
  const playAs: PlayAs =
    walk.modes.solo && walk.modes.team ? 'both' : walk.modes.team ? 'team' : 'solo';
  const [when, setWhen] = useState<string>();
  return (
    <View style={styles.block}>
      <SectionLabel>Settings</SectionLabel>
      <Txt variant="calloutStrong">Play as</Txt>
      <Segmented<PlayAs>
        label="Play as"
        value={playAs}
        onChange={(v) => updateWalk(walk.id, { modes: { solo: v !== 'team', team: v !== 'solo' } })}
        options={[
          { value: 'both', label: 'Both' },
          { value: 'team', label: 'Teams' },
          { value: 'solo', label: 'Solo' },
        ]}
      />
      {playAs !== 'solo' ? (
        <Stepper
          label="Players per team (max)"
          value={walk.maxPlayers}
          min={1}
          max={20}
          onChange={(n) => updateWalk(walk.id, { maxPlayers: n })}
        />
      ) : null}
      <Field
        label="When (optional)"
        value={when ?? walk.whenText ?? ''}
        onChangeText={setWhen}
        onEndEditing={() => {
          if (when !== undefined) updateWalk(walk.id, { whenText: when.trim() });
          setWhen(undefined);
        }}
        placeholder="Sat 14:00, meet at the anchor"
        maxLength={60}
        helper="Shown to players on the invite and in the lobby. The walk only opens when you tap Open walk."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm + 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: 4,
    paddingRight: spacing.md - 4,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
