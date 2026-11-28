#!/usr/bin/env -S npx tsx
/**
 * Reviews the question bank (spec §8 "Reports and blocking": in v1, review is a script or the
 * Firestore console). Against the emulator unless --project is given, with the Firebase CLI's
 * login, like fill-bank.ts.
 *
 *   npx tsx scripts/review-bank.ts sample --project qualk-a173e --per 6          # by category
 *   npx tsx scripts/review-bank.ts sample --project qualk-a173e --pool history.medieval.kids
 *   npx tsx scripts/review-bank.ts flagged --project qualk-a173e                 # with reports
 *   npx tsx scripts/review-bank.ts list-reports --project qualk-a173e            # open reports
 *   npx tsx scripts/review-bank.ts list-reports --all --project qualk-a173e      # and closed ones
 *   npx tsx scripts/review-bank.ts close-reports stop:<walkId>/<stopId> --project … --note "fine"
 *   npx tsx scripts/review-bank.ts remove-walk <walkId> --project qualk-a173e     # moderation
 *   npx tsx scripts/review-bank.ts block <id> [<id> …] --project qualk-a173e --note "wrong year"
 *   npx tsx scripts/review-bank.ts keep <id> --project qualk-a173e               # back to active
 *   npx tsx scripts/review-bank.ts search "\\b(drugs?|beer)\\b" --project qualk-a173e  # every match
 *   npx tsx scripts/review-bank.ts stats --project qualk-a173e                   # counts, spend
 *   npx tsx scripts/review-bank.ts tag-batch gemini-2026-11-27 --project …       # untagged → batch
 *   npx tsx scripts/review-bank.ts flag-batch gemini-2026-11-27 --project …      # hide a whole batch
 *   npx tsx scripts/review-bank.ts unflag-batch gemini-2026-11-27 --project …    # and back
 *
 * A report is open until it is closed: `block` and `keep` close a bank question's reports,
 * `close-reports` closes any target's, and `remove-walk` closes those on the walk it removes.
 * Closing sets `reviewedAt` (and `reviewNote`) on the report documents; nothing else changes.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

import {
  CATEGORIES,
  EMPTY_STATS,
  parsePoolKey,
  REPORT_REASON_LABELS,
  type BankQuestionDoc,
  type ReportReason,
} from '../shared/src/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    project: { type: 'string' },
    per: { type: 'string', default: '6' },
    pool: { type: 'string' },
    note: { type: 'string' },
    all: { type: 'boolean', default: false },
  },
});

async function useCliLogin(): Promise<void> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;
  const require = createRequire(join(root, 'package.json'));
  const auth = require('firebase-tools/lib/auth.js');
  const creds = require('firebase-tools/lib/defaultCredentials.js');
  const account = auth.getGlobalDefaultAccount();
  if (!account) throw new Error('Sign in with `npx firebase login` first.');
  process.env.GOOGLE_APPLICATION_CREDENTIALS = await creds.getCredentialPathAsync(account);
}

function show(id: string, q: BankQuestionDoc) {
  const where = q.kind === 'place' ? q.placeKey : `${q.category}.${q.subcategory}.${q.difficulty}`;
  console.log(`\n[${id}] ${where} (${q.status})`);
  console.log(`  ${q.question}`);
  console.log(`  ✓ ${q.correct}   ✗ ${q.wrong.join(' | ')}`);
  if (q.explanation) console.log(`  ${q.explanation}`);
  const s = q.stats ?? EMPTY_STATS;
  if (s.reports || s.answered || s.replaced) {
    console.log(
      `  used ${s.used}, answered ${s.answered} (${s.correct} right), replaced ${s.replaced}, ` +
        `reports ${s.reports} ${JSON.stringify(s.reasons)}`,
    );
  }
}

async function sample(db: Firestore) {
  const per = Number(args.per);
  const groups = args.pool
    ? [{ label: args.pool, pool: parsePoolKey(args.pool) }]
    : CATEGORIES.filter((c) => c.id !== 'local').map((c) => ({ label: c.label, cat: c.id }));
  for (const g of groups) {
    console.log(`\n=== ${g.label}`);
    let q = db.collection('questionBank').where('status', '==', 'active');
    if ('pool' in g && g.pool) {
      q = q
        .where('category', '==', g.pool.category)
        .where('subcategory', '==', g.pool.subcategory)
        .where('difficulty', '==', g.pool.difficulty);
    } else if ('cat' in g) {
      q = q.where('category', '==', g.cat);
    }
    // Equality filters only, so no extra index; a category is a few hundred questions.
    const docs = (await q.get()).docs;
    for (let i = docs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [docs[i], docs[j]] = [docs[j]!, docs[i]!];
    }
    for (const d of docs.slice(0, per)) show(d.id, d.data() as BankQuestionDoc);
  }
}

async function flagged(db: Firestore) {
  const snap = await db.collection('questionBank').where('status', '==', 'flagged').get();
  console.log(`${snap.size} flagged`);
  for (const d of snap.docs) show(d.id, d.data() as BankQuestionDoc);
  const reports = await db
    .collection('questionReports')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  const own = reports.docs.filter((r) => !r.get('questionId'));
  console.log(`\n${own.length} recent reports on creators' own questions`);
  for (const r of own) {
    console.log(`  ${r.get('reason')}: walks/${r.get('walkId')}/stops/${r.get('stopId')}`);
  }
}

async function setStatus(db: Firestore, ids: string[], status: 'blocked' | 'active') {
  for (const id of ids) {
    const ref = db.collection('questionBank').doc(id);
    if (!(await ref.get()).exists) {
      console.log(`${id}: not found`);
      continue;
    }
    await ref.update(
      status === 'active'
        ? {
            status,
            reviewedAt: FieldValue.serverTimestamp(),
            // Kept on review: only new reports flag it again.
            'stats.reasons': EMPTY_STATS.reasons,
          }
        : { status, ...(args.note ? { reviewNote: args.note } : {}) },
    );
    const closed = await closeReports(db, `bank:${id}`);
    console.log(`${id}: ${status}${closed ? `, ${closed} reports closed` : ''}`);
  }
}

// ------------------------------------------------------------------ reports

type ReportDoc = FirebaseFirestore.QueryDocumentSnapshot;

/** `bank:<questionId>` for a bank question, `stop:<walkId>/<stopId>` for a creator's own. */
function targetOf(r: ReportDoc): string {
  const questionId = r.get('questionId') as string | undefined;
  return questionId ? `bank:${questionId}` : `stop:${r.get('walkId')}/${r.get('stopId')}`;
}

