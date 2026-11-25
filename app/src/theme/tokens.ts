/** Design tokens from docs/v1-spec.md §14. Light mode only in v1. */

export const colors = {
  accent: '#1F6F4A',
  accentPressed: '#14502F',
  ink: '#16211B',
  /** Pressed ink buttons and the dark walk card's inner surfaces. */
  inkRaised: '#24342A',
  inkBorder: '#3A4C41',
  /** Secondary text on dark (ink) surfaces: 7.9:1 on ink. */
  onInkMuted: '#B9C7BE',
  secondary: '#4A5A50',
  muted: '#5F6E65',
  background: '#F4F6F1',
  surface: '#FFFFFF',
  /** Light tint for selected rows and the map-less header areas. */
  tint: '#E9EFE6',
  mapBase: '#E4EAE0',
  /** Card edges and dividers. Too faint for the outline of a control. */
  border: '#C9D2C4',
  divider: '#E3E8DF',
  /** Inputs, radios and unselected answers: at least 3:1 on surface and background. */
  controlBorder: '#7A8C82',
  /** Upcoming progress segments. */
  track: '#DDE3D9',
  successFill: '#E2F0E7',
  error: '#B4471B',
  errorText: '#93391A',
  errorFill: '#FBF1EB',
  /** "Live" badges. */
  live: '#C2410C',
  warningFill: '#FFF6E0',
  warningText: '#7A4B00',
  white: '#FFFFFF',
  scrim: 'rgba(22, 33, 27, 0.45)',
} as const;

/**
 * Indexed by `teams/{uid}.colorIndex`. Each gives white initials at least 4.5:1 and none is
 * the accent, error or ink colour (those mean other things on the map). The set was picked
 * to stay apart under simulated red-green colour blindness; initials remain the real cue.
 */
export const teamColors = [
  '#1D4ED8', // blue
  '#9F1239', // rose
  '#0F766E', // teal
  '#6B21A8', // purple
  '#0369A1', // sky
  '#701A75', // plum
  '#475569', // slate
  '#0E7490', // cyan
] as const;

export function teamColor(index: number | undefined): string {
  return teamColors[(index ?? 0) % teamColors.length] ?? teamColors[0];
}

/** Minimum touch target in points. */
export const minTouchTarget = 48;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;

export const fonts = {
  heading: 'SpaceGrotesk_700Bold',
  headingMedium: 'SpaceGrotesk_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
} as const;

/**
 * Text styles. Nothing a player needs while walking (P3, P4) is below 15 pt; 13 pt is the floor
 * elsewhere (§14). Sizes scale with the system text size.
 */
export const type = {
  display: { fontFamily: fonts.heading, fontSize: 34, lineHeight: 38, letterSpacing: -0.8 },
  title: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 33, letterSpacing: -0.6 },
  heading: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 27, letterSpacing: -0.3 },
  subheading: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 23, letterSpacing: -0.2 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 23 },
  callout: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  calloutStrong: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 17, letterSpacing: 0.6 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  button: { fontFamily: fonts.bodySemiBold, fontSize: 17, lineHeight: 22 },
  number: {
    fontFamily: fonts.heading,
    fontSize: 34,
    lineHeight: 38,
    fontVariant: ['tabular-nums' as const],
  },
} as const;

export type TypeVariant = keyof typeof type;
