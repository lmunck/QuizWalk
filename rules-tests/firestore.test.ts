import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  type DocumentData,
  type Firestore,
  GeoPoint,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * docs/v1-spec.md §7. One describe per bullet, each with at least one allow and one deny case.
 * Data is seeded with rules disabled, the way Cloud Functions write it.
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

// ------------------------------------------------------------------ helpers

const OWNER = 'owner';
const PLAYER = 'player';
const STRANGER = 'stranger';
const WALK = 'w1';
const STOP = 's1';

/** A creator signed in with Google. */
// The test contexts hand back the compat Firestore, which the modular functions accept.
const asModular = (db: unknown) => db as Firestore;
const creator = (uid: string): Firestore =>
  asModular(
    env.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore(),
  );
/** An anonymous participant. */
const anon = (uid: string): Firestore =>
  asModular(
    env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore(),
  );
const signedOut = (): Firestore => asModular(env.unauthenticatedContext().firestore());

function walkData(overrides: DocumentData = {}): DocumentData {
  return {
    ownerUid: OWNER,
    ownerName: 'Anders',
    title: 'Harbour history',
    status: 'draft',
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
    ...overrides,
  };
}

function stopData(overrides: DocumentData = {}): DocumentData {
  return {
    order: 0,
    location: new GeoPoint(55.681, 12.591),
    placeName: 'Nyhavn',
    radiusM: 40,
    question: 'When was the canal dug?',
    options: ['1670s', '1770s'],
    correctIndex: 0,
    explanation: '',
    origin: 'manual',
    warnings: [],
    skippedForAll: false,
    ...overrides,
  };
}

function newTeam(overrides: DocumentData = {}): DocumentData {
  return {
    name: 'Fjord Kids',
    mode: 'team',
    players: 3,
    colorIndex: 0,
    joinedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    distanceWalkedM: 0,
    score: 0,
    correctCount: 0,
    stopsDone: 0,
    ...overrides,
  };
}

function answerData(overrides: DocumentData = {}): DocumentData {
  const opened = Timestamp.fromMillis(Date.now() - 6_000);
  return {
    kind: 'answered',
    choiceIndex: 0,
    openedAtClient: opened,
    answeredAtClient: Timestamp.now(),
    elapsedMs: 6_000,
    ...overrides,
  };
}

/** Starts over with a walk (and optionally its stop and the player's team), rules disabled. */
async function seed(
  status: 'draft' | 'ready' | 'open' | 'ended',
  opts: { stop?: boolean; team?: DocumentData | false; walk?: DocumentData } = {},
) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `walks/${WALK}`), walkData({ status, ...opts.walk }));
    if (opts.stop !== false) await setDoc(doc(db, `walks/${WALK}/stops/${STOP}`), stopData());
    if (opts.team) {
      await setDoc(doc(db, `walks/${WALK}/teams/${PLAYER}`), {
        ...newTeam(),
        joinedAt: Timestamp.now(),
        lastSeenAt: Timestamp.now(),
        ...opts.team,
      });
    }
  });
}

const started = { startedAt: Timestamp.now() };

// ------------------------------------------------------------------ users

describe('users/{uid}: read/write by that user only', () => {
  it('lets a user write and read their own doc', async () => {
    const db = anon(PLAYER);
    await assertSucceeds(setDoc(doc(db, `users/${PLAYER}`), { playing: [WALK] }));
    await assertSucceeds(getDoc(doc(db, `users/${PLAYER}`)));
  });

  it("denies another user's doc and unknown fields", async () => {
    await assertFails(getDoc(doc(anon(STRANGER), `users/${PLAYER}`)));
    await assertFails(setDoc(doc(anon(STRANGER), `users/${PLAYER}`), { playing: [] }));
    await assertFails(setDoc(doc(anon(PLAYER), `users/${PLAYER}`), { isAdmin: true }));
    await assertFails(getDoc(doc(signedOut(), `users/${PLAYER}`)));
  });
});

