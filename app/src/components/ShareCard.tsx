/**
 * Image cards for sharing (spec §3 C6, C9, P5, P6). Each card is drawn off-screen at a fixed
 * size and captured as a PNG, so it looks the same on every phone and at every text size.
 * The words on the cards come from `@qualk/shared` (format.ts); these components only lay
 * them out.
 */
import { rankLabel, teamInitials } from '@qualk/shared';
import {
  Fragment,
  useCallback,
  useRef,
  type ComponentProps,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';

import { colors, fonts, radius, spacing, teamColor } from '@/theme/tokens';

import { Icon } from './Icon';
import { Txt } from './Txt';

type CardRef = ComponentRef<typeof View>;

/** Card size in points: 4:5, which messaging apps and social feeds show uncropped. */
export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 450;

// ------------------------------------------------------------------ capture

/**
 * A ref for an off-screen card and a function that captures it as a PNG in the cache
 * directory, returning its `file://` URI.
 */
export function useCardShot() {
  const ref = useRef<CardRef>(null);
  const capture = useCallback(async () => {
    if (!ref.current) throw new Error('The share card is not ready');
    const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
    return uri.startsWith('file://') ? uri : `file://${uri}`;
  }, []);
  return { ref, capture };
}

/**
 * Holds a card outside the visible screen so it can be captured. Hidden from screen readers
 * and touches. Put it outside a ScrollView (a screen's footer is a good place), where it is
 * always laid out.
 */
export function OffscreenCard({
  shotRef,
  children,
}: {
  shotRef: RefObject<CardRef | null>;
  children: ReactNode;
}) {
  return (
    <View
      style={styles.offscreen}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View ref={shotRef} collapsable={false}>
        {children}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ pieces

/** Text that ignores the system text size: the card is an image of a fixed size. */
function T(props: ComponentProps<typeof Txt>) {
  return <Txt color={colors.white} {...props} allowFontScaling={false} />;
}

/** A team's colour and initials. `ring` sets it apart from the accent row it sits on. */
function Badge({
  name,
  colorIndex,
  size = 28,
  ring,
}: {
  name: string;
  colorIndex: number;
  size?: number;
  ring?: boolean;
}) {
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: teamColor(colorIndex),
        },
        ring ? styles.badgeRing : null,
      ]}
    >
      <T style={{ fontFamily: fonts.heading, fontSize: size * 0.4, lineHeight: size * 0.5 }}>
        {teamInitials(name)}
      </T>
    </View>
  );
}

