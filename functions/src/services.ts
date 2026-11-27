/**
 * Everything the generation functions talk to, passed in so the tests can swap each one for
 * recorded responses or a fake.
 */
import type { Rng } from '@qualk/shared';
import type { Firestore } from 'firebase-admin/firestore';

import type { Llm, Models } from './llm/llm';
import type { Overpass } from './places/overpass';
import type { Wiki } from './places/wiki';
import type { WalkingRouter } from './routing/router';

export interface Services {
  db: Firestore;
  /** Missing when GEMINI_API_KEY isn't available: no new Local questions are written. */
  llm?: Llm;
  models: Models;
  overpass: Overpass;
  wiki: Wiki;
  router?: WalkingRouter;
  rng: Rng;
  now: () => number;
}
