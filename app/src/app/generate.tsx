/**
 * C2 Generate for me: the map screen (spec §3 C2, m4-generation-design §2–§3 and §11). The map
 * fills the screen above a sheet. The Start pin is fixed at the bottom centre of the usable map
 * area and the map moves under it; zooming sets the walk's size and turning sets its direction.
 * Refresh routes a loop through the four points of the shrunk view; nothing is drawn before the
 * first Refresh, and moving the map changes nothing until the next one. Next writes the draft
 * (or, for C4's New route, the walk) and goes to C3.
 *
 * With `walkId` this is C4's New route: it opens on the walk's area with its quiz choices.
 */
import {
  CATEGORIES,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  QUESTION_COUNT_MAX,
  QUESTION_COUNT_MIN,
  decodePolyline,
  defaultQuestionCount,
  minLoopLengthM,
  normaliseCategories,
  refreshCheck,
  spaceStops,
  straightLineLoopM,
  tooShortMessage,
  viewScreenPoints,
  walkSummaryLine,
  type CategoryId,
  type Difficulty,
  type LatLng,
  type RefreshCheck,
  type RouteForViewResponse,
  type ScreenPoint,
  type ViewDiamond,
} from '@qualk/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { Button, IconButton } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { MapAttribution, QMap, type QMapRef } from '@/components/MapPieces';
import { Txt } from '@/components/Txt';
import { Segmented, Stepper } from '@/components/ui';
import { errorDetails, routeForView } from '@/data/callables';
import { errorMessage } from '@/data/errors';
import { createGeneratedDraft, setNewRoute } from '@/data/generation';
import { useStops, useWalk, type Walk } from '@/data/walks';
import { currentPlace, FALLBACK_LOCATION, labelFor } from '@/location/places';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

/** Height of the row with the close button and the hint, under the status bar. */
const HEADER_H = 64;
/** The map opens about this tall in degrees of latitude: a walk of roughly 8 questions. */
const OPEN_DELTA = 0.022;

export default function Generate() {
  const { walkId } = useLocalSearchParams<{ walkId?: string }>();
  const { uid } = useAuth();
  const walk = useWalk(walkId);
  const stops = useStops(walkId);

  if (walkId && (walk.loading || stops.loading)) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (walkId && (!walk.data || walk.data.ownerUid !== uid)) return <Redirect href="/" />;
  if (walk.data && walk.data.status !== 'draft' && walk.data.status !== 'ready') {
    return <Redirect href="/" />;
  }
  return <MapScreen walk={walk.data} stopCount={stops.data.length} />;
}

interface Result extends RouteForViewResponse {
  points: LatLng[];
  /**
   * The stops the drawn route has: the count it was made for, or the stepper's value when the
   * creator changes it afterwards (the stops are spaced again along the same loop, as
   * generateWalk spaces them). Moving the map never changes it.
   */
  count: number;
}

