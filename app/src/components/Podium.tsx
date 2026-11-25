/** The top three on a podium (C9, P6). Shared places read "2=". Decorative for screen readers:
 * the leaderboard below carries the same facts. */
import { StyleSheet, View } from 'react-native';

import { colors, fonts, spacing } from '@/theme/tokens';

import { Txt } from './Txt';
import { Card } from './ui';

export function Podium({
  rows,
}: {
  rows: { id: string; name: string; rank: number; tied: boolean; score: number }[];
}) {
  const order = [rows[1], rows[0], rows[2]];
  const heights = [96, 128, 76];
  return (
    <View
      style={styles.podium}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {order.map((r, i) =>
        r ? (
          <View key={r.id} style={styles.podiumCol}>
            <Txt variant="calloutStrong" numberOfLines={2} center>
              {r.name}
            </Txt>
            <Card dark={i === 1} style={[styles.podiumBlock, { height: heights[i] }]}>
              <Txt style={styles.podiumRank} color={i === 1 ? colors.white : colors.ink}>
                {r.tied ? `${r.rank}=` : r.rank}
              </Txt>
              <Txt variant="caption" color={i === 1 ? colors.onInkMuted : colors.secondary}>
                {r.score} pts
              </Txt>
            </Card>
          </View>
        ) : (
          <View key={i} style={styles.podiumCol} />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  podiumCol: { flex: 1, gap: spacing.xs, alignItems: 'stretch' },
  podiumBlock: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: spacing.md - 4,
    gap: 2,
  },
  podiumRank: { fontFamily: fonts.heading, fontSize: 28 },
});
