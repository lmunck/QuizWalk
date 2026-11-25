# User testing guide

Written 2026-11-25 with the M1 build (playing and making walks, plus the live monitor from M2).
Two ways to run it: on the Mac's iPhone simulator against local Firebase emulators (works
today, no accounts), and on your phones against the real Firebase project (needs the one-time
setup in part 2).

---

## 1. On the Mac, today (simulator + emulators)

Everything below runs locally. Nothing touches the real Firebase project.

```bash
npm install
```

```bash
npm run build -w functions && npx firebase emulators:start --only auth,firestore,functions --project demo-qualk
```

In a second terminal:

```bash
cd app && QUALK_EMULATORS=1 npx expo run:ios
```

The first `run:ios` compiles the native app (15–25 minutes); after that `cd app && QUALK_EMULATORS=1 npx expo start --dev-client` is enough. On this Mac, port 8081 was taken, so use `--port 8082` if Metro complains.

A seeded walk to play, in a third terminal (prints a join code):

```bash
node scripts/seed-walk.mjs --status open
```

Useful extras:

| Command | What it does |
|---|---|
| `xcrun simctl location booted set 55.67985,12.59060` | Puts the simulator at the seeded walk's start (Nyhavn) |
| `node scripts/seed-walk.mjs --at <lat>,<lng> --stops 6 --status ready` | A walk around any point, waiting to be opened |
| `node scripts/seed-walk.mjs --code <CODE> --status ended` | Ends that walk (players see final results) |
| `node scripts/seed-walk.mjs --code <CODE> --team "Harbour Hawks" --answered 2 --blocked` | A pretend team on the walk, for trying the live monitor alone |

In the simulator build:

- **Sign in as test creator** replaces Apple and Google (the Auth emulator accepts a test
  account; real sign-in needs the real config).
- **Simulate arrive** on the walk screen stands you at the stop.
- The Android emulator works too, after `adb reverse tcp:9099 tcp:9099`, the same for `8080` and
  `5001`, then `QUALK_EMULATORS=1 npx expo run:android` (needs Android Studio, not installed on
  this Mac).

---

## 2. On your phones (one-time setup)

The app switches from the emulators to the real project as soon as both Firebase config files
are in `app/` (see `app/app.config.ts`). The steps, in order. **I** marks steps I can run for you
from here once you say yes; **You** marks steps that need your consoles.

### A. Register the apps in Firebase — I (or you)

```bash
sh scripts/firebase-apps.sh
```

This registers `com.lmunck.Qualk` (iOS) and `com.lmunck.qualk` (Android) in `qualk-a173e` and
writes `app/GoogleService-Info.plist` and `app/google-services.json`. They hold no secrets and are
committed.

### B. Android signing fingerprint for Google sign-in — You

