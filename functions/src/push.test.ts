import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';

import { teamJustLeft } from './push';

describe('teamJustLeft', () => {
  const started = { name: 'A', startedAt: Timestamp.now() };

  it('is true only for the update that sets leftAt on a team that had started', () => {
    expect(teamJustLeft(started, { ...started, leftAt: Timestamp.now() })).toBe(true);
  });

  it('ignores every other team write', () => {
    const left = { ...started, leftAt: Timestamp.now() };
    expect(teamJustLeft(started, { ...started, distanceWalkedM: 120 })).toBe(false);
    expect(teamJustLeft(left, { ...left, distanceWalkedM: 140 })).toBe(false);
    expect(teamJustLeft({ name: 'A' }, { name: 'A', leftAt: Timestamp.now() })).toBe(false);
    expect(teamJustLeft(undefined, undefined)).toBe(false);
  });
});
