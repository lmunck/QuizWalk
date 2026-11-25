/**
 * C4 Route builder. Start pin and stops on a map, a sheet with three heights listing the stops.
 * Tap a row to edit it (C5); Move up / Move down reorder; tapping a pin selects its row. Rows
 * mark blocking problems in the error style and warnings quietly. Publish & share is always
 * tappable and lists what blocks it (spec §3 C4). Distances are straight lines until routing
 * arrives in M4, and say so.
 */
import {
  bestInsertIndex,
  estimateWalkMinutes,
  formatDistance,
  formatMinutes,
  insertPositionLabel,
  plural,
  stopProblems,
  walkProblems,
  type LatLng,
} from '@qualk/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { Button, IconButton } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import {
  QMap,
  regionFor,
  RouteLine,
  StartMarker,
  StopMarker,
  type QMapRef,
} from '@/components/MapPieces';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { Banner } from '@/components/ui';
import { problemsFrom, publishWalk } from '@/data/callables';
import { errorMessage } from '@/data/errors';
import {
  addStop,
  moveStart,
  reorderStops,
  updateStop,
  updateWalk,
  useStops,
  useWalk,
  type Stop,
} from '@/data/walks';
import { PlaceSearch } from '@/features/PlaceSearch';
import { currentPlace, labelFor } from '@/location/places';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