1. Open [expo.dev](https://expo.dev) → project **qualk** → **Credentials** → **Android** →
   `com.lmunck.qualk` → the keystore. Copy the **SHA-1** fingerprint (it looks like
   `AA:BB:CC:…`, 20 pairs).
2. Run, pasting it in:

   ```bash
   SHA1=AA:BB:… sh scripts/firebase-apps.sh
   ```

   That adds it to the Firebase Android app and downloads a `google-services.json` that now
   carries the Google sign-in client.

Without this, Google sign-in on Android fails with "developer error"; everything else works.

### C. Google Maps key for Android — You

The iPhone uses Apple Maps and needs nothing. Android uses Google Maps:

1. [Google Cloud console](https://console.cloud.google.com/) → project **qualk-a173e** →
   **APIs & Services → Library** → enable **Maps SDK for Android**.
2. **APIs & Services → Credentials → Create credentials → API key**. Under **Application
   restrictions** choose **Android apps** and add package `com.lmunck.qualk` with the SHA-1 from
   step B. Under **API restrictions** pick **Maps SDK for Android**.
3. Store it in EAS so builds get it:

   ```bash
   cd app && npx eas-cli@latest env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <key> --environment development --environment preview --environment production --visibility sensitive
   ```

Without the key the Android app still works; the maps show a placeholder.

### D. Deploy rules, indexes and functions — I (or you)

```bash
npx firebase deploy --only firestore:rules,firestore:indexes,functions --project qualk-a173e
```

The first functions deploy enables a few Google Cloud APIs (Cloud Functions, Cloud Build,
Artifact Registry, Eventarc, Cloud Run, Cloud Scheduler) and takes 5–10 minutes. On the Blaze
plan this stays inside the free quotas at test volumes.

### E. App Check for the test period — You decide

The functions enforce App Check (spec §8), which needs App Attest on iPhone and Play Integrity
on Android. Play Integrity needs the app in the Play Console, which is still an open task
(spec §18). Two ways through the test period:

- **Recommended for the first tests:** set `ENFORCE_APP_CHECK=false` in `functions/.env`
  and deploy (step D). Test builds use the App Check debug provider, so nothing breaks, and
  enforcement goes back on once Play Integrity exists. Firestore itself is not App Check
  enforced until M5 in any case.
- **Keep enforcement on:** in the Firebase console → **App Check** → each app → **Manage debug
  tokens** → add a token (any UUID). Put the same UUID in `app/.env.local` as
  `EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN=<uuid>` for dev builds, and as an EAS environment variable
  for preview builds.

### F. Build and install — I (or you)

Two kinds of build:

| Profile | For | Install |
|---|---|---|
| `development` | You, with the Mac's dev server (fast changes) | As in M0 |
| `preview` | Testers: standalone, no dev server | iPhone: link from EAS (only registered UDIDs). Android: APK link |

```bash
cd app && npx eas-cli@latest build --profile preview --platform all
```

Each takes 30–45 minutes the first time. Every native module the plan needs is already in, so
later changes are JavaScript only: the development build keeps working with the dev server,
and testers' `preview` builds are made again to pick up a new version (over-the-air updates
are not set up).

**Installing the Android preview build** (first Android phone):

1. Open the build link from EAS on the Android phone (or scan the QR on the build page).
2. Tap **Download**, then open the `.apk` from the notification.
3. Android asks to allow installs from this source (Chrome or Files): tap **Settings**, switch
   on **Allow from this source**, go back, tap **Install**.
4. Open QuizWalk. Allow location **While using the app**, and keep **Precise** on.

**Adding a tester's iPhone** needs its UDID in the provisioning profile:
`npx eas-cli@latest device:create`, send them the link, then rebuild the iOS preview.

### G. Join links

`https://qualk.dk/play?code=…` opens the app directly on Android builds signed with the EAS key
(its SHA-256 is already in `hosting/.well-known/assetlinks.json`) and on iOS builds with the
associated domain. On a phone without the app it shows the code on the web page.

---

## 3. What to ask testers to do

Hand over a code, say nothing else, and watch. Note every hesitation.

**Players (two phones, one walk):**

1. Join with the code (and once by tapping the link).
2. Pick team or solo, name the team, allow location.
3. Wait in the lobby until the walk opens; tap Start walk.
4. Walk to each stop. When the question opens, gather round, tap Show question, answer.
5. At one stop, open **Can't reach it** and try **I'm here** or **Skip**.
6. Put one phone in airplane mode for a stop, answer, switch back. Does the score catch up?
7. Force-quit the app mid-walk, reopen, continue from Home.
8. Finish, look at the standings, wait for the final results.

**Creator:**

1. Create a walk by hand with 3–5 stops: long-press the map, search a place, or Add stop here.
2. Write questions; try Preview; publish; share the invite.
3. Open the walk (Today), watch the monitor, end the walk, read the results.

**Write down:** stops that unlocked early, late or never (and the GPS accuracy the walk screen
showed), anything that read wrongly, battery use over the walk, and anything the tester asked
about.

---

## 4. Known limits in this build

| Limit | Why | When |
|---|---|---|
| The screen must stay on while walking; no buzz in a pocket | Pocket mode is M3 and depends on the background-location spike (spec §9) | M3 |
| Routes are straight lines between pins, "as the crow flies" | Walking routes need the OpenRouteService key | M4 |
| No AI-generated walks | M4 | M4 |
| Push notifications are written but untested | Needs the push credentials (spec §18, M2) and a real phone | M2 |
| Result share is text, not an image card | Image cards are M2 | M2 |
| No account deletion or privacy page | M5 | M5 |
| Reorder stops with Move up / Move down only (no drag handle yet) | Kept simple and accessible for the first test | Later |
