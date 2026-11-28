/**
 * Map, markers and lines (spec §10). Apple Maps on iOS, Google Maps on Android. Without an
 * Android Maps key the map is replaced by a calm placeholder, so everything else still works.
 */
import { teamInitials, type LatLng } from '@qualk/shared';
import { forwardRef, useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, {
  Circle,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type MapViewProps,
  type Region,
} from 'react-native-maps';

import { mapsAvailable } from '@/lib/env';
import { colors, fonts, teamColor } from '@/theme/tokens';

import { Icon } from './Icon';
import { Txt } from './Txt';

export type { Region };
export type QMapRef = MapView;

export const QMap = forwardRef<
  MapView,
  MapViewProps & { style?: StyleProp<ViewStyle>; children?: ReactNode }
>(function QMap({ style, children, ...props }, ref) {
  if (!mapsAvailable) {
    return (
      <View
        style={[style, styles.placeholder]}
        accessibilityLabel="Map not available in this build"
      >
        <Icon name="map" size={36} color={colors.controlBorder} />
        <Txt variant="caption" color={colors.muted} center>
          Map needs a Google Maps key on Android.{'\n'}Everything else works without it.
        </Txt>
      </View>
    );
  }
  return (
    <MapView
      ref={ref}
      style={style}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      showsPointsOfInterests={false}
      showsCompass={false}
      toolbarEnabled={false}
      pitchEnabled={false}
      rotateEnabled={false}
      {...props}
    >
      {children}
    </MapView>
  );
});

/** A region that fits all points, with some air around them. */
export function regionFor(points: LatLng[], minDelta = 0.006): Region | undefined {
  if (points.length === 0) return undefined;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(minDelta, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(minDelta, (maxLng - minLng) * 1.6),
  };
}

/**
 * Custom marker views must re-render when their content changes; tracking is switched off
 * again shortly after, which keeps Android smooth.
 */
function useTracks(deps: unknown[]): boolean {
  const key = JSON.stringify(deps);
  const [settled, setSettled] = useState<string>();
  useEffect(() => {
    const t = setTimeout(() => setSettled(key), 500);
    return () => clearTimeout(t);
  }, [key]);
  return settled !== key;
}

/** The meeting point: an ink circle with "S" (spec §14: ink is the start pin). */
export function StartMarker({
  coordinate,
  draggable,
  onDragEnd,
  onPress,
}: {
  coordinate: LatLng;
  draggable?: boolean;
  onDragEnd?: (c: LatLng) => void;
  onPress?: () => void;
}) {
  const tracks = useTracks([]);
  return (
    <Marker
      coordinate={coordinate}
      draggable={draggable}
      onDragEnd={(e) => onDragEnd?.(e.nativeEvent.coordinate)}
      onPress={onPress}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      accessibilityLabel="Start"
      zIndex={5}
    >
      <View style={[styles.pin, { backgroundColor: colors.ink }]}>
        <Txt style={styles.pinText} color={colors.white} maxFontSizeMultiplier={1}>
          S
        </Txt>
      </View>
    </Marker>
  );
}

export type StopTone = 'normal' | 'selected' | 'problem' | 'done' | 'muted';

export function StopMarker({
  coordinate,
  number,
  tone = 'normal',
  draggable,
  onDragEnd,
  onPress,
  label,
}: {
  coordinate: LatLng;
  number: number;
  tone?: StopTone;
  draggable?: boolean;
  onDragEnd?: (c: LatLng) => void;
  onPress?: () => void;
  label?: string;
}) {
  const tracks = useTracks([tone, number]);
  const bg =
    tone === 'problem'
      ? colors.error
      : tone === 'done'
        ? '#8FA197'
        : tone === 'muted'
          ? colors.controlBorder
          : colors.accent;
  const selected = tone === 'selected';
  return (
    <Marker
      coordinate={coordinate}
      draggable={draggable}
      onDragEnd={(e) => onDragEnd?.(e.nativeEvent.coordinate)}
      onPress={onPress}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      accessibilityLabel={label ?? `Stop ${number}`}
      zIndex={selected ? 10 : 4}
    >
      <View
        style={[
          styles.pin,
          { backgroundColor: selected ? colors.ink : bg },
          selected ? styles.pinSelected : null,
        ]}
      >
        <Txt style={styles.pinText} color={colors.white} maxFontSizeMultiplier={1}>
          {number}
        </Txt>
      </View>
    </Marker>
  );
}

export function TeamMapMarker({
  coordinate,
  name,
  colorIndex,
  dimmed,
  onPress,
  label,
}: {
  coordinate: LatLng;
  name: string;
  colorIndex: number;
  dimmed?: boolean;
  onPress?: () => void;
  label: string;
}) {
  const tracks = useTracks([dimmed, name]);
  return (
    <Marker
      coordinate={coordinate}
      onPress={onPress}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      accessibilityLabel={label}
      zIndex={8}
      opacity={dimmed ? 0.5 : 1}
    >
      <View style={[styles.team, { backgroundColor: teamColor(colorIndex) }]}>
        <Txt style={styles.teamText} color={colors.white} maxFontSizeMultiplier={1}>
          {teamInitials(name)}
        </Txt>
      </View>
    </Marker>
  );
}

/** Straight legs between pins, dashed: there is no routed path before M4 (m1-design §1). */
export function RouteLine({ points, color = colors.accent }: { points: LatLng[]; color?: string }) {
  if (points.length < 2) return null;
  return (
    <Polyline
      coordinates={points}
      strokeColor={color}
      strokeWidth={3}
      lineDashPattern={[8, 8]}
      lineCap="round"
    />
  );
}

/** The credit for routes and place names from OpenStreetMap via openrouteservice (spec §10). */
export const MAP_ATTRIBUTION = '© OpenStreetMap contributors · openrouteservice';
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

/**
 * The OSM credit over a map, small and quiet (ODbL). Place it with `style`; it takes no touches,
 * so the map under it still pans. Settings carries the same line with a link.
 */
export function MapAttribution({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[styles.attribution, style]}>
      <Txt variant="caption" color={colors.secondary} maxFontSizeMultiplier={1.4}>
        {MAP_ATTRIBUTION}
      </Txt>
    </View>
  );
}

export function RadiusCircle({ center, radiusM }: { center: LatLng; radiusM: number }) {
  return (
    <Circle
      center={center}
      radius={radiusM}
      strokeColor={colors.accent}
      strokeWidth={1.5}
      fillColor="rgba(31, 111, 74, 0.12)"
    />
  );
}

const styles = StyleSheet.create({
  attribution: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  placeholder: {
    backgroundColor: colors.mapBase,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.white,
  },
  pinSelected: { width: 42, height: 42, borderRadius: 21, borderWidth: 3 },
  pinText: { fontFamily: fonts.heading, fontSize: 15, lineHeight: 18 },
  team: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.white,
  },
  teamText: { fontFamily: fonts.heading, fontSize: 12, lineHeight: 15 },
});