export default function RouteBuilder() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  const { uid } = useAuth();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const walk = useWalk(walkId);
  const stops = useStops(walkId);
  const mapRef = useRef<QMapRef>(null);
  const [selected, setSelected] = useState<string>();
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [blocked, setBlocked] = useState<{ message: string; stopId?: string }[]>();
  const [publishing, setPublishing] = useState(false);
  const [title, setTitle] = useState<string>();

  const problems = useMemo(
    () => (walk.data ? walkProblems(walk.data, stops.data) : { blocking: [], warnings: [] }),
    [walk.data, stops.data],
  );

  if (walk.loading || stops.loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  const w = walk.data;
  if (!w || w.ownerUid !== uid) return <Redirect href="/" />;
  if (w.status === 'open') return <Redirect href={`/walk/${walkId}/monitor`} />;
  if (w.status === 'ended') return <Redirect href={`/walk/${walkId}/results`} />;

  const list = stops.data;
  const points: LatLng[] = [w.start, ...list.map((s) => s.location)];
  const minutes = estimateWalkMinutes(w.distanceM, list.length);

  const add = async (location: LatLng, label?: string) => {
    if (list.length >= 12) {
      toast('A walk can have at most 12 stops.', 'error');
      return;
    }
    const at = bestInsertIndex(
      w.start,
      list.map((s) => s.location),
      location,
    );
    const placeName = label ?? (await labelFor(location));
    const id = addStop(w, list, { location, placeName, insertAt: at });
    toast(`Stop added ${insertPositionLabel(at, list.length)}`);
    router.push({
      pathname: '/walk/[walkId]/stop/[stopId]',
      params: { walkId, stopId: id, isNew: '1' },
    });
  };

  const addHere = async () => {
    setAdding(true);
    const here = await currentPlace();
    setAdding(false);
    if (!here.located) {
      toast('Your location is not available. Long-press the map instead.', 'error');
      return;
    }
    await add(here.location, here.label);
  };

  const move = (index: number, by: -1 | 1) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + by, 0, item);
    reorderStops(w, next);
  };

  const publish = async () => {
    if (problems.blocking.length > 0) {
      setBlocked(problems.blocking);
      return;
    }
    setPublishing(true);
    try {
      await publishWalk(w.id);
      router.replace(`/walk/${w.id}/share`);
    } catch (err) {
      const server = problemsFrom(err);
      if (server.length > 0) setBlocked(server);
      else
        toast(
          errorMessage(err, 'Could not publish. Check your connection and try again.'),
          'error',
        );
    } finally {
      setPublishing(false);
    }
  };

  const select = (s: Stop) => {
    setSelected(s.id);
  };

  return (
    <View style={styles.root}>
      <QMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={regionFor(points, 0.008)}
        showsUserLocation
        onLongPress={(e) => void add(e.nativeEvent.coordinate)}
        onMapReady={() => {
          // One pin alone would zoom to the maximum; show the neighbourhood instead.
          if (points.length < 2) {
            const r = regionFor(points, 0.008);
            // Shift the centre south so the pin sits in the part of the map above the sheet.
            if (r)
              mapRef.current?.animateToRegion(
                { ...r, latitude: r.latitude - r.latitudeDelta * 0.22 },
                0,
              );
            return;
          }
          mapRef.current?.fitToCoordinates(points, {
            edgePadding: { top: insets.top + 90, bottom: 500, left: 60, right: 60 },
            animated: false,
          });
        }}
      >
        <RouteLine points={points} />
        <StartMarker
          coordinate={w.start}
          draggable
          onDragEnd={(c) => {
            moveStart(w, list, c);
            void labelFor(c).then((label) => label && updateWalk(w.id, { startLabel: label }));
          }}
        />
        {list.map((s, i) => {
          const p = stopProblems(s, i + 1);
          return (
            <StopMarker
              key={s.id}
              coordinate={s.location}
              number={i + 1}
              tone={selected === s.id ? 'selected' : p.blocking.length > 0 ? 'problem' : 'normal'}
              draggable
              onPress={() => select(s)}
              onDragEnd={(c) => updateStop(w, list, s.id, { location: c })}
              label={`Stop ${i + 1}, ${s.placeName}`}
            />
          );
        })}
      </QMap>

      <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <IconButton icon="back" label="Home" tone="surface" onPress={() => router.replace('/')} />
        <View style={styles.hintPill}>
          <Txt variant="caption" color={colors.secondary}>
            Long-press the map to add a stop · drag pins to move them
          </Txt>
        </View>
      </View>

      <Sheet
        peek={210}
        initial={1}
        header={
          <View style={styles.sheetHeader}>
            <TextInput
              value={title ?? w.title}
              onChangeText={setTitle}
              onEndEditing={() => {
                const t = (title ?? '').trim();
                if (t && t !== w.title) updateWalk(w.id, { title: t });
                setTitle(undefined);
              }}
              style={styles.titleInput}
              maxLength={80}
              accessibilityLabel="Walk title"
              returnKeyType="done"
            />
            <Txt variant="caption" color={colors.secondary}>
              {list.length === 0
                ? 'No stops yet'
                : `${plural(list.length, 'stop')} · ${formatDistance(w.distanceM)} as the crow flies · ${formatMinutes(minutes)}`}
            </Txt>
            <View style={styles.addRow}>
              <Button
                label="Add stop here"
                icon="gps"
                kind="secondary"
                loading={adding}
                style={styles.flex}
                onPress={() => void addHere()}
              />
              <Button
                label="Search"
                icon="search"
                kind="secondary"
                style={styles.flex}
                onPress={() => setSearching(true)}
              />
            </View>
          </View>
        }
        footer={
          <View style={styles.footerRow}>
            <Button
              label="Preview"
              icon="eye"
              kind="secondary"
              disabled={list.length === 0}
              style={styles.flex}
              onPress={() => router.push(`/walk/${w.id}/preview`)}
            />
            <Button
              label={w.status === 'ready' ? 'Save & share' : 'Publish & share'}
              icon="share"
              loading={publishing}
              style={styles.flexWide}
              onPress={() => void publish()}
            />
          </View>
        }
      >
        <ScrollView contentContainerStyle={styles.list}>
          {list.length === 0 ? (
            <Banner
              kind="info"
              icon="plus"
              text="No stops yet. Long-press the map where the first question should be, or search for a place."
            />
          ) : null}
          {list.map((s, i) => (
            <StopRow
              key={s.id}
              stop={s}
              number={i + 1}
              count={list.length}
              selected={selected === s.id}
              onPress={() =>
                router.push({
                  pathname: '/walk/[walkId]/stop/[stopId]',
                  params: { walkId, stopId: s.id },
                })
              }
              onUp={() => move(i, -1)}
              onDown={() => move(i, 1)}
            />
          ))}
          {problems.blocking.length > 0 && list.length > 0 ? (
            <Txt variant="caption" color={colors.muted} center>
              {plural(problems.blocking.length, 'thing')} to fix before publishing.
            </Txt>
          ) : null}
        </ScrollView>
      </Sheet>

      <PlaceSearch
        visible={searching}
        onDismiss={() => setSearching(false)}
        onPick={(p) => {
          setSearching(false);
          void add(p.location, p.label);
        }}
      />
      <Dialog
        visible={blocked !== undefined}
        title="Almost there"
        text="Fix these before players can join:"
        onDismiss={() => setBlocked(undefined)}
        actions={[
          ...(blocked?.[0]?.stopId
            ? [
                {
                  label: 'Fix the first one',
                  onPress: () => {
                    const stopId = blocked[0]!.stopId!;
                    setBlocked(undefined);
                    router.push({
                      pathname: '/walk/[walkId]/stop/[stopId]',
                      params: { walkId, stopId },
                    });
                  },
                },
              ]
            : []),
          { label: 'OK', kind: 'ghost' as const, onPress: () => setBlocked(undefined) },
        ]}
      >
        {blocked?.map((p, i) => (
          <View key={i} style={styles.problem}>
            <Icon name="warning" size={18} color={colors.errorText} />
            <Txt variant="callout" color={colors.errorText} style={styles.flex}>
              {p.message}
            </Txt>
          </View>
        ))}
      </Dialog>
    </View>
  );
}

