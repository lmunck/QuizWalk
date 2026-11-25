/**
 * P3 Walk to stop. Distance, a compass arrow (or a text bearing when the compass is unreliable)
 * and the map. The current stop is derived from the team's answers, so a restart loses
 * nothing. Until pocket mode ships (M3) the screen stays awake and says "Keep QuizWalk open"
 * (spec §3 P3, §9).
 */
import {
  compassPoint,
  formatDistance,
  formatMinutes,
  walkingMinutes,
  walkProgress,
} from '@qualk/shared';
import { useKeepAwake } from 'expo-keep-awake';
import { useNetworkState } from 'expo-network';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { CantReach } from '@/features/CantReach';
import { ProgressSegments } from '@/components/game';
import { Icon } from '@/components/Icon';
import { LocationNotice } from '@/components/LocationNotice';
import { QMap, RadiusCircle, regionFor, StopMarker, type QMapRef } from '@/components/MapPieces';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { Banner } from '@/components/ui';
import { WalkMenu } from '@/features/WalkMenu';
import { useAnswers, useTeam } from '@/data/teams';
import { useStops, useWalk } from '@/data/walks';
import { useArrival, useHeading } from '@/location/arrival';
import { simulatePosition, useLocationAccess } from '@/location/position';
import { useWalkTracking } from '@/location/tracking';
import { devTools } from '@/lib/env';
import { buzzArrived } from '@/lib/feedback';
import { questionOpenedAt } from '@/lib/storage';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

