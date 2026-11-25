/** Line icons on a 24 × 24 grid, drawn for QuizWalk. Decorative unless given a label. */
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme/tokens';

export type IconName =
  | 'back'
  | 'close'
  | 'plus'
  | 'minus'
  | 'check'
  | 'cross'
  | 'navigate'
  | 'pin'
  | 'more'
  | 'share'
  | 'settings'
  | 'trophy'
  | 'flag'
  | 'clock'
  | 'walk'
  | 'map'
  | 'list'
  | 'drag'
  | 'chevronRight'
  | 'chevronDown'
  | 'info'
  | 'warning'
  | 'offline'
  | 'gps'
  | 'edit'
  | 'trash'
  | 'up'
  | 'down'
  | 'copy'
  | 'crosshair'
  | 'users'
  | 'user'
  | 'eye'
  | 'play'
  | 'skip'
  | 'blocked'
  | 'search'
  | 'sparkle'
  | 'key'
  | 'bell'
  | 'logout';

const PATHS: Record<IconName, string[]> = {
  back: ['M15 5l-7 7 7 7'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  cross: ['M7 7l10 10', 'M17 7L7 17'],
  navigate: ['M12 3l6.5 17-6.5-4-6.5 4z'],
  pin: [
    'M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z',
    'M12 12.2a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2z',
  ],
  more: [],
  share: ['M12 15V3', 'M7.5 7.5L12 3l4.5 4.5', 'M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7'],
  settings: [
    'M12 15a3 3 0 100-6 3 3 0 000 6z',
    'M19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.6 7.6 0 01-2 1.2L14.8 21h-4l-.3-2.4a7.6 7.6 0 01-2-1.2l-1.9.7-2-3.4 1.6-1.2a7.4 7.4 0 010-2.9L4.6 9.3l2-3.4 1.9.7a7.6 7.6 0 012-1.2L10.8 3h4l.3 2.4a7.6 7.6 0 012 1.2l1.9-.7 2 3.4-1.6 1.2a7.4 7.4 0 010 3z',
  ],
  trophy: [
    'M8 4h8v5a4 4 0 01-8 0V4z',
    'M8 6H5v1a3 3 0 003 3',
    'M16 6h3v1a3 3 0 01-3 3',
    'M12 13v4',
    'M8.5 20h7',
    'M10 17h4v3h-4z',
  ],
  flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  clock: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 7v5l3 2'],
  walk: [
    'M13 4.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
    'M9.5 21l2-6 3 3V22',
    'M8 11l2.5-4 3.5.5 2 4 2.5 1',
    'M10.5 7L8 14l3.5 1',
  ],
  map: ['M9 4L3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5L9 4z', 'M9 4v13.5', 'M15 6.5V20'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  drag: ['M5 9h14', 'M5 15h14'],
  chevronRight: ['M9 5l7 7-7 7'],
  chevronDown: ['M5 9l7 7 7-7'],
  info: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 11v5', 'M12 7.5h.01'],
  warning: ['M12 3.5L2.5 20h19L12 3.5z', 'M12 10v4.5', 'M12 17.2h.01'],
  offline: [
    'M3 3l18 18',
    'M8.5 16.5a5 5 0 017 0',
    'M5 12.5a10 10 0 015.2-2.7',
    'M19 12.5a10 10 0 00-2.4-1.7',
    'M2 8.8a15 15 0 014.3-2.7',
    'M22 8.8a15 15 0 00-10-3.8',
    'M12 20h.01',
  ],
  gps: [
    'M12 19a7 7 0 100-14 7 7 0 000 14z',
    'M12 2v3',
    'M12 19v3',
    'M2 12h3',
    'M19 12h3',
    'M12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  ],
  edit: ['M4 20h4L19 9l-4-4L4 16v4z', 'M13.5 6.5l4 4'],
  trash: ['M4 7h16', 'M9.5 7V4h5v3', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
  up: ['M12 19V5', 'M6 11l6-6 6 6'],
  down: ['M12 5v14', 'M6 13l6 6 6-6'],
  copy: ['M8 8h11v13H8z', 'M5 16H4V3h11v1'],
  crosshair: ['M12 3v6', 'M12 15v6', 'M3 12h6', 'M15 12h6'],
  users: [
    'M9 11a4 4 0 100-8 4 4 0 000 8z',
    'M2 21v-1a6 6 0 0112 0v1',
    'M16 3.3a4 4 0 010 7.4',
    'M18 14.5a6 6 0 014 5.5v1',
  ],
  user: ['M12 12a4.5 4.5 0 100-9 4.5 4.5 0 000 9z', 'M4 21v-1a8 8 0 0116 0v1'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 15a3 3 0 100-6 3 3 0 000 6z'],
  play: ['M7 4.5v15l12-7.5-12-7.5z'],
  skip: ['M5 5l9 7-9 7V5z', 'M18 5v14'],
  blocked: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M5.6 5.6l12.8 12.8'],
  search: ['M11 18a7 7 0 100-14 7 7 0 000 14z', 'M20 20l-4-4'],
  sparkle: [
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z',
    'M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  ],
  key: [
    'M15 3a6 6 0 00-5.6 8.2L3 17.6V21h3.4l1-1v-2h2v-2h2l1.4-1.4A6 6 0 1015 3z',
    'M16.5 7.5h.01',
  ],
  bell: ['M18 16V11a6 6 0 00-12 0v5l-2 2h16l-2-2z', 'M10 21h4'],
  logout: ['M15 4h4v16h-4', 'M10 17l5-5-5-5', 'M15 12H3'],
};

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Rotation in degrees (the walk arrow). */
  rotate?: number;
  /** Set for icons that carry meaning on their own (no visible text beside them). */
  label?: string;
}

export function Icon({
  name,
  size = 24,
  color = colors.ink,
  strokeWidth = 2,
  rotate,
  label,
}: Props) {
  const filled = name === 'navigate' || name === 'play';
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={rotate !== undefined ? { transform: [{ rotate: `${rotate}deg` }] } : undefined}
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      {name === 'more' ? (
        <>
          <Circle cx="5" cy="12" r="1.8" fill={color} />
          <Circle cx="12" cy="12" r="1.8" fill={color} />
          <Circle cx="19" cy="12" r="1.8" fill={color} />
        </>
      ) : name === 'drag' ? (
        <>
          <Rect x="5" y="8" width="14" height="2" rx="1" fill={color} />
          <Rect x="5" y="14" width="14" height="2" rx="1" fill={color} />
        </>
      ) : (
        PATHS[name].map((d, i) => (
          <Path
            key={i}
            d={d}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={filled ? color : 'none'}
          />
        ))
      )}
    </Svg>
  );
}