function StopRow({
  stop,
  number,
  count,
  selected,
  onPress,
  onUp,
  onDown,
}: {
  stop: Stop;
  number: number;
  count: number;
  selected: boolean;
  onPress: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const p = stopProblems(stop, number);
  const problem = p.blocking[0];
  const warning = p.warnings[0];
  return (
    <View style={[styles.row, selected ? styles.rowSelected : null]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Stop ${number}, ${stop.placeName || 'no name'}. ${problem ? problem.message : stop.question}. Edit.`}
        style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.num, problem ? { backgroundColor: colors.error } : null]}>
          <Txt style={styles.numText} color={colors.white}>
            {number}
          </Txt>
        </View>
        <View style={styles.flex}>
          <Txt variant="calloutStrong" numberOfLines={1}>
            {stop.placeName || `Stop ${number}`}
          </Txt>
          {problem ? (
            <Txt variant="caption" color={colors.errorText} numberOfLines={1}>
              {problem.message.replace(`Stop ${number} `, '').replace(/^./, (c) => c.toUpperCase())}
            </Txt>
          ) : warning ? (
            <Txt variant="caption" color={colors.warningText} numberOfLines={1}>
              {warning.message}
            </Txt>
          ) : (
            <Txt variant="caption" color={colors.secondary} numberOfLines={1}>
              {stop.question}
            </Txt>
          )}
        </View>
      </Pressable>
      <View style={styles.moves}>
        {number > 1 ? (
          <IconButton icon="up" label={`Move stop ${number} up`} onPress={onUp} />
        ) : (
          <View style={styles.moveSpacer} />
        )}
        {number < count ? (
          <IconButton icon="down" label={`Move stop ${number} down`} onPress={onDown} />
        ) : (
          <View style={styles.moveSpacer} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapBase },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  flexWide: { flex: 1.6 },
  topBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hintPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md - 4,
    paddingVertical: spacing.sm,
  },
  sheetHeader: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs + 2 },
  titleInput: {
    fontFamily: fonts.heading,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
    paddingVertical: 4,
    minHeight: 44,
  },
  addRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  footerRow: { flexDirection: 'row', gap: spacing.sm + 2 },
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.md - 4,
    minHeight: 64,
  },
  rowSelected: { borderColor: colors.ink, borderWidth: 2 },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    paddingVertical: spacing.sm,
  },
  num: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: { fontFamily: fonts.heading, fontSize: 15 },
  moves: { flexDirection: 'row' },
  moveSpacer: { width: 48 },
  problem: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
});
