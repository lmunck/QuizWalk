#!/usr/bin/env -S npx tsx
/**
 * Imports the Claude-written seed bank (decided 2026-11-28) from
 * content/question-bank/<category>/<subcategory>.json into questionBank. The files' ids are
 * the document ids, so it can be run again: a re-import updates the text and keeps the stats,
 * `rand` and status. Duplicates of questions already in the bank are skipped. The mapping from
 * the files' categories onto the live taxonomy is in functions/src/bank/importBank.ts.
 *
 *   npx tsx scripts/import-question-bank.ts --dry-run                       # emulator, report only
 *   npx tsx scripts/import-question-bank.ts                                 # emulator
 *   npx tsx scripts/import-question-bank.ts --project qualk-a173e --dry-run
 *   npx tsx scripts/import-question-bank.ts --project qualk-a173e
 *
 * Options: --dir <folder, default content/question-bank>  --batch <seedBatch, default
 *          claude-2026-11-27>  --project <id>  --dry-run
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { importBank, type ImportFile } from '../functions/src/bank/importBank';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const { values: args } = parseArgs({
  options: {
    dir: { type: 'string', default: 'content/question-bank' },
    batch: { type: 'string', default: 'claude-2026-11-27' },
    project: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

/** Every .json file under the folder, sorted, as path and parsed contents. */
function readBankFiles(dir: string): { path: string; data: ImportFile }[] {
  const out: { path: string; data: ImportFile }[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.json')) {
        out.push({ path: relative(dir, p), data: JSON.parse(readFileSync(p, 'utf8')) });
      }
    }
  };
  walk(dir);
  return out;
}

async function useCliLogin(): Promise<void> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;
  const require = createRequire(join(root, 'package.json'));
  const auth = require('firebase-tools/lib/auth.js');
  const creds = require('firebase-tools/lib/defaultCredentials.js');
  const account = auth.getGlobalDefaultAccount();
  if (!account) throw new Error('Sign in with `npx firebase login` first.');
  process.env.GOOGLE_APPLICATION_CREDENTIALS = await creds.getCredentialPathAsync(account);
}

async function main() {
  const dir = join(root, args.dir as string);
  const files = readBankFiles(dir);
  if (args.project) {
    await useCliLogin();
    console.log(`Real project ${args.project}`);
  } else {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    console.log(`Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
  }
  initializeApp({ projectId: args.project ?? 'demo-qualk' });
  const report = await importBank(getFirestore(), files, {
    dryRun: args['dry-run'] as boolean,
    seedBatch: args.batch as string,
  });
  console.log(
    `${args['dry-run'] ? 'Dry run: would import' : 'Imported'} from ${report.files} files: ` +
      `${report.questions} questions, ${report.inserted} new, ${report.updated} updated.`,
  );
  const skipped = Object.entries(report.skipped);
  console.log(
    skipped.length === 0
      ? 'Nothing skipped.'
      : `Skipped: ${skipped.map(([r, n]) => `${n} ${r}`).join(', ')}.`,
  );
  for (const e of report.examples) console.log(`  ${e}`);
  console.log('Per pool:');
  for (const [pool, n] of Object.entries(report.perPool).sort()) console.log(`  ${pool}: ${n}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
