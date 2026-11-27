/** The Welcome illustration: a dotted walk between numbered stops on a soft map. */
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { colors } from '@/theme/tokens';

export function WalkIllustration({
  width = 320,
  height = 220,
}: {
  width?: number;
  height?: number;
}) {
  return (
    <Svg width={width} height={height} viewBox="0 0 320 220" accessibilityElementsHidden>
      <Rect x="0" y="0" width="320" height="220" rx="28" fill={colors.mapBase} />
      <Path d="M0 170 C70 150 120 195 190 178 S290 150 320 162 L320 220 L0 220 Z" fill="#BCD5E4" />
      <Path
        d="M228 28 C278 22 304 60 292 98 C280 128 236 124 222 98 C208 70 196 36 228 28 Z"
        fill="#CBE0C0"
      />
      <G stroke={colors.white} strokeLinecap="round" fill="none">
        <Path d="M0 116 L320 104" strokeWidth={12} />
        <Path d="M118 0 L132 220" strokeWidth={12} />
        <Path d="M40 0 L52 160" strokeWidth={6} />
        <Path d="M0 58 L320 66" strokeWidth={6} />
      </G>
      <Path
        d="M62 150 C70 120 92 108 124 108 C160 108 168 70 204 66 C236 62 252 92 262 120"
        stroke={colors.accent}
        strokeWidth={4}
        strokeDasharray="2 9"
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx="62" cy="150" r="15" fill={colors.ink} stroke={colors.white} strokeWidth={3} />
      <SvgText
        x="62"
        y="155.5"
        fontSize="14"
        fontWeight="700"
        fill={colors.white}
        textAnchor="middle"
      >
        S
      </SvgText>
      {[
        { x: 124, y: 108, n: '1' },
        { x: 204, y: 66, n: '2' },
        { x: 262, y: 120, n: '3' },
      ].map((p) => (
        <G key={p.n}>
          <Circle cx={p.x} cy={p.y} r="24" fill={colors.accent} fillOpacity={0.14} />
          <Circle
            cx={p.x}
            cy={p.y}
            r="15"
            fill={colors.accent}
            stroke={colors.white}
            strokeWidth={3}
          />
          <SvgText
            x={p.x}
            y={p.y + 5.5}
            fontSize="14"
            fontWeight="700"
            fill={colors.white}
            textAnchor="middle"
          >
            {p.n}
          </SvgText>
        </G>
      ))}
      <G>
        <Rect x="150" y="146" width="118" height="44" rx="14" fill={colors.white} />
        <SvgText x="164" y="164" fontSize="11" fill={colors.secondary}>
          Stop 2 · +14 pts
        </SvgText>
        <SvgText x="164" y="180" fontSize="12" fontWeight="700" fill={colors.ink}>
          ✓ Right answer
        </SvgText>
      </G>
    </Svg>
  );
}