// ------------------------------------------------------------------ join codes

describe('joinCodes: get for signed-in users, no list, writes by functions only', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'joinCodes/K72QX'), {
        walkId: WALK,
        createdAt: Timestamp.now(),
      });
    });
  });

  it('lets a signed-in user resolve a code', async () => {
    await assertSucceeds(getDoc(doc(anon(PLAYER), 'joinCodes/K72QX')));
  });

  it('denies signed-out reads, listing and any write', async () => {
    await assertFails(getDoc(doc(signedOut(), 'joinCodes/K72QX')));
    await assertFails(getDocs(collection(anon(PLAYER), 'joinCodes')));
    await assertFails(setDoc(doc(creator(OWNER), 'joinCodes/ABCDE'), { walkId: WALK }));
  });
});

// ------------------------------------------------------------------ walks

describe('walks create: signed-in creator, own uid, draft', () => {
  it('lets a creator create their own draft', async () => {
    await assertSucceeds(setDoc(doc(creator(OWNER), 'walks/new'), walkData()));
  });

  it('denies anonymous users, other owners, other statuses and function fields', async () => {
    await assertFails(setDoc(doc(anon(OWNER), 'walks/new'), walkData()));
    await assertFails(setDoc(doc(creator(OWNER), 'walks/new'), walkData({ ownerUid: STRANGER })));
    await assertFails(setDoc(doc(creator(OWNER), 'walks/new'), walkData({ status: 'ready' })));
    await assertFails(setDoc(doc(creator(OWNER), 'walks/new'), walkData({ joinCode: 'K72QX' })));
  });
});

describe('walks update: owner while draft/ready, never status or function fields', () => {
  it('lets the owner edit a draft and a ready walk', async () => {
    await seed('draft');
    await assertSucceeds(updateDoc(doc(creator(OWNER), `walks/${WALK}`), { title: 'New title' }));
    await seed('ready');
    await assertSucceeds(
      updateDoc(doc(creator(OWNER), `walks/${WALK}`), { whenText: 'Sat 14:00' }),
    );
  });

  it('denies edits while open, by others, and to protected fields', async () => {
    await seed('open');
    await assertFails(updateDoc(doc(creator(OWNER), `walks/${WALK}`), { title: 'x' }));
    await seed('draft');
    await assertFails(updateDoc(doc(creator(STRANGER), `walks/${WALK}`), { title: 'x' }));
    for (const field of [
      { status: 'ready' },
      { joinCode: 'K72QX' },
      { openFor: 'week' },
      { openedAt: Timestamp.now() },
      { endedAt: Timestamp.now() },
      { ownerUid: STRANGER },
    ]) {
      await assertFails(updateDoc(doc(creator(OWNER), `walks/${WALK}`), field));
    }
  });
});

describe("walks: the owner's one status write is open → ended at server time", () => {
  it('lets the owner end an open walk', async () => {
    await seed('open');
    await assertSucceeds(
      updateDoc(doc(creator(OWNER), `walks/${WALK}`), {
        status: 'ended',
        endedAt: serverTimestamp(),
      }),
    );
  });

  it('denies ending a ready walk, a client endedAt, or a stranger ending it', async () => {
    await seed('ready');
    await assertFails(
      updateDoc(doc(creator(OWNER), `walks/${WALK}`), {
        status: 'ended',
        endedAt: serverTimestamp(),
      }),
    );
    await seed('open');
    await assertFails(
      updateDoc(doc(creator(OWNER), `walks/${WALK}`), {
        status: 'ended',
        endedAt: Timestamp.fromMillis(0),
      }),
    );
    await assertFails(
      updateDoc(doc(creator(STRANGER), `walks/${WALK}`), {
        status: 'ended',
        endedAt: serverTimestamp(),
      }),
    );
  });
});