/** The bottom line of every card: the brand mark and a short note, such as the date. */
function Footer({ note }: { note?: string }) {
  return (
    <View style={styles.footer}>
      <View style={styles.brand}>
        <View style={styles.brandMark}>
          <Icon name="flag" size={15} color={colors.white} strokeWidth={2.2} />
        </View>
        <T style={styles.brandName}>QuizWalk</T>
      </View>
      {note ? (
        <T variant="caption" color={colors.onInkMuted} numberOfLines={1} style={styles.footerNote}>
          {note}
        </T>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ results

export interface CardRow {
  id: string;
  name: string;
  colorIndex: number;
  rank: number;
  tied: boolean;
  score: number;
}

export interface CardStat {
  value: string;
  label: string;
}

/**
 * Results as an image: C9 for the creator, P6 for a team's final result, P5 for a team's
 * standing so far in a week-long walk. `rows` are already picked (`cardRows`); the team in
 * `highlightId` stands out. `gapBeforeLast` marks that the last row was brought up from
 * further down the list.
 */
export function ResultCard({
  kicker,
  headline,
  subline,
  stats,
  rows,
  highlightId,
  gapBeforeLast,
  more,
  note,
}: {
  /** Small line above the headline: "Final results · Harbour history". */
  kicker: string;
  headline: string;
  subline?: string;
  /** Up to three tiles: points, right answers, time. */
  stats?: CardStat[];
  rows: CardRow[];
  highlightId?: string;
  gapBeforeLast?: boolean;
  /** "+ 3 more teams" when not every team fits. */
  more?: string;
  note?: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <T variant="callout" color={colors.onInkMuted} numberOfLines={2}>
          {kicker}
        </T>
        <T style={styles.headline} numberOfLines={3}>
          {headline}
        </T>
        {subline ? (
          <T variant="callout" color={colors.onInkMuted} numberOfLines={1}>
            {subline}
          </T>
        ) : null}
      </View>

      {stats && stats.length > 0 ? (
        <View style={styles.stats}>
          {stats.map((s) => (
            <View key={s.label} style={styles.stat}>
              <T style={styles.statValue} numberOfLines={1}>
                {s.value}
              </T>
              <T variant="caption" color={colors.onInkMuted}>
                {s.label}
              </T>
            </View>
          ))}
        </View>
      ) : null}

      {rows.length > 0 ? (
        <View style={styles.panel}>
          {rows.map((r, i) => {
            const mine = r.id === highlightId;
            return (
              <Fragment key={r.id}>
                {gapBeforeLast && i === rows.length - 1 ? (
                  <T color={colors.onInkMuted} style={styles.gap}>
                    ⋯
                  </T>
                ) : null}
                <View style={[styles.row, mine ? styles.rowMine : null]}>
                  <T
                    style={styles.rank}
                    color={mine || r.rank <= 3 ? colors.white : colors.onInkMuted}
                  >
                    {rankLabel(r.rank, r.tied)}
                  </T>
                  <Badge name={r.name} colorIndex={r.colorIndex} ring={mine} />
                  <T variant="calloutStrong" numberOfLines={1} style={styles.flex}>
                    {r.name}
                  </T>
                  <T style={styles.score}>{r.score}</T>
                </View>
              </Fragment>
            );
          })}
          {more ? (
            <T variant="caption" color={colors.onInkMuted} style={styles.more}>
              {more}
            </T>
          ) : null}
        </View>
      ) : null}

      <View style={styles.flex} />
      <Footer note={note} />
    </View>
  );
}

// ------------------------------------------------------------------ invite

/** The invite as an image (C6): walk title, the "When" line, the join code and its QR. */
export function InviteCard({
  title,
  code,
  link,
  when,
  how,
}: {
  title: string;
  code: string;
  link: string;
  when?: string;
  how: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <T variant="label" color={colors.onInkMuted} caps>
          Join my quiz walk
        </T>
        <T style={styles.inviteTitle} numberOfLines={3}>
          {title}
        </T>
        {when ? (
          <T variant="calloutStrong" numberOfLines={2}>
            {when}
          </T>
        ) : null}
      </View>

      <View style={styles.codePanel}>
        <QRCode
          value={link}
          size={124}
          color={colors.ink}
          backgroundColor={colors.white}
          quietZone={0}
        />
        <View style={styles.codeText}>
          <T variant="label" color={colors.secondary} caps>
            Join code
          </T>
          <T style={styles.code} color={colors.ink} numberOfLines={1}>
            {code}
          </T>
        </View>
      </View>

      <T variant="callout" color={colors.onInkMuted}>
        {how}
      </T>

      <View style={styles.flex} />
      <Footer note={link.replace('https://', '')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  offscreen: { position: 'absolute', left: -CARD_WIDTH * 4, top: 0 },
  card: {
    width: CARD_WIDTH,
    minHeight: CARD_HEIGHT,
    padding: spacing.lg,
    gap: spacing.md + 2,
    backgroundColor: colors.ink,
  },
  head: { gap: spacing.xs + 2 },
  headline: {
    fontFamily: fonts.heading,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
    color: colors.white,
  },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.inkRaised,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.sm + 2,
    gap: 2,
  },
  statValue: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 27, color: colors.white },
  panel: {
    backgroundColor: colors.inkRaised,
    borderRadius: radius.lg,
    padding: spacing.xs + 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: 42,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.sm,
  },
  rowMine: { backgroundColor: colors.accent },
  rank: { fontFamily: fonts.heading, fontSize: 16, width: 32 },
  score: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.white,
    fontVariant: ['tabular-nums'],
  },
  gap: { width: 32, marginLeft: spacing.sm + 2, lineHeight: 14, textAlign: 'center' },
  more: { paddingHorizontal: spacing.sm + 2, paddingTop: spacing.xs, paddingBottom: spacing.xs },
  badge: { alignItems: 'center', justifyContent: 'center' },
  badgeRing: { borderWidth: 2, borderColor: colors.white },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontFamily: fonts.heading, fontSize: 16, color: colors.white },
  footerNote: { flex: 1, textAlign: 'right' },
  inviteTitle: {
    fontFamily: fonts.heading,
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -0.6,
    color: colors.white,
  },
  codePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md - 2,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
  },
  codeText: { flex: 1, gap: spacing.xs },
  code: { fontFamily: fonts.heading, fontSize: 34, lineHeight: 40, letterSpacing: 3 },
});
