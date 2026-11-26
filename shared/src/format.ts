/**
 * Words and numbers shown to people. English only in v1 (§1). Pure, so every screen and the
 * server say the same thing the same way.
 */
import { walkEndsAtMs, WALKING_SPEED_M_PER_MIN } from './rules';
import type { WalkOpenFor } from './types';

/** "40 m", "950 m", "1.2 km", "12 km". */
export function formatDistance(m: number): string {
  const metres = Math.max(0, m);
  if (metres < 995) {
    // Round to 5 m below 100 m, 10 m above, so the number does not flicker while walking.
    const step = metres < 100 ? 5 : 10;
    return `${Math.round(metres / step) * step} m`;
  }
  const km = metres / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** "about 55 min", "about 1 h 20 min". */
export function formatMinutes(minutes: number): string {
  const total = Math.max(1, Math.round(minutes));
  if (total < 60) return `about ${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `about ${h} h` : `about ${h} h ${m} min`;
}

/** Minutes to walk a distance at 4.5 km/h. */
export function walkingMinutes(distanceM: number): number {
  return Math.max(0, distanceM) / WALKING_SPEED_M_PER_MIN;
}

/** "1:05" for a clock; "0:07" below a minute. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "42 min", "1 h 05 min" for a walk time. */
export function formatWalkTime(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

const POINTS_8 = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const;

/** Text bearing for when the compass is unreliable: 0° → "north", 50° → "north-east". */
export function compassPoint(bearingDeg: number): (typeof POINTS_8)[number] {
  const normalised = ((bearingDeg % 360) + 360) % 360;
  return POINTS_8[Math.round(normalised / 45) % 8] ?? 'north';
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "2nd" or, for a shared place, "2=" in tables. */
export function rankLabel(rank: number, tied: boolean): string {
  return tied ? `${rank}=` : ordinal(rank);
}

/**
 * The headline on a result card, fitting the result rather than only a win (spec §3 P6):
 * "Fjord Kids won", "Fjord Kids came 3rd of 4", "Fjord Kids came joint 2nd of 5".
 */
export function resultHeadline(name: string, rank: number, tied: boolean, teams: number): string {
  if (rank === 1 && !tied) return `${name} won`;
  if (rank === 1 && tied) return `${name} shared first place`;
  return `${name} came ${tied ? 'joint ' : ''}${ordinal(rank)} of ${teams}`;
}

/** A place in a sentence: "2nd", or "joint 2nd" when it is shared. */
export function placeWords(rank: number, tied: boolean): string {
  return tied ? `joint ${ordinal(rank)}` : ordinal(rank);
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The headline on a team's card before the final results, in a week-long walk (spec §3 P5):
 * "In the lead so far", "Sharing the lead so far", "3rd of 5 so far", "Joint 2nd of 5 so far".
 */
export function soFarHeadline(rank: number, tied: boolean, teams: number): string {
  if (rank === 1) return tied ? 'Sharing the lead so far' : 'In the lead so far';
  return `${capitalise(placeWords(rank, tied))} of ${teams} so far`;
}

/**
 * P5's line under "Standings so far" in a week-long walk: "2nd of 5 teams so far. Final
 * results on Sun 29 Nov." `finalOn` is the day the walk ends by itself.
 */
export function standingsSoFarText(
  rank: number,
  tied: boolean,
  teams: number,
  finalOn?: string,
): string {
  const place = capitalise(placeWords(rank, tied));
  return `${place} of ${plural(teams, 'team')} so far. Final results on ${finalOn ?? 'the last day'}.`;
}

/**
 * The headline on the creator's results card (C9): who won, or who shares first place.
 * `leaders` are the names ranked 1st, in ranking order. Before the walk ends the same facts
 * read as a lead: "Fjord Kids in the lead", "Fjord Kids and Harbour Hawks share the lead".
 */
export function leadersHeadline(leaders: string[], final: boolean): string {
  const [first, second] = leaders;
  if (first === undefined) return 'No team started this walk';
  if (leaders.length === 1) return final ? `${first} won` : `${first} in the lead`;
  const who = leaders.length === 2 ? `${first} and ${second}` : `${leaders.length} teams`;
  return final ? `${who} shared first place` : `${who} share the lead`;
}

/** The label above a results card's headline: "Final results" or "Standings so far". */
export function resultsLabel(final: boolean): string {
  return final ? 'Final results' : 'Standings so far';
}

/** The line under a results card's list when not every team fits: "+ 3 more teams". */
export function moreTeamsLabel(total: number, shown: number): string | undefined {
  const more = total - shown;
  return more > 0 ? `+ ${plural(more, 'more team')}` : undefined;
}

/**
 * The three tiles on a team's card: points, right answers, and the walk time once the team
 * has finished (the distance walked until then).
 */
export function cardStats(t: {
  score: number;
  correctCount: number;
  stopCount: number;
  walkTimeMs?: number;
  distanceWalkedM?: number;
}): { value: string; label: string }[] {
  return [
    { value: String(t.score), label: t.score === 1 ? 'point' : 'points' },
    { value: `${t.correctCount}/${t.stopCount}`, label: 'right' },
    t.walkTimeMs !== undefined
      ? { value: formatWalkTime(t.walkTimeMs), label: 'time' }
      : { value: formatDistance(t.distanceWalkedM ?? 0), label: 'walked' },
  ];
}

/** The invite card's instruction, with the "When" line from C6 when there is one. */
export function inviteLines(whenText?: string): { when?: string; how: string } {
  const when = whenText?.trim();
  return {
    when: when ? `When: ${when}` : undefined,
    how: "Scan with your phone's camera, or type the code in the QuizWalk app.",
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sun 29 Nov", in the phone's time zone. */
export function formatDayDate(ms: number): string {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "17:00", 24-hour, in the phone's time zone. */
export function formatTimeOfDay(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * "Open until Sun 29 Nov" for a week-long walk; "Ends by 21:30" for a day walk, or "Ends by
 * 09:30 tomorrow" when the 12 hours run past midnight.
 */
export function openUntilLabel(openedAtMs: number, openFor: WalkOpenFor = 'day'): string {
  const ends = walkEndsAtMs(openedAtMs, openFor);
  if (openFor === 'week') return `Open until ${formatDayDate(ends)}`;
  return `Ends by ${formatTimeOfDay(ends)}${sameDay(openedAtMs, ends) ? '' : ' tomorrow'}`;
}

/** "just now", "6 min ago", "2 h ago". */
export function formatAgo(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ago`;
}

/** "1 team", "3 teams". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
