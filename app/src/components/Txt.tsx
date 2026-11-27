import { Text, type TextProps } from 'react-native';

import { colors, type as typeScale, type TypeVariant } from '@/theme/tokens';

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
  ...rest
}: Props) {
  return (
    <Text
      {...rest}
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
