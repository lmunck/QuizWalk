import { describe, expect, it } from 'vitest';
import { isTeamNameTaken, pickColorIndex, suggestTeamName, teamInitials } from './teams';

describe('pickColorIndex', () => {
  it('takes the first colour for the first team', () => {
    expect(pickColorIndex([])).toBe(0);
  });

  it('takes the least-used colour, lowest index first', () => {
    expect(pickColorIndex([0, 1, 2])).toBe(3);
    expect(pickColorIndex([0, 1, 2, 3, 4, 5, 6, 7])).toBe(0);
    expect(pickColorIndex([0, 1, 2, 3, 4, 5, 6, 7, 0, 2])).toBe(1);
  });

  it('ignores out-of-range values', () => {
    expect(pickColorIndex([-1, 9, 0])).toBe(1);
  });
});

describe('teamInitials', () => {
  it('uses the first letters of the first two words', () => {
    expect(teamInitials('Fjord Kids')).toBe('FK');
    expect(teamInitials('  harbour   hawks rule ')).toBe('HH');
  });

  it('uses two letters of a single word', () => {
    expect(teamInitials('anders')).toBe('AN');
    expect(teamInitials('Å')).toBe('Å');
    expect(teamInitials('')).toBe('?');
  });
});

describe('team names', () => {
  const teams = [
    { id: 't1', name: 'Fjord Kids' },
    { id: 't2', name: 'Harbour Hawks' },
  ];

  it('flags a name another team uses, ignoring case and spaces', () => {
    expect(isTeamNameTaken(' fjord kids', teams)).toBe(true);
    expect(isTeamNameTaken('Fjord Kids', teams, 't1')).toBe(false);
    expect(isTeamNameTaken('Late Starters', teams)).toBe(false);
  });

  it('suggests a free name', () => {
    let i = 0;
    const seq = [0, 0, 0.5, 0.5];
    const name = suggestTeamName(
      () => seq[i++ % seq.length] ?? 0,
      [{ id: 'x', name: 'Brisk Badgers' }],
    );
    expect(name).not.toBe('Brisk Badgers');
    expect(name.split(' ')).toHaveLength(2);
  });
});
