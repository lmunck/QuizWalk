import { setGlobalOptions } from 'firebase-functions/v2';

// Firestore lives in europe-west1 and functions run next to it (docs/v1-spec.md §1).
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

// Functions arrive from M1 onwards (docs/v1-spec.md §8). Import rules and types from
// '@qualk/shared'; esbuild inlines that package at build time.
