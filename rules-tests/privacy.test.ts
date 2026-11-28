import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  deleteField,
  doc,
  type Firestore,
  GeoPoint,
  getDoc,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * M5 deletion and retention (spec §7, §8, §13). Deleting someone's data and the 30-day purge
 * run in Cloud Functions (`deleteMyData`, `deleteAccount`, `daily`), which bypass the rules. These
 * tests pin down that a client cannot do the same work itself: a started team cannot erase its
 * answers or its trail, and nobody can fake a purge on a walk. Kept apart from firestore.test.ts
 * so the two files can change independently.
 */

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-qualk',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env?.cleanup();
});

const OWNER = 'owner';
const PLAYER = 'player';
const STRANGER = 'stranger';
const WALK = 'w1';

const asModular = (db: unknown) => db as Firestore;
const creator = (uid: string): Firestore =>
  asModular(
    env.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore(),
  );
const anon = (uid: string): Firestore =>
  asModular(
    env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore(),
  );

/** A walk with the player's team, an answer, a position and an alert, rules disabled. */
async function seed(status: 'open' | 'ended', team: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `walks/${WALK}`), {
      ownerUid: OWNER,
      ownerName: 'Anders',
      title: 'Harbour history',
      status,
      joinCode: 'K72QX',
      modes: { solo: true, team: true },
      maxPlayers: 6,
      start: new GeoPoint(55.68, 12.59),
      startLabel: 'Nyhavn 17',
      shape: 'loop',
      route: null,
      stopCount: 1,
      distanceM: 400,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...(status === 'ended' ? { endedAt: Timestamp.now() } : {}),
    });
    await setDoc(doc(db, `walks/${WALK}/teams/${PLAYER}`), {
      name: 'Fjord Kids',
      mode: 'team',
      players: 3,
      colorIndex: 0,
      joinedAt: Timestamp.now(),
      lastSeenAt: Timestamp.now(),
      distanceWalkedM: 0,
      score: 0,
      correctCount: 0,
      stopsDone: 0,
      ...team,
    });
    await setDoc(doc(db, `walks/${WALK}/teams/${PLAYER}/answers/s1`), { kind: 'answered' });
    await setDoc(doc(db, `walks/${WALK}/positions/${PLAYER}`), {
      location: new GeoPoint(55.68, 12.59),
      accuracyM: 5,
      at: Timestamp.now(),
    });
    await setDoc(doc(db, `walks/${WALK}/alerts/a1`), {
      teamUid: PLAYER,
      stopId: 's1',
      kind: 'blocked',
      createdAt: Timestamp.now(),
      resolved: false,
    });
    await setDoc(doc(db, `users/${PLAYER}`), { playing: [WALK] });
  });
}

describe('Delete my data: the playing list and a lobby team, nothing a started team left', () => {
  it('lets a participant delete their own users doc and leave a lobby', async () => {
    await seed('open', {});
    await assertSucceeds(deleteDoc(doc(anon(PLAYER), `users/${PLAYER}`)));
    await assertSucceeds(deleteDoc(doc(anon(PLAYER), `walks/${WALK}/teams/${PLAYER}`)));
  });

  it("denies erasing a started team's answers, position, alerts or team, or anyone else's", async () => {
    await seed('open', { startedAt: Timestamp.now() });
    const db = anon(PLAYER);
    await assertFails(deleteDoc(doc(db, `walks/${WALK}/teams/${PLAYER}`)));
    await assertFails(deleteDoc(doc(db, `walks/${WALK}/teams/${PLAYER}/answers/s1`)));
    await assertFails(deleteDoc(doc(db, `walks/${WALK}/positions/${PLAYER}`)));
    await assertFails(deleteDoc(doc(db, `walks/${WALK}/alerts/a1`)));
    await assertFails(deleteDoc(doc(anon(STRANGER), `users/${PLAYER}`)));
  });
});

describe('daily: only functions purge a walk and release its code', () => {
  it('keeps the results and the code readable until the purge', async () => {
    await seed('ended', { startedAt: Timestamp.now() });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'joinCodes/K72QX'), { walkId: WALK });
    });
    await assertSucceeds(getDoc(doc(anon(STRANGER), 'joinCodes/K72QX')));
    await assertSucceeds(getDoc(doc(anon(STRANGER), `walks/${WALK}/teams/${PLAYER}`)));
    await assertSucceeds(getDoc(doc(creator(OWNER), `walks/${WALK}/positions/${PLAYER}`)));
  });

  it('denies the owner marking a walk purged, dropping its code or deleting the code', async () => {
    await seed('ended', { startedAt: Timestamp.now() });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'joinCodes/K72QX'), { walkId: WALK });
    });
    const db = creator(OWNER);
    await assertFails(
      updateDoc(doc(db, `walks/${WALK}`), { participantDataDeletedAt: Timestamp.now() }),
    );
    await assertFails(updateDoc(doc(db, `walks/${WALK}`), { joinCode: deleteField() }));
    await assertFails(deleteDoc(doc(db, 'joinCodes/K72QX')));
    await assertFails(deleteDoc(doc(db, `walks/${WALK}/teams/${PLAYER}`)));
  });
});