const when = (r: ReportDoc) =>
  (r.get('createdAt') as FirebaseFirestore.Timestamp | undefined)?.toDate().toISOString() ?? '?';

/**
 * Reports grouped by what they are about, newest first, with each reason's count. Open ones
 * only unless --all. Reports are few, so they are read whole and filtered here (a missing
 * `reviewedAt` can't be queried).
 */
async function listReports(db: Firestore) {
  const snap = await db.collection('questionReports').orderBy('createdAt', 'desc').get();
  const groups = new Map<string, ReportDoc[]>();
  for (const r of snap.docs) {
    if (!args.all && r.get('reviewedAt')) continue;
    const key = targetOf(r);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const bank = [...groups].filter(([k]) => k.startsWith('bank:'));
  const own = [...groups].filter(([k]) => k.startsWith('stop:'));
  const label = args.all ? 'reported' : 'with open reports';
  console.log(`${snap.size} reports in all.`);

  console.log(`\n=== Bank questions ${label}: ${bank.length}`);
  for (const [key, reports] of bank) {
    const id = key.slice('bank:'.length);
    const q = await db.collection('questionBank').doc(id).get();
    console.log(`\n${key}  ${summary(reports)}`);
    if (q.exists) show(id, q.data() as BankQuestionDoc);
    else console.log('  (no longer in the bank)');
  }

  console.log(`\n=== Creator-written questions ${label}: ${own.length}`);
  for (const [key, reports] of own) {
    const [walkId, stopId] = key.slice('stop:'.length).split('/') as [string, string];
    const [walk, stop] = await Promise.all([
      db.doc(`walks/${walkId}`).get(),
      db.doc(`walks/${walkId}/stops/${stopId}`).get(),
    ]);
    console.log(`\n${key}  ${summary(reports)}`);
    if (!walk.exists) {
      console.log('  (the walk has been deleted)');
      continue;
    }
    console.log(
      `  "${walk.get('title')}" by ${walk.get('ownerName')} (owner ${walk.get('ownerUid')}), ` +
        `${walk.get('status')}${walk.get('joinCode') ? `, code ${walk.get('joinCode')}` : ''}`,
    );
    if (!stop.exists) {
      console.log('  (the stop has been removed)');
      continue;
    }
    const options = (stop.get('options') as string[] | undefined) ?? [];
    const correct = stop.get('correctIndex') as number;
    console.log(`  Stop ${(stop.get('order') as number) + 1}, ${stop.get('placeName')}`);
    console.log(`  ${stop.get('question')}`);
    console.log(
      `  ✓ ${options[correct] ?? '?'}   ✗ ${options.filter((_, i) => i !== correct).join(' | ')}`,
    );
    if (stop.get('explanation')) console.log(`  ${stop.get('explanation')}`);
  }
  if (bank.length + own.length > 0) {
    console.log(
      '\nBank: block <id> or keep <id>. Creator-written: close-reports <target>, or remove-walk ' +
        '<walkId>; to stop the creator signing in, disable the owner in Firebase console → ' +
        'Authentication.',
    );
  }
}

/** "3 reports (offensive 1, wrong answer 2), last 2026-12-01T…, 1 closed". */
function summary(reports: ReportDoc[]): string {
  const counts = new Map<string, number>();
  for (const r of reports) {
    const reason = REPORT_REASON_LABELS[r.get('reason') as ReportReason] ?? String(r.get('reason'));
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const reasons = [...counts].map(([k, n]) => `${k} ${n}`).join(', ');
  const closed = reports.filter((r) => r.get('reviewedAt')).length;
  return (
    `${reports.length} report${reports.length === 1 ? '' : 's'} (${reasons}), last ${when(reports[0]!)}` +
    (closed ? `, ${closed} closed` : '')
  );
}

/** Marks a target's open reports as reviewed. Returns how many were closed. */
async function closeReports(db: Firestore, target: string): Promise<number> {
  const col = db.collection('questionReports');
  let q: FirebaseFirestore.Query;
  if (target.startsWith('bank:')) {
    q = col.where('questionId', '==', target.slice('bank:'.length));
  } else if (target.startsWith('stop:') || target.startsWith('walk:')) {
    const [walkId, stopId] = target.slice(5).split('/');
    q = col.where('walkId', '==', walkId);
    if (stopId) q = q.where('stopId', '==', stopId);
  } else {
    throw new Error(`Not a report target: ${target} (bank:<id>, stop:<walkId>/<stopId>)`);
  }
  const open = (await q.get()).docs.filter(
    (r) => !r.get('reviewedAt') && (target.startsWith('bank:') || !r.get('questionId')),
  );
  await updateAll(
    db,
    open.map((r) => r.ref),
    {
      reviewedAt: FieldValue.serverTimestamp(),
      ...(args.note ? { reviewNote: args.note } : {}),
    },
  );
  return open.length;
}

/**
 * Moderation: removes a walk with everything under it (stops, teams, answers, positions,
 * alerts), its join code and its generation job, as deleteWalk does, also when it is open.
 * The walk's reports are closed. The creator's account is left alone.
 */
async function removeWalk(db: Firestore, walkId: string) {
  const ref = db.doc(`walks/${walkId}`);
  const walk = await ref.get();
  if (!walk.exists) {
    console.log(`${walkId}: not found`);
    return;
  }
  const code = walk.get('joinCode') as string | undefined;
  if (code) {
    const join = db.doc(`joinCodes/${code}`);
    if ((await join.get()).get('walkId') === walkId) await join.delete();
  }
  await db.doc(`generationJobs/${walkId}`).delete();
  await db.recursiveDelete(ref);
  const closed = await closeReports(db, `walk:${walkId}`);
  console.log(
    `${walkId}: "${walk.get('title')}" (${walk.get('status')}) removed` +
      `${code ? `, code ${code} freed` : ''}, ${closed} reports closed`,
  );
}

/** Every active question whose text, answers or explanation match a regular expression. */
async function search(db: Firestore, pattern: string) {
  const re = new RegExp(pattern, 'i');
  const snap = await db.collection('questionBank').where('status', '==', 'active').get();
  let hits = 0;
  for (const d of snap.docs) {
    const q = d.data() as BankQuestionDoc;
    if (re.test([q.question, q.correct, ...q.wrong, q.explanation].join(' '))) {
      show(d.id, q);
      hits++;
    }
  }
  console.log(`\n${hits} of ${snap.size} match`);
}

/** Writes in chunks, so a batch of thousands fits Firestore's 500-write limit. */
async function updateAll(
  db: Firestore,
  refs: FirebaseFirestore.DocumentReference[],
  data: Record<string, unknown>,
) {
  for (let i = 0; i < refs.length; i += 400) {
    const b = db.batch();
    for (const ref of refs.slice(i, i + 400)) b.update(ref, data);
    await b.commit();
  }
}

/** Gives every bank question without a seedBatch this one (the Gemini fill's, after the fact). */
async function tagBatch(db: Firestore, batch: string) {
  const snap = await db.collection('questionBank').where('kind', '==', 'trivia').get();
  const refs = snap.docs.filter((d) => !d.get('seedBatch')).map((d) => d.ref);
  await updateAll(db, refs, { seedBatch: batch });
  console.log(`${refs.length} questions tagged ${batch}`);
}

/** Hides a whole batch, or brings back the ones hidden that way (not ones flagged by reports). */
async function flagBatch(db: Firestore, batch: string, flag: boolean) {
  let q = db.collection('questionBank').where('seedBatch', '==', batch);
  q = flag ? q.where('status', '==', 'active') : q.where('batchFlagged', '==', true);
  const refs = (await q.get()).docs.map((d) => d.ref);
  await updateAll(
    db,
    refs,
    flag
      ? { status: 'flagged', batchFlagged: true }
      : { status: 'active', batchFlagged: FieldValue.delete() },
  );
  console.log(`${refs.length} questions in ${batch} ${flag ? 'flagged' : 'back to active'}`);
}

async function stats(db: Firestore) {
  const bank = db.collection('questionBank');
  for (const status of ['active', 'flagged', 'blocked']) {
    const n = (await bank.where('status', '==', status).count().get()).data().count;
    console.log(`${status}: ${n}`);
  }
  for (const c of CATEGORIES) {
    const n = (
      await bank.where('category', '==', c.id).where('status', '==', 'active').count().get()
    ).data().count;
    console.log(`  ${c.label}: ${n}`);
  }
  const spend = (await db.doc('bankMeta/spend').get()).data() ?? {};
  for (const [source, v] of Object.entries(spend)) {
    if (v && typeof v === 'object' && 'costUsd' in v) {
      const s = v as { costUsd: number; calls: number; inputTokens: number; outputTokens: number };
      console.log(
        `spend ${source}: $${s.costUsd.toFixed(2)} over ${s.calls} calls ` +
          `(${s.inputTokens} in, ${s.outputTokens} out)`,
      );
    }
  }
}

async function main() {
  const [command, ...ids] = positionals;
  if (args.project) await useCliLogin();
  else process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  initializeApp({ projectId: args.project ?? 'demo-qualk' });
  const db = getFirestore();
  if (command === 'sample') await sample(db);
  else if (command === 'flagged') await flagged(db);
  else if (command === 'block') await setStatus(db, ids, 'blocked');
  else if (command === 'keep') await setStatus(db, ids, 'active');
  else if (command === 'stats') await stats(db);
  else if (command === 'list-reports' || command === 'reports') await listReports(db);
  else if (command === 'close-reports' && ids.length > 0) {
    for (const t of ids) console.log(`${t}: ${await closeReports(db, t)} reports closed`);
  } else if (command === 'remove-walk' && ids[0]) await removeWalk(db, ids[0]);
  else if (command === 'search') await search(db, ids[0] ?? '.');
  else if (command === 'tag-batch' && ids[0]) await tagBatch(db, ids[0]);
  else if (command === 'flag-batch' && ids[0]) await flagBatch(db, ids[0], true);
  else if (command === 'unflag-batch' && ids[0]) await flagBatch(db, ids[0], false);
  else {
    console.log(
      'Commands: sample, flagged, search <regex>, block <id…>, keep <id…>, stats, ' +
        'list-reports [--all], close-reports <target…>, remove-walk <walkId>, ' +
        'tag-batch <batch>, flag-batch <batch>, unflag-batch <batch>',
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