describe('walks delete: owner while draft', () => {
  it('lets the owner delete a draft', async () => {
    await seed('draft');
    await assertSucceeds(deleteDoc(doc(creator(OWNER), `walks/${WALK}`)));
  });

  it('denies deleting a published walk, or someone else’s', async () => {
    await seed('ready');
    await assertFails(deleteDoc(doc(creator(OWNER), `walks/${WALK}`)));
    await seed('draft');
    await assertFails(deleteDoc(doc(creator(STRANGER), `walks/${WALK}`)));
  });
});

describe('walks read: owner always, others unless draft; list only own', () => {
  it('lets the owner read a draft and anyone signed in read a published walk', async () => {
    await seed('draft');
    await assertSucceeds(getDoc(doc(creator(OWNER), `walks/${WALK}`)));
    await seed('ready');
    await assertSucceeds(getDoc(doc(anon(PLAYER), `walks/${WALK}`)));
    await assertSucceeds(
      getDocs(query(collection(creator(OWNER), 'walks'), where('ownerUid', '==', OWNER))),
    );
  });

  it("denies a stranger a draft, signed-out reads and listing others' walks", async () => {
    await seed('draft');
    await assertFails(getDoc(doc(anon(STRANGER), `walks/${WALK}`)));
    await seed('ready');
    await assertFails(getDoc(doc(signedOut(), `walks/${WALK}`)));
    await assertFails(getDocs(collection(creator(STRANGER), 'walks')));
    await assertFails(
      getDocs(query(collection(creator(STRANGER), 'walks'), where('ownerUid', '==', OWNER))),
    );
  });
});

// ------------------------------------------------------------------ stops

describe('stops: owner writes while draft/ready', () => {
  it('lets the owner add, edit and delete stops on a draft or ready walk', async () => {
    await seed('draft', { stop: false });
    const db = creator(OWNER);
    await assertSucceeds(setDoc(doc(db, `walks/${WALK}/stops/a`), stopData()));
    await assertSucceeds(updateDoc(doc(db, `walks/${WALK}/stops/a`), { question: 'Why?' }));
    await seed('ready');
    await assertSucceeds(updateDoc(doc(db, `walks/${WALK}/stops/${STOP}`), { radiusM: 60 }));
    await assertSucceeds(deleteDoc(doc(db, `walks/${WALK}/stops/${STOP}`)));
  });

  it('denies strangers, bad values and edits while open', async () => {
    await seed('draft');
    await assertFails(setDoc(doc(creator(STRANGER), `walks/${WALK}/stops/b`), stopData()));
    await assertFails(
      setDoc(doc(creator(OWNER), `walks/${WALK}/stops/b`), stopData({ radiusM: 99 })),
    );
    await assertFails(
      setDoc(doc(creator(OWNER), `walks/${WALK}/stops/b`), stopData({ skippedForAll: true })),
    );
    await seed('open');
    await assertFails(
      updateDoc(doc(creator(OWNER), `walks/${WALK}/stops/${STOP}`), { question: 'x' }),
    );
    await assertFails(deleteDoc(doc(creator(OWNER), `walks/${WALK}/stops/${STOP}`)));
  });
});

describe('stops while open: only skippedForAll, only to true', () => {
  it('lets the owner skip a stop for everyone', async () => {
    await seed('open');
    await assertSucceeds(
      updateDoc(doc(creator(OWNER), `walks/${WALK}/stops/${STOP}`), { skippedForAll: true }),
    );
  });

  it('denies un-skipping, other fields and strangers', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `walks/${WALK}`), walkData({ status: 'open' }));
      await setDoc(
        doc(ctx.firestore(), `walks/${WALK}/stops/${STOP}`),
        stopData({ skippedForAll: true }),
      );
    });
    await assertFails(
      updateDoc(doc(creator(OWNER), `walks/${WALK}/stops/${STOP}`), { skippedForAll: false }),
    );
    await assertFails(
      updateDoc(doc(creator(OWNER), `walks/${WALK}/stops/${STOP}`), {
        skippedForAll: true,
        correctIndex: 1,
      }),
    );
    await assertFails(
      updateDoc(doc(anon(STRANGER), `walks/${WALK}/stops/${STOP}`), { skippedForAll: true }),
    );
  });
});

