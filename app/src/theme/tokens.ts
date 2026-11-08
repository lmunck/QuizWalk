/** Design tokens from docs/v1-spec.md §14. Light mode only in v1. */

export const colors = {
  accent: '#1F6F4A',
  accentPressed: '#14502F',
  ink: '#16211B',
  secondary: '#4A5A50',
  muted: '#6B7A71',
  background: '#F4F6F1',
  surface: '#FFFFFF',
  border: '#C9D2C4',
  successFill: '#E2F0E7',
  error: '#B4471B',
  errorText: '#93391A',
  errorFill: '#FBF1EB',
} as const;

/** The first four come from the design; four more are chosen when team colours are built. */
export const teamColors = ['#1D4ED8', '#7C3AED', '#B4471B', '#16211B'] as const;

/** Minimum touch target in points. */
export const minTouchTarget = 48;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
