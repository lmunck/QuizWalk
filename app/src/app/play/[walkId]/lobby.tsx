/**
 * P2 Lobby. Before the walk opens: "Waiting for Anders to open the walk" with Notify me. Once
 * open: Start walk. Reading every stop here puts the whole quiz in the offline cache (m1-design
 * §8). Nothing about the player's position is uploaded until Start walk (spec §3 P2).
 */
import { distanceM, formatDistance, openUntilLabel, plural } from '@qualk/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { Button, IconButton } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { TeamBadge } from '@/components/game';
import { Icon } from '@/components/Icon';
import { LocationNotice } from '@/components/LocationNotice';
import { QMap, regionFor, StartMarker } from '@/components/MapPieces';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { Banner, Card, Field, Row, RowGroup, SectionLabel, Stepper } from '@/components/ui';
import { leaveWalk, startWalk, updateTeam, useTeam, useTeams } from '@/data/teams';
import { useStops, useWalk } from '@/data/walks';
import { usePosition, useLocationAccess } from '@/location/position';
import { pushPermission, requestPushToken } from '@/lib/push';
import { playerHref } from '@/lib/routes';
import { colors, radius, spacing } from '@/theme/tokens';

export default function Lobby() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  const { uid } = useAuth();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const walk = useWalk(walkId);
  const team = useTeam(walkId, uid);
  const teams = useTeams(walkId);
  const stops = useStops(walkId);
  const [access] = useLocationAccess();
  const here = usePosition(access?.status === 'granted');

  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [askPush, setAskPush] = useState<'notify' | 'start'>();
  const [notifyOn, setNotifyOn] = useState(false);

  const w = walk.data;
  const me = team.data;
  const others = useMemo(
    () => teams.data.filter((t) => t.id !== uid && !t.leftAt),
    [teams.data, uid],
  );
  const smallestRadius = stops.data.length ? Math.min(...stops.data.map((s) => s.radiusM)) : 40;
  const toStart = w && here ? distanceM(here, w.start) : undefined;

  if (walk.loading || team.loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!w) return <Redirect href="/" />;
  if (!me || me.leftAt) return <Redirect href={`/play/${walkId}`} />;
  if (w.status === 'ended' || me.startedAt) return <Redirect href={playerHref(w, me)} />;

  const open = w.status === 'open';
  const owner = w.ownerName || 'the creator';

  const begin = () => {
    if (!uid) return;
    startWalk(w.id, uid);
    router.replace(`/play/${w.id}/stop`);
  };

  const onStart = async () => {
    // Asked once, where its use is obvious (spec §11): so you hear when the results are in.
    if ((await pushPermission()) === 'undetermined') setAskPush('start');
    else begin();
  };

  const turnOnPush = async (then?: () => void) => {
    const res = await requestPushToken();
    if (res.token && uid) {
      updateTeam(w.id, uid, { pushToken: res.token });
      setNotifyOn(true);
    } else if (res.status === 'unavailable') {
      toast("Notifications aren't available on this phone yet.");
    }
    setAskPush(undefined);
    then?.();
  };

  return (
    <View style={styles.root}>
      <QMap
        style={styles.map}
        initialRegion={regionFor(here ? [w.start, here] : [w.start], 0.008)}
        showsUserLocation={access?.status === 'granted'}
      >
        <StartMarker coordinate={w.start} />
      </QMap>
      <View style={[styles.back, { top: insets.top + spacing.sm }]}>
        <IconButton icon="back" label="Home" tone="surface" onPress={() => router.replace('/')} />
      </View>

      <View style={styles.panel}>
        <ScrollView contentContainerStyle={styles.panelContent}>
          <View style={styles.heading}>
            <Txt variant="label" color={colors.secondary} caps>
              {`You're in · ${me.name}`}
            </Txt>
            <Txt variant="title" accessibilityRole="header">
              {open ? 'Head to the start' : `Waiting for ${owner} to open the walk`}
            </Txt>
            <Txt variant="callout" color={colors.secondary}>
              {[
                w.startLabel || 'Start pin',
                toStart === undefined
                  ? null
                  : toStart < 30
                    ? "You're at the start"
                    : `${formatDistance(toStart)} away`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Txt>
            {open && w.openFor === 'week' && w.openedAt ? (
              <Txt variant="callout" color={colors.accent}>
                {openUntilLabel(w.openedAt.toMillis(), 'week')}. Start now or come back later from
                Home.
              </Txt>
            ) : null}
            {!open && w.whenText ? (
              <Txt variant="callout" color={colors.secondary}>
                Planned for {w.whenText}
              </Txt>
            ) : null}
          </View>

          <LocationNotice access={access} />

          {!open ? (
            <RowGroup>
              <Row
                icon="bell"
                label={notifyOn ? "We'll tell you when it opens" : 'Notify me when it opens'}
                detail={notifyOn ? undefined : 'The lobby also updates by itself while it is open.'}
                onPress={notifyOn ? undefined : () => setAskPush('notify')}
                last
              />
            </RowGroup>
          ) : null}

          <Card style={styles.rules}>
            <Rule n="1" text="Walk to each stop on the map. They are revealed one at a time." />
            <Rule
              n="2"
              text={`The question opens when you are within ${smallestRadius} m of the stop.`}
            />
            <Rule
              n="3"
              text="Answer fast for up to 5 bonus points. Keep QuizWalk open on the walk."
            />
            <View style={styles.safety}>
              <Icon name="warning" size={18} color={colors.warningText} />
              <Txt variant="callout" color={colors.warningText} style={styles.flex}>
                Watch the traffic, not the phone. The quiz waits for you.
              </Txt>
            </View>
          </Card>

          <View style={styles.teamsBlock}>
            <SectionLabel>
              {others.length === 0
                ? 'No other teams yet'
                : `${plural(others.length, 'other team')} joined`}
            </SectionLabel>
            <View style={styles.chips}>
              {others.map((t) => (
                <View key={t.id} style={styles.chip}>
                  <TeamBadge name={t.name} colorIndex={t.colorIndex} size={26} />
                  <Txt variant="callout">{t.name}</Txt>
                </View>
              ))}
            </View>
          </View>

          <RowGroup>
            <Row
              icon="users"
              label={me.name}
              detail={me.mode === 'solo' ? 'Playing solo' : plural(me.players, 'player')}
              onPress={() => setEditing(true)}
              right={
                <Txt variant="calloutStrong" color={colors.accent}>
                  Edit
                </Txt>
              }
            />
            <Row
              icon="logout"
              label="Leave walk"
              destructive
              onPress={() => setLeaving(true)}
              last
            />
          </RowGroup>
          {stops.data.length > 0 ? (
            <Txt variant="caption" color={colors.muted} center>
              All {stops.data.length} questions are on your phone, so the walk works offline.
            </Txt>
          ) : null}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          {open ? (
            <Button label="Start walk" icon="play" large onPress={() => void onStart()} />
          ) : (
            <Banner
              kind="info"
              icon="clock"
              text="Start walk appears here as soon as the walk opens."
            />
          )}
        </View>
      </View>

      <EditTeam
        visible={editing}
        name={me.name}
        players={me.players}
        solo={me.mode === 'solo'}
        maxPlayers={w.maxPlayers}
        taken={(n) => others.some((t) => t.name.trim().toLowerCase() === n.trim().toLowerCase())}
        onDismiss={() => setEditing(false)}
        onSave={(name, players) => {
          if (uid) updateTeam(w.id, uid, { name: name.trim(), players });
          setEditing(false);
        }}
      />
      <Dialog
        visible={leaving}
        title="Leave this walk?"
        text="Your team is removed from the walk. You can join again with the same code."
        onDismiss={() => setLeaving(false)}
        actions={[
          {
            label: 'Leave walk',
            kind: 'destructive',
            onPress: () => {
              if (uid) leaveWalk(w.id, uid, false);
              setLeaving(false);
              router.replace('/');
            },
          },
          { label: 'Stay', kind: 'ghost', onPress: () => setLeaving(false) },
        ]}
      />
      <Dialog
        visible={askPush !== undefined}
        title={
          askPush === 'notify'
            ? 'Get a notification when it opens?'
            : 'Hear when the results are in?'
        }
        text={
          askPush === 'notify'
            ? `We'll send one notification when ${owner} opens the walk, and one when the results are in.`
            : `The final results appear when ${owner} ends the walk. A notification tells you, even if QuizWalk is closed.`
        }
        onDismiss={() => {
          setAskPush(undefined);
          if (askPush === 'start') begin();
        }}
        actions={[
          {
            label: 'Allow notifications',
            onPress: () => void turnOnPush(askPush === 'start' ? begin : undefined),
          },
          {
            label: 'Not now',
            kind: 'ghost',
            onPress: () => {
              const wasStart = askPush === 'start';
              setAskPush(undefined);
              if (wasStart) begin();
            },
          },
        ]}
      />
    </View>
  );
}

function Rule({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.rule}>
      <Txt variant="subheading" color={colors.accent} style={styles.ruleN}>
        {n}
      </Txt>
      <Txt variant="callout" style={styles.flex}>
        {text}
      </Txt>
    </View>
  );
}

