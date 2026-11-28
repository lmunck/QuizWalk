/* eslint-disable react-hooks/refs -- the drag handler reads and writes the live height in
   refs from gesture callbacks, never to render; React state would re-render on every frame. */
/**
 * A bottom sheet over a map with three heights: peek, half and full (spec §3 C4, C7). Drag the
 * handle, or tap it, to change height; screen readers get an Expand / Collapse button, so
 * nothing depends on a drag alone (§14).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/theme/tokens';

export type SheetLevel = 0 | 1 | 2;

export function Sheet({
  header,
  children,
  footer,
  above,
  peek = 150,
  initial = 1,
  onLevelChange,
}: {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Drawn just above the sheet's top edge and moves with it, such as the map's attribution. */
  above?: ReactNode;
  /** Height in points when collapsed, above the footer. */
  peek?: number;
  initial?: SheetLevel;
  onLevelChange?: (level: SheetLevel) => void;
}) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [footerH, setFooterH] = useState(0);
  const heights = useMemo(() => {
    const full = screenH - insets.top - 64;
    return [peek + footerH, Math.max(peek + footerH + 80, screenH * 0.52), full] as const;
  }, [screenH, insets.top, peek, footerH]);

  const [level, setLevel] = useState<SheetLevel>(initial);
  const [height] = useState(() => new Animated.Value(heights[initial]));
  const startH = useRef(heights[level]);
  const currentH = useRef(heights[level]);

  useEffect(() => {
    const id = height.addListener(({ value }) => {
      currentH.current = value;
    });
    return () => height.removeListener(id);
  }, [height]);

  const snapTo = (next: SheetLevel) => {
    setLevel(next);
    onLevelChange?.(next);
    Animated.spring(height, {
      toValue: heights[next],
      useNativeDriver: false,
      damping: 22,
      stiffness: 220,
      mass: 0.8,
    }).start();
  };

  // Keep the height right when the window, insets or footer change.
  useEffect(() => {
    height.setValue(heights[level]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heights]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          startH.current = currentH.current;
        },
        onPanResponderMove: (_, g) => {
          const next = Math.min(heights[2], Math.max(heights[0], startH.current - g.dy));
          height.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const projected = currentH.current - g.vy * 120;
          let best: SheetLevel = 0;
          heights.forEach((h, i) => {
            if (Math.abs(h - projected) < Math.abs(heights[best] - projected))
              best = i as SheetLevel;
          });
          snapTo(best);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heights],
  );

  const cycle = () => snapTo(level === 2 ? 0 : ((level + 1) as SheetLevel));

  return (
    <Animated.View style={[styles.sheet, { height }]}>
      {/* At full height the map is all but covered, and the slot would meet the top bar. */}
      {above && level < 2 ? (
        <View pointerEvents="box-none" style={styles.above}>
          {above}
        </View>
      ) : null}
      <View style={styles.inner}>
        <View {...pan.panHandlers}>
          <Pressable
            onPress={cycle}
            accessibilityRole="button"
            accessibilityLabel={level === 2 ? 'Collapse the list' : 'Expand the list'}
            style={styles.handleArea}
            hitSlop={8}
          >
            <View style={styles.handle} />
          </Pressable>
          {header}
        </View>
        <View style={styles.body}>{children}</View>
        {footer ? (
          <View
            style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
            onLayout={(e: LayoutChangeEvent) => setFooterH(e.nativeEvent.layout.height)}
          >
            {footer}
          </View>
        ) : (
          <View style={{ height: insets.bottom }} />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
  // The rounded corners clip here, so the shadow and the `above` slot stay outside.
  inner: {
    flex: 1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  above: { position: 'absolute', left: 0, right: 0, bottom: '100%', paddingBottom: spacing.xs },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 6, minHeight: 28 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.controlBorder },
  body: { flex: 1 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 4,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    backgroundColor: colors.background,
  },
});
