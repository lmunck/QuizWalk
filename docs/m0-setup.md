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

Done: the Expo project is linked. `npx eas-cli@latest init` created `@lmunck/qualk`, and its project ID is in `app/app.config.ts` as `extra.eas.projectId` (it is not secret).

Done: the Android side. The first development build (2026-11-21) created the cloud keystore, installed on the test phone, and loaded a bundle from the dev server. Its upload-key SHA-256 is in `hosting/.well-known/assetlinks.json`, and hosting plus the Firestore rules are deployed — `qualk.dk` and `www.qualk.dk` both serve from Firebase with valid certificates.

1. **Register your iPhone** for internal builds: `npx eas-cli@latest device:create`.
2. **First iOS development build:** `npx eas-cli@latest build --profile development --platform ios`. EAS creates the signing credentials.
3. **Play App Signing fingerprint:** once the Play app exists, its SHA-256 joins the upload key's in `hosting/.well-known/assetlinks.json`. Until then only directly installed builds verify App Links; Play-installed ones fall back to the web page.

A note for step 3: `keytool -printcert -jarfile` cannot read an EAS APK, because EAS signs with APK signature scheme v2/v3 only and there is no `META-INF` v1 signature. Take the fingerprint from the Play Console (App signing) or from `npx eas-cli@latest credentials`.

### Repeating the builds

```bash
npx eas-cli@latest build --profile development --platform android
```

```bash
npm start -w @qualk/app
```

The phone needs to be on the same network as the Mac, or on the same tailnet with `REACT_NATIVE_PACKAGER_HOSTNAME` set to the Mac's Tailscale address.

## Not in M0

- React Native Firebase is added in M1. It needs the Firebase iOS and Android app registrations (`GoogleService-Info.plist`, `google-services.json`), which are a manual step to be added to §18.
- The privacy page (`/privacy`) is M5.