function MapScreen({ walk, stopCount }: { walk?: Walk; stopCount: number }) {
  const { uid, displayName } = useAuth();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  // At the largest text sizes the sheet scrolls more and its buttons stack, so the map stays.
  const bigText = fontScale > 1.6;
  const mapRef = useRef<QMapRef>(null);

  const [sheetH, setSheetH] = useState(0);
  // Where the top bar ends: the map credit goes just under it, clear of the Start pin.
  const [topBarBottom, setTopBarBottom] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [categories, setCategories] = useState<CategoryId[]>(() =>
    normaliseCategories(walk?.categories),
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(walk?.difficulty ?? 'mixed');
  // New route keeps the walk's number of stops; a new walk follows the view until changed.
  const [count, setCount] = useState(walk && stopCount > 0 ? stopCount : 8);
  const [countTouched, setCountTouched] = useState(!!walk && stopCount > 0);
  const [view, setView] = useState<{ diamond: ViewDiamond<LatLng>; corners: LatLng[] }>();
  const [heading, setHeading] = useState(0);
  const [result, setResult] = useState<Result>();
  const [refreshing, setRefreshing] = useState(false);
  const [serverMessage, setServerMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const last = useRef<{ key: string; variant: number } | undefined>(undefined);
  const placed = useRef(false);

  const frame = useMemo(
    () => ({
      width,
      height,
      insets: { top: insets.top + HEADER_H, right: 0, bottom: sheetH, left: 0 },
    }),
    [width, height, insets.top, sheetH],
  );
  const screen = useMemo(() => viewScreenPoints(frame), [frame]);

  /** The four points and the corners as coordinates, each time the map stops moving. */
  const readView = async () => {
    const map = mapRef.current;
    if (!map || sheetH === 0) return;
    try {
      const toCoord = (p: ScreenPoint) => map.coordinateForPoint({ x: p.x, y: p.y });
      const [start, left, top, right, ...corners] = await Promise.all(
        [screen.start, screen.left, screen.top, screen.right, ...screen.corners].map(toCoord),
      );
      const diamond = { start: start!, left: left!, top: top!, right: right! };
      setView({ diamond, corners });
      if (!countTouched) setCount(defaultQuestionCount(straightLineLoopM(diamond)));
      const camera = await map.getCamera();
      setHeading(camera.heading ?? 0);
    } catch {
      // The map is not laid out yet; the next region change reads it.
    }
  };

  // Place the map once the sheet's height is known: the creator's location under the Start
  // pin, or the walk's route inside the usable area.
  useEffect(() => {
    if (sheetH === 0 || !mapReady || placed.current) return;
    placed.current = true;
    void (async () => {
      const map = mapRef.current;
      if (!map) return;
      const route = walk?.route?.polyline ? decodePolyline(walk.route.polyline) : [];
      if (route.length > 1) {
        map.fitToCoordinates(route, {
          edgePadding: {
            top: frame.insets.top + 24,
            bottom: frame.insets.bottom + 24,
            left: 32,
            right: 32,
          },
          animated: false,
        });
        return;
      }
      const here = walk?.start ?? (await currentPlace()).location;
      // Centre so that `here` sits under the Start pin rather than in the middle.
      const shiftLat = ((screen.start.y - height / 2) / height) * OPEN_DELTA;
      map.animateToRegion(
        {
          latitude: here.latitude + shiftLat,
          longitude: here.longitude,
          latitudeDelta: OPEN_DELTA,
          longitudeDelta: OPEN_DELTA * (width / height),
        },
        0,
      );
    })();
  }, [sheetH, mapReady, walk, frame.insets, screen.start.y, height, width]);

  // The sheet's height sets the usable area, so the points move when it changes.
  useEffect(() => {
    void readView();
    // readView is rebuilt every render; the screen points say when it matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const check: RefreshCheck | undefined = view ? refreshCheck(view.diamond, count) : undefined;
  const nextTooShort = result && result.route.distanceM < minLoopLengthM(result.count);
  const stopsShown = useMemo(
    () => (result && !nextTooShort ? spaceStops(result.points, result.count) : []),
    [result, nextTooShort],
  );

  const refresh = async () => {
    if (!view || !check?.ok) return;
    const key = JSON.stringify([
      ...[view.diamond.start, view.diamond.left, view.diamond.top, view.diamond.right].map((p) => [
        p.latitude.toFixed(5),
        p.longitude.toFixed(5),
      ]),
      count,
    ]);
    const variant = last.current?.key === key ? last.current.variant + 1 : 0;
    setRefreshing(true);
    setServerMessage(undefined);
    try {
      const res = await routeForView({
        view: view.diamond,
        corners: view.corners,
        questionCount: count,
        variant,
      });
      last.current = { key, variant };
      setResult({ ...res, points: decodePolyline(res.route.polyline), count });
    } catch (err) {
      // tooShort keeps the previous route on screen with the server's message.
      const reason = errorDetails(err).reason;
      setServerMessage(
        errorMessage(
          err,
          reason === 'unavailable'
            ? 'The route service is busy. Try again in a moment.'
            : 'Could not make a route here. Check your connection and try again.',
        ),
      );
    } finally {
      setRefreshing(false);
    }
  };

  const next = async () => {
    if (!uid || !result || nextTooShort) return;
    setBusy(true);
    try {
      const startLabel = await labelFor(result.start);
      const input = {
        route: result.route,
        start: result.start,
        startLabel,
        categories,
        difficulty,
      };
      let id: string;
      if (walk) {
        await setNewRoute(walk.id, input);
        id = walk.id;
      } else {
        id = await createGeneratedDraft({ ...input, uid, ownerName: displayName ?? '' });
      }
      router.replace({
        pathname: '/walk/[walkId]/generating',
        params: { walkId: id, n: String(result.count), start: '1' },
      });
    } catch (err) {
      setServerMessage(errorMessage(err, 'Could not save the walk. Check your connection.'));
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- camera buttons (§14)
  const zoom = async (by: 1 | -1) => {
    const map = mapRef.current;
    if (!map) return;
    const camera = await map.getCamera();
    if (Platform.OS === 'ios' && camera.altitude !== undefined) {
      map.animateCamera({ altitude: camera.altitude * (by > 0 ? 0.5 : 2) }, { duration: 250 });
    } else {
      map.animateCamera({ zoom: (camera.zoom ?? 15) + by }, { duration: 250 });
    }
  };
  const turn = async (by: number) => {
    const map = mapRef.current;
    if (!map) return;
    const camera = await map.getCamera();
    map.animateCamera({ heading: ((camera.heading ?? 0) + by + 360) % 360 }, { duration: 250 });
  };
  const northUp = () => mapRef.current?.animateCamera({ heading: 0 }, { duration: 250 });

  const toggle = (id: CategoryId) =>
    setCategories((c) =>
      normaliseCategories(c.includes(id) ? c.filter((x) => x !== id) : [...c, id]),
    );

  const line = serverMessage
    ? { text: serverMessage, error: true }
    : check && !check.ok
      ? { text: check.message ?? '', error: true }
      : nextTooShort
        ? { text: tooShortMessage(result.count), error: true }
        : result
          ? { text: walkSummaryLine(result.count, result.route.distanceM), error: false }
          : undefined;

  // The summary line: inside the scrolling part at the largest text sizes, so the map stays.
  const summary = (
    <View style={styles.lineWrap} accessibilityLiveRegion="polite">
      {line ? (
        <Txt
          variant="callout"
          color={line.error ? colors.errorText : colors.ink}
          center
          style={line.error ? undefined : styles.summary}
        >
          {line.text}
        </Txt>
      ) : (
        <Txt variant="callout" color={colors.muted} center>
          Refresh to make a walking loop that fits the map.
        </Txt>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <QMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          ...(walk?.start ?? FALLBACK_LOCATION),
          latitudeDelta: OPEN_DELTA,
          longitudeDelta: OPEN_DELTA,
        }}
        rotateEnabled
        pitchEnabled={false}
        showsUserLocation
        onMapReady={() => setMapReady(true)}
        onRegionChangeComplete={() => void readView()}
      >
        {result ? (
          <Polyline
            coordinates={result.points}
            strokeColor={colors.accent}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}
        {stopsShown.map((s, i) => (
          <Marker
            key={`${i}-${s.alongM}`}
            coordinate={s.location}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            accessibilityLabel={`Stop ${i + 1}`}
          >
            <View style={styles.dot} />
          </Marker>
        ))}
      </QMap>

      {/* The Start pin, fixed on screen while the map moves under it. */}
      <View
        pointerEvents="none"
        style={[styles.pinWrap, { left: screen.start.x - 18, top: screen.start.y - 18 }]}
        accessible
        accessibilityLabel="Start. Move the map to choose where teams meet."
      >
        <View style={styles.pin}>
          <Txt style={styles.pinText} color={colors.white} maxFontSizeMultiplier={1}>
            S
          </Txt>
        </View>
      </View>

      <View
        style={[styles.topBar, { top: insets.top + spacing.sm }]}
        onLayout={(e) => {
          const { y, height: h } = e.nativeEvent.layout;
          setTopBarBottom(Math.round(y + h));
        }}
      >
        <IconButton
          icon={walk ? 'back' : 'close'}
          label={walk ? 'Back to the route' : 'Cancel'}
          tone="surface"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <View style={styles.hintPill}>
          <Txt variant="caption" color={colors.secondary} maxFontSizeMultiplier={1.6}>
            Move the map to choose the start. Zoom and turn it to shape the walk.
          </Txt>
        </View>
      </View>

      <View style={[styles.side, { top: insets.top + HEADER_H + spacing.sm }]}>
        <IconButton icon="plus" label="Zoom in" tone="surface" onPress={() => void zoom(1)} />
        <IconButton icon="minus" label="Zoom out" tone="surface" onPress={() => void zoom(-1)} />
        <IconButton
          icon="rotateLeft"
          label="Turn the map left"
          tone="surface"
          onPress={() => void turn(-30)}
        />
        <IconButton
          icon="rotateRight"
          label="Turn the map right"
          tone="surface"
          onPress={() => void turn(30)}
        />
        <Pressable
          onPress={northUp}
          accessibilityRole="button"
          accessibilityLabel="North up"
          style={({ pressed }) => [styles.compass, pressed && { backgroundColor: colors.tint }]}
        >
          <Icon name="compass" size={24} rotate={-heading} color={colors.error} />
        </Pressable>
      </View>

      {topBarBottom > 0 ? (
        <MapAttribution style={[styles.attribution, { top: topBarBottom + spacing.xs }]} />
      ) : null}

      <View
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
        onLayout={(e) => setSheetH(Math.round(e.nativeEvent.layout.height))}
      >
        <ScrollView
          style={{ maxHeight: height * (bigText ? 0.3 : 0.45) }}
          contentContainerStyle={styles.sheetBody}
          bounces={false}
        >
          <Txt variant="calloutStrong">Questions about</Txt>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Chip
              label="Auto"
              selected={categories.length === 0}
              onPress={() => setCategories([])}
            />
            {CATEGORIES.map((c) => (
              <Chip
                key={c.id}
                label={c.label}
                selected={categories.includes(c.id)}
                onPress={() => toggle(c.id)}
              />
            ))}
          </ScrollView>
          <Segmented
            label="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))}
          />
          <Stepper
            label="Questions"
            value={count}
            min={QUESTION_COUNT_MIN}
            max={QUESTION_COUNT_MAX}
            onChange={(v) => {
              setCount(v);
              setCountTouched(true);
              setResult((r) => (r ? { ...r, count: v } : r));
              setServerMessage(undefined);
            }}
          />
          {bigText ? summary : null}
        </ScrollView>
        {bigText ? null : summary}
        <View style={[styles.actions, bigText ? styles.actionsStacked : null]}>
          <Button
            label="Refresh"
            icon="refresh"
            kind="secondary"
            loading={refreshing}
            disabled={!check?.ok}
            hint={check && !check.ok ? check.message : undefined}
            style={styles.flex}
            onPress={() => void refresh()}
          />
          <Button
            label="Next"
            loading={busy}
            disabled={!result || !!nextTooShort || refreshing}
            hint={result ? undefined : 'Refresh first to make a route.'}
            style={styles.flex}
            onPress={() => void next()}
          />
        </View>
      </View>
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipOn : null,
        pressed && !selected ? { backgroundColor: colors.tint } : null,
      ]}
    >
      {selected ? <Icon name="check" size={16} color={colors.white} strokeWidth={2.6} /> : null}
      <Txt variant="calloutStrong" color={selected ? colors.white : colors.ink}>
        {label}
      </Txt>
    </Pressable>
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
    gap: spacing.sm,
  },
  hintPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md - 4,
    paddingVertical: spacing.sm,
  },
  side: { position: 'absolute', right: spacing.md, gap: spacing.sm },
  // Left of the zoom and turn buttons, under the top bar.
  attribution: { position: 'absolute', left: spacing.sm, maxWidth: '70%' },
  compass: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pinWrap: { position: 'absolute', width: 36, height: 36 },
  pin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.ink,
    borderWidth: 2.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinText: { fontFamily: fonts.heading, fontSize: 15, lineHeight: 18 },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    borderWidth: 2.5,
    borderColor: colors.white,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  sheetBody: { paddingHorizontal: spacing.lg, gap: spacing.sm + 2 },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  lineWrap: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  summary: { fontFamily: fonts.bodySemiBold },
  actions: { flexDirection: 'row', gap: spacing.sm + 2, paddingHorizontal: spacing.lg },
  actionsStacked: { flexDirection: 'column' },
});
