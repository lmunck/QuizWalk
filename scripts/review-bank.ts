#!/usr/bin/env -S npx tsx
/**
 * Reviews the question bank (spec §8 "Reports and blocking": in v1, review is a script or the
 * Firestore console). Against the emulator unless --project is given, with the Firebase CLI's
 * login, like fill-bank.ts.
 *
 *   npx tsx scripts/review-bank.ts sample --project qualk-a173e --per 6          # by category
 *   npx tsx scripts/review-bank.ts sample --project qualk-a173e --pool history.medieval.kids
 *   npx tsx scripts/review-bank.ts flagged --project qualk-a173e                 # with reports
 *   npx tsx scripts/review-bank.ts block <id> [<id> …] --project qualk-a173e --note "wrong year"
 *   npx tsx scripts/review-bank.ts keep <id> --project qualk-a173e               # back to active
 *   npx tsx scripts/review-bank.ts search "\\b(drugs?|beer)\\b" --project qualk-a173e  # every match
 *   npx tsx scripts/review-bank.ts stats --project qualk-a173e                   # counts, spend
 *   npx tsx scripts/review-bank.ts tag-batch gemini-2026-11-27 --project …       # untagged → batch
 *   npx tsx scripts/review-bank.ts flag-batch gemini-2026-11-27 --project …      # hide a whole batch
 *   npx tsx scripts/review-bank.ts unflag-batch gemini-2026-11-27 --project …    # and back
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

import { CATEGORIES, EMPTY_STATS, parsePoolKey, type BankQuestionDoc } from '../shared/src/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    project: { type: 'string' },
    per: { type: 'string', default: '6' },
    pool: { type: 'string' },
    note: { type: 'string' },
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
    console.log(`${id}: ${status}`);
  }
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
  else if (command === 'search') await search(db, ids[0] ?? '.');
  else if (command === 'tag-batch' && ids[0]) await tagBatch(db, ids[0]);
  else if (command === 'flag-batch' && ids[0]) await flagBatch(db, ids[0], true);
  else if (command === 'unflag-batch' && ids[0]) await flagBatch(db, ids[0], false);
  else {
    console.log(
      'Commands: sample, flagged, search <regex>, block <id…>, keep <id…>, stats, ' +
        'tag-batch <batch>, flag-batch <batch>, unflag-batch <batch>',
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
