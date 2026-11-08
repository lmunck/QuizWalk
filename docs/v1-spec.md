# QuizWalk (Qualk) — v1 specification

Status: **Draft for approval** · 2026-11-04
Design reference: [`/design`](../design/README.md), with screen IDs C1–C9, P1–P6 and G1–G6.

The aim of v1 is a small, robust app that does one loop well:

> A creator generates or writes a quiz walk and shares a code → teams walk to each stop, answer, and see the leaderboard → the creator ends the walk and results are shared.

Anything outside that loop goes in [§16 Not in v1](#16-not-in-v1). A new idea either replaces something here or goes on that list.

---

## 1. Decisions

| Area | Decision |
|---|---|
| Apps | One Expo (React Native + TypeScript) app for iOS and Android. The same app is used to create walks and to play them. |
| Web | No web app. Static pages on `qualk.dk` (Firebase Hosting) only: landing, privacy, `/play` fallback, link-verification files. |
| Backend | Firebase: Firestore, Auth, Cloud Functions (2nd gen, TypeScript), App Check. Blaze plan with a budget alert. |
| Region | Firestore and Functions in `europe-west1`. **Permanent once chosen.** |
| Identity | iOS bundle ID `com.lmunck.Qualk`, which reuses the retired App Store record and keeps the name reserved (Team `3JMZLMZVTS`). Android package `com.lmunck.qualk`. |
| Name | The store name stays flexible ("QuizWalk" preferred, "Qualk" fallback). Code and IDs use `qualk`. |
| Language | English only. |
| Maps | `react-native-maps`: Apple Maps on iOS, Google Maps on Android. Draggable pins in the editor. |
| Routing | OpenRouteService (OSM-based, `foot-walking`), called only from Cloud Functions, behind one swappable module. |
| Content | OpenStreetMap (Overpass) + Wikipedia/Wikidata → LLM via OpenRouter writes questions → second LLM pass fact-checks. |
| Locations | Firestore `GeoPoint`. No geohash: we never query by proximity. Distances are computed on the phone. |
| Cheating | Accepted risk. The full quiz, including correct answers, is downloaded to the phone for offline play. No money is involved. Points are still calculated server-side. |
| Push | `expo-notifications` + Expo Push Service. |

---

## 2. Roles and accounts

- **Creator**: signs in with Apple or Google (G1). On iOS both are shown, Apple first. On Android, Google is shown, plus Apple via the web flow if it proves cheap. Otherwise Google only.
- **Participant**: no account. Uses Firebase **anonymous auth**, one per app install. If a participant later signs in as a creator on the same phone, the anonymous account is *linked*, so nothing is lost.
- A creator can also play other people's walks. There are no separate app modes.

---

## 3. Screens in v1

Legend: **Keep** = as designed · **Change** = kept with listed changes · **Merge** / **Replace** / **Cut** · **New** = not in the design.

### Creator

| ID | Screen | v1 | Notes |
|---|---|---|---|
| C1 | Home – my walks | Keep | Sections: Live / Ready / Drafts / Finished. "Join with code" opens the join sheet (P0). Avatar opens Settings (S1). |
| C2 | Create quiz | Change | Topic, questions (4–12, default 8), walk length (1–6 km, default 3), difficulty (Kids/Mixed/Expert), start (my location or a picked point), shape **Loop** or **One-way** (one-way ends wherever the last stop falls; no end-point picker). "Write questions yourself" goes straight to C4 with an empty route. |
| C3 | Generating | Keep | Driven live by a `generationJobs` document. Four steps as designed. Adds a failure / "only found N places" state with *Continue with N stops* or *Add stops manually*. |
| C4 | Route builder | Keep | Reorder stops (drag in list), drag pins, add stop (G2), delete. "New route" = regenerate. Shows warnings ("Pin is on water", "Off path") from server snapping. Rerouting happens on save, not on every drag. |
| C5 | Edit stop | Change | Question, 2–4 answers, mark correct, radius 25/40/**60** m (**default 40**), optional hint, "New question" (AI). **No photo.** |
| C6 | Share | Change | Join code, QR, link `https://qualk.dk/play?code=K72QX`. Settings: *Play as* (Solo / Team / both), *Players per team* (max, info only). **No open/close schedule:** an optional free-text "When" line (e.g. "Sat 14:00") is shown to players only. Order is always fixed. Scoring is always *correct + speed bonus*. Primary action: **Open walk**. |
| C7 | Live monitor | Change | Map with each team's *last known* position + leaderboard. **"Message all" cut.** Adds an alerts strip for "Way blocked" reports with *Skip stop for everyone*. "End walk & score" kept. |
| C8 | Team detail | Change | Read-only: stats + per-stop results. **Both buttons cut**: skipping is done for everyone from C7; messaging is cut. |
| C9 | Results | Keep | Podium, stats. "Reuse walk" duplicates it as a new draft. "Share results" shares an image card. |
| S1 | Settings | **New** | Account, sign out, **Delete account and all data**, privacy policy link, app version. |

### Participant

| ID | Screen | v1 | Notes |
|---|---|---|---|
| P0 | Join sheet | **New** | Enter or scan a 5-character code. Also opened by tapping a `qualk.dk/play?code=…` link. |
| P1 | Join | Change | In-app (no browser/App Clip footer). Walk summary, **Solo / Team** choice (only if the creator allows both; replaces G3), team name, players on this phone, location explainer + permission request. |
| P2 | Lobby | Change | If the walk isn't open yet: "Waiting for {creator} to open the walk — we'll notify you" (replaces G4's countdown). When open: "Start walk". Shows head-to-start distance and other joined teams. Rule text uses the stop's real radius, not a hard-coded "25 m". |
| P3 | Walk to stop | Keep | Distance + direction arrow + map. Pocket mode: buzz + notification on arrival. "Simulate arrive" exists only in dev builds. |
| P4 | Question | Change | 20 s speed-bonus timer, answers, feedback with explanation and source. **No photo.** Hint shown if set. |
| P5 | Finish | Keep | Score, correct, time, distance. "Review our answers". |
| P6 | Final results | Change | In-app final leaderboard (arrives via push when the creator ends the walk) + *Share result card* (image). |

### Gap proposals

| ID | v1 | Notes |
|---|---|---|
| G1 Sign-in | Keep | See §2. |
| G2 Add stop | Keep | Long-press map or search a place, then *Suggest a question* or *Write my own*. Place search uses the platform's own geocoder via `expo-location` (no extra API). |
| G3 Solo or team | Merge into P1 | "Join a team on another phone" **cut**. |
| G4 Arrived early | Replace | Becomes the P2 waiting state; no countdown or scheduling. |
| G5 Weak GPS & offline | Keep | See §9. |
| G6 Can't reach | Keep | *I'm here* (≤150 m, no speed bonus), *Skip* (0 points), *Way blocked* (alerts creator, who can skip the stop for everyone). **The creator moving a stop live is cut.** |

### Error and empty states (new, small)

Invalid or expired code · walk already ended (read-only results) · location permission denied (explain + open Settings) · generation failed · no network during create/edit · first-run Home (empty, with "New quiz walk").

---

## 4. Game rules

**Walk lifecycle:** `draft → ready → open → ended`

| Status | Creator can | Participants can |
|---|---|---|
| draft | Edit everything | — |
| ready (published, code exists) | Edit everything | Join, wait in lobby |
| open | Skip a stop for everyone, end walk | Join, play |
| ended | View results, reuse | View results only |

- A walk that has been `open` for **12 hours** is ended automatically.
- **Order:** fixed, 1 → N. The next stop is revealed once the current one is answered or skipped.
- **Unlock:** distance ≤ effective radius, where
  `effectiveRadius = radius` if GPS accuracy ≤ radius, else `min(accuracy, max(radius, 60))` (G5).
  Fixes with accuracy worse than 100 m are ignored for unlocking.
- **I'm here:** allowed when distance ≤ 150 m. The question opens with no speed bonus.
- **Skip:** 0 points, go straight on to the next stop.
- **Scoring:**
  - Correct: 10 points.
  - Speed bonus: `ceil(5 × secondsLeft / 20)` (0–5), measured from question open to answer.
  - Wrong: 0.
  - Example: correct with 14 s left = 10 + 4.
- **Time** is measured with the phone's clock, so offline answers keep their true timing.
- **Skip for everyone:** the stop is removed from play. Any points already earned on it are voided for all teams, and scores are recalculated on the server.
- **Finished team:** all stops answered or skipped. When the walk ends, unfinished teams keep what they have.
- **Ranking:** score ↓, then correct count ↓, then finish time ↑ (unfinished teams rank after finished teams with the same score).

---

## 5. Architecture

```
 Expo app (iOS + Android)
   ├─ Firestore SDK (React Native Firebase, offline cache on) ──► Firestore
   ├─ Callable functions ───────────────────────────────────► Cloud Functions ─┬─► OpenStreetMap Overpass
   │                                                                        ├─► Wikipedia / Wikidata
   │                                                                        ├─► OpenRouteService
   │                                                                        ├─► OpenRouter (LLM)
   │                                                                        └─► Expo Push Service
   └─ expo-location + task manager (foreground + background tracking)

 qualk.dk ──► Firebase Hosting (static: landing, privacy, /play, .well-known)
```

**Repository layout** (npm workspaces):

```
app/          Expo app
functions/    Cloud Functions (bundled with esbuild so `shared/` is included on deploy)
shared/       Types, scoring rules, geo helpers — used by app and functions
hosting/      Static site for qualk.dk
firestore.rules, firestore.indexes.json, firebase.json
design/       Design reference
docs/         This spec and later docs
```

The app uses **development builds** (via EAS), not Expo Go, because background location and React Native Firebase need native modules.

---

## 6. Data model (Firestore)

```
users/{uid}
  displayName, createdAt, pushToken?

joinCodes/{code}                         // 5 chars, alphabet without 0/O/1/I/L
  walkId, createdAt

walks/{walkId}
  ownerUid, ownerName, title, topic, difficulty
  status: 'draft'|'ready'|'open'|'ended'
  joinCode?, modes: { solo: bool, team: bool }, maxPlayers, whenText?
  start: GeoPoint, startLabel, shape: 'loop'|'oneway'
  route: { polyline, distanceM, durationS } | null
  stopCount, createdAt, updatedAt, openedAt?, endedAt?

walks/{walkId}/stops/{stopId}
  order, location: GeoPoint, placeName, radiusM
  question, options: string[2..4], correctIndex, explanation, hint?
  source?: { title, url }, origin: 'ai'|'manual'
  warnings: string[]                     // 'onWater', 'offPath', 'unverified'
  skippedForAll: bool

walks/{walkId}/teams/{uid}               // team id = the participant's uid (one phone per team)
  name, mode: 'solo'|'team', players, pushToken?
  joinedAt, startedAt?, finishedAt?, lastSeenAt
  distanceWalkedM                         // written by app
  score, correctCount, stopsDone          // written by functions only

walks/{walkId}/teams/{uid}/answers/{stopId}   // doc id = stop id → max one answer per stop
  kind: 'answered'|'imHere'|'skipped', choiceIndex?
  openedAtClient, answeredAtClient, elapsedMs
  points?, correct?                       // written by functions only

walks/{walkId}/positions/{uid}           // one doc per team, overwritten, not a history
  location: GeoPoint, accuracyM, at

walks/{walkId}/alerts/{alertId}
  teamUid, stopId, kind: 'blocked', createdAt, resolved

generationJobs/{jobId}
  ownerUid, walkId, status: 'running'|'done'|'failed'
  step: 0..4, stepDetail[], latestQuestion?, error?
```

Positions live in their own collection so other teams can read the leaderboard without seeing where anyone is.

---

## 7. Security rules (outline)

Rules are covered by automated tests against the Firestore emulator in CI.

- `users/{uid}`: read/write by that user only.
- `joinCodes/{code}`: `get` for any signed-in user, no `list`, writes by functions only.
- `walks/{w}`: owner full access while `draft`/`ready`. While `open`, the owner may only change `status` to `ended`. Participants (have `teams/{auth.uid}`) can read.
- `stops`: owner writes (except while `open`/`ended`, where only `skippedForAll` may change). Participants read.
- `teams/{uid}`:
  - **create** by `auth.uid == uid` if the walk is `ready`/`open` and the chosen mode is allowed;
  - **update** by that uid, limited to `name, players, pushToken, startedAt, lastSeenAt, distanceWalkedM`;
  - **read** by the owner and every participant of the walk.
- `answers/{stopId}`: **create once** by the team uid; `stopId` must exist; client fields only; no update or delete.
- `positions/{uid}`: write by that uid; read by that uid and the walk owner.
- `alerts`: create by a participant, read/update by the owner.
- `generationJobs`: read by owner, write by functions only.

---

## 8. Cloud Functions

| Function | Type | Purpose |
|---|---|---|
| `generateWalk` | callable | Full AI pipeline (below). Rate-limited (e.g. 20/creator/day). |
| `suggestQuestion` | callable | Steps 3–4 for one place (G2, C5 "New question"). |
| `reroute` | callable | After edits: snap pins to walkable paths, compute route + distance, return warnings. |
| `publishWalk` | callable | Validate (≥1 stop, every stop has a question), allocate join code, `draft → ready`. |
| `duplicateWalk` | callable | "Reuse walk" → new draft. |
| `deleteAccount` | callable | Delete the user's walks (recursively), their participant data, and the Auth user. |
| `onAnswerCreated` | Firestore trigger | Score the answer, update team totals, set `finishedAt`. |
| `onStopUpdated` | Firestore trigger | `skippedForAll` → recalculate all team scores. |
| `onWalkStatusChanged` | Firestore trigger | `open` → push "Walk is open" to joined teams. `ended` → final ranks, push "Final results". |
| `onAlertCreated` | Firestore trigger | Push to creator: "Fjord Kids: way to stop 4 is blocked". |
| `daily` | scheduled | Auto-end walks open > 12 h; delete participant data (teams, answers, positions, alerts) 30 days after `endedAt`. |

API keys (OpenRouter, ORS) live in **Secret Manager** via Functions secrets, never in the app or repo. Callables require **App Check** (App Attest / Play Integrity).

### Generation pipeline (C3 steps)

1. **Finding places.** Overpass query around the start (radius ≈ 0.4 × walk length, max 3 km) for features with a Wikipedia/Wikidata link (historic, tourism, artwork, memorial, notable buildings). Fetch Wikipedia extracts: English, falling back to the local language.
2. **Building a walkable route.**
   - The LLM shortlists ~1.5× N places that fit the topic and difficulty and are spread out.
   - Order them: angle around the centroid for a loop, nearest-neighbour for one-way.
   - Snap each to a walkable path (ORS snap) and call ORS `foot-walking` directions.
   - If distance is outside ±30 % of the target, drop or add places and retry (max 3 tries).
3. **Writing questions.** One LLM call returns structured JSON per stop: question, 4 options, correct index, explanation, optional hint, source. Instruction: use **only** the supplied extract.
4. **Fact-checking.** A second LLM call (different model) checks each question against its source text. Failures are regenerated once; if they still fail, the stop is kept with an `unverified` warning shown in C4.

Model IDs are configuration, not code. If fewer than N good places are found, the job finishes with what it has and C3 shows the "only found N places" state.

---

## 9. Location, background and offline

**Tracking**
- **Foreground:** `expo-location` watch, high accuracy.
- **Background ("pocket mode"):** `expo-location` background updates + `expo-task-manager`.
  - **iOS:** "When In Use" permission, `location` background mode, blue status indicator.
  - **Android:** foreground service of type `location` with a persistent notification ("Guiding you to stop 4").
  - **No "Always" permission is requested on either platform.**
- **Arrival:** the background task computes distance; on unlock it fires a local notification + vibration. Tapping it opens P4.
- **Battery:** balanced accuracy, 10 m distance filter; high accuracy only within 300 m of the stop. Tracking stops when the team finishes, the walk ends, or the player leaves.

**Uploads**
- `positions/{uid}` is written at most every 30 s and only after moving ≥ 20 m.
- `distanceWalkedM` is computed on the phone (fixes with accuracy > 30 m or segments < 5 m are ignored).

**Offline**
- Joining reads all stops, so the whole quiz is in Firestore's offline cache.
- Answers written offline queue automatically and sync later.
- Banners (G5): *Weak GPS* when accuracy > stop radius; *Offline* with the count of unsynced answers.
- Map tiles are not stored offline in v1. The distance and arrow view works without them.
- Creating and editing walks requires a connection.

---

## 10. Maps

- `react-native-maps`. iOS: Apple Maps (no key). Android: Google Maps SDK (free for mobile; key restricted to the app's package and signing certificate).
- Draggable markers in C4/C5; dropping a pin triggers snapping on save.
- Route drawn as a polyline from ORS.
- Attribution "© OpenStreetMap contributors · openrouteservice" shown in C4 and in Settings.

---

## 11. Notifications

| Who | When |
|---|---|
| Participants | Walk opened · final results ready |
| Creator | Way-blocked alert · (optional) all teams finished |
| Local, participant | Arrived at stop |

Push permission is requested at P1 (join), with one sentence explaining why.

---

## 12. Hosting — qualk.dk

All files live in `hosting/` and deploy with the rest of the project.

| Path | Content |
|---|---|
| `/` | Simple landing page with store badges |
| `/privacy` | New Qualk privacy policy (§13) |
| `/play?code=XXXXX` | Opens the app if installed. Otherwise shows the code + App Store / Google Play buttons. |
| `/.well-known/apple-app-site-association` | appID `3JMZLMZVTS.com.lmunck.Qualk`, path `/play*`. Served as `application/json`. |
| `/.well-known/assetlinks.json` | `com.lmunck.qualk` + SHA-256 fingerprints (upload key and Play App Signing key) |

CI validates both `.well-known` files as JSON before deploying.

**Migration (one-time, in M0):**
1. Add the custom domain in Firebase Hosting.
2. At simply.com DNS, add the TXT record and switch the A records for `qualk.dk` and `www` (MX untouched).
3. Wait for the certificate.
4. Retire the WordPress site.

On nulkommafire.com, the "Qualk" line of the shared privacy page links to `qualk.dk/privacy` (M5).

---

## 13. Privacy and compliance

| Data | Why | Who sees it | Kept |
|---|---|---|---|
| Creator Apple/Google ID, display name | Sign in, show "Anders invited you" | Players of their walks | Until account deletion |
| Walks, stops, questions | Core content | Creator; players of that walk | Until the creator deletes them |
| Participant anonymous ID, team name, players | Playing | Creator + players of that walk | 30 days after walk ends |
| Participant location (last known only) | Monitor map, distance walked | Creator of that walk only | 30 days after walk ends |
| Answers and timing | Scoring | Creator; own team | 30 days after walk ends |
| Push token | Notifications | Nobody (system) | With the team/user record |

- Location is only collected **during an active walk**.
- Participant locations never leave Firebase. ORS only receives stop coordinates; the LLM only receives topic and place information.
- **In-app deletion:** creators: S1 "Delete account and all data". Participants: "Delete my data" in S1 (removes their teams/answers/positions).
- No ads, no analytics SDKs, no tracking. This is declared accordingly in Apple privacy labels and the Play Data safety form.
- Not aimed at children as account holders. Children play as part of a team on an adult's phone. The app is not submitted to Apple's Kids category.
- App review notes explain why background location is used: "unlocks questions at stops while the phone is in a pocket".

---

## 14. Design system (from the design files)

| Token | Value |
|---|---|
| Accent | `#1F6F4A` (pressed `#14502F`) |
| Ink / secondary / muted | `#16211B` / `#4A5A50` / `#6B7A71` |
| Background / surface | `#F4F6F1` / `#FFFFFF` |
| Border | `#C9D2C4` |
| Success fill | `#E2F0E7` |
| Error / error text / error fill | `#B4471B` / `#93391A` / `#FBF1EB` |
| Team colours | `#1D4ED8`, `#7C3AED`, `#B4471B`, `#16211B` (+4 more chosen at build time) |
| Type | Space Grotesk 500/700 (headings, numbers) · Inter 400/500/600 (body) |
| Touch targets | ≥ 48 pt |

Accessibility in v1: Dynamic Type / font scaling, screen-reader labels on all controls, right/wrong feedback shown with text and icon (not only colour). Light mode only (§16).

---

## 15. Cost estimate (low usage: ~50 walks/month, ~10 teams each)

| Item | Expected |
|---|---|
| Firestore, Functions, Hosting | Within free quotas |
| LLM (OpenRouter) | A few cents per generated walk → < $5/month |
| OpenRouteService | Free plan (2,000 routes/day) |
| Maps (Apple, Google mobile SDK) | Free |
| Expo EAS | Free tier (limited monthly builds); paid plan optional |
| Apple Developer / Google Play | $99/year (existing) / $25 once |

Set a Google Cloud budget alert at **$10/month**.

---

## 16. Not in v1

- Teams on several phones (G3 "join a team")
- Scheduled opening, countdown (G4), open/close windows
- Creator moving stops during a live walk
- Messaging (message all / message team)
- Photos per stop
- Web play, App Clip, Android Instant
- Staggered team starts, free stop order, alternative scoring
- Question types other than 2–4-option multiple choice
- Languages other than English
- Offline map tiles
- Public walk discovery / "walks near me"
- A participant's history across walks
- Dark mode
- Anti-cheat beyond server-side scoring
- Analytics

---

## 17. Milestones

Each milestone ends with a build you can install and test on your phone.

| # | Milestone | Done when |
|---|---|---|
| M0 | **Foundations** | Repo scaffold, Firebase project (EU), CI (typecheck, lint, unit tests, rules tests), EAS dev builds on your iPhone + an Android device, qualk.dk on Firebase Hosting with both link files. |
| M1 | **Manual walk, end to end** | Sign in, create a walk by hand (add stops on the map, write questions), publish, join by code and link, walk with location unlock (foreground), answer, scoring, finish, leaderboard. |
| M2 | **Creator live tools** | Open/end walk, live monitor, team detail, push notifications, way-blocked alerts, skip for everyone, results + share card, reuse walk. |
| M3 | **Out in the real world** | Pocket mode (background), offline answers, weak-GPS widening, Can't reach (G6), battery tuning. Field test on a real walk. |
| M4 | **AI generation** | Generation pipeline, C3 Generating, suggest/new question, regenerate route, failure states. |
| M5 | **Release** | Privacy page, account/data deletion, store listings and privacy labels, TestFlight + Play internal testing, then release. |

AI comes after the core game on purpose: the game must work without it. The data model includes AI fields from day one, so it is not bolted on.

---

## 18. Your manual tasks

These need your accounts or consoles. Each will be walked through step by step when its milestone arrives.

- [x] **M0** Create a Firebase project in `europe-west1`, upgrade to Blaze, set a $10 budget alert (project ID `qualk-a173e`; Firestore, Auth with Anonymous/Google/Apple and Hosting enabled)
- [x] **M0** Create an Expo account and give the project access (account `lmunck`, personal; access token saved)
- [x] **M0** App Store Connect: confirm the old `com.lmunck.Qualk` record exists; create an API key for EAS Submit
- [ ] **M0** Google Play Console: account ($25) + app `com.lmunck.qualk` (personal account created; blocked on Android device verification, so the 12-tester / 14-day closed test applies before release)
- [ ] **M0** DNS change at simply.com for qualk.dk (`qualk.dk` added in Firebase Hosting; `www` pending confirmation)
- [ ] **M1** Google Maps Android API key (same Google Cloud project)
- [ ] **M4** OpenRouteService API key and OpenRouter API key → stored as Firebase secrets (never pasted into chat or the repo)
- [ ] **M5** Update the Qualk line on nulkommafire.com's privacy page; update privacy/support/marketing URLs in App Store Connect

---

## 19. Risks and open points

| Risk | Mitigation |
|---|---|
| Thin OSM/Wikipedia coverage outside cities | "Only found N places" state; manual stops are always possible |
| ORS free plan: commercial use not explicitly stated; possible endpoint changes | Routing behind one module; revisit before any commercial launch (self-host or paid alternative) |
| App review friction for background location | Clear permission copy, "When In Use" only, review notes |
| English questions from Danish sources | Fact-check pass; creator reviews in C4 before publishing |
| GPS in dense streets | Default radius 40 m, automatic widening, "I'm here" fallback |
