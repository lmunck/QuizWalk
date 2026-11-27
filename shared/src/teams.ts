/** Team identity helpers: colour, initials, names (spec §3 P1, §6 colorIndex, §14). */

export const TEAM_COLOR_COUNT = 8;

/**
 * The least-used team colour so far, lowest index first. Two teams only share a colour once
 * all eight are in use, and a team keeps its colour for the whole walk.
 */
export function pickColorIndex(taken: number[]): number {
  const counts = new Array<number>(TEAM_COLOR_COUNT).fill(0);
  for (const i of taken) {
    if (Number.isInteger(i) && i >= 0 && i < TEAM_COLOR_COUNT) counts[i] = (counts[i] ?? 0) + 1;
  }
  let best = 0;
  for (let i = 1; i < TEAM_COLOR_COUNT; i++) {
    if ((counts[i] ?? 0) < (counts[best] ?? 0)) best = i;
  }
  return best;
}

/** Up to two initials for a team marker: "Fjord Kids" → "FK", "anders" → "AN". */
export function teamInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return '?';
  const first = [...(words[0] ?? '')];
  if (words.length === 1) return first.slice(0, 2).join('').toUpperCase();
  const second = [...(words[1] ?? '')];
  return `${first[0] ?? ''}${second[0] ?? ''}`.toUpperCase();
}

/** Names compare without case or surrounding spaces. */
export function sameTeamName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/** Whether another team in the walk already uses this name. */
export function isTeamNameTaken(
  name: string,
  teams: { id: string; name: string }[],
  myId?: string,
): boolean {
  return teams.some((t) => t.id !== myId && sameTeamName(t.name, name));
}

const ADJECTIVES = [
  'Brisk',
  'Curious',
  'Daring',
  'Fearless',
  'Mighty',
  'Nimble',
  'Rambling',
  'Restless',
  'Sharp',
  'Speedy',
  'Sunny',
  'Wandering',
];
const NOUNS = [
  'Badgers',
  'Foxes',
  'Gulls',
  'Hares',
  'Herons',
  'Otters',
  'Owls',
  'Puffins',
  'Ramblers',
  'Seals',
  'Squirrels',
  'Walkers',
];

/**
 * A suggested team name for P1. `random` returns [0, 1); a name other teams already use is
 * avoided when possible.
 */
export function suggestTeamName(
  random: () => number,
  taken: { id: string; name: string }[] = [],
): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const adjective = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)] ?? 'Curious';
    const noun = NOUNS[Math.floor(random() * NOUNS.length)] ?? 'Walkers';
    const name = `${adjective} ${noun}`;
    if (!isTeamNameTaken(name, taken)) return name;
  }
  return 'Curious Walkers';
}
