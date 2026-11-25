#!/usr/bin/env node
/**
 * Seeds a walk for testing (implementation plan B1). Against the emulator by default; against
 * the real project only with --project and Application Default Credentials.
 *
 *   node scripts/seed-walk.mjs                          # 5 stops around Nyhavn, status ready
 *   node scripts/seed-walk.mjs --at 55.6761,12.5683 --stops 6 --status open
 *   node scripts/seed-walk.mjs --code K72QX --status ended   # change an existing walk
 *   node scripts/seed-walk.mjs --points "55.68,12.59;55.681,12.592"   # exact stop positions
 *   node scripts/seed-walk.mjs --code K72QX --team "Harbour Hawks" --answered 2 --blocked
 *        # a pretend team on an existing walk: started, 2 stops answered, way to the next blocked
 *
 * Options: --at lat,lng (start)  --stops N (2-12)  --spacing metres (default 180)
 *          --status draft|ready|open|ended  --open-for day|week  --owner uid  --title "…"
 *          --code XXXXX (with no other changes: print; with --status: update that walk)
 *          --project <id> (real project; omit for the emulator)
 */
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, GeoPoint, getFirestore, Timestamp } from 'firebase-admin/firestore';

const { values: args } = parseArgs({
  options: {
    at: { type: 'string', default: '55.67985,12.59060' },
    stops: { type: 'string', default: '5' },
    spacing: { type: 'string', default: '180' },
    points: { type: 'string' },
    status: { type: 'string' },
    'open-for': { type: 'string', default: 'day' },
    owner: { type: 'string', default: 'seed-owner' },
    title: { type: 'string', default: 'Harbour history (seeded)' },
    code: { type: 'string' },
    team: { type: 'string' },
    answered: { type: 'string', default: '1' },
    blocked: { type: 'boolean', default: false },
    project: { type: 'string' },
  },
});

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const projectId = args.project ?? 'demo-qualk';
if (!args.project) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  console.log(`Using the Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
} else {
  console.log(`Using the real project ${projectId}`);
}
initializeApp({ projectId });
const db = getFirestore();

const QUESTIONS = [
  [
    'Which colour are most of the old houses on this street?',
    ['Every colour you can think of', 'All white', 'All red brick', 'Grey stone'],
    0,
    'The houses were painted in bright colours from the 1700s on.',
  ],
  [
    'Roughly how old is this harbour?',
    ['About 350 years', 'About 50 years', 'About 1,000 years', 'About 150 years'],
    0,
    'It was dug in the 1670s by Swedish prisoners of war.',
  ],
  [
    'What were these quays mainly built for?',
    ['Ships loading goods', 'Fishing competitions', 'A royal racecourse', 'Ice skating'],
    0,
    'Merchant ships unloaded cargo right in front of the warehouses.',
  ],
  [
    'Which writer lived at three different addresses on this street?',
    ['H.C. Andersen', 'Karen Blixen', 'Søren Kierkegaard', 'Ludvig Holberg'],
    0,
    'Hans Christian Andersen lived at no. 20, 67 and 18.',
  ],
  [
    'What is the big anchor by the canal a memorial for?',
    ['Sailors who died in WWII', 'The first ferry', 'A famous pirate', 'A royal wedding'],
    0,
    'The Memorial Anchor honours Danish sailors who died in the Second World War.',
  ],
  [
    'How many arms does the starfish on the old sign have?',
    ['Five', 'Four', 'Six', 'Eight'],
    0,
    'Most starfish have five arms, and so does this one.',
  ],
  [
    'What is sold in the kiosk at the corner?',
    ['Ice cream', 'Newspapers only', 'Bicycles', 'Train tickets'],
    0,
    '',
  ],
  [
    'Which direction does the canal run from here?',
    ['Towards the harbour', 'Uphill', 'Into a lake', 'Under the palace'],
    0,
    '',
  ],
];

function code() {
  let c = '';
  for (let i = 0; i < 5; i++) c += ALPHABET[randomInt(ALPHABET.length)];
  return c;
}

/** Points on a gentle loop around the start, `spacing` metres apart. */
function loopAround(lat, lng, n, spacingM) {
  const out = [];
  const r = (n * spacingM) / (2 * Math.PI);
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * (i + 1)) / (n + 1) - Math.PI / 2;
    const dLat = ((Math.sin(a) * r + r) / 111_320) * 1;
    const dLng = (Math.cos(a) * r) / (111_320 * Math.cos((lat * Math.PI) / 180));
    out.push([lat + dLat, lng + dLng]);
  }
  return out;
}

async function setStatus(walkRef, walk, status) {
  const update = { status, updatedAt: FieldValue.serverTimestamp() };
  if (status === 'open') {
    update.openedAt = Timestamp.now();
    update.openFor = args['open-for'];
  }
  if (status === 'ended') update.endedAt = Timestamp.now();
  if ((status === 'ready' || status === 'open') && !walk.joinCode) {
    const c = code();
    await db.doc(`joinCodes/${c}`).set({ walkId: walkRef.id, createdAt: Timestamp.now() });
    update.joinCode = c;
  }
  await walkRef.update(update);
  return { ...walk, ...update };
}

/** A pretend team that started 10 minutes ago, for testing the creator's monitor alone. */
async function addTeam(walkRef, name, answered, blocked) {
  const stops = (await walkRef.collection('stops').orderBy('order').get()).docs;
  const teams = await walkRef.collection('teams').get();
  const uid = `seed-team-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const teamRef = walkRef.collection('teams').doc(uid);
  const start = Date.now() - 10 * 60_000;
  await teamRef.set({
    name,
    mode: 'team',
    players: 3,
    colorIndex: teams.size % 8,
    joinedAt: Timestamp.fromMillis(start - 60_000),
    startedAt: Timestamp.fromMillis(start),
    lastSeenAt: Timestamp.now(),
    distanceWalkedM: 180 * answered,
    score: 0,
    correctCount: 0,
    stopsDone: 0,
  });
  for (let i = 0; i < Math.min(answered, stops.length); i++) {
    const s = stops[i].data();
    const at = start + (i + 1) * 4 * 60_000;
    // Alternate right and wrong answers so the leaderboard has something to rank.
    const choiceIndex = i % 2 === 0 ? s.correctIndex : (s.correctIndex + 1) % s.options.length;
    await teamRef
      .collection('answers')
      .doc(stops[i].id)
      .set({
        kind: 'answered',
        choiceIndex,
        openedAtClient: Timestamp.fromMillis(at - 7_000),
        answeredAtClient: Timestamp.fromMillis(at),
        elapsedMs: 7_000,
      });
  }
  const next = stops[Math.min(answered, stops.length - 1)];
  const loc = next.data().location;
  await walkRef
    .collection('positions')
    .doc(uid)
    .set({
      location: new GeoPoint(loc.latitude - 0.0008, loc.longitude + 0.0004),
      accuracyM: 8,
      at: Timestamp.now(),
    });
  if (blocked && answered < stops.length) {
    await walkRef.collection('alerts').add({
      teamUid: uid,
      stopId: next.id,
      kind: 'blocked',
      createdAt: Timestamp.now(),
      resolved: false,
    });
    await teamRef.collection('answers').doc(next.id).set({
      kind: 'skipped',
      openedAtClient: Timestamp.now(),
      answeredAtClient: Timestamp.now(),
      elapsedMs: 0,
    });
  }
  console.log(
    `Added team ${name} (${uid}) with ${answered} answers${blocked ? ' and a blocked way' : ''}`,
  );
}

