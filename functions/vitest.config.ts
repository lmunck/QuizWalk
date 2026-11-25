import { defineConfig } from 'vitest/config';

// `npm test` runs the plain unit tests; `npm run test:emulator` (from `npm run test:functions`
// at the repo root, which starts the Firestore emulator) runs *.emulator.test.ts.
const emulator = process.env.QUALK_EMULATOR_TESTS === '1';

export default defineConfig({
  test: {
    include: emulator ? ['src/**/*.emulator.test.ts'] : ['src/**/*.test.ts'],
    exclude: emulator ? [] : ['src/**/*.emulator.test.ts', 'node_modules/**'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
