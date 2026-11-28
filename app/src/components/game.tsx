/** Pieces specific to the game: team badges, progress segments, the score chip. */
import { teamInitials, type StopMark } from '@qualk/shared';
import { StyleSheet, View } from 'react-native';

import { colors, fonts, teamColor } from '@/theme/tokens';

import { Icon } from './Icon';
import { Txt } from './Txt';

/** A team's colour with its initials. Colour is never the only cue (§14). */
export function TeamBadge({
  name,
  colorIndex,
  size = 36,
  dimmed,
}: {
  name: string;
  colorIndex: number;
  size?: number;
  dimmed?: boolean;
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
          opacity: dimmed ? 0.45 : 1,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Txt
        style={{
          fontFamily: fonts.heading,
          fontSize: Math.max(13, size * 0.4),
          lineHeight: Math.max(16, size * 0.5),
        }}
        color={colors.white}
        maxFontSizeMultiplier={size < 34 ? 1 : 1.2}
      >
        {teamInitials(name)}
      </Txt>
    </View>
  );
}

const MARK_STYLE: Record<StopMark, { bg: string; icon?: 'check' | 'cross' | 'minus' }> = {
  correct: { bg: colors.accent, icon: 'check' },
  wrong: { bg: colors.error, icon: 'cross' },
  skipped: { bg: '#8FA197', icon: 'minus' },
  current: { bg: colors.ink },
  upcoming: { bg: colors.track },
};

const MARK_WORD: Record<StopMark, string> = {
  correct: 'right',
  wrong: 'wrong',
  skipped: 'skipped',
  current: 'next',
  upcoming: 'to come',
};

/** One segment per stop, each with ✓ / ✕ / – as well as a colour (spec §3 P3). */
export function ProgressSegments({ marks, onDark }: { marks: StopMark[]; onDark?: boolean }) {
  const summary = marks.map((m, i) => `Stop ${i + 1} ${MARK_WORD[m]}`).join(', ');
  return (
    <View style={styles.segments} accessible accessibilityLabel={summary}>
      {marks.map((m, i) => {
        const s = MARK_STYLE[m];
        const bg =
          onDark && m === 'upcoming'
            ? colors.inkBorder
            : onDark && m === 'current'
              ? colors.white
              : s.bg;
        return (
          <View key={i} style={[styles.segment, { backgroundColor: bg }]}>
            {s.icon ? (
              <Icon name={s.icon} size={11} color={colors.white} strokeWidth={3.2} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  segments: { flexDirection: 'row', gap: 4 },
  segment: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
