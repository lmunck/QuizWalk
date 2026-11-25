# QuizWalk (Qualk) — v1 specification

Status: **Draft for approval** · 2026-11-04 · UX review folded in 2026-11-24 (§3, §4, §9, §11, §14) · design review 2026-11-25 (§4, §6–§9, §17)
Build order: [`implementation-plan.md`](implementation-plan.md) · Design reference: [`/design`](../design/README.md), with screen IDs C1–C9, P1–P6 and G1–G6. The mockups were not redrawn after the UX review; where a mockup and §3 disagree, §3 wins.

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
- **The creator's name** is what players see ("Waiting for Anders"). Apple hands over a name only on the very first sign-in and sometimes not at all, so the first sign-in ends with one field, *Your name, as players see it*, prefilled when a name came through. It can be changed in Settings.
- **Signing in never costs a player their walk.** If this phone has a walk in progress and the Apple/Google account already exists (so the two cannot be merged), sign-in is refused with "Finish or leave your walk first". Signing out while a walk is in progress warns that the walk will be lost on this phone.
- **First run:** a join link or scanned QR goes straight to P1, with no welcome screen and no sign-in. Otherwise the Welcome screen (G1) offers two equal choices, *Join a walk* and *Create a walk*.
- **Sign-in is asked for only when someone first taps *Create a walk* / *New quiz walk*.** Nobody who only wants to play ever sees a sign-in button as the main action.

---

## 3. Screens in v1

Legend: **Keep** = as designed · **Change** = kept with listed changes · **Merge** / **Replace** / **Cut** · **New** = not in the design.

### Creator