function EditTeam(props: {
  visible: boolean;
  name: string;
  players: number;
  solo: boolean;
  maxPlayers: number;
  taken: (name: string) => boolean;
  onDismiss: () => void;
  onSave: (name: string, players: number) => void;
}) {
  const [name, setName] = useState(props.name);
  const [players, setPlayers] = useState(props.players);
  const clash = props.taken(name);
  const empty = name.trim().length === 0;
  return (
    <Dialog
      visible={props.visible}
      title={props.solo ? 'Your name' : 'Your team'}
      onDismiss={props.onDismiss}
      actions={[
        { label: 'Save', onPress: () => props.onSave(name, players), disabled: clash || empty },
        { label: 'Cancel', kind: 'ghost', onPress: props.onDismiss },
      ]}
    >
      <Field
        label={props.solo ? 'Name' : 'Team name'}
        value={name}
        onChangeText={setName}
        maxLength={30}
        error={clash ? 'Another team already has this name.' : undefined}
      />
      {!props.solo ? (
        <Stepper
          label="Players on this phone"
          value={players}
          min={1}
          max={Math.max(1, props.maxPlayers)}
          onChange={setPlayers}
        />
      ) : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapBase },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  map: { height: '34%' },
  back: { position: 'absolute', left: spacing.md },
  panel: {
    flex: 1,
    marginTop: -24,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  panelContent: { padding: spacing.lg, gap: spacing.md + 2 },
  heading: { gap: spacing.xs },
  rules: { gap: spacing.sm + 2, paddingVertical: spacing.md },
  rule: { flexDirection: 'row', gap: spacing.md - 4, alignItems: 'flex-start' },
  ruleN: { width: 20 },
  safety: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.warningFill,
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    marginTop: spacing.xs,
  },
  teamsBlock: { gap: spacing.sm },
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
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
});
