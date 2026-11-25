import { describe, expect, it } from 'vitest';
import {
  compassPoint,
  formatAgo,
  formatClock,
  formatDayDate,
  formatDistance,
  formatMinutes,
  formatWalkTime,
  openUntilLabel,
  ordinal,
  plural,
  rankLabel,
  resultHeadline,
} from './format';

describe('formatDistance', () => {
  it('rounds metres so walking numbers do not flicker', () => {
    expect(formatDistance(37)).toBe('35 m');
    expect(formatDistance(142)).toBe('140 m');
    expect(formatDistance(-3)).toBe('0 m');
  });

  it('switches to kilometres', () => {
    expect(formatDistance(994)).toBe('990 m');
    expect(formatDistance(1_000)).toBe('1.0 km');
    expect(formatDistance(2_140)).toBe('2.1 km');
    expect(formatDistance(12_600)).toBe('13 km');
  });
});

describe('formatMinutes', () => {
  it('says about N min, then hours', () => {
    expect(formatMinutes(0.2)).toBe('about 1 min');
    expect(formatMinutes(55)).toBe('about 55 min');
    expect(formatMinutes(60)).toBe('about 1 h');
    expect(formatMinutes(80)).toBe('about 1 h 20 min');
  });
});

describe('clocks and times', () => {
  it('formats a clock', () => {
    expect(formatClock(7_400)).toBe('0:07');
    expect(formatClock(65_000)).toBe('1:05');
  });

  it('formats a walk time', () => {
    expect(formatWalkTime(42 * 60_000)).toBe('42 min');
    expect(formatWalkTime(65 * 60_000)).toBe('1 h 05 min');
  });

  it('formats time since', () => {
    expect(formatAgo(20_000)).toBe('just now');
    expect(formatAgo(6 * 60_000)).toBe('6 min ago');
    expect(formatAgo(130 * 60_000)).toBe('2 h ago');
  });
});

describe('compassPoint', () => {
  it('names the eight points', () => {
    expect(compassPoint(0)).toBe('north');
    expect(compassPoint(50)).toBe('north-east');
    expect(compassPoint(181)).toBe('south');
    expect(compassPoint(-90)).toBe('west');
    expect(compassPoint(350)).toBe('north');
  });
});

describe('ranks', () => {
  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '103rd',
    ]);
  });

  it('marks shared places', () => {
    expect(rankLabel(2, true)).toBe('2=');
    expect(rankLabel(2, false)).toBe('2nd');
  });

  it('writes a headline that fits the result', () => {
    expect(resultHeadline('Fjord Kids', 1, false, 4)).toBe('Fjord Kids won');
    expect(resultHeadline('Fjord Kids', 1, true, 4)).toBe('Fjord Kids shared first place');
    expect(resultHeadline('Fjord Kids', 3, false, 4)).toBe('Fjord Kids came 3rd of 4');
    expect(resultHeadline('Fjord Kids', 2, true, 5)).toBe('Fjord Kids came joint 2nd of 5');
  });
});

describe('dates', () => {
  it('formats a day and date', () => {
    // Local time, so build the date locally.
    expect(formatDayDate(new Date(2026, 10, 29, 12).getTime())).toBe('Sun 29 Nov');
  });

  it('says when a walk closes', () => {
    const opened = new Date(2026, 10, 22, 10, 0).getTime();
    expect(openUntilLabel(opened, 'week')).toBe('Open until Sun 29 Nov');
    expect(openUntilLabel(opened, 'day')).toBe('Ends by 22:00');
    expect(openUntilLabel(opened)).toBe('Ends by 22:00');
    const evening = new Date(2026, 10, 22, 21, 30).getTime();
    expect(openUntilLabel(evening, 'day')).toBe('Ends by 09:30 tomorrow');
  });
});

describe('plural', () => {
  it('pluralises', () => {
    expect(plural(1, 'team')).toBe('1 team');
    expect(plural(3, 'team')).toBe('3 teams');
    expect(plural(2, 'person', 'people')).toBe('2 people');
  });
});
