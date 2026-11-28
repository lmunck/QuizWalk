/**
 * P3's arrow to the stop. It listens to the shared compass itself, so turning the phone only
 * re-renders the arrow, and skips changes under a degree.
 */
import { headingDelta } from '@qualk/shared';
import { useEffect, useState } from 'react';

import { Icon } from '@/components/Icon';
import { subscribeCompass } from '@/location/compass';

export function CompassArrow({
  bearingDeg,
  size,
  color,
}: {
  /** Bearing from here to the stop, 0 = north. */
  bearingDeg: number;
  size: number;
  color: string;
}) {
  const [headingDeg, setHeadingDeg] = useState<number>();

  useEffect(
    () =>
      subscribeCompass((s) =>
        setHeadingDeg((prev) =>
          prev !== undefined && headingDelta(prev, s.headingDeg) < 1 ? prev : s.headingDeg,
        ),
      ),
    [],
  );

  if (headingDeg === undefined) return <Icon name="pin" size={size - 4} color={color} />;
  return (
    <Icon name="navigate" size={size} color={color} rotate={(bearingDeg - headingDeg + 360) % 360} />
  );
}