async function main() {
  if (args.code) {
    const jc = await db.doc(`joinCodes/${args.code.toUpperCase()}`).get();
    if (!jc.exists) throw new Error(`No walk with code ${args.code}`);
    const ref = db.doc(`walks/${jc.data().walkId}`);
    const walk = (await ref.get()).data();
    if (args.team) {
      await addTeam(ref, args.team, Number(args.answered), args.blocked);
      return;
    }
    if (args.status) {
      await setStatus(ref, walk, args.status);
      console.log(`Walk ${ref.id} (${args.code}) is now ${args.status}`);
    } else {
      console.log(`Walk ${ref.id} (${args.code}) is ${walk.status}`);
    }
    return;
  }

  const [lat, lng] = args.at.split(',').map(Number);
  const points = args.points
    ? args.points.split(';').map((p) => p.split(',').map(Number))
    : loopAround(lat, lng, Math.max(2, Math.min(12, Number(args.stops))), Number(args.spacing));

  const walkRef = db.collection('walks').doc();
  let distance = 0;
  let prev = [lat, lng];
  for (const p of points) {
    const dLat = ((p[0] - prev[0]) * Math.PI) / 180;
    const dLng = ((p[1] - prev[1]) * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((prev[0] * Math.PI) / 180) *
        Math.cos((p[0] * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    distance += 2 * 6_371_008.8 * Math.asin(Math.sqrt(h));
    prev = p;
  }

  await db.doc(`users/${args.owner}`).set({ displayName: 'Anders' }, { merge: true });
  const walk = {
    ownerUid: args.owner,
    ownerName: 'Anders',
    title: args.title,
    status: 'draft',
    modes: { solo: true, team: true },
    maxPlayers: 6,
    start: new GeoPoint(lat, lng),
    startLabel: 'Nyhavn 1',
    shape: 'oneway',
    route: null,
    stopCount: points.length,
    distanceM: Math.round(distance),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  await walkRef.set(walk);
  const batch = db.batch();
  points.forEach((p, i) => {
    const q = QUESTIONS[i % QUESTIONS.length];
    batch.set(walkRef.collection('stops').doc(), {
      order: i,
      location: new GeoPoint(p[0], p[1]),
      placeName: `Stop ${i + 1}`,
      radiusM: 40,
      question: q[0],
      options: q[1],
      correctIndex: q[2],
      explanation: q[3],
      ...(i === 0 ? { hint: 'Look for the big anchor by the water.' } : {}),
      origin: 'manual',
      warnings: [],
      skippedForAll: false,
    });
  });
  await batch.commit();

  const status = args.status ?? 'ready';
  const final = status === 'draft' ? walk : await setStatus(walkRef, walk, status);
  console.log(
    `\nSeeded walk ${walkRef.id}: ${points.length} stops, ${Math.round(distance)} m, status ${status}`,
  );
  if (final.joinCode)
    console.log(`Join code: ${final.joinCode}\nLink: https://qualk.dk/play?code=${final.joinCode}`);
  console.log('Stops:');
  points.forEach((p, i) => console.log(`  ${i + 1}. ${p[0].toFixed(5)},${p[1].toFixed(5)}`));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
