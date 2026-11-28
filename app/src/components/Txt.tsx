import { Text, type TextProps } from 'react-native';

import { colors, type as typeScale, type TypeVariant } from '@/theme/tokens';

/**
 * How far each style may grow with the system text size. Body text grows all the way (about
 * 3× at the largest accessibility size), as iOS's own body style does; the big styles grow
 * less, as iOS's Large Title and Title styles do, so a title never takes a whole screen and a
 * button label still fits its button (spec §14 "Layouts scroll").
 */
const MAX_SCALE: Partial<Record<TypeVariant, number>> = {
  display: 1.8,
  number: 1.8,
  title: 2,
  heading: 2.4,
  subheading: 2.8,
  button: 2,
};

interface Props extends TextProps {
  variant?: TypeVariant;
  color?: string;
  center?: boolean;
  /** Upper-case section labels ("LIVE NOW"). */
  caps?: boolean;
}

/** Text in one of the design's styles. Scales with the system text size. */
export function Txt({
  variant = 'body',
  color = colors.ink,
  center,
  caps,
  style,
  children,
  maxFontSizeMultiplier,
  ...rest
}: Props) {
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_SCALE[variant]}
      style={[
        typeScale[variant],
        { color },
        center ? { textAlign: 'center' } : null,
        caps ? { textTransform: 'uppercase' } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}