describe('stops read: owner, and anyone signed in unless draft', () => {
  it('lets the owner read draft stops and guests read published ones', async () => {
    await seed('draft');
    await assertSucceeds(getDocs(collection(creator(OWNER), `walks/${WALK}/stops`)));
    await seed('ready');
    await assertSucceeds(getDocs(collection(anon(PLAYER), `walks/${WALK}/stops`)));
  });

  it('denies guests draft stops and signed-out reads', async () => {
    await seed('draft');
    await assertFails(getDocs(collection(anon(PLAYER), `walks/${WALK}/stops`)));
    await seed('open');
    await assertFails(getDoc(doc(signedOut(), `walks/${WALK}/stops/${STOP}`)));
  });
});

// ------------------------------------------------------------------ teams

describe('teams create: own uid, walk ready/open, allowed mode, zero totals', () => {
  it('lets a participant join a ready or open walk', async () => {
    await seed('ready');
    await assertSucceeds(setDoc(doc(anon(PLAYER), `walks/${WALK}/teams/${PLAYER}`), newTeam()));
    await seed('open', { walk: { modes: { solo: true, team: false } } });
    await assertSucceeds(
      setDoc(
        doc(anon(PLAYER), `walks/${WALK}/teams/${PLAYER}`),
        newTeam({ mode: 'solo', players: 1 }),
      ),
    );
  });

  it('denies drafts, ended walks, disallowed modes, totals, start times and other uids', async () => {
    await seed('draft');
    await assertFails(setDoc(doc(anon(PLAYER), `walks/${WALK}/teams/${PLAYER}`), newTeam()));
    await seed('ended');
    await assertFails(setDoc(doc(anon(PLAYER), `walks/${WALK}/teams/${PLAYER}`), newTeam()));
    await seed('ready', { walk: { modes: { solo: true, team: false } } });
    await assertFails(setDoc(doc(anon(PLAYER), `walks/${WALK}/teams/${PLAYER}`), newTeam()));
    await seed('ready');
    const ref = doc(anon(PLAYER), `walks/${WALK}/teams/${PLAYER}`);
    await assertFails(setDoc(ref, newTeam({ score: 50 })));
    await assertFails(setDoc(ref, newTeam({ correctCount: 1 })));
    await assertFails(setDoc(ref, newTeam({ startedAt: Timestamp.now() })));
    await assertFails(setDoc(ref, newTeam({ finishedAt: Timestamp.now() })));
    await assertFails(setDoc(ref, newTeam({ leftAt: Timestamp.now() })));
    await assertFails(setDoc(ref, newTeam({ colorIndex: 8 })));
    await assertFails(setDoc(doc(anon(STRANGER), `walks/${WALK}/teams/${PLAYER}`), newTeam()));
  });
});