export default function WalkToStop() {
  useKeepAwake();
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  const { uid } = useAuth();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const network = useNetworkState();
  const walk = useWalk(walkId);
  const team = useTeam(walkId, uid);
  const stops = useStops(walkId);
  const answers = useAnswers(walkId, uid);
  const [access] = useLocationAccess();
  const [menu, setMenu] = useState(false);
  const [cantReach, setCantReach] = useState(false);
  const mapRef = useRef<QMapRef>(null);

  const progress = useMemo(
    () =>
      walkProgress(
        stops.data,
        answers.data.map((a) => ({ ...a, stopId: a.id })),
      ),
    [stops.data, answers.data],
  );
  const stop = progress.current;
  const stopNumber = progress.currentIndex + 1;
  const arrival = useArrival(stop, access?.status === 'granted');
  const heading = useHeading(arrival.fix, stop?.location, !!stop);
  const w = walk.data;
  const me = team.data;

  const walking = !!w && w.status === 'open' && !!me?.startedAt && !me.leftAt && !progress.finished;
  useWalkTracking({ walkId, uid, active: walking, startDistanceM: me?.distanceWalkedM ?? 0 });

  const openQuestion = (stopId: string, imHere = false) =>
    router.push({
      pathname: '/play/[walkId]/question',
      params: imHere ? { walkId, stopId, imHere: '1' } : { walkId, stopId },
    });

  // Arrival opens the question (P4) with a buzz.
  const opened = useRef<string>(undefined);
  useEffect(() => {
    if (!stop || !arrival.unlocked || opened.current === stop.id) return;
    opened.current = stop.id;
    void buzzArrived();
    simulatePosition(undefined);
    openQuestion(stop.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival.unlocked, stop, walkId]);

  // A question whose clock already runs (backed out, or the app restarted) is reopened once,
  // and stays one tap away after that.
  const [clockStarted, setClockStarted] = useState(false);
  useEffect(() => {
    if (!stop) return;
    let cancelled = false;
    void questionOpenedAt(walkId, stop.id).then((t) => {
      if (cancelled) return;
      setClockStarted(t !== undefined);
      if (t !== undefined && opened.current !== stop.id) {
        opened.current = stop.id;
        openQuestion(stop.id);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop?.id, walkId]);

  // A stop removed for everyone while walking (M2 skip for everyone): say so and move on.
  const previous = useRef<{ id: string; number: number }>(undefined);
  useEffect(() => {
    if (!stop) return;
    const prev = previous.current;
    if (prev && prev.id !== stop.id) {
      const removed = stops.data.find((s) => s.id === prev.id)?.skippedForAll;
      if (removed) {
        toast(
          `${w?.ownerName || 'The creator'} removed stop ${prev.number}. On to stop ${stopNumber}.`,
        );
      }
    }
    previous.current = { id: stop.id, number: stopNumber };
  }, [stop, stopNumber, stops.data, toast, w?.ownerName]);

  // Keep the stop and the player in view, clear of the header card and the bottom card.
  const fit = () => {
    if (!stop) return;
    const points = arrival.fix ? [stop.location, arrival.fix] : [stop.location];
    mapRef.current?.fitToCoordinates(points, {
      edgePadding: { top: insets.top + 180, bottom: 380, left: 70, right: 70 },
      animated: true,
    });
  };
  useEffect(() => {
    fit();
    // Only when the stop changes or the first fix arrives; following every fix would fight
    // the person's own panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop?.id, !!arrival.fix]);

  if (walk.loading || team.loading || stops.loading || answers.loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!w || !me || me.leftAt) return <Redirect href={`/play/${walkId}`} />;
  if (w.status === 'ended') return <Redirect href={`/play/${walkId}/results`} />;
  if (!me.startedAt) return <Redirect href={`/play/${walkId}/lobby`} />;
  if (progress.finished || !stop) return <Redirect href={`/play/${walkId}/finish`} />;

  const offline = network.isInternetReachable === false || network.isConnected === false;
  const unsent = answers.pendingWrites ?? 0;
  const distance = arrival.distanceM;
  const arrowUsable = heading.reliable && heading.arrowDeg !== undefined;

  return (
    <View style={styles.root}>
      <QMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={regionFor(
          arrival.fix ? [stop.location, arrival.fix] : [stop.location],
          0.004,
        )}
        showsUserLocation
        showsMyLocationButton={false}
        onMapReady={fit}
      >
        <RadiusCircle center={stop.location} radiusM={stop.radiusM} />
        <StopMarker coordinate={stop.location} number={stopNumber} tone="selected" />
      </QMap>

      <View style={[styles.top, { top: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => setMenu(true)}
          accessibilityRole="button"
          accessibilityLabel={`${w.title}. Stop ${stopNumber} of ${progress.stops.length}, ${progress.localScore} points. Open the walk menu.`}
          style={({ pressed }) => [styles.headerCard, pressed && { backgroundColor: colors.tint }]}
        >
          <View style={styles.headerRow}>
            <Txt variant="calloutStrong" numberOfLines={1} style={styles.flex}>
              {w.title}
            </Txt>
            <Txt variant="callout" color={colors.secondary}>
              Stop {stopNumber} of {progress.stops.length} · {progress.localScore} pts
            </Txt>
            <Icon name="more" size={20} color={colors.secondary} />
          </View>
          <ProgressSegments marks={progress.marks} />
        </Pressable>
        {offline ? (
          <Banner
            kind="dark"
            icon="offline"
            title="Offline"
            text={
              unsent > 0
                ? `${unsent === 1 ? '1 answer is' : `${unsent} answers are`} waiting to send. Keep walking: the quiz works offline.`
                : 'Keep walking: the quiz works offline. Answers send when you are back online.'
            }
          />
        ) : null}
        {arrival.weakGps && arrival.fix ? (
          <Banner
            kind="warning"
            icon="gps"
            title="Weak GPS"
            text={`Your position is only accurate to about ${Math.round(arrival.accuracyM ?? 0)} m, so the stop may unlock late.`}
            actionLabel={arrival.canImHere ? "I'm at the stop" : undefined}
            onAction={arrival.canImHere ? () => openQuestion(stop.id, true) : undefined}
          />
        ) : null}
        <LocationNotice access={access} />
      </View>

      <View style={[styles.card, { bottom: Math.max(insets.bottom, spacing.md) + spacing.sm }]}>
        <View style={styles.cardRow}>
          <View
            style={styles.arrowWell}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {arrowUsable ? (
              <Icon name="navigate" size={34} color={colors.white} rotate={heading.arrowDeg} />
            ) : (
              <Icon name="pin" size={30} color={colors.white} />
            )}
          </View>
          <View style={styles.flex} accessible accessibilityLiveRegion="polite">
            <Txt style={styles.distance} color={colors.white}>
              {distance === undefined ? '–' : formatDistance(distance)}
            </Txt>
            <Txt variant="callout" color={colors.onInkMuted}>
              {distance === undefined
                ? `Finding your position for stop ${stopNumber}…`
                : `to stop ${stopNumber}${
                    !arrowUsable && heading.bearingToTarget !== undefined
                      ? `, to the ${compassPoint(heading.bearingToTarget)}`
                      : ''
                  } · ${formatMinutes(walkingMinutes(distance))}`}
            </Txt>
          </View>
        </View>
        <Txt variant="callout" color={colors.onInkMuted}>
          The question opens within {stop.radiusM} m. Keep QuizWalk open – the screen stays on while
          you walk.
        </Txt>
        {arrival.unlocked || clockStarted ? (
          <Button
            label="Open the question"
            kind="onDark"
            icon="eye"
            large
            onPress={() => openQuestion(stop.id)}
          />
        ) : null}
        <View style={styles.actions}>
          <Button
            label="Can't reach it"
            kind="onDarkOutline"
            style={styles.flex}
            onPress={() => setCantReach(true)}
          />
          {devTools && !arrival.unlocked ? (
            <Button
              label="Simulate arrive"
              kind="onDark"
              style={styles.flex}
              onPress={() => simulatePosition(stop.location)}
            />
          ) : null}
        </View>
      </View>

      <WalkMenu
        visible={menu}
        onDismiss={() => setMenu(false)}
        walk={w}
        myTeamId={uid!}
        score={progress.localScore}
        radiusM={stop.radiusM}
      />
      <CantReach
        visible={cantReach}
        onDismiss={() => setCantReach(false)}
        walk={w}
        uid={uid!}
        stop={stop}
        stopNumber={stopNumber}
        isLast={progress.currentIndex === progress.stops.length - 1}
        arrival={arrival}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapBase },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  top: { position: 'absolute', left: spacing.md, right: spacing.md, gap: spacing.sm },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm + 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  card: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.ink,
    borderRadius: radius.xl,
    padding: spacing.md + 4,
    gap: spacing.md,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  arrowWell: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.inkRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  distance: {
    fontFamily: fonts.heading,
    fontSize: 38,
    lineHeight: 42,
    fontVariant: ['tabular-nums'],
  },
  actions: { flexDirection: 'row', gap: spacing.sm + 2 },
});
