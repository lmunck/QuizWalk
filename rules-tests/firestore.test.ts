import { readFileSync } from 'node:fs';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

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

// M0 baseline: everything is locked. M1 replaces this with the per-collection rules in
// docs/v1-spec.md §7, and each rule gets its own allow and deny tests here.
describe('M0 locked-down rules', () => {
  it('denies reads and writes to signed-out users', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'walks/w1')));
    await assertFails(setDoc(doc(db, 'walks/w1'), { title: 'x' }));
  });

  it('denies a signed-in user access to their own user doc', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(db, 'users/alice')));
    await assertFails(setDoc(doc(db, 'users/alice'), { displayName: 'Alice' }));
  });

  it('denies writes to function-only collections', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'joinCodes/K72QX'), { walkId: 'w1' }));
    await assertFails(setDoc(doc(db, 'generationJobs/j1'), { ownerUid: 'alice' }));
  });
});
