import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // One emulator is shared by all tests, so run files one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
