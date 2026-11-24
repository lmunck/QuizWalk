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

Done: the development builds, both on 2026-11-21.

- **Android.** EAS generated the cloud keystore, the APK installed from the build QR, and the app loads bundles from the dev server. The upload key's SHA-256 is in `hosting/.well-known/assetlinks.json`.
- **iOS.** `device:create` registered the iPhone by UDID, and EAS created the distribution certificate and the ad hoc profile `*[expo] com.lmunck.Qualk AdHoc`, both valid until 2027-11-21. Adding another iPhone or iPad means registering it and rebuilding, because the UDIDs are baked into the profile.
- Hosting and the Firestore rules are deployed. `qualk.dk` and `www.qualk.dk` both serve from Firebase with valid certificates.

What is left of M0 is in the consoles, not the repo:

1. **Google Play Console**: the account and the app entry for `com.lmunck.qualk` (§18).
2. **Play App Signing fingerprint:** once the Play app exists, its SHA-256 joins the upload key's in `hosting/.well-known/assetlinks.json`. Until then only directly installed builds verify App Links; Play-installed ones fall back to the web page.

A note for step 2: `keytool -printcert -jarfile` cannot read an EAS APK, because EAS signs with APK signature scheme v2/v3 only and there is no `META-INF` v1 signature. Take the fingerprint from the Play Console (App signing) or from `npx eas-cli@latest credentials`.

### Running a build again

```bash
npx eas-cli@latest build --profile development --platform android
```

```bash
npx eas-cli@latest build --profile development --platform ios
```

```bash
npm start -w @qualk/app
```

A first build compiles the native modules for four Android ABIs and takes 30–45 minutes; later ones reuse the cache.

### Reaching the dev server from a phone

On the same Wi-Fi, the `http://<mac-lan-ip>:8081` that the dev server prints works for both phones.

Over Tailscale — which is what the M3 field test needs, with the phone on mobile data — iOS refuses `http://100.x.y.z:8081`. App Transport Security exempts the private ranges but not the CGNAT range Tailscale uses, so the dev client rejects the URL. Serve Metro under the tailnet's HTTPS name instead, which has a real certificate:

```bash
tailscale serve --bg --https 8081 http://127.0.0.1:8081
```

Both phones then use `https://<machine>.<tailnet>.ts.net:8081`. It has to be port 8081: the dev client replaces any other port with Metro's default. Remove it again with `tailscale serve --https=8081 off`.

### Sign In with Apple is currently disabled

Every iOS build syncs the bundle ID's capabilities from the app config, and today's reported `Disabled: Sign In with Apple`. §2 requires Apple sign-in for creators, so M1 has to enable it in `app/app.config.ts` (`ios.usesAppleSignIn`, with `expo-apple-authentication`). Enabling it by hand in the Developer Portal would not hold: the next build would switch it off again.

## Not in M0

- React Native Firebase is added in M1. It needs the Firebase iOS and Android app registrations (`GoogleService-Info.plist`, `google-services.json`), now tracked in §18 along with the SHA-1, App Check and Maps-key steps. The M1 architecture is in [`m1-design.md`](m1-design.md).
- The privacy page (`/privacy`) is M5.
