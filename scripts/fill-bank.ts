#!/usr/bin/env -S npx tsx
/**
 * Fills the question bank ahead of time (spec §8 "Question bank", implementation plan M4·4).
 * Breadth first, resumable and idempotent: run it again and it carries on. Each batch is
 * written by GEMINI_WRITER_MODEL and checked by GEMINI_CHECKER_MODEL (functions/.env), and
 * its token use and estimated cost are logged and added to bankMeta/spend. It stops before
 * the fill's spend, across all runs, passes --cap.
 *
 *   npx tsx scripts/fill-bank.ts --fake                     # emulator, fake model, spends nothing
 *   npx tsx scripts/fill-bank.ts --project qualk-a173e --dry-run
 *   npx tsx scripts/fill-bank.ts --project qualk-a173e --cap 10
 *   npx tsx scripts/fill-bank.ts --project qualk-a173e --only space,history --target 40
 *
 * Against the real project the key is read from Secret Manager with the Firebase CLI
 * (`firebase functions:secrets:access GEMINI_API_KEY`) and never printed, and Firestore is
 * reached with the Firebase CLI's own login, as the emulators do. Set GEMINI_API_KEY or
 * GOOGLE_APPLICATION_CREDENTIALS to use something else.
 *
 * Options: --project <id>  --cap <usd, default 10>  --target <per pool, default 40>
 *          --concurrency <default 6>  --rpm <model calls per minute, default 60>
 *          --only <category,…>  --fake  --dry-run
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { allPools, FILL_TARGET_PER_POOL, isCategoryId } from '../shared/src/index';
import { fillBank, type FillLogEntry } from '../functions/src/bank/fill';
import { countActive, spentUsd } from '../functions/src/bank/store';
import { fakeLlm } from '../functions/src/llm/fake';
import { geminiLlm } from '../functions/src/llm/gemini';
import { DEFAULT_MODELS, type Models } from '../functions/src/llm/llm';
import { costUsd, hasPrice } from '../functions/src/llm/pricing';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const { values: args } = parseArgs({
  options: {
    project: { type: 'string' },
    cap: { type: 'string', default: '10' },
    target: { type: 'string', default: String(FILL_TARGET_PER_POOL) },
    concurrency: { type: 'string', default: '6' },
    rpm: { type: 'string', default: '60' },
    only: { type: 'string' },
    fake: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});

/** The model ids from functions/.env, the same configuration the functions use. */
function configuredModels(): Models {
  const env = readFileSync(join(root, 'functions/.env'), 'utf8');
  const get = (k: string) => new RegExp(`^${k}=(.+)$`, 'm').exec(env)?.[1]?.trim();
  return {
    writer: get('GEMINI_WRITER_MODEL') ?? DEFAULT_MODELS.writer,
    checker: get('GEMINI_CHECKER_MODEL') ?? DEFAULT_MODELS.checker,
  };
}

function firebaseCli(argv: string[]): string {
  return execFileSync('npx', ['firebase', ...argv], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/** Credentials from the Firebase CLI's login, the way the emulators give functions access. */
async function useCliLogin(): Promise<void> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;
  const require = createRequire(join(root, 'package.json'));
  const auth = require('firebase-tools/lib/auth.js');
  const creds = require('firebase-tools/lib/defaultCredentials.js');
  const account = auth.getGlobalDefaultAccount();
  if (!account) throw new Error('Sign in with `npx firebase login` first.');
  const path = await creds.getCredentialPathAsync(account);
  if (!path) throw new Error('Could not use the Firebase CLI login.');
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
}

async function main() {
  const models = configuredModels();
  for (const m of [models.writer, models.checker]) {
    if (!args.fake && !hasPrice(m))
      throw new Error(`No price for ${m} in functions/src/llm/pricing.ts`);
  }
  const only =
    args.only
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const bad = only.filter((c) => !isCategoryId(c) || c === 'local');
  if (bad.length > 0) throw new Error(`Unknown categories: ${bad.join(', ')}`);
  const pools = allPools().filter((p) => only.length === 0 || only.includes(p.category));
  const capUsd = Number(args.cap);
  const target = Number(args.target);

  const projectId = args.project ?? 'demo-qualk';
  if (args.project) {
    await useCliLogin();
    console.log(`Real project ${projectId}`);
  } else {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    console.log(`Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
  }
  initializeApp({ projectId });
  const db = getFirestore();

  const counts = await Promise.all(pools.map((p) => countActive(db, p)));
  const missing = counts.reduce((s, c) => s + Math.max(0, target - c), 0);
  const spent = await spentUsd(db, 'fill');
  const batchUsd =
    costUsd({ model: models.writer, inputTokens: 1500, outputTokens: 3000, thinkingTokens: 500 }) +
    (args.fake
      ? 0
      : costUsd({
          model: models.checker,
          inputTokens: 3500,
          outputTokens: 600,
          thinkingTokens: 500,
        }));
  console.log(
    `${pools.length} pools, ${counts.reduce((a, b) => a + b, 0)} active questions, ${missing} to reach ${target} each.`,
  );
  console.log(`Writer ${models.writer}, checker ${models.checker}${args.fake ? ' (fake)' : ''}.`);
  console.log(
    `Spent so far on the fill: $${spent.toFixed(2)} of $${capUsd.toFixed(2)}. ` +
      `About $${batchUsd.toFixed(3)} per batch of 25, ~${Math.ceil(missing / 20)} batches.`,
  );
  if (args['dry-run']) return;

  const apiKey = args.fake
    ? ''
    : (process.env.GEMINI_API_KEY ??
      firebaseCli(['functions:secrets:access', 'GEMINI_API_KEY', '--project', projectId]));
  if (!args.fake && !apiKey) throw new Error('No GEMINI_API_KEY.');
  const llm = args.fake ? fakeLlm() : geminiLlm(apiKey);

  const logDir = join(root, 'scripts/logs');
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, `fill-bank-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  console.log(`Log: ${logFile}`);
  const log = (e: FillLogEntry) => {
    appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), ...e })}\n`);
    const tokens = e.usage
      .map((u) => `${u.model} ${u.inputTokens}+${u.outputTokens + u.thinkingTokens}`)
      .join(', ');
    console.log(
      `[r${e.round}] ${e.pool.padEnd(26)} +${e.added} -${e.dropped} $${e.costUsd.toFixed(4)} ` +
        `(total $${e.spentUsd.toFixed(2)})${e.error ? ` ERROR ${e.error}` : ''} ${tokens}`,
    );
  };

  const report = await fillBank(db, llm, models, {
    pools,
    target,
    capUsd,
    concurrency: Number(args.concurrency),
    rpm: Number(args.rpm),
    log,
  });
  appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), report })}\n`);
  console.log(
    `Done: ${report.batches} batches, ${report.added} questions added, ${report.dropped} dropped, ` +
      `fill spend $${report.spentUsd.toFixed(2)}${report.stoppedByCap ? ' (stopped by the cap)' : ''}.`,
  );
  if (report.short.length > 0) {
    console.log(
      `${report.short.length} pools below ${target}: ${report.short.slice(0, 20).join(', ')}${report.short.length > 20 ? ', …' : ''}`,
    );
  }
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
