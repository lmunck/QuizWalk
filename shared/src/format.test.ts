import { describe, expect, it } from 'vitest';
import {
  cardStats,
  compassPoint,
  formatAgo,
  formatClock,
  formatDayDate,
  formatDistance,
  formatMinutes,
  formatWalkTime,
  inviteLines,
  leadersHeadline,
  moreTeamsLabel,
  openUntilLabel,
  ordinal,
  placeWords,
  plural,
  rankLabel,
  resultHeadline,
  resultsLabel,
  soFarHeadline,
  standingsSoFarText,
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

  it('writes a place in a sentence', () => {
    expect(placeWords(3, false)).toBe('3rd');
    expect(placeWords(2, true)).toBe('joint 2nd');
  });
});

describe('share cards', () => {
  it('heads a card before the final results', () => {
    expect(soFarHeadline(1, false, 5)).toBe('In the lead so far');
    expect(soFarHeadline(1, true, 5)).toBe('Sharing the lead so far');
    expect(soFarHeadline(3, false, 5)).toBe('3rd of 5 so far');
    expect(soFarHeadline(2, true, 5)).toBe('Joint 2nd of 5 so far');
  });

  it('says where a finished team stands in a week-long walk', () => {
    expect(standingsSoFarText(2, false, 5, 'Sun 29 Nov')).toBe(
      '2nd of 5 teams so far. Final results on Sun 29 Nov.',
    );
    expect(standingsSoFarText(2, true, 5, 'Sun 29 Nov')).toBe(
      'Joint 2nd of 5 teams so far. Final results on Sun 29 Nov.',
    );
    expect(standingsSoFarText(1, false, 1)).toBe(
      '1st of 1 team so far. Final results on the last day.',
    );
  });

  it('names the winners on the creator card', () => {
    expect(leadersHeadline(['Fjord Kids'], true)).toBe('Fjord Kids won');
    expect(leadersHeadline(['Fjord Kids', 'Harbour Hawks'], true)).toBe(
      'Fjord Kids and Harbour Hawks shared first place',
    );
    expect(leadersHeadline(['A', 'B', 'C'], true)).toBe('3 teams shared first place');
    expect(leadersHeadline([], true)).toBe('No team started this walk');
  });

  it('reads as a lead before the walk ends', () => {
    expect(leadersHeadline(['Fjord Kids'], false)).toBe('Fjord Kids in the lead');
    expect(leadersHeadline(['Fjord Kids', 'Harbour Hawks'], false)).toBe(
      'Fjord Kids and Harbour Hawks share the lead',
    );
    expect(leadersHeadline(['A', 'B', 'C'], false)).toBe('3 teams share the lead');
  });

  it('labels the card and counts the teams left out', () => {
    expect(resultsLabel(true)).toBe('Final results');
    expect(resultsLabel(false)).toBe('Standings so far');
    expect(moreTeamsLabel(8, 5)).toBe('+ 3 more teams');
    expect(moreTeamsLabel(6, 5)).toBe('+ 1 more team');
    expect(moreTeamsLabel(5, 5)).toBeUndefined();
  });

  it('fills the tiles on a team card', () => {
    expect(
      cardStats({ score: 96, correctCount: 7, stopCount: 8, walkTimeMs: 47 * 60_000 }),
    ).toEqual([
      { value: '96', label: 'points' },
      { value: '7/8', label: 'right' },
      { value: '47 min', label: 'time' },
    ]);
    expect(cardStats({ score: 1, correctCount: 0, stopCount: 5, distanceWalkedM: 3_400 })).toEqual([
      { value: '1', label: 'point' },
      { value: '0/5', label: 'right' },
      { value: '3.4 km', label: 'walked' },
    ]);
  });

  it('writes the invite card lines', () => {
    expect(inviteLines('  Sat 14:00, meet at the anchor ').when).toBe(
      'When: Sat 14:00, meet at the anchor',
    );
    expect(inviteLines('   ').when).toBeUndefined();
    expect(inviteLines().when).toBeUndefined();
    expect(inviteLines().how).toContain('QuizWalk app');
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
