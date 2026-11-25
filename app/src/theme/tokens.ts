/** Design tokens from docs/v1-spec.md §14. Light mode only in v1. */

export const colors = {
  accent: '#1F6F4A',
  accentPressed: '#14502F',
  ink: '#16211B',
  secondary: '#4A5A50',
  muted: '#5F6E65',
  background: '#F4F6F1',
  surface: '#FFFFFF',
  /** Card edges and dividers. Too faint for the outline of a control. */
  border: '#C9D2C4',
  /** Inputs, radios and unselected answers: at least 3:1 on surface and background. */
  controlBorder: '#7A8C82',
  successFill: '#E2F0E7',
  error: '#B4471B',
  errorText: '#93391A',
  errorFill: '#FBF1EB',
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

/** Minimum touch target in points. */
export const minTouchTarget = 48;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
