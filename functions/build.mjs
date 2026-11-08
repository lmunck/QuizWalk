// Bundles src/ into lib/index.js. Workspace code such as @qualk/shared is inlined, so the
// deployed package only needs the npm dependencies listed in package.json.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  // Installed by Cloud Build from package.json, so keep them out of the bundle.
  external: ['firebase-admin', 'firebase-functions'],
});