describe('teams update: own uid, limited fields, startedAt once and only while open', () => {
  it('lets a team rename itself, start, report distance and leave', async () => {
    await seed('open', { team: {} });
    const ref = doc(anon(PLAYER), `walks/${WALK}/teams/${PLAYER}`);
    await assertSucceeds(updateDoc(ref, { name: 'Harbour Hawks', players: 4 }));
    await assertSucceeds(updateDoc(ref, { startedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { distanceWalkedM: 420, lastSeenAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { leftAt: serverTimestamp() }));
  });

  it('denies totals, a second startedAt, starting before open and other uids', async () => {
    await seed('ready', { team: {} });
    const ref = doc(anon(PLAYER), `walks/${WALK}/teams/${PLAYER}`);
    await assertFails(updateDoc(ref, { startedAt: serverTimestamp() }));
    await seed('open', { team: started });
    await assertFails(updateDoc(ref, { startedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { score: 99 }));
    await assertFails(updateDoc(ref, { stopsDone: 3 }));
    await assertFails(updateDoc(ref, { finishedAt: Timestamp.now() }));
    await assertFails(updateDoc(ref, { colorIndex: 2 }));
    await assertFails(
      updateDoc(doc(anon(STRANGER), `walks/${WALK}/teams/${PLAYER}`), { name: 'Hijack' }),
    );
  });
});

describe('teams delete: own uid while startedAt is unset', () => {
  it('lets a team leave the lobby', async () => {
    await seed('ready', { team: {} });
    await assertSucceeds(deleteDoc(doc(anon(PLAYER), `walks/${WALK}/teams/${PLAYER}`)));
  });

  it('denies deleting a started team or another team', async () => {
    await seed('open', { team: started });
    await assertFails(deleteDoc(doc(anon(PLAYER), `walks/${WALK}/teams/${PLAYER}`)));
    await seed('ready', { team: {} });
    await assertFails(deleteDoc(doc(anon(STRANGER), `walks/${WALK}/teams/${PLAYER}`)));
  });
});

describe('teams read: any signed-in user', () => {
  it('lets anyone signed in read the leaderboard', async () => {
    await seed('open', { team: {} });
    await assertSucceeds(getDocs(collection(anon(STRANGER), `walks/${WALK}/teams`)));
  });

  it('denies signed-out reads', async () => {
    await seed('open', { team: {} });
    await assertFails(getDocs(collection(signedOut(), `walks/${WALK}/teams`)));
  });
});

// ------------------------------------------------------------------ answers

describe('answers: create once by the started team while open, client fields only', () => {
  const answerRef = (db: Firestore, stopId = STOP) =>
    doc(db, `walks/${WALK}/teams/${PLAYER}/answers/${stopId}`);

  it('lets a started team answer, skip and use I’m here', async () => {
    await seed('open', { team: started });
    await assertSucceeds(setDoc(answerRef(anon(PLAYER)), answerData()));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `walks/${WALK}/stops/s2`), stopData({ order: 1 }));
      await setDoc(doc(ctx.firestore(), `walks/${WALK}/stops/s3`), stopData({ order: 2 }));
    });
    const skipped = answerData({ kind: 'skipped' });
    delete skipped.choiceIndex;
    await assertSucceeds(setDoc(answerRef(anon(PLAYER), 's2'), skipped));
    await assertSucceeds(setDoc(answerRef(anon(PLAYER), 's3'), answerData({ kind: 'imHere' })));
  });

  it('denies a second answer, updates, deletes and function fields', async () => {
    await seed('open', { team: started });
    const ref = answerRef(anon(PLAYER));
    await assertSucceeds(setDoc(ref, answerData()));
    await assertFails(setDoc(ref, answerData({ choiceIndex: 1 })));
    await assertFails(updateDoc(ref, { choiceIndex: 1 }));
    await assertFails(deleteDoc(ref));
    await seed('open', { team: started });
    await assertFails(setDoc(answerRef(anon(PLAYER)), answerData({ points: 15 })));
    await assertFails(setDoc(answerRef(anon(PLAYER)), answerData({ correct: true })));
  });

  it('denies unstarted teams, closed walks, missing stops and other uids', async () => {
    await seed('open', { team: {} });
    await assertFails(setDoc(answerRef(anon(PLAYER)), answerData()));
    await seed('ended', { team: started });
    await assertFails(setDoc(answerRef(anon(PLAYER)), answerData()));
    await seed('open', { team: started });
    await assertFails(setDoc(answerRef(anon(PLAYER), 'nope'), answerData()));
    await assertFails(setDoc(answerRef(anon(STRANGER)), answerData()));
  });

  it('lets the team and the owner read answers, and nobody else', async () => {
    await seed('open', { team: started });
    await assertSucceeds(setDoc(answerRef(anon(PLAYER)), answerData()));
    await assertSucceeds(getDoc(answerRef(anon(PLAYER))));
    await assertSucceeds(
      getDocs(collection(creator(OWNER), `walks/${WALK}/teams/${PLAYER}/answers`)),
    );
    await assertFails(getDoc(answerRef(anon(STRANGER))));
  });
});

