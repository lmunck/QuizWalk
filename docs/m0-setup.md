# M0 setup: what is in the repo and what is left

This covers the M0 scaffold (docs/v1-spec.md §17). The manual account tasks are tracked in §18.

## In the repo

| Path | What |
|---|---|
| `app/` | Expo SDK 58 app with Expo Router (`src/app/`), development-client builds, iOS bundle ID `com.lmunck.Qualk`, Android package `com.lmunck.qualk`, link handling for `https://qualk.dk/play`. |
| `shared/` | `@qualk/shared`: data-model types (§6), game rules (§4), geo helpers (§9), join codes. Unit tested. |
| `functions/` | Cloud Functions skeleton, region `europe-west1`, bundled with esbuild so `shared/` is included. No functions yet (M1). |
| `firestore.rules` | Locked down (deny all) until the M1 rules land. |
| `rules-tests/` | Security rules tests run against the Firestore emulator. |
| `hosting/` | qualk.dk: landing page, `/play` fallback, `.well-known` link files. |
| `.github/workflows/ci.yml` | Format, typecheck, lint, unit tests, link-file validation, functions build, rules tests, app bundle for both platforms. |

## Commands (from the repo root)

```bash
npm install
```

```bash
npm run typecheck && npm run lint && npm test
```

```bash
npm run test:rules
```

The rules tests need Java 21 or newer for the Firestore emulator.

## Remaining M0 steps

These need your accounts. Each one will be walked through step by step.

1. **Link the Expo project.** In `app/`, run `npx eas-cli@latest init`. It creates the `@lmunck/qualk` project and prints a project ID. The ID goes into `app/app.config.ts` as `extra.eas.projectId` (it is not secret).
2. **Register your iPhone** for internal builds: `npx eas-cli@latest device:create`.
3. **First development builds:** `npx eas-cli@latest build --profile development --platform ios` (and `--platform android` once there is an Android device). EAS creates the signing credentials.
4. **Android link fingerprints:** after the first Android build, the upload key's SHA-256 goes into `hosting/.well-known/assetlinks.json`. The Play App Signing key's SHA-256 is added once the Play app exists. Until then, Android join links open the web fallback page.
5. **Deploy hosting and rules** from your Mac: `npx firebase-tools login`, then `npx firebase-tools deploy --only hosting,firestore`.

## Not in M0

- React Native Firebase is added in M1. It needs the Firebase iOS and Android app registrations (`GoogleService-Info.plist`, `google-services.json`), which are a manual step to be added to §18.
- The privacy page (`/privacy`) is M5.
