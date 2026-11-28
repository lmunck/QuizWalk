/**
 * Small things this phone remembers across restarts. Nothing here is shared or synced.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const WELCOME_SEEN = 'qualk:welcomeSeen';
const clockKey = (walkId: string, stopId: string) => `qualk:clock:${walkId}/${stopId}`;
const rejectedKey = (walkId: string) => `qualk:rejected:${walkId}`;

async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * After *Delete my data* or account deletion: forgets every walk's question clocks and refused
 * answers on this phone. Whether Welcome was seen is kept.
 */
export const forgetWalksOnThisPhone = () =>
  safely(async () => {
    const keys = await AsyncStorage.getAllKeys();
    const walkKeys = keys.filter(
      (k) => k.startsWith('qualk:clock:') || k.startsWith('qualk:rejected:'),
    );
    if (walkKeys.length > 0) await AsyncStorage.multiRemove(walkKeys);
  }, undefined);

/** First run without a link shows Welcome (G1); after any choice it never shows again. */
export const hasSeenWelcome = () =>
  safely(async () => (await AsyncStorage.getItem(WELCOME_SEEN)) === '1', false);
export const markWelcomeSeen = () =>
  safely(() => AsyncStorage.setItem(WELCOME_SEEN, '1'), undefined);

/**
 * The bonus clock starts on Show question and cannot be restarted (spec §3 P4): the tap's time
 * is stored, and a question reopened after backing out or a restart continues from it.
 */
export async function questionOpenedAt(
  walkId: string,
  stopId: string,
): Promise<number | undefined> {
  const v = await safely(() => AsyncStorage.getItem(clockKey(walkId, stopId)), null);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function startQuestionClock(
  walkId: string,
  stopId: string,
  atMs: number,
): Promise<number> {
  const existing = await questionOpenedAt(walkId, stopId);
  if (existing !== undefined) return existing;
  await safely(() => AsyncStorage.setItem(clockKey(walkId, stopId), String(atMs)), undefined);
  return atMs;
}

/** Answers the server refused after syncing late (spec §4), shown on P6. */
export async function recordRejectedAnswer(walkId: string, stopId: string): Promise<void> {
  const list = await rejectedAnswers(walkId);
  if (list.includes(stopId)) return;
  await safely(
    () => AsyncStorage.setItem(rejectedKey(walkId), JSON.stringify([...list, stopId])),
    undefined,
  );
}

export async function rejectedAnswers(walkId: string): Promise<string[]> {
  const raw = await safely(() => AsyncStorage.getItem(rejectedKey(walkId)), null);
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