| ID | Screen | v1 | Notes |
|---|---|---|---|
| C1 | Home – my walks | Change | Sections: **Playing** (walks joined on this phone, always first) / Live / Ready / Drafts / Finished. Tapping a card goes where the walk is: Playing → the player's current screen, Live → C7, Ready → C6, Draft → C4, Finished → C9. Ready cards show the join code and how many teams have joined. Live and Playing cards of a week-long walk show "Open until Sun 29 Nov". Each of the creator's cards has a ⋯ menu: *Duplicate*, *Delete* (confirm; not offered while open). "Join with code" opens the join sheet (P0). Avatar opens Settings (S1). For someone who has not signed in, Home shows Playing plus the two actions *Join with code* and *New quiz walk*. |
| C2 | Create quiz | Change | Starts with a choice of two equal options, **Generate for me** and **Build it myself** (the mockup's small "write questions yourself" link undersells the manual path; until M4 only the manual path exists and the choice is hidden). *Build it myself* asks only for a title, then goes to C4 with an empty route and a **Start** pin at the creator's location. The Start pin is where teams meet; it is dragged like any other pin. *Generate* asks for topic (optional, with example chips), questions (stepper, 4–12, default 8), walk length (stepper, 1–6 km, default 3), difficulty (Kids/Mixed/Expert), start (my location or a picked point), shape **Loop** or **One-way** (one-way ends wherever the last stop falls; no end-point picker). A live line sums it up: "8 stops · ~3 km · about 55 min" (§4 time estimate). |
| C3 | Generating | Change | Driven live by a `generationJobs` document. Four steps as designed. Can be left: generation continues and the draft shows "Generating…" on Home. Adds a failure / "only found N places" state with *Continue with N stops* or *Add stops manually*. Done state: *Review route & questions* (primary) and ***Play it myself — no spoilers***, which publishes, opens and joins in one step without showing the questions (for a creator who wants to play their own generated walk; offered only when nothing blocks publishing). |
| C4 | Route builder | Change | Reorder stops (drag in list), drag pins, add stop (G2), delete. The sheet has three heights (peek / half / full) so a 12-stop list can be reordered. **Tap a row = edit (C5); drag its handle = reorder.** Tapping a pin selects its row, and the reverse. The title is edited in the sheet header. Rows mark *blocking problems* (no question, fewer than 2 answers, no correct answer) in the error style and *warnings* ("Pin is on water", "Off path", "Check this answer" for `unverified`) in a quieter style. *Publish & share* is always tappable and lists what blocks it. "New route" (= regenerate) appears only on generated walks and confirms, naming what is lost. **Preview** steps through the questions as players will see them, with no location and nothing saved. Rerouting happens on save, not on every drag. |
| C5 | Edit stop | Change | Scrolls. Place name, question, 2–4 answers, explanation (optional; shown after answering), hint (optional; shown on arrival, before the question), radius 25/40/**60** m (**default 40**) with a one-line helper ("Bigger is easier to trigger in tight streets"). **Answers are rows**: a text field with a "correct" radio, plus add/remove. This replaces the mockup's tap-to-mark grid, which leaves no way to edit the text and is too narrow for real answers. **Pin:** tapping the mini map opens a full-screen *Move pin* where the map moves under a fixed crosshair, with *Use my location*. "New question" (AI) shows its suggestion to accept or discard and never overwrites silently. Cancel with unsaved changes asks first. *Delete stop* sits at the bottom of the scroll and confirms. **No photo.** |
| C6 | Share | Change | Join code, QR, link `https://qualk.dk/play?code=K72QX`. The code is shown as `K72QX`, without the mockup's separator dot. Settings: *Play as* (Solo / Team / both), *Players per team* (max, info only), and an optional free-text "When" line (e.g. "Sat 14:00") shown to players only. **No open/close schedule.** The mockup's *Order* and *Score* rows are removed: both are fixed, so they are not settings. A live list shows the teams that have joined. Primary action: **Share invite** (system share sheet with a ready-made message). **Open walk** is a separate button with a confirm, because opening cannot be undone and creators publish days ahead. The confirm asks how long the walk stays open: **Today** ("Everyone walks at the same time. Ends by itself after 12 hours.", the default) or **This week** ("Teams walk when it suits them. Ends by itself on Sun 29 Nov.", 7 days). The choice cannot be changed once the walk is open; the creator can still end it early. *Open walk* checks the walk again (it may have been edited since publishing) and lists what blocks it, as Publish does. Once open, C6 is replaced by C7. Until C7 ships (M2), the open state of C6 lists the teams with their scores and has an *End walk* button with the same confirm. |
| C7 | Live monitor | Change | Map with each team's *last known* position + leaderboard, in a sheet with the same three heights as C4. Teams not heard from for 2 minutes are dimmed and labelled "seen 6 min ago". An *Invite* pill shows the join code for late-comers. **"Message all" cut.** Adds an alerts strip for "Way blocked" reports with *Skip stop for everyone*. *End walk* is a secondary button, not the accent one, and its confirm says how many teams are still walking. When every team that started has finished or left, a banner offers *End walk & show results* (not in a week-long walk, where more teams may still join). In a week-long walk the header shows "Open until Sun 29 Nov", and teams that have not walked today are listed under the leaderboard without a map pin instead of as stale pins. |
| C8 | Team detail | Change | Read-only: stats + per-stop results. **Both buttons cut**: skipping is done for everyone from C7; messaging is cut. |
| C9 | Results | Keep | Podium, stats. Tapping a team opens C8. "Reuse walk" duplicates it as a new draft. "Share results" shares an image card. |
| S1 | Settings | **New** | Account, sign out, **Delete account and all data**, privacy policy link, app version. |

### Participant

| ID | Screen | v1 | Notes |
|---|---|---|---|
| P0 | Join sheet | **New** | Enter a 5-character code. A QR is scanned with the phone's own camera, which opens the link; there is no in-app scanner (§16), so the app never asks for the camera. Input upper-cases, ignores spaces and submits on the fifth character. Also opened by tapping a `qualk.dk/play?code=…` link. Entering the code of a walk already joined on this phone resumes it instead of joining again. |
| P1 | Join | Change | In-app (no browser/App Clip footer). Walk summary with the time estimate and, when the last stop is more than 300 m from the start, "Ends 2.1 km from the start" (worked out from the pins, so it is right for hand-built walks too). A week-long walk that is open also shows "Open until Sun 29 Nov. Walk it when it suits you." **Solo / Team** choice (only if the creator allows both; replaces G3). Team name, prefilled with a suggested name (solo: "Your name"); a name another team already has is flagged before joining. Players on this phone. Location explainer + permission request; the button reads *Allow location & join* only while permission is still needed, otherwise *Join*. **Notification permission is not asked here** (§11). |
| P2 | Lobby | Change | If the walk isn't open yet: "Waiting for {creator} to open the walk" with a *Notify me when it opens* row (replaces G4's countdown). When open: "Start walk" (a week-long walk adds "Open until Sun 29 Nov"; a team that joins it gets no waiting state and can start at once or come back later from Home). Shows head-to-start distance and other joined teams; team name and players can still be edited. Rule text uses the stop's real radius, not a hard-coded "25 m", and gains one safety line: "Watch the traffic, not the phone. The quiz waits for you." Nothing is uploaded about the player's position until *Start walk*. |
| P3 | Walk to stop | Change | Distance + direction arrow + map. The arrow follows the compass; when the compass is unreliable it is replaced by a text bearing ("north-east"). The header card opens a **walk menu**: live standings, answers so far, the rules, *Leave walk* (confirm: "You keep your 42 points. You can come back with the same code."). Leaving stops tracking at once (§4). The Weak GPS banner carries an *I'm at the stop* action when G6 allows it. Reacts live to a stop being removed ("Anders removed stop 4. On to stop 5.") and to the walk ending (→ P6). Progress segments carry a ✓ / ✕ mark, not only a colour. Pocket mode: buzz + notification on arrival. **Until pocket mode ships (M3) the screen is kept awake and the copy says "Keep Qualk open"**; it must not promise a pocket buzz it cannot deliver. *Directions* opens the stop in Apple / Google Maps (M3, since it backgrounds the app). "Simulate arrive" exists only in dev builds. |
| P4 | Question | Change | Two steps. **Arrived:** "Stop 4 · Nyhavn", the hint if set, and a *Show question* button. The 20 s bonus clock starts on that tap, not on arrival, so a team can gather round the phone first. **Question:** the clock is drawn as a draining bonus (+5 → +0) and at zero reads "No bonus. Take your time."; it never times out. The clock cannot be restarted: backing out, or killing and reopening the app, returns to the same question with the clock where it would have been. One tap answers. Feedback shows right/wrong with icon and text, points, explanation and source. **No photo.** |
| P5 | Finish | Keep | Score, correct, time, distance. "Review our answers". Stays reachable from Home (Playing) until the final results arrive. In a week-long walk it also shows **Standings so far** ("2nd of 5 teams so far. Final results on Sun 29 Nov.") and the share card, so a team that finishes on Tuesday is not left waiting until Sunday. |
| P6 | Final results | Change | In-app final leaderboard (arrives via push when the walk ends, by the creator or by itself) + *Share result card* (image). The card's headline fits the result ("Fjord Kids came 3rd of 4", or "joint 2nd"), not only a win. If answers were still unsent when the walk ended, P6 says so (§4). |

### Gap proposals

| ID | v1 | Notes |
|---|---|---|
| G1 Welcome & sign-in | Change | See §2. First run shows two equal choices, *Join a walk* and *Create a walk*; the Apple / Google buttons appear only after *Create a walk*. The mockup's line "Friends join from a link – no app needed" is wrong for v1 and becomes "Friends join with a code – no account needed". |
| G2 Add stop | Change | Long-press map, search a place, or ***Add stop here*** (my location, for building a walk while walking it). Then *Suggest a question* (from M4) or *Write my own*. The new stop goes into the nearest leg and the sheet says where ("between 5 and 6"). Place search uses the platform's own geocoder via `expo-location` (no extra API). |
| G3 Solo or team | Merge into P1 | "Join a team on another phone" **cut**. |
| G4 Arrived early | Replace | Becomes the P2 waiting state; no countdown or scheduling. |
| G5 Weak GPS & offline | Keep | See §9. |
| G6 Can't reach | Change | *I'm here* (§4, no speed bonus; shown disabled with the reason when too far). *Skip* (0 points) asks to confirm. *Way blocked* reports and moves on in one step: "We told Anders. Carry on to stop 5. If the stop is removed for everyone, nobody loses points." A team is never left waiting for the creator. **The creator moving a stop live is cut.** |

### Error and empty states (new, small)

Invalid or expired code · walk already ended (read-only results) · location permission denied (explain + open Settings) · **precise location switched off** (iOS "Precise Location", Android "Approximate": stops can never unlock, so explain + open Settings) · stop removed or walk ended while a team is walking (P3) · generation failed · no network during create/edit · first-run Home (empty, with *Join with code* and *New quiz walk*).

---

## 4. Game rules

**Walk lifecycle:** `draft → ready → open → ended`

| Status | Creator can | Participants can |
|---|---|---|
| draft | Edit everything | — |
| ready (published, code exists) | Edit everything | Join, wait in lobby |
| open | Skip a stop for everyone, end walk | Join, play |
| ended | View results, reuse | View results only |

- A walk ends by itself **12 hours** after it is opened (checked every hour, so within the hour after that), or after **7 days** if the creator chose *This week* on *Open walk* (`openFor`). The choice is fixed at opening; the creator can end the walk earlier, not extend it.
- In a week-long walk, teams walk at different times. The rules are the same; ranking already uses walk time, not time of day. A team that has finished sees the standings so far, and the final ranks are frozen when the walk ends. Nothing stops a finished team from telling a later one the answers; that is accepted for a walk shared among friends, a family or a class.
- **Order:** fixed, 1 → N. The next stop is revealed once the current one is answered or skipped.
- **Unlock:** distance ≤ effective radius, where
  `effectiveRadius = radius` if GPS accuracy ≤ radius, else `min(accuracy, max(radius, 60))` (G5).
  Fixes with accuracy worse than 100 m are ignored for unlocking.
- **I'm here:** allowed when `distance − accuracy ≤ 150 m`, so a team with poor GPS that is plausibly at the stop is not stranded. The question opens with no speed bonus.
- **Skip:** 0 points, go straight on to the next stop.
- **Leaving:** a team that leaves before *Start walk* is removed. A team that leaves after starting keeps its points, is ranked as unfinished, is no longer tracked, and no longer counts as "still walking". Entering the code again resumes at the next stop.
- **Way blocked:** recorded as a skip plus an alert to the creator. The team moves on at once.
- **Scoring:**
  - Correct: 10 points.
  - Speed bonus: `ceil(5 × secondsLeft / 20)` (0–5), measured from the tap on *Show question* (P4) to the answer, not from arrival.
  - Wrong: 0.
  - Example: correct with 14 s left = 10 + 4.
- **Time** is measured with the phone's clock, so offline answers keep their true timing.
- **Skip for everyone:** the stop is removed from play. Any points already earned on it are voided for all teams, and scores are recalculated on the server.
- **Finished team:** all stops answered or skipped. When the walk ends, unfinished teams keep what they have.
- **Answers count only if they reach the server while the walk is open.** An answer given offline and still unsent when the walk ends is lost. This keeps final results final; it can only happen to a team that is both offline and still walking at the moment the walk ends, and the *End walk* confirm tells the creator how many teams are still walking.
- **Walk time** = the team's last answer minus its *Start walk* tap, both from the same phone's clock. `finishedAt` is that last answer's time, not the moment it synced.
- **Ranking:** score ↓, then correct count ↓, then walk time ↑ (unfinished teams rank after finished teams with the same score). Teams equal on all three share a place ("2="). Ranks are not stored: once a walk has ended no score can change, and every phone ranks the same teams with the same shared code. Walk time, not time of day, because teams start when they arrive and a late start must not cost a place.
- **Time estimate** shown to creators and players ("about 55 min"): the walk's distance at 4.5 km/h plus 2 minutes per stop.
- **Distance** of a walk is Start → stop 1 → … → last stop. The way back to the start is not counted, because the game ends at the last stop. It is the routed distance once a route exists (M4) and straight lines between pins until then, labelled "as the crow flies" for the creator.

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
users/{uid}                              // a participant's doc holds only `playing`
  displayName?, createdAt?, pushToken?
  playing?: walkId[]                     // walks joined on this phone, for Home's Playing section

joinCodes/{code}                         // 5 chars, alphabet without 0/O/1/I/L
  walkId, createdAt                      // deleted with the walk, or 30 days after it ended

walks/{walkId}
  ownerUid, ownerName, title, topic?, difficulty?
  status: 'draft'|'ready'|'open'|'ended'
  joinCode?, modes: { solo: bool, team: bool }, maxPlayers, whenText?
  start: GeoPoint, startLabel, shape: 'loop'|'oneway'
  route: { polyline, distanceM, durationS } | null
  distanceM                              // §4 Distance; on the walk so P1 can show it before joining
  openFor?: 'day'|'week'                 // set with openedAt; ends openedAt + 12 h or + 7 days
  stopCount, createdAt, updatedAt, openedAt?, endedAt?

walks/{walkId}/stops/{stopId}
  order, location: GeoPoint, placeName, radiusM
  question, options: string[2..4], correctIndex, explanation, hint?
  source?: { title, url }, origin: 'ai'|'manual'
  warnings: string[]                     // 'onWater', 'offPath', 'unverified'
  skippedForAll: bool

walks/{walkId}/teams/{uid}               // team id = the participant's uid (one phone per team)
  name, mode: 'solo'|'team', players, pushToken?
  colorIndex                              // picked at join: the least-used team colour so far
  joinedAt, startedAt?, leftAt?, lastSeenAt
  finishedAt?                             // written by functions only
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

`users/{uid}.playing` is written by the app on join and trimmed on *Leave walk* or when a walk's results are older than 30 days. It is what lets a player who closed the app get back into their walk. It is not a history (§16). A team's colour is stored as `colorIndex` when it joins, so two teams only share a colour once all eight are in use, and a team's colour never changes mid-walk.

A join code works for as long as its walk exists: it opens the join screen while the walk is `ready` or `open`, and read-only results once it has ended. It is released when the walk is deleted or 30 days after it ended, and then reads as "invalid or expired".

---

## 7. Security rules (outline)

Rules are covered by automated tests against the Firestore emulator in CI, with an allow and a deny case per bullet.

A walk's id is unguessable and is only handed out through its join code, so **holding the id is what makes someone a guest of that walk**. Rules do not check for a team document before letting a guest read the walk: the join screen has to show the walk before the team exists, and anyone with the code could create a team in one write anyway.

- `users/{uid}`: read/write by that user only.
- `joinCodes/{code}`: `get` for any signed-in user, no `list`, writes by functions only.
- `walks/{w}`:
  - **create** by a signed-in, non-anonymous user, with `ownerUid == auth.uid` and `status == 'draft'`;
  - **update** by the owner while `draft`/`ready`, never touching `ownerUid`, `status`, `joinCode`, `openFor`, `openedAt` or `endedAt`. Publishing and opening go through callables (§8), so a client cannot skip their checks;
  - the owner's one status write: `open → ended`, setting `endedAt` to the server time;
  - **delete** by the owner while `draft`. Anything published is deleted by `deleteWalk`;
  - **get** by the owner always, and by any signed-in user unless it is a `draft`; **list** only one's own (`ownerUid == auth.uid`).
- `stops`: owner writes while `draft`/`ready`; while `open`, only `skippedForAll` may change, and only to `true`. Read by the owner, and by any signed-in user unless the walk is a `draft`.
- `teams/{uid}`:
  - **create** by `auth.uid == uid` if the walk is `ready`/`open` and the chosen mode is allowed, with `score`, `correctCount` and `stopsDone` all 0 and no `startedAt`, `finishedAt` or `leftAt`;
  - **update** by that uid, limited to `name, players, pushToken, startedAt, leftAt, lastSeenAt, distanceWalkedM`. `startedAt` can be set once, only while the walk is `open`, and never changed;
  - **delete** by that uid while `startedAt` is unset (leaving the lobby);
  - **read** by any signed-in user (the leaderboard; it holds no location).
- `answers/{stopId}`: **create once** by the team uid, only while the walk is `open` and the team has started; `stopId` must exist; client fields only; no update or delete. Read by the team and the owner.
- `positions/{uid}`: write by that uid while the walk is `open`; read by that uid and the walk owner.
- `alerts`: create by a team of that walk with `teamUid == auth.uid`; read/update by the owner.
- `generationJobs`: read by owner, write by functions only.

**App Check** is enforced on callables from the first one written, and on Firestore itself before release (M5), which is what stops a script from guessing join codes.

---

## 8. Cloud Functions

| Function | Type | Purpose |
|---|---|---|
| `generateWalk` | callable | Full AI pipeline (below). Rate-limited (e.g. 20/creator/day). |
| `suggestQuestion` | callable | Steps 3–4 for one place (G2, C5 "New question"). |
| `reroute` | callable | After edits: snap pins to walkable paths, compute route + distance, return warnings. |
| `publishWalk` | callable | Validate (≥1 stop; every stop has a question, 2–4 non-empty answers and a correct one), recompute `stopCount` and `distanceM`, allocate join code, `draft → ready`. |
| `openWalk` | callable | Validate again (a `ready` walk can still be edited), set `openFor`, `openedAt`, `ready → open`. |
| `deleteWalk` | callable | Delete a walk that is not `open`, with its stops, teams, answers, positions, alerts and join code. |
| `duplicateWalk` | callable | "Reuse walk" → new draft. |
| `deleteAccount` | callable | Delete the user's walks (recursively), their participant data, and the Auth user. |
| `onAnswerCreated` | Firestore trigger | Score the answer, update team totals, set `finishedAt` (from the last answer's client time, §4). When no team is still walking (every team that started has finished or left), push "Everyone has finished" to the creator. In a week-long walk, push "Fjord Kids finished: 96 points" for each team instead. |
| `onStopUpdated` | Firestore trigger | `skippedForAll` → recalculate all team scores. |
| `onWalkStatusChanged` | Firestore trigger | `open` → push "Walk is open" to joined teams. `ended` (by the creator or by `hourly`) → push "Final results". Nothing is frozen or copied: ranks are derived (§4). |
| `onAlertCreated` | Firestore trigger | Push to creator: "Fjord Kids: way to stop 4 is blocked". |
| `hourly` | scheduled | Auto-end walks past their end time (`openedAt` + 12 h or + 7 days, by `openFor`). Hourly, not daily: a daily job would leave a "12-hour" walk open for up to 36. |
| `daily` | scheduled | Delete participant data (teams, answers, positions, alerts) and the join code 30 days after `endedAt`. |

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
  - **The aim is that no "Always" permission is requested on either platform. This is not yet proven.** The `expo-location` docs (SDK 58, read 2026-11-25) say background updates need "Always" on iOS and background permission on Android, and do not say that a session started in the foreground keeps running on "When In Use" alone, though both operating systems allow that. A spike in M1 step A settles it on both phones before anything is built on it. If the spike fails, the order of fallbacks is: (1) **iOS: a location-triggered local notification**, the mechanism behind location reminders. The app schedules a notification for the next stop's area; iOS itself watches for it and delivers "You're close to stop 4. Open Qualk." with the app suspended, on "When In Use" permission alone. It is coarse (roughly 100 m or more, sometimes late), so it only brings the player back to the phone; the precise unlock still happens once the app is on screen. Only the next stop is ever scheduled, and it is cancelled when the team finishes or leaves. Android has no equivalent without background permission, but there the foreground service is the standard route and the less doubtful half of the spike; (2) a small native module or another library for true background updates; (3) ask for "Always" / background permission only when a player switches pocket mode on, with screen-on play as the default; (4) ship v1 with screen-on play only.
- **Arrival:** the background task computes distance; on unlock it fires a local notification + vibration. Tapping it opens P4.
- **Battery:** balanced accuracy, 10 m distance filter; high accuracy only within 300 m of the stop. Tracking stops when the team finishes, the walk ends, or the player leaves.

- **Before pocket mode (M1–M2):** unlocking only works while the app is on screen, so P3 keeps the screen awake (`expo-keep-awake`) and says so.

**Uploads**
- `positions/{uid}` is written only between *Start walk* and the team finishing or leaving, at most every 30 s and only after moving ≥ 20 m. The lobby's distance-to-start is computed on the phone and not uploaded.
- `distanceWalkedM` is computed on the phone (fixes with accuracy > 30 m or segments < 5 m are ignored).

**Offline**
- Joining reads all stops, so the whole quiz is in Firestore's offline cache.
- Answers written offline queue automatically and sync later.
- Banners (G5): *Weak GPS* when accuracy > stop radius; *Offline* with the count of unsynced answers.
- Map tiles are not stored offline in v1. The distance and arrow view works without them.
- Creating and editing walks requires a connection.

---

## 10. Maps

- `react-native-maps` (not `expo-maps`, whose Apple Maps markers cannot be dragged — see `docs/m1-design.md` §2). iOS: Apple Maps (no key). Android: Google Maps SDK (free for mobile; key restricted to the app's package and signing certificate).
- Draggable markers in C4/C5; dropping a pin triggers snapping on save.
- Route drawn as a polyline from ORS.
- Attribution "© OpenStreetMap contributors · openrouteservice" shown in C4 and in Settings.

---

## 11. Notifications

| Who | When |
|---|---|
| Participants | Walk opened · final results ready |
| Creator | Way-blocked alert · all teams finished ("End the walk to publish the results") · in a week-long walk, each team that finishes |
| Local, participant | Arrived at stop |

Permission is asked where its use is obvious, never as a second system prompt straight after location at P1:

- **Participants:** in the lobby (P2). Before the walk opens, the *Notify me when it opens* row asks. Once it is open, *Start walk* asks, with "So you hear when the results are in" (from M3, when pocket mode exists: "So we can buzz you at each stop").
- **Creators:** on the first *Open walk*, with "So you hear when a team is stuck or everyone has finished".

A refusal is respected and never blocks play: the lobby and P3 update live while the app is open.

"All teams finished" is not optional. Final results only appear when the creator ends the walk, so the creator has to be told when that makes sense.

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
| Ink / secondary / muted | `#16211B` / `#4A5A50` / `#5F6E65` |
| Background / surface | `#F4F6F1` / `#FFFFFF` |
| Border (cards, dividers) | `#C9D2C4` |
| Control border (inputs, radios, unselected answers) | `#7A8C82` |
| Success fill | `#E2F0E7` |
| Error / error text / error fill | `#B4471B` / `#93391A` / `#FBF1EB` |
| Team colours | `#1D4ED8` blue, `#9F1239` rose, `#0F766E` teal, `#6B21A8` purple, `#0369A1` sky, `#701A75` plum, `#475569` slate, `#0E7490` cyan |
| Type | Space Grotesk 500/700 (headings, numbers; tabular figures for clocks and scores) · Inter 400/500/600 (body) |
| Touch targets | ≥ 48 pt |

Changes from the mockups, and why:

- **Muted text** was `#6B7A71`, which is 4.15:1 on the background and fails WCAG AA for small text. `#5F6E65` is 4.94:1.
- **Control border.** `#C9D2C4` is 1.56:1 on white: fine for a card edge, too faint for the outline of something to tap or type in, least of all in sunlight. Controls use `#7A8C82` (3.56:1 on white, 3.27:1 on the background).
- **Team colours** no longer include the error orange (`#B4471B`, also the warning pin) or the ink (`#16211B`, also the start pin). Every team colour must give white initials ≥ 4.5:1 and must not be the accent, error or ink colour. The eight were picked by simulating red-green colour blindness: the closest pair stays about twice as far apart as in the first set of four. Several are still close cousins (blue, sky, cyan), so colour is never the only cue: a team marker always carries its initials.
- **Touch targets.** The mockups draw back buttons, steppers and pills at 44 pt; build them at 48.
- **Text size.** Nothing a player needs while walking (P3, P4) is set below 15 pt. Elsewhere 13 pt is the floor.
- **Layouts scroll.** The mockups are fixed 390 × 844 frames. With larger text sizes every screen must scroll rather than clip, and bottom buttons stay pinned.
- **Destructive actions** (End walk, Delete, Skip, New route) are never the accent-coloured button and always confirm.
- **Haptics:** a buzz on arrival, and distinct taps for right and wrong.

Accessibility in v1: Dynamic Type / font scaling, screen-reader labels on all controls, right/wrong feedback shown with text and icon (not only colour). Nothing depends on a drag or a long-press alone: stops can be reordered with *Move up* / *Move down* actions, added with *Add stop here* or search, and placed with the crosshair. Light mode only (§16).

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
- Carrying a join code through an app-store install (a new player types the 5 characters once)
- Moving a team to another phone mid-walk
- An in-app QR scanner (the phone's camera opens the link)
- Choosing a walk's end date, or extending an open walk
- Dark mode
- Anti-cheat beyond server-side scoring
- Analytics

---

## 17. Milestones

Each step ends with a build you can install and test on your phone. The work inside each step, its order and its checks are in [`implementation-plan.md`](implementation-plan.md).

| # | Milestone | Done when |
|---|---|---|
| M0 | **Foundations** | Done, except the Google Play Console tasks in §18. |
| M1·A | **Native spine** | One dev build per platform with every native library v1 needs. Anonymous auth, security rules and their tests, App Check, Apple and Google sign-in proven. The pocket-mode permission spike (§9) has an answer. |
| M1·B | **Play a walk** | A walk seeded by script can be joined by code and link and played to the end: lobby, walk with location unlock (screen on), arrive, answer, scoring, finish, standings, way back in from Home, leave, can't-reach, offline answers. First field test. |
| M1·C | **Make a walk** | Welcome, sign in, build a walk by hand, preview, publish, share, open (today or this week), end, results. The two-phone test in `m1-design.md` §12 passes. |
| M2 | **Creator live tools** | Live monitor, team detail, push notifications, way-blocked alerts, skip for everyone, share cards, reuse, duplicate and delete. The Play closed test starts here, because its 14 days run on the calendar. |
| M3 | **Out in the real world** | Pocket mode as far as the spike allows, battery tuning, *Directions*, week-long walks field-tested over several days. |
| M4 | **AI generation** | Real walking routes (ORS), generation pipeline, C3, suggest/new question, regenerate route, failure states, *Play it myself*. |
| M5 | **Release** | Privacy page, account and data deletion, retention job, App Check on Firestore, store listings and privacy labels, TestFlight + Play testing, then release. |

AI comes after the core game on purpose: the game must work without it. The data model includes AI fields from day one, so it is not bolted on. Playing comes before making within M1, because location unlock is the riskiest part of the experience and should meet a real street as early as possible.

---

## 18. Your manual tasks

These need your accounts or consoles. Each will be walked through step by step when its milestone arrives.

- [x] **M0** Create a Firebase project in `europe-west1`, upgrade to Blaze, set a $10 budget alert (project ID `qualk-a173e`; Firestore, Auth with Anonymous/Google/Apple and Hosting enabled)
- [x] **M0** Create an Expo account and give the project access (account `lmunck`, personal; access token saved)
- [x] **M0** App Store Connect: confirm the old `com.lmunck.Qualk` record exists; create an API key for EAS Submit
- [ ] **M0** Google Play Console: account ($25) + app `com.lmunck.qualk` (personal account created; a test Android device is now available for the verification step that was blocking it. The 12-tester / 14-day closed test applies before release)
- [x] **M0** DNS change at simply.com for qualk.dk (`qualk.dk` and `www.qualk.dk` both serve from Firebase Hosting with valid certificates, verified 2026-11-21)
- [ ] **M1** Register the iOS and Android apps in the Firebase console and download `GoogleService-Info.plist` + `google-services.json` (needed by React Native Firebase; committed to the repo, they hold no secrets)
- [ ] **M1** Add the Android signing SHA-1 fingerprints to the Firebase Android app (dev/upload key from `npx eas-cli@latest credentials`, and the Play app-signing key once it exists) — Google sign-in on Android fails without them
- [ ] **M1** Google Maps Android API key (same Google Cloud project), restricted to `com.lmunck.qualk` + the signing SHA-1
- [ ] **M1** App Check: enable App Attest (iOS) and Play Integrity (Android), and register debug tokens for the dev builds and the emulator
- [ ] **M2** Google Play: start the closed test (12 testers for 14 days is required before a personal account can release; the clock only runs once testers have opted in)
- [ ] **M2** Push credentials: an FCM V1 service-account key uploaded to Expo for Android; EAS generates the APNs key for iOS
- [ ] **M4** OpenRouteService API key and OpenRouter API key → stored as Firebase secrets (never pasted into chat or the repo)
- [ ] **M5** Update the Qualk line on nulkommafire.com's privacy page; update privacy/support/marketing URLs in App Store Connect

---

## 19. Risks and open points

| Risk | Mitigation |
|---|---|
| Thin OSM/Wikipedia coverage outside cities | "Only found N places" state; manual stops are always possible |
| ORS free plan: commercial use not explicitly stated; possible endpoint changes | Routing behind one module; revisit before any commercial launch (self-host or paid alternative) |
| App review friction for background location | Clear permission copy, "When In Use" only, review notes |
| **Pocket mode may need "Always" location.** `expo-location`'s docs say so; the spec assumes otherwise | Spike in M1·A on both phones; fallbacks listed in §9, the first being iOS's own location-triggered notifications. Nothing before M3 depends on the answer |
| An answer given offline is lost if the walk ends before it syncs | Accepted (§4). The creator sees how many teams are still walking before ending; the player is told on P6 |
| English questions from Danish sources | Fact-check pass; creator reviews in C4 before publishing |
| GPS in dense streets | Default radius 40 m, automatic widening, "I'm here" fallback |
| **Self-paced walks (decided 2026-11-25).** A 12-hour lifetime made "here is a walk, do it any time this week" impossible, which may be the most common way a walk gets shared in a family or a class | *Open walk* asks **Today** (12 h, default) or **This week** (7 days). Stored as `openFor`. Finished teams see standings so far; final ranks freeze when the walk ends (§3 C6, P5; §4). No custom end date and no extending in v1 |
