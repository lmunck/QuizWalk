/** A ranked list of teams. Shared places read "2=" (spec §4 Ranking). */
import { formatWalkTime, plural, rankLabel } from '@qualk/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/theme/tokens';

import { TeamBadge } from './game';
import { Txt } from './Txt';

export interface LeaderRow {
  id: string;
  name: string;
  colorIndex: number;
  rank: number;
  tied: boolean;
  score: number;
  correctCount: number;
  stopsDone: number;
  walkTimeMs?: number;
  finished: boolean;
  walking?: boolean;
  left?: boolean;
  /** "seen 6 min ago" on the monitor. */
  note?: string;
  dimmed?: boolean;
}

export function Leaderboard({
  rows,
  myId,
  stopCount,
  onPress,
  compact,
  ended,
}: {
  rows: LeaderRow[];
  myId?: string;
  stopCount: number;
  onPress?: (id: string) => void;
  compact?: boolean;
  /** The walk has ended: unfinished teams read "Didn't finish", not "Walking". */
  ended?: boolean;
}) {
  return (
    <View style={styles.list} accessibilityRole="list">
      {rows.map((r, i) => {
        const mine = r.id === myId;
        const status = r.finished
          ? `${r.correctCount}/${stopCount} right${r.walkTimeMs !== undefined ? ` · ${formatWalkTime(r.walkTimeMs)}` : ''}`
          : r.left
            ? `Left after ${plural(r.stopsDone, 'stop')}`
            : ended
              ? `Didn't finish · ${r.stopsDone}/${stopCount} stops`
              : r.walking
                ? `Walking · ${r.stopsDone}/${stopCount} stops`
                : 'Not started';
        const content = (
          <View
            style={[
              styles.row,
              i < rows.length - 1 ? styles.divider : null,
              mine ? styles.mine : null,
              compact ? styles.compact : null,
            ]}
            accessible
            accessibilityLabel={`${rankLabel(r.rank, r.tied)}, ${r.name}${mine ? ' (you)' : ''}, ${plural(r.score, 'point')}. ${status}${r.note ? `. ${r.note}` : ''}`}
          >
            <Txt style={styles.rank} color={r.rank <= 3 ? colors.accent : colors.secondary}>
              {rankLabel(r.rank, r.tied)}
            </Txt>
            <TeamBadge name={r.name} colorIndex={r.colorIndex} size={34} dimmed={r.dimmed} />
            <View style={styles.flex}>
              <Txt variant="calloutStrong" numberOfLines={1}>
                {r.name}
                {mine ? '  · you' : ''}
              </Txt>
              <Txt variant="callout" color={colors.secondary} numberOfLines={1}>
                {status}
                {r.note ? ` · ${r.note}` : ''}
              </Txt>
            </View>
            <Txt style={styles.score}>{r.score}</Txt>
          </View>
        );
        return onPress ? (
          <Pressable
            key={r.id}
            onPress={() => onPress(r.id)}
            accessibilityRole="button"
            style={({ pressed }) => (pressed ? { backgroundColor: colors.tint } : null)}
          >
            {content}
          </Pressable>
        ) : (
          <View key={r.id}>{content}</View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    minHeight: 60,
  },
  compact: { paddingVertical: spacing.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  mine: { backgroundColor: '#F1F8F3' },
  rank: { fontFamily: fonts.heading, fontSize: 17, width: 38 },
  score: {
    fontFamily: fonts.heading,
    fontSize: 22,
    fontVariant: ['tabular-nums'],
    color: colors.ink,
  },
});