// ------------------------------------------------------------------ positions

describe('positions: written by the team while open; read by the team and the owner', () => {
  const position = () => ({
    location: new GeoPoint(55.68, 12.59),
    accuracyM: 8,
    at: serverTimestamp(),
  });

  it('lets a team report its position and the owner read it', async () => {
    await seed('open', { team: started });
    await assertSucceeds(
      setDoc(doc(anon(PLAYER), `walks/${WALK}/positions/${PLAYER}`), position()),
    );
    await assertSucceeds(getDoc(doc(anon(PLAYER), `walks/${WALK}/positions/${PLAYER}`)));
    await assertSucceeds(getDocs(collection(creator(OWNER), `walks/${WALK}/positions`)));
  });

  it('denies writes before open, for other uids, and reads by strangers', async () => {
    await seed('ready', { team: {} });
    await assertFails(setDoc(doc(anon(PLAYER), `walks/${WALK}/positions/${PLAYER}`), position()));
    await seed('open', { team: started });
    await assertFails(setDoc(doc(anon(STRANGER), `walks/${WALK}/positions/${PLAYER}`), position()));
    await assertSucceeds(
      setDoc(doc(anon(PLAYER), `walks/${WALK}/positions/${PLAYER}`), position()),
    );
    await assertFails(getDoc(doc(anon(STRANGER), `walks/${WALK}/positions/${PLAYER}`)));
    await assertFails(getDocs(collection(anon(STRANGER), `walks/${WALK}/positions`)));
  });
});

// ------------------------------------------------------------------ alerts

describe('alerts: created by a team of the walk; read and resolved by the owner', () => {
  const alert = (teamUid = PLAYER) => ({
    teamUid,
    stopId: STOP,
    kind: 'blocked',
    createdAt: serverTimestamp(),
    resolved: false,
  });

  it('lets a team report a blocked way and the owner resolve it', async () => {
    await seed('open', { team: started });
    await assertSucceeds(setDoc(doc(anon(PLAYER), `walks/${WALK}/alerts/a1`), alert()));
    await assertSucceeds(getDocs(collection(creator(OWNER), `walks/${WALK}/alerts`)));
    await assertSucceeds(
      updateDoc(doc(creator(OWNER), `walks/${WALK}/alerts/a1`), { resolved: true }),
    );
  });

  it('denies non-teams, impersonation and reads by teams', async () => {
    await seed('open', { team: started });
    await assertFails(setDoc(doc(anon(STRANGER), `walks/${WALK}/alerts/a1`), alert(STRANGER)));
    await assertFails(setDoc(doc(anon(PLAYER), `walks/${WALK}/alerts/a2`), alert(OWNER)));
    await assertSucceeds(setDoc(doc(anon(PLAYER), `walks/${WALK}/alerts/a3`), alert()));
    await assertFails(getDocs(collection(anon(PLAYER), `walks/${WALK}/alerts`)));
    await assertFails(updateDoc(doc(anon(PLAYER), `walks/${WALK}/alerts/a3`), { resolved: true }));
  });
});

// ------------------------------------------------------------------ generation jobs

describe('generationJobs: read by owner, written by functions only', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'generationJobs/j1'), {
        ownerUid: OWNER,
        walkId: WALK,
        status: 'running',
        step: 1,
        stepDetail: [],
      });
    });
  });

  it('lets the owner follow their job', async () => {
    await assertSucceeds(getDoc(doc(creator(OWNER), 'generationJobs/j1')));
  });

  it("denies other users' reads and all client writes", async () => {
    await assertFails(getDoc(doc(creator(STRANGER), 'generationJobs/j1')));
    await assertFails(setDoc(doc(creator(OWNER), 'generationJobs/j2'), { ownerUid: OWNER }));
    await assertFails(updateDoc(doc(creator(OWNER), 'generationJobs/j1'), { status: 'done' }));
  });
});
