# QuizWalk (Qualk) — v1 specification

Status: **Draft for approval** · 2026-11-04 · UX review folded in 2026-11-24 (§3, §4, §9, §11, §14) · design review 2026-11-25 (§4, §6–§9, §17) · generation design 2026-11-27 (§1, §3, §4, §6–§8, §14–§17, §19; the how and why are in [`m4-generation-design.md`](m4-generation-design.md)) · M3 pocket mode 2026-11-27 (§3 P3, §8, §9, §11, §19; the how and why are in [`m2-m3-delivery.md`](m2-m3-delivery.md)) · M4 backend 2026-11-27: Gemini instead of OpenRouter, and what building it settled (§1, §5–§8, §15, §18, §19; [`m4-backend-delivery.md`](m4-backend-delivery.md)) · M5 privacy 2026-11-28: deletion, retention, App Check timing (§6–§8, §12, §13, §18; [`m5-privacy-delivery.md`](m5-privacy-delivery.md))
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
| Routing | OpenRouteService (OSM-based, `foot-walking`, at `api.heigit.org/openrouteservice` since the old address closed on 2026-11-24), called only from Cloud Functions, behind one swappable module. A generated route fits the creator's map view (§3 C2, §8). |
| Content | A shared **question bank** by category: filled ahead of time with a seed bank written by Claude Code sessions (a writer model and an independent reviewer on a different model) and loaded by `scripts/import-question-bank.ts`, plus a one-off Gemini fill from 2026-11-27 (tagged `seedBatch: 'gemini-2026-11-27'`). In production, Google's Gemini API (one Google AI Studio key in the same Google Cloud project) writes top-ups and *Local* questions, and a second, stronger Gemini model fact-checks them. *Local* questions are written from Wikipedia/Wikidata about places on the route (found with OpenStreetMap Overpass) and kept per place. Walks are made from the bank, so generating one rarely spends tokens (§8). |
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
| C2 | Create quiz | Change | Starts with a choice of two equal options, **Generate for me** and **Build it myself** (the mockup's small "write questions yourself" link undersells the manual path; until M4 only the manual path exists and the choice is hidden). *Build it myself* asks only for a title, then goes to C4 with an empty route and a **Start** pin at the creator's location. The Start pin is where teams meet; it is dragged like any other pin. *Generate for me* is a **map screen**. Zooming sets the walk's size and rotating the map sets its direction: the route goes up the screen from a **Start** pin fixed at the bottom centre, and the map moves under the pin. The screen opens on the creator's location, and panning picks another start. There is **no distance limit**. Tilt is off. Zoom and turn buttons, and a compass button back to north-up, sit beside the map (§14). The sheet holds the quiz: **Auto** or one or more categories (§8; *Local* is one of them), difficulty (Kids/Mixed/Expert), and questions (stepper, 4–12). The number of questions follows the view's length by default, about one per 350 m, until the creator changes it. **Refresh** makes a walking loop with its stops that fits the visible map. Nothing is drawn before the first Refresh, and moving the map changes nothing until the next one. A second Refresh on the same view gives a different route. When the loop would be shorter than 150 m per question, Refresh is disabled with "Zoom out, or choose fewer questions". After a Refresh, a line sums the walk up: "8 stops · 3 km · about 55 min" (§4 time estimate). Changing the number of questions after a Refresh spaces the stops again along the same loop; when the loop is too short for them, Next says so. **Next** creates the draft and goes to C3. Generated walks are loops, with no shape choice and no free-text topic. |
| C3 | Generating | Change | Driven live by a `generationJobs` document. A short wait (a few seconds, longer only when a *Local* stop's place is new) with the steps *Naming stops*, *Picking questions* and, when needed, *Writing local questions*. Can be left: generation continues and the draft shows "Generating…" on Home. Adds a failure state with *Try again* or *Add stops manually*. There is no "only found N places" state, because stops come from the route, not from places. Done state: *Review route & questions* (primary) and ***Play it myself — no spoilers***, which publishes, opens and joins in one step without showing the questions (for a creator who wants to play their own generated walk; offered only when nothing blocks publishing). |
| C4 | Route builder | Change | Reorder stops (drag in list), drag pins, add stop (G2), delete. The sheet has three heights (peek / half / full) so a 12-stop list can be reordered. **Tap a row = edit (C5); drag its handle = reorder.** Tapping a pin selects its row, and the reverse. The title is edited in the sheet header. Rows mark *blocking problems* (no question, fewer than 2 answers, no correct answer) in the error style and *warnings* ("Pin is on water", "Off path", "Check this answer" for `unverified`) in a quieter style. *Publish & share* is always tappable and lists what blocks it. "New route" appears only on generated walks. It confirms, naming what is lost (the stop positions and any *Local* questions), then opens C2's map screen on the walk's area. Trivia questions are kept in their order. **Preview** steps through the questions as players will see them, with no location and nothing saved. Rerouting happens on save, not on every drag: the editor saves each change at once, so C4 calls `reroute` once the pins have stayed put for about 2 seconds, and at once on *Publish* or on leaving. Until it returns, the distance is straight lines, "as the crow flies". |
| C5 | Edit stop | Change | Scrolls. Place name, question, 2–4 answers, explanation (optional; shown after answering), hint (optional; shown on arrival, before the question), radius 25/40/**60** m (**default 40**) with a one-line helper ("Bigger is easier to trigger in tight streets"). **Answers are rows**: a text field with a "correct" radio, plus add/remove. This replaces the mockup's tap-to-mark grid, which leaves no way to edit the text and is too narrow for real answers. **Pin:** tapping the mini map opens a full-screen *Move pin* where the map moves under a fixed crosshair, with *Use my location*. **Swap** offers another question from the bank (§8), or another question about the place for a *Local* stop, to accept or discard. It never overwrites silently. Cancel with unsaved changes asks first. *Delete stop* sits at the bottom of the scroll and confirms. **No photo.** |
| C6 | Share | Change | Join code, QR, link `https://qualk.dk/play?code=K72QX`. The code is shown as `K72QX`, without the mockup's separator dot. Settings: *Play as* (Solo / Team / both), *Players per team* (max, info only), and an optional free-text "When" line (e.g. "Sat 14:00") shown to players only. **No open/close schedule.** The mockup's *Order* and *Score* rows are removed: both are fixed, so they are not settings. A live list shows the teams that have joined. Primary action: **Share invite** (system share sheet with a ready-made message). **Open walk** is a separate button with a confirm, because opening cannot be undone and creators publish days ahead. The confirm asks how long the walk stays open: **Today** ("Everyone walks at the same time. Ends by itself after 12 hours.", the default) or **This week** ("Teams walk when it suits them. Ends by itself on Sun 29 Nov.", 7 days). The choice cannot be changed once the walk is open; the creator can still end it early. *Open walk* checks the walk again (it may have been edited since publishing) and lists what blocks it, as Publish does. Once open, C6 is replaced by C7. Until C7 ships (M2), the open state of C6 lists the teams with their scores and has an *End walk* button with the same confirm. |
| C7 | Live monitor | Change | Map with each team's *last known* position + leaderboard, in a sheet with the same three heights as C4. Teams not heard from for 2 minutes are dimmed and labelled "seen 6 min ago". An *Invite* pill shows the join code for late-comers. **"Message all" cut.** Adds an alerts strip for "Way blocked" reports with *Skip stop for everyone*. *End walk* is a secondary button, not the accent one, and its confirm says how many teams are still walking. When every team that started has finished or left, a banner offers *End walk & show results* (not in a week-long walk, where more teams may still join). In a week-long walk the header shows "Open until Sun 29 Nov", and teams that have not walked today are listed under the leaderboard without a map pin instead of as stale pins. |
| C8 | Team detail | Change | Read-only: stats + per-stop results. **Both buttons cut**: skipping is done for everyone from C7; messaging is cut. |
| C9 | Results | Keep | Podium, stats. Tapping a team opens C8. "Reuse walk" duplicates it as a new draft. "Share results" shares an image card. |
| S1 | Settings | **New** | Account, sign out, **Delete account and all data** (creators) or **Delete my data** (no account), privacy policy link, app version. Each delete confirms with what is lost. |

### Participant

| ID | Screen | v1 | Notes |
|---|---|---|---|
| P0 | Join sheet | **New** | Enter a 5-character code. A QR is scanned with the phone's own camera, which opens the link; there is no in-app scanner (§16), so the app never asks for the camera. Input upper-cases, ignores spaces and submits on the fifth character. Also opened by tapping a `qualk.dk/play?code=…` link. Entering the code of a walk already joined on this phone resumes it instead of joining again. |
| P1 | Join | Change | In-app (no browser/App Clip footer). Walk summary with the time estimate and, when the last stop is more than 300 m from the start, "Ends 2.1 km from the start" (worked out from the pins, so it is right for hand-built walks too). A week-long walk that is open also shows "Open until Sun 29 Nov. Walk it when it suits you." **Solo / Team** choice (only if the creator allows both; replaces G3). Team name, prefilled with a suggested name (solo: "Your name"); a name another team already has is flagged before joining. Players on this phone. Location explainer + permission request; the button reads *Allow location & join* only while permission is still needed, otherwise *Join*. **Notification permission is not asked here** (§11). |
| P2 | Lobby | Change | If the walk isn't open yet: "Waiting for {creator} to open the walk" with a *Notify me when it opens* row (replaces G4's countdown). When open: "Start walk" (a week-long walk adds "Open until Sun 29 Nov"; a team that joins it gets no waiting state and can start at once or come back later from Home). Shows head-to-start distance and other joined teams; team name and players can still be edited. Rule text uses the stop's real radius, not a hard-coded "25 m", and gains one safety line: "Watch the traffic, not the phone. The quiz waits for you." Nothing is uploaded about the player's position until *Start walk*. |
| P3 | Walk to stop | Change | Distance + direction arrow + map. The arrow follows the compass; when the compass is unreliable it is replaced by a text bearing ("north-east"). The header card opens a **walk menu**: live standings, answers so far, the rules, *Leave walk* (confirm: "You keep your 42 points. You can come back with the same code."). Leaving stops tracking at once (§4). The Weak GPS banner carries an *I'm at the stop* action when G6 allows it. Reacts live to a stop being removed ("Anders removed stop 4. On to stop 5.") and to the walk ending (→ P6). Progress segments carry a ✓ / ✕ mark, not only a colour. Pocket mode (§9): buzz + notification on arrival, and the copy says the phone can stay in a pocket. **When pocket mode cannot buzz** (notifications refused, the background updates failed to start, or pocket mode switched off for a platform) **the screen is kept awake and the copy says "Keep QuizWalk open"**; it never promises a pocket buzz it cannot deliver. *Directions* opens the stop in Apple / Google Maps for walking, and is shown only in pocket mode, since it backgrounds the app. "Simulate arrive" exists only in dev builds. |
| P4 | Question | Change | Two steps. **Arrived:** "Stop 4 · Nyhavn", the hint if set, and a *Show question* button. The 20 s bonus clock starts on that tap, not on arrival, so a team can gather round the phone first. **Question:** the clock is drawn as a draining bonus (+5 → +0) and at zero reads "No bonus. Take your time."; it never times out. The clock cannot be restarted: backing out, or killing and reopening the app, returns to the same question with the clock where it would have been. One tap answers. Feedback shows right/wrong with icon and text, points, explanation and source. Under it, a small ***Report question*** link asks for a reason (wrong answer, offensive, confusing) and confirms with "Thanks. We'll check it." Each person can report a question once (§8). **No photo.** |
| P5 | Finish | Keep | Score, correct, time, distance. "Review our answers". Stays reachable from Home (Playing) until the final results arrive. In a week-long walk it also shows **Standings so far** ("2nd of 5 teams so far. Final results on Sun 29 Nov.") and the share card, so a team that finishes on Tuesday is not left waiting until Sunday. |
| P6 | Final results | Change | In-app final leaderboard (arrives via push when the walk ends, by the creator or by itself) + *Share result card* (image). The card's headline fits the result ("Fjord Kids came 3rd of 4", or "joint 2nd"), not only a win. If answers were still unsent when the walk ended, P6 says so (§4). |

### Gap proposals

| ID | v1 | Notes |
|---|---|---|
| G1 Welcome & sign-in | Change | See §2. First run shows two equal choices, *Join a walk* and *Create a walk*; the Apple / Google buttons appear only after *Create a walk*. The mockup's line "Friends join from a link – no app needed" is wrong for v1 and becomes "Friends join with a code – no account needed". |
| G2 Add stop | Change | Long-press map, search a place, or ***Add stop here*** (my location, for building a walk while walking it). Then *Suggest a question* (from M4: a question from the bank, or a *Local* one when the stop is next to a documented place) or *Write my own*. The new stop goes into the nearest leg and the sheet says where ("between 5 and 6"). Place search uses the platform's own geocoder via `expo-location` (no extra API). |
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
- **Distance** of a walk is Start → stop 1 → … → last stop. The way back to the start is not counted, because the game ends at the last stop. It is the routed distance once a route exists (M4) and straight lines between pins until then, labelled "as the crow flies" for the creator. A generated walk's last stop is back at the start (§8), so its distance is the whole loop.

---

## 5. Architecture

```
 Expo app (iOS + Android)
   ├─ Firestore SDK (React Native Firebase, offline cache on) ──► Firestore
   ├─ Callable functions ───────────────────────────────────► Cloud Functions ─┬─► OpenStreetMap Overpass
   │                                                                        ├─► Wikipedia / Wikidata
   │                                                                        ├─► OpenRouteService
   │                                                                        ├─► Gemini API (LLM)
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
  ownerUid, ownerName, title, difficulty?
  categories?: string[]                  // generated walks: the chosen categories; missing or empty = Auto
  status: 'draft'|'ready'|'open'|'ended'
  joinCode?, modes: { solo: bool, team: bool }, maxPlayers, whenText?
  start: GeoPoint, startLabel, shape: 'loop'|'oneway'
  route: { polyline, distanceM, durationS, key? } | null   // key: routeKey of the pins it was made for
  distanceM                              // §4 Distance; on the walk so P1 can show it before joining
  openFor?: 'day'|'week'                 // set with openedAt; ends openedAt + 12 h or + 7 days
  stopCount, createdAt, updatedAt, openedAt?, endedAt?
  participantDataDeletedAt?              // set by `daily` when it purged the walk; `joinCode` is removed then

walks/{walkId}/stops/{stopId}
  order, location: GeoPoint, placeName, radiusM
  question, options: string[2..4], correctIndex, explanation, hint?
  source?: { title, url }, origin: 'ai'|'manual'
  bankQuestionId?                        // the question came from the bank (§8); its text is still copied here
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
  bankCounted?                            // functions: counted towards the bank question's stats

walks/{walkId}/positions/{uid}           // one doc per team, overwritten, not a history
  location: GeoPoint, accuracyM, at

walks/{walkId}/alerts/{alertId}
  teamUid, stopId, kind: 'blocked', createdAt, resolved

generationJobs/{jobId}                   // jobId = walkId
  ownerUid, walkId, status: 'running'|'done'|'failed'
  steps: ('naming'|'picking'|'writing')[], step: 0..3, stepDetail[], error?
  latestQuestion?                        // never written: C3 shows no question text
  createdAt, updatedAt

questionBank/{questionId}              // functions only
  kind: 'trivia'|'place'
  category, subcategory, difficulty: 'kids'|'mixed'|'expert'
  placeKey?                              // 'wikidata:Q12345', place questions only
  question, correct, wrong: string[3], explanation, source?: { title, url }
  status: 'active'|'flagged'|'blocked'  // flagged: hidden until reviewed
  stats: { used, answered, correct, replaced, reports, reasons: { wrong, offensive, confusing } }
  model, checkModel, createdAt, rand     // rand: random picks with a range query
  reviewedAt?                            // set by the review script when a question is kept
  seedBatch?, batchFlagged?              // bulk loads ('gemini-2026-11-27', 'claude-2026-11-27'); flagged as a batch

places/{placeKey}                        // functions only; recorded even when no good question came out
  name, location: GeoPoint, generatedAt, questionCount, source?

questionReports/{reportId}               // 'bank_{questionId}_{uid}' or 'stop_{walkId}_{stopId}_{uid}'
  uid, reason: 'wrong'|'offensive'|'confusing', createdAt
  walkId, stopId                         // where it was reported
  questionId?                            // set when the stop's question came from the bank

bankTopUps/{poolKey}                     // functions only: one top-up per pool at a time
bankMeta/{spend|topUps}                  // functions only: LLM spend by source, today's top-up count
rateLimits/{uid}                         // functions only: recent calls per rate-limited callable
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
- `generationJobs`: read by owner (a job that doesn't exist yet can be read, so C3 can wait for it), list by owner, write by functions only.
- `questionBank`, `places`: no client access. Functions pick the questions and copy them into stops. The functions' own `bankTopUps`, `bankMeta` and `rateLimits` have no client access either.
- `questionReports`: **create** by a team of the walk with `uid == auth.uid` and `createdAt` the server time, under the id built from the question (or walk and stop) and the uid, so each person reports a question once. A bank question can only be reported as it is on that stop (`questionId` equals the stop's `bankQuestionId`). No client read, update or delete.

**App Check** is enforced on callables from the first one written, and on Firestore itself before release (M5), which is what stops a script from guessing join codes. *Decided 2026-11-28:* both stay in monitor mode until Play Integrity exists, because enforcement is set per Firebase service for every app at once, not per platform. Callables go first, then Firestore after a week of clean metrics ([`m5-privacy-delivery.md`](m5-privacy-delivery.md)).

Deleting data and the 30-day purge run in functions (`deleteMyData`, `deleteAccount`, `daily`, §8), so no rule allows a started team to remove its answers, position or alerts.

---

## 8. Cloud Functions

| Function | Type | Purpose |
|---|---|---|
| `routeForView` | callable | C2's *Refresh*: four points → a walking loop fitted to the view, with stop positions and the spacing check (below). Writes nothing. About 30 per creator per hour. |
| `generateWalk` | callable | C2's *Next*: names the stops, picks questions, writes *Local* questions for new places, titles and writes the walk (below). Rate-limited (e.g. 20/creator/day). |
| `swapQuestion` | callable | C5's *Swap* and G2's *Suggest a question*: another question for one stop, as a proposal to accept or discard. About 120 per creator per hour. |
| `reroute` | callable | After edits: route the pins along walkable paths, write route + distance and the *Off path* / *on water* warnings. Pins are not moved. About 60 per creator per hour. |
| `publishWalk` | callable | Validate (≥1 stop; every stop has a question, 2–4 non-empty answers and a correct one), recompute `stopCount` and `distanceM`, allocate join code, `draft → ready`. |
| `openWalk` | callable | Validate again (a `ready` walk can still be edited), set `openFor`, `openedAt`, `ready → open`. |
| `deleteWalk` | callable | Delete a walk that is not `open`, with its stops, teams, answers, positions, alerts and join code. |
| `duplicateWalk` | callable | "Reuse walk" → new draft. |
| `deleteAccount` | callable | S1 *Delete account and all data*: the user's walks recursively, open ones included, with their join codes and generation jobs; their participant data in other walks (as `deleteMyData`); `rateLimits/{uid}`; `users/{uid}`; and last the Auth user, so a failure part-way can be retried. On iOS, an Apple user confirms with Apple once more first, so the app can revoke the Sign in with Apple token. |
| `deleteMyData` | callable | S1 *Delete my data*, anonymous users included: this uid's teams with their answers, positions, alerts and question reports in every walk that can still hold them (ready, open, ended in the last 60 days, or on `playing`), then `playing` and `pushToken`. A team removed from an open walk drops out of the standings; if it was the last one walking, the creator gets "Everyone has finished". |
| `onAnswerCreated` | Firestore trigger | Score the answer, update team totals, add to the bank question's `answered`/`correct` counts when the stop has a `bankQuestionId`, set `finishedAt` (from the last answer's client time, §4). When no team is still walking (every team that started has finished or left), push "Everyone has finished" to the creator. In a week-long walk, push "Fjord Kids finished: 96 points" for each team instead. |
| `onTeamUpdated` | Firestore trigger | A started team setting `leftAt` may leave nobody walking: the same "Everyone has finished" check as `onAnswerCreated`. Every other team write returns at once. |
| `onStopUpdated` | Firestore trigger | `skippedForAll` → recalculate all team scores. |
| `onWalkStatusChanged` | Firestore trigger | `open` → push "Walk is open" to joined teams. `ended` (by the creator or by `hourly`) → push "Final results". Nothing is frozen or copied: ranks are derived (§4). |
| `onAlertCreated` | Firestore trigger | Push to creator: "Fjord Kids: way to stop 4 is blocked". |
| `onQuestionReported` | Firestore trigger | Update the reported question's counts and status (below). |
| `onStopWritten` | Firestore trigger | A creator swapping a bank question in counts as `used`; swapping it out, editing it (the app drops `bankQuestionId`) or deleting its stop counts as `replaced`. Writes by functions don't count. |
| `topUpQuestions` | background | Add 20–25 questions to one bank pool (below). At most one per pool at a time, a 6-hour cooldown per pool, and at most 20 a day. |
| `hourly` | scheduled | Auto-end walks past their end time (`openedAt` + 12 h or + 7 days, by `openFor`). Hourly, not daily: a daily job would leave a "12-hour" walk open for up to 36. |
| `daily` | scheduled | 04:00 Copenhagen time. Delete participant data (teams, answers, positions, alerts) and the join code 30 days after `endedAt`; take the walk off `playing` lists; set `participantDataDeletedAt` so the next run skips it. The walk and its stops stay with the creator. A join code is deleted only while it still points at the walk. |

API keys live in **Secret Manager** via Functions secrets (`GEMINI_API_KEY`, `ORS_API_KEY`), never in the app or repo. The fill script reads the same Gemini key with the Firebase CLI. Callables require **App Check** (App Attest / Play Integrity).

### Generated walks

How and why: [`m4-generation-design.md`](m4-generation-design.md).

**Refresh (`routeForView`).** No tokens are spent.

1. The phone takes the usable map area (the screen minus the sheet, the header and the safe areas) and shrinks it by 15–20%. The midpoints of its edges are the four points: the start at the bottom, one at each side and one at the top.
2. ORS `foot-walking` routes the loop start → side → top → other side → start. A point too far from any path is moved towards the start and tried again. If the route leaves the view, the shape is shrunk and routed once more.
3. N stops are spaced evenly along the route, at length × *i* / N, so the last stop is back at the start.
4. The route is refused if it is shorter than N × 150 m, so that unlock circles don't overlap. The phone checks the straight-line estimate first and disables Refresh. If the real route is too short, the previous route stays and C2 says "Couldn't fit 8 stops here. Zoom out a little."

A second Refresh on the same view moves the three far points a little to give a different route.

**Next (`generateWalk`).**

1. One Overpass query along the route. Each stop moves to a named feature within about 50 m of the path where there is one (a fountain, church, statue or playground). Otherwise it takes its street name.
2. Trivia questions come from the bank. A *Local* stop (and, under Auto, any stop next to a documented place) uses the stored questions of its nearest Wikidata place. A place's questions are written on its first walk: about 5, only from its Wikipedia extract (English, falling back to the local language), then fact-checked. Auto uses *Local* at up to half the stops, so the walk still mixes categories; *Local* with other categories gets its share of the stops; *Local* alone gets every stop that has a place, and trivia from Auto's categories elsewhere. At most 4 new places are written per walk, so C3 stays a short wait. *Local* questions carry the `unverified` warning, so C4 asks the creator to check them.
3. The title is "{Category} walk from {start}", or "Quiz walk from {start}" for Auto or several categories. The creator can change it in C4.

**Question bank.**

- The categories, and subcategories that creators never see, are typed code in `shared/`. The first list is: History, Geography, Science, Nature & animals, Space, Sport, Music, Film & TV, Food & drink, Art & books, Words & language, Local. Auto mixes categories that suit the difficulty.
- The bank is filled ahead of time for every category, subcategory and difficulty: by the seed bank's JSON files in `content/question-bank/`, imported with `scripts/import-question-bank.ts` (decided 2026-11-28), and by the Gemini fill of 2026-11-27. `scripts/fill-bank.ts` (20–25 questions per call, capped at $10) stays for a deliberate refill but isn't used at volume. `topUpQuestions` adds more in the background when a creator has fewer than about twice a walk's worth of unused questions left in a pool. The prompt includes the pool's existing correct answers, so new questions don't repeat them.
- A second model fact-checks every question, and a failure is dropped, not rewritten. Only facts that stay true are allowed (no "current" office holders or records). Each question records its model and date.
- Picking leaves out questions the creator has used before, picks at random within the pool, spreads a walk over subcategories, and shuffles the correct and wrong answers.

**Reports and blocking.** Google Play's policy on AI-generated content requires in-app reporting. Apple's guideline 1.2 covers questions that creators write themselves.

- One *offensive* report hides a question until it has been reviewed. A few *wrong answer* reports (3), 5 *confusing* ones, or an unusual share of correct answers (under 10% once 10 teams have answered) flags it. A creator replacing, editing or deleting a bank question counts against it, and flags it once that has happened in at least 5 walks and half the walks it was in. A flagged question is not picked until it is reviewed (`scripts/review-bank.ts`).
- A blocked question is never picked again, and the top-up refills its pool. In v1, review is a script or the Firestore console.
- Stops copy the question text and keep the `bankQuestionId`, so a block never changes a walk in progress. The counts are totals with no personal data, so they are kept when answers are deleted.

Model IDs are configuration, not code: `GEMINI_WRITER_MODEL` (a fast model writes) and `GEMINI_CHECKER_MODEL` (a different, stronger one checks) in `functions/.env`, read by the functions and the fill script. From 2026-11-27: `gemini-3.8-flash` writes and `gemini-4-argon` checks.

---

## 9. Location, background and offline

**Tracking**
- **Foreground:** `expo-location` watch, high accuracy.
- **Background ("pocket mode"), from M3:** `expo-location` background updates, started on *Start walk* while the app is on screen, stopped when the team finishes or leaves or the walk ends. Built and checked on the simulator on 2026-11-27; the real-phone walk is still to come (how and why: [`m2-m3-delivery.md`](m2-m3-delivery.md)).
  - **iOS:** "When In Use" permission, `location` background mode, blue status indicator. The background location task (`startLocationUpdatesAsync` + `expo-task-manager`).
  - **Android:** "While using the app" permission, a foreground service of type `location` with a persistent notification ("Guiding you to stop 4"). expo-location's background session, which keeps an ordinary position watch running and lets it change accuracy in the background.
  - **No "Always" permission is requested on either platform.** expo-location 58's code starts both mechanisms with the foreground permission alone, when they start on screen (Apple and Android both allow that), and the simulator kept tracking and buzzing with the app in the background on "While Using". Geofencing and expo-location's newer `LocationUpdatesHandle` need "Always" on iOS and are not used.
  - **One switch** (`POCKET_ENGINE` in `app/src/location/tuning.ts`) picks the mechanism per platform: the above, Android's background task instead (same permission, but Android will not let it change accuracy in the background, so it stays on high accuracy), or `off` for screen-on play.
  - **Pocket mode needs notifications.** Without them it cannot buzz, so it does not run: P3 falls back to screen-on play (below). The same happens if the updates fail to start.
  - If a real phone shows that pocket mode cannot run on "When In Use", the fallbacks, in order: (1) **iOS: a location-triggered local notification**, the mechanism behind location reminders. The app schedules a notification for the next stop's area; iOS itself watches for it and delivers "You're close to stop 4. Open Qualk." with the app suspended, on "When In Use" permission alone. It is coarse (roughly 100 m or more, sometimes late), so it only brings the player back to the phone; the precise unlock still happens once the app is on screen. `expo-notifications` cannot schedule it, so it needs a few lines of native code; (2) another library for true background updates; (3) ask for "Always" / background permission only when a player switches pocket mode on, with screen-on play as the default; (4) ship v1 with screen-on play only (`POCKET_ENGINE` `off`).
- **Arrival:** each background fix is checked with the same unlock rule as on screen (§4). On unlock, with the app not on P3, a local notification with a buzz: "You're at stop 4". Tapping it opens P4. On screen, P3 opens P4 itself. Once per stop.
- **Battery:** balanced accuracy and a 10 m distance filter between stops; high accuracy within 300 m of the stop, back to balanced beyond 400 m so the GPS does not flip at the line. On screen, high accuracy throughout. Tracking stops when the team finishes, the walk ends, or the player leaves. The numbers are named constants in `app/src/location/tuning.ts`, to be set from battery measurements on both phones.

- **Screen-on play** (M1–M2, and whenever pocket mode cannot buzz): unlocking only works while the app is on screen, so P3 keeps the screen awake (`expo-keep-awake`) and says so.

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

- **Participants:** in the lobby (P2). Before the walk opens, the *Notify me when it opens* row asks. Once it is open, *Start walk* asks "Buzz you at each stop?" ("Then your phone can stay in your pocket on the way. You'll also hear when the results are in."). In a build with pocket mode switched off it asks "Hear when the results are in?" instead.
- **Tokens** are saved for each new team, and for the creator at each *Open walk*, whenever notifications are already allowed, without asking again.
- **Tapping a notification** opens what it is about: the question (arrival), the lobby (walk open), the results (final results), or the live monitor (blocked way, everyone finished, a team finished).
- **Creators:** on the first *Open walk*, with "So you hear when a team is stuck or everyone has finished".

A refusal is respected and never blocks play: the lobby and P3 update live while the app is open.

"All teams finished" is not optional. Final results only appear when the creator ends the walk, so the creator has to be told when that makes sense.

---

## 12. Hosting — qualk.dk

All files live in `hosting/` and deploy with the rest of the project.

| Path | Content |
|---|---|
| `/` | Simple landing page with store badges |
| `/privacy` | New Qualk privacy policy (§13). Live since 2026-11-28; linked from S1 and the landing page |
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
| Way-blocked alerts | Tell the creator | Creator of that walk | 30 days after walk ends |
| Question reports (uid, reason) | Hide bad questions | Nobody (functions) | Until *Delete my data* or account deletion; the counts they leave on a bank question have no personal data and stay |
| `playing` list | Way back into a walk | That user | Each walk taken off 30 days after it ends |
| Rate-limit times | Fair use of generation | Nobody (functions) | A day at most; deleted with the account |

- Location is only collected **during an active walk**.
- Participant locations never leave Firebase. ORS only receives the route's points and stop coordinates; Overpass and Wikipedia receive coordinates along a route; Gemini only receives categories and place information. All of these are called from functions, never from the phone.
- **In-app deletion:** creators: S1 "Delete account and all data". Participants: "Delete my data" in S1 (removes their teams/answers/positions, alerts, reports and `playing`; shown only to someone without an account, since account deletion covers it for creators).
- A team in the lobby of a walk that is never opened is not covered by the 30-day rule (there is no `endedAt`); it goes when the creator deletes the walk or the player deletes their data.
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

Accessibility in v1: Dynamic Type / font scaling, screen-reader labels on all controls, right/wrong feedback shown with text and icon (not only colour). Nothing depends on a drag or a long-press alone: stops can be reordered with *Move up* / *Move down* actions, added with *Add stop here* or search, and placed with the crosshair. The view that sets a generated route (C2) can be set with buttons as well as pinch and twist. Light mode only (§16).

---

## 15. Cost estimate (low usage: ~50 walks/month, ~10 teams each)

| Item | Expected |
|---|---|
| Firestore, Functions, Hosting | Within free quotas |
| LLM (Gemini API) | The one-off fill of 2026-11-27 cost $6.99 for 8,305 questions. The seed bank is written by Claude Code sessions, not Gemini. In production: top-ups (at most 20 a day, about $0.02–0.04 each) and *Local* questions for new places (about $0.008 a place) → < $5/month. Gemini 4 prices double on 2026-12-01 and 3.8 Flash's on 2027-01-01 |
| OpenRouteService | Free plan (2,000 routes/day). A Refresh is 1–2 routes, limited to about 30 per creator per hour |
| Overpass, Wikipedia, Wikidata | Free public services. One Overpass query per generated walk |
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
- Free-text quiz topics (categories only)
- One-way generated walks (hand-built walks can still end anywhere)
- An admin screen for reported questions (a script or the Firestore console)

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
| M4 | **AI generation** | Real walking routes (ORS), C2's map screen and *Refresh*, the question bank and the script that fills it, generation and C3, *Swap* and *Suggest a question*, *Report question* and blocking, *New route*, failure states, *Play it myself*. |
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
- [x] **M1** Register the iOS and Android apps in the Firebase console and download `GoogleService-Info.plist` + `google-services.json` (needed by React Native Firebase; committed to the repo, they hold no secrets)
- [ ] **M1** Add the Android signing SHA-1 fingerprints to the Firebase Android app (dev/upload key from `npx eas-cli@latest credentials`, and the Play app-signing key once it exists) — Google sign-in on Android fails without them (EAS key added 2026-11-27; the Play app-signing key still to come)
- [ ] **M1** Google Maps Android API key (same Google Cloud project), restricted to `com.lmunck.qualk` + the signing SHA-1
- [ ] **M1** App Check: enable App Attest (iOS) and Play Integrity (Android), and register debug tokens for the dev builds and the emulator
- [ ] **M2** Google Play: start the closed test (12 testers for 14 days is required before a personal account can release; the clock only runs once testers have opted in)
- [ ] **M2** Push credentials: an FCM V1 service-account key uploaded to Expo for Android; EAS generates the APNs key for iOS
- [x] **M4** OpenRouteService API key and Gemini API key (Google AI Studio, same Google Cloud project; decided 2026-11-27 instead of OpenRouter) → stored as the Firebase secrets `ORS_API_KEY` and `GEMINI_API_KEY` (done 2026-11-27)
- [ ] **M5** Update the Qualk line on nulkommafire.com's privacy page; update privacy/support/marketing URLs in App Store Connect (`https://qualk.dk/privacy` is live; steps in `m5-privacy-delivery.md`)
- [ ] **M5** Make `privacy@qualk.dk` reach you (the privacy page's contact address)
- [ ] **M5** Sign in with Apple token revocation: the Apple key, Services ID and Team ID in Firebase Auth's Apple provider, so deleting an account revokes the Apple sign-in
- [ ] **M5** App Check: register Play Integrity once the Play Console app exists, then enforce on callables and, after a week of clean metrics, on Firestore

---

## 19. Risks and open points

| Risk | Mitigation |
|---|---|
| Public Overpass servers are busy: `overpass-api.de` answered 502 at capacity several times on 2026-11-27 and says it is meant for human-operated tools | One query per generated walk, with a second server and a retry. If both fail the walk is still made, with unnamed stops and trivia instead of *Local*. A paid or self-hosted Overpass if usage grows |
| Thin OSM/Wikipedia coverage outside cities | Only affects *Local* questions: stops come from the route, and Auto uses trivia where there is no documented place |
| ORS free plan: commercial use not explicitly stated; possible endpoint changes (the address moved to `api.heigit.org` on 2026-11-24) | Routing behind one module; revisit before any commercial launch (self-host or paid alternative) |
| App review friction for background location | Clear permission copy, "When In Use" only, review notes |
| **Pocket mode on "When In Use" is proven on the simulator, not yet on a phone in a pocket.** iOS can end a backgrounded app under memory pressure; some Android makers kill foreground services | Built on what expo-location 58's code allows and checked on the simulator (2026-11-27). The real-phone walk is the user's next check. Without notifications, or if updates fail to start, P3 falls back to screen-on play. One switch per platform for the alternatives; further fallbacks in §9 |
| An answer given offline is lost if the walk ends before it syncs | Accepted (§4). The creator sees how many teams are still walking before ending; the player is told on P6 |
| English questions from Danish sources | Only *Local* questions. Fact-check pass; creator reviews in C4 before publishing |
| A wrong or offensive AI-written question reaches players | Fact-checked before it enters the bank; *Report question* on P4; automatic hiding and flagging; a blocked question is never picked again |
| GPS in dense streets | Default radius 40 m, automatic widening, "I'm here" fallback |
| **Self-paced walks (decided 2026-11-25).** A 12-hour lifetime made "here is a walk, do it any time this week" impossible, which may be the most common way a walk gets shared in a family or a class | *Open walk* asks **Today** (12 h, default) or **This week** (7 days). Stored as `openFor`. Finished teams see standings so far; final ranks freeze when the walk ends (§3 C6, P5; §4). No custom end date and no extending in v1 |
