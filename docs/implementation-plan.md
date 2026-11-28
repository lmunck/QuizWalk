# Implementation plan

Written 2026-11-25, after the UX and design reviews. It replaces the milestone detail that used
to live only in `v1-spec.md` §17. The spec says **what** is built, `m1-design.md` says **how**
M1 is put together, and this document says **in what order**, and how each step is checked.

Where this plan and the spec disagree, the spec wins and this plan should be fixed.

## Where things stand

Updated 2026-11-28, after the M2 wrap-up, M3, the M4 backend and M5's privacy work. Delivery
notes: [`m1-delivery.md`](m1-delivery.md), [`m2-m3-delivery.md`](m2-m3-delivery.md),
[`m5-privacy-delivery.md`](m5-privacy-delivery.md),
[`m4-backend-delivery.md`](m4-backend-delivery.md); how to test: [`user-testing.md`](user-testing.md).

| Area | State |
|---|---|
| Repo, CI, hosting, dev builds on both phones | Done (M0) |
| `shared/` | Rules, scoring, totals, ranking, progress, `walkProblems`, team colours and names, formatting, stop insertion, pocket-mode accuracy steps, *Directions* links; from M4 the categories, route geometry and phone-side Refresh helpers, bank rules and the callable contracts: 161 unit tests |
| Security rules | Spec §7 in full, including the M4 collections: 50 allow/deny tests against the emulator, in CI, plus 4 from M5 showing deletion is server-only (`rules-tests/privacy.test.ts`; no rule changed). Deployed |
| Cloud Functions | `publishWalk`, `openWalk`, `deleteWalk`, `duplicateWalk`, `onAnswerCreated`, `onTeamUpdated`, `onStopUpdated`, `onWalkStatusChanged`, `onAlertCreated`, `hourly`, and from M4 `routeForView`, `reroute`, `generateWalk`, `swapQuestion`, `topUpQuestions`, `onQuestionReported`, `onStopWritten`: 48 unit tests (M4's on recorded service answers) and 46 tests against the emulator, in CI. M4's deployed to `qualk-a173e` on 2026-11-27; `onTeamUpdated` goes out with the next deploy from `m2-m5`. From M5 `deleteMyData`, `deleteAccount` and `daily`, with 7 more emulator tests; deployed 2026-11-28 |
| Privacy (M5·1, 2026-11-28) | `qualk.dk/privacy` live; S1 *Delete my data* (players) and *Delete account and all data* (creators); 30-day retention with join-code release. App Check on Firestore stays in monitor mode until Play Integrity exists; the steps to enforce are in [`m5-privacy-delivery.md`](m5-privacy-delivery.md) |
| App | Every M1 screen (G1, C1–C6, C9, S1, P0–P6, G2, G6), all of M2 (C7, C8, share cards, duplicate and delete, push tokens and notification taps) and M3's pocket mode and *Directions*. Verified end to end on the iOS simulator against the emulators, including a simulated walk with the app in the background |
| Native build | All native modules in one build, including M2/M3 needs (task manager, notifications, background-location config). New app icon and splash; an Android notification icon from M3. `preview` builds with pocket mode started 2026-11-27 (links in `m2-m3-delivery.md`) |
| Firebase app registrations, Maps key, App Check, EAS builds with the real config | Done on 2026-11-26, except the Google Maps key for Android (yours, `user-testing.md` part 2) |
| Pocket mode (A7, M3·1–3) | Built on "When In Use" for both platforms, one switch per platform for the alternative (`app/src/location/tuning.ts`). Settled from expo-location 58's code and the iOS simulator; the walk with a phone in a pocket is yours |
| Battery (M3·4) | Knobs in place with defaults from spec §9; measuring on phones is yours |
| M2 account steps | FCM V1 key for Android pushes, the Play closed test, the three-phone check: yours, in `m2-m3-delivery.md` |
| M4 backend (2026-11-27) | Routing (`routeForView`, `reroute`), the question bank (categories, rules, fill script, top-ups, reports and counts), `generateWalk` and `swapQuestion`, with their contracts in `shared/`. Deployed to `qualk-a173e`; the bank is filled. Details and what's left: [`m4-backend-delivery.md`](m4-backend-delivery.md). The M4 screens (C2 map, C3, *Swap*, *Suggest a question*, *Report question*) are next |
| Store paperwork (M5·4, 2026-11-28) | App Store and Play listings, privacy label and Data safety answers, review notes, screenshot plan and the release checklist in [`store/`](store/checklist.md). Nothing submitted; the checklist lists six places where code and spec differ, the M4 screens and *Report question* first |
| Google Play Console account and app | Still open (spec §18) |

## How the work is ordered

1. **Native first.** A dev build takes 30–45 minutes per platform. Every native library v1
   needs goes into the first build of M1, including ones not used until M2 and M3.
2. **Rules before screens.** The security rules and their tests are written before any screen,
   so every screen is built against the real rules.
3. **Playing before making.** Location unlock on a real street is the riskiest part of the
   experience. A walk seeded by script lets it be field-tested weeks before the editor exists.
4. **Each step ends on your phones**, with a short check you run yourself.
5. **Logic goes into `shared/` with a test**; screens and functions stay thin.
6. **Calendar-bound tasks start early.** The Play closed test needs 12 testers for 14 days and
   cannot be compressed, so it starts in M2, not M5.

Console and account tasks are yours (spec §18). Each is walked through when its step arrives,
with the Android side spelled out.

---

## M1·A — Native spine

**Goal:** both phones run a build that contains everything native, talk to Firebase under the
real rules, and can sign in. No product screens yet.

| # | Work | Check |
|---|---|---|
| A1 | **You:** register the iOS and Android apps in Firebase, download the two config files, add the Android SHA-1, create the Maps key, enable App Check and register debug tokens (spec §18, M1 items) | Config files are in `app/`; `npm run config -w app` passes |
| A2 | Add every native dependency and config plugin in one change: React Native Firebase (app, auth, firestore, functions, app-check), `react-native-maps`, `expo-location`, `expo-task-manager`, `expo-notifications`, `expo-apple-authentication` (with `ios.usesAppleSignIn`), Google sign-in, `expo-keep-awake`, AsyncStorage, `react-native-svg` + QR, `expo-sharing`, `react-native-view-shot`, `expo-build-properties` (dynamic frameworks). Permission strings for location | CI's app-bundle job is green; one EAS dev build per platform installs and starts |
| A3 | `firestore.rules` from spec §7, with an allow and a deny test per bullet in `rules-tests/`. The `walks` index for Home | `npm run test:rules` green in CI |
| A4 | `src/data/` skeleton with converters, `src/auth/` with anonymous sign-in at launch. ESLint rule that keeps Firebase imports out of screens and components | The app shows its anonymous uid; a doc written from the phone appears in the console |
| A5 | Apple sign-in (iOS) and Google sign-in (both), linking to the anonymous user, the *Your name* field, the walk-in-progress guard (m1-design §6) | Sign in on both phones; the uid is unchanged after linking; signing in with an account that already exists is handled, not a crash |
| A6 | Functions pipeline: `publishWalk` as the first callable, App Check enforced, deployed to `europe-west1` | A call from each phone succeeds; a call without App Check is rejected |
| A7 | **Pocket-mode spike.** A throwaway dev screen starts background location updates with a foreground service and only When-In-Use permission, logs fixes and fires a local notification near a point. Lock the phone, walk 200 m, on both phones. On iOS the same walk also tests a location-triggered local notification for the same point (spec §9, fallback 1), including whether `expo-notifications` can schedule one or a few lines of Swift are needed | A written answer in spec §9: works as assumed, or which fallback applies. The screen is deleted afterwards |
| A8 | A map screen with one draggable pin on both platforms | The pin drags on both; Google Maps tiles load on Android |

**Decision point after A7.** If pocket mode cannot run on When-In-Use permission, M3 is
re-planned around the fallbacks in spec §9 before M2 starts. Nothing in M1 or M2 depends on it.

**Fallback inside A5.** If the Google OAuth callback does not return under SDK 58's scene
lifecycle, switch Google sign-in library as m1-design §13 says. That costs one more build,
which is why it is found here and not in step C.

---

## M1·B — Play a walk

**Goal:** a player's whole experience, on a walk that a script puts into Firestore.

| # | Work | Check |
|---|---|---|
| B1 | `scripts/seed-walk` (Admin SDK): creates an owner, a walk with stops at coordinates you pass in, a join code, and can set it `ready`, `open` or `ended`. Works against the emulator and the real project | A walk around your block exists with a code |
| B2 | `onAnswerCreated` (shell around `recomputeTeamTotals`) and `hourly` auto-end, with unit tests for the shells against the emulator | An answer doc created by hand gets points and the team gets totals |
| B3 | Components from the tokens: buttons (accent, secondary, destructive), text styles with scaling, card, banner, sheet with three heights, confirm dialog, team marker. 48 pt targets | A dev gallery screen shows them at the largest text size without clipping |
| B4 | P0 join sheet, the deep link, and the `/play` page's link to the app. P1 join (summary, estimate, solo/team, name, location permission, precise-location check) | Typing the code and tapping the link both reach P1 on both phones; a wrong code says so inline |
| B5 | P2 lobby: waiting state, live switch to *Start walk*, distance to start, other teams, edit team, leave | Seed script opens the walk; the lobby changes without a reload |
| B6 | `src/location/`: `useArrival`, `useHeading`, distance walked, position upload after *Start walk* | Unit tests for the pure parts; live values on a debug overlay |
| B7 | P3 walk to stop: distance, arrow or text bearing, map, progress marks, screen kept awake, weak-GPS and offline banners, walk menu (standings, answers, rules, leave), reaction to a removed stop and an ended walk. Dev-only *Simulate arrive* | Walk to a seeded stop and see it unlock |
| B8 | P4: Arrived step, question with the draining bonus, persistent clock, feedback with points and explanation, haptics | Backing out or restarting does not reset the clock |
| B9 | G6 can't reach: *I'm here*, *Skip*, *Way blocked* | Each moves the team on; the alert doc exists |
| B10 | P5 finish, standings so far (week-long walks), P6 final results with shared ranks, the unsent-answers notice | Seed script ends the walk; P6 appears with ranks from `rankTeams` |
| B11 | Home (C1) with the Playing section only, and resume from it or from the code | Force-quit mid-walk, reopen, continue at the right stop |
| B12 | Error and empty states for the player side (m1-design §11) | Each is reachable and reads correctly |

**Field test 1 (you, both phones):** a seeded walk of 5–6 stops near home, including one stop
in a narrow street and one in the open. Walk it once per phone. Note where stops unlocked early,
late or not at all, how the arrow behaved, and battery use. Put one phone in airplane mode for
two stops. Findings go into spec §4 (radius, widening, *I'm here* distance) before step C.

---

## M1·C — Make a walk

**Goal:** a creator can build, share, open and end a walk without the seed script.

| # | Work | Check |
|---|---|---|
| C1 | G1 Welcome with the two equal choices; first-run routing (link skips it); sign-in only from *Create a walk* | A fresh install opened from a link never shows Welcome or sign-in |
| C2 | Home's creator sections (Live, Ready, Drafts, Finished) and card destinations; S1 settings without deletion | Cards land on the right screen for each status |
| C3 | Create (title only), then C4 route builder: Start pin, add stop by long-press, search and *Add stop here* (G2), drag pins, reorder with the handle and with *Move up/down*, delete, pin↔row selection, straight-line distance and time estimate, title editing | Build a 5-stop walk outdoors with *Add stop here* |
| C4 | C5 edit stop: answer rows, correct radio, explanation, hint, radius, *Move pin* with crosshair, unsaved-changes guard, delete | Every field survives save and reopen |
| C5 | `walkProblems` in `shared/` with tests; used by C4's blocking list, `publishWalk` and `openWalk` | The same walk is blocked with the same message on the phone and by the server |
| C6 | Preview: P4's question view over local state | Steps through every stop; writes nothing |
| C7 | Publish, then C6 share: code, QR, link, *Play as*, players per team, *When* line, live list of joined teams, *Share invite* | The shared message opens the app on the other phone |
| C8 | `openWalk` and the *Open walk* confirm (Today / This week); the open state of C6 with teams, scores and *End walk*; C9 results without the share card | Open, play on the other phone, end, both see the same results |
| C9 | Creator-side error states: publish blocked, open blocked, no network while editing | Each is reachable |

**Done when** the nine-step two-phone test in m1-design §12 passes, and
`npm run typecheck && npm run lint && npm test && npm run test:rules` and CI are green.

**Field test 2:** build a walk by hand in a place you do not know by heart, hand the code to
someone who has never seen the app, and watch without helping. Their hesitations are the input
to M2.

---

## M2 — Creator live tools

| # | Work |
|---|---|
| 1 | **You:** push credentials (spec §18). Start the Play closed test with the M1 build |
| 2 | Push plumbing: tokens on `users` and `teams`, permission asked in the lobby and on first *Open walk* (spec §11), `onWalkStatusChanged`, `onAlertCreated`, the "everyone has finished" and per-team pushes |
| 3 | C7 live monitor: map with last-known positions, stale dimming, leaderboard sheet, *Invite* pill, alerts strip, *End walk* with its count, the all-finished banner, the week-long variant |
| 4 | Skip for everyone: `onStopUpdated` reusing `recomputeTeamTotals`; P3's "stop removed" notice against a live change |
| 5 | C8 team detail |
| 6 | Share cards for C9 and P6, and *Share invite* gaining the image |
| 7 | `duplicateWalk`, `deleteWalk`, and Home's ⋯ menu |

**Check:** three phones or two phones and the seed script: one creator watching, one team
reporting a blocked way, the stop skipped for everyone, scores recalculated on all screens,
pushes arriving with the app closed.

---

## M3 — Out in the real world

Scope depends on the A7 spike.

| # | Work |
|---|---|
| 1 | Pocket mode behind the same `src/location/` hooks: background updates, Android foreground-service notification, arrival notification that opens P4, accuracy stepping within 300 m of the stop |
| 2 | P3's copy and keep-awake switch over; the notification prompt copy changes (spec §11) |
| 3 | *Directions* to Apple / Google Maps |
| 4 | Battery measurement on both phones over a 60-minute walk, and tuning |
| 5 | A week-long walk left open for several days, with teams starting on different days |

**Field test 3:** a full walk with phones in pockets, one phone on mobile data only.

---

## M4 — AI generation

| # | Work |
|---|---|
| 1 | **You:** ORS and Gemini keys as Firebase secrets (`ORS_API_KEY`, `GEMINI_API_KEY`; Gemini instead of OpenRouter, decided 2026-11-27). Done 2026-11-27 |
| 2 | Routing module and `reroute`: snapping, real polyline and distance, "off path" / "on water" warnings in C4 |
| 3 | `routeForView` and C2's map screen: *Refresh*, the stop-spacing check on the phone and on the server, zoom and turn buttons, the default number of questions |
| 4 | Question bank: categories in `shared/`, the script that fills the bank with its fact-check pass, `topUpQuestions`. Replace `topic` with `categories` in the shared types and `duplicateWalk` |
| 5 | `generateWalk` (naming stops, picking questions, *Local* questions, the title) with `generationJobs` and C3, including leaving and returning |
| 6 | `swapQuestion`: C5's *Swap* and G2's *Suggest a question* as accept/discard |
| 7 | *Report question* on P4, `onQuestionReported`, bank counts in `onAnswerCreated`, rules for the new collections and their tests |
| 8 | *New route*, *Play it myself*, rate limiting |

Design: [`m4-generation-design.md`](m4-generation-design.md). The server side of rows 2 and 4–7 was built on 2026-11-27 and is deployed: [`m4-backend-delivery.md`](m4-backend-delivery.md). The contracts the screens are built against are in the design doc's §11.

**Check:** generate walks in a city centre, a suburb, a village and a forest, at several zoom
levels and directions, and walk one. Before the bank goes live, read a sample from every
category. Read every *Local* question against its source before trusting the fact-check pass.

---

## M5 — Release

| # | Work |
|---|---|
| 1 | Privacy page; `deleteAccount`; participant *Delete my data*; the `daily` retention job with join-code release. **Done 2026-11-28** ([`m5-privacy-delivery.md`](m5-privacy-delivery.md)) |
| 2 | App Check enforced on Firestore, after a period in monitor mode shows no legitimate traffic failing. **Decided 2026-11-28:** monitor mode until Play Integrity exists, because enforcement is per service, not per platform; then callables first, a week of watching, then Firestore (steps in `m5-privacy-delivery.md`) |
| 3 | Accessibility pass with VoiceOver and TalkBack on every screen at the largest text size |
| 4 | Store listings, screenshots, privacy labels and Data safety, review notes for location. **Written 2026-11-28** ([`store/checklist.md`](store/checklist.md)); nothing uploaded yet |
| 5 | TestFlight and the Play closed test (running since M2) → production |

---

## Open points that can change this plan

| Point | Settled in | Effect if it goes the wrong way |
|---|---|---|
| Pocket mode on When-In-Use permission | Simulator 2026-11-27; real phones in field test 3 | Flip `POCKET_ENGINE` per platform, then the spec §9 fallbacks |
| Google sign-in library under SDK 58 | M1·A (A5) | One more build cycle |
| Unlock radius and widening on real streets | Field test 1 | Constants in `shared/rules.ts` and the default radius change |
| Play Console account | Your task, M0 | Android stays on debug App Check tokens and cannot start the closed test |
| Mockups | Not planned | Screens are built from spec §3. If you want the mockups redrawn first, that is a separate piece of design work before M1·B |
