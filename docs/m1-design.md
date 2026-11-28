# M1 design: manual walk, end to end

The architecture M1 establishes, decided before implementation so the details have something
to hang on. Scope is `docs/v1-spec.md` §17 M1, built in three steps (A native spine, B play a
walk, C make a walk) whose order and checks are in `docs/implementation-plan.md`. This document
covers **how**; the spec covers **what**. Where they disagree, the spec wins and this document is wrong and should be fixed.

Everything here was checked against the Expo SDK 58 and React Native Firebase docs on
2026-11-24. Versions move; re-check before changing a dependency.

## 1. What M1 delivers

Welcome · sign in · create a walk by hand · add stops on a map · write questions · preview ·
publish · join by code and link · walk with foreground location unlock · arrive · answer ·
score · finish · leaderboard · get back into a walk after closing the app.

Screens: **G1, C1, C2, C4, C5, C6, S1, P0, P1, P2, P3, P4, P5, P6, G2, G6** and the error and
empty states in §3 of the spec. C2 in M1 is only *Build it myself* (title + start); the
*Generate for me* choice is hidden until M4, and so is *Suggest a question* in G2.

Out of M1, by milestone: live monitor and team detail (C7/C8, M2) · push notifications (M2) ·
results share card (C9 share image, M2) · duplicate and delete from Home (M2) · background location and battery tuning (M3) · all AI generation and C3 (M4) · account deletion and the
privacy page (M5).

**Two things M1 cannot have, and must not pretend to have.** The OpenRouteService key is an M4
manual task (§18), so M1 has no path snapping, no walking route, no `route.polyline` and no
"off path" / "on water" warnings. `walks/{id}.route` stays `null` and C4 draws straight lines
between stops in map order. Distance shown to the creator is the sum of straight-line legs,
labelled as such. The `reroute` callable is not written in M1.

**Opening and ending a walk are in M1**, because the definition of done needs them. C7 is not:
until M2 the open state of C6 lists the teams with their scores and carries *End walk*.

## 2. Dependencies, and why

| Need | Choice | Why |
|---|---|---|
| Firestore + Auth | `@react-native-firebase/app`, `/auth`, `/firestore` | Offline persistence and background work need the native SDK. The JS SDK is Expo Go-friendly but we already require a dev build. |
| Maps | `react-native-maps` 1.29.11 | **`expo-maps` cannot do this job.** `AppleMapsMarker` has no `draggable` property — drag is Android-only — and C4/C5 are built on dragging pins. Apple Maps marker callbacks there also need iOS 18. |
| Apple sign-in | `expo-apple-authentication` ~58.0.3 | §2. iOS only, which matches the spec. |
| Google sign-in | `react-native-nitro-google-signin` | Android Credential Manager is free here. The legacy `play-services-auth` SDK that `@react-native-google-signin`'s free tier uses on Android is deprecated by Google; Credential Manager is behind that library's paid tier. |
| Location | `expo-location` ~58.0.22 | Foreground in M1; the same module does background and geofencing in M3. |
| Background tasks | `expo-task-manager` ~58.0.14 | M3 needs it, and the pocket-mode spike in step A needs it now. In the first build. |
| Notifications | `expo-notifications` | Used from M2, but it is a native module with a config plugin, so it goes into the first build rather than costing a rebuild later. |
| Local storage | `@react-native-async-storage/async-storage` | Holds `openedAtClient` for the question on screen, so the bonus clock survives a restart (§7). |
| Share sheet | React Native's own `Share` | C6 *Share invite* is text and a link; no library. Image share cards (M2) will need `expo-sharing` + `react-native-view-shot`, also added to the first build. |
| QR | `react-native-qrcode-svg` + `react-native-svg` | C6 shows a join QR. |
| Screen awake | `expo-keep-awake` | Until M3 a stop only unlocks while the app is on screen, so P3 must not let the phone sleep. Removed from P3 when pocket mode lands. |

There is no in-app QR scanner (spec §16): the phone's camera opens the join link, so the app
never asks for camera permission and `expo-camera` is not a dependency.

The compass arrow (P3) uses `watchHeadingAsync` from `expo-location`, and haptics use React
Native's own `Vibration`, so neither adds a native module.

### Native constraints these impose

These are build-breaking, not stylistic:

- **iOS frameworks must be `dynamic`.** React Native Firebase states that `pod install` and
  prebuild fail with `useFrameworks: "static"` or `disableSPM: true`. Most third-party guides
  say `static`; they are wrong for this version.
  `["expo-build-properties", { "ios": { "useFrameworks": "dynamic" } }]`
- **RNFirebase v27 is SPM-only**, and SPM requires dynamic frameworks. Firebase and Google
  sign-in must use the **same** dependency manager, so nitro is configured for SPM too.
- `@react-native-firebase/app` comes **first** in `plugins`.
- New Architecture enabled (RN 0.88 default), Android `minSdk` 24, iOS deployment target 15.0.
- **Only the modular API.** The namespaced API was removed in v26. No `firebase.firestore()`.
- Expo SDK 58 has UIKit scene lifecycle on by default. Do **not** set nitro's
  `enableSceneSupport`. The Google OAuth callback has to be verified in the first dev build —
  if the callback does not return, that is the cause, not a code bug.
- Config files are declared as `android.googleServicesFile` and `ios.googleServicesFile`.

## 3. Module boundaries

```
app/src/
  app/              Expo Router routes ONLY. No Firestore imports, no business logic.
  data/             The only place that talks to Firestore. One module per aggregate.
  auth/             AuthProvider, sign-in methods, anonymous linking.
  location/         Position watching and arrival detection. Swappable for M3.
  components/       Presentational, reusable. No data access.
  theme/            tokens.ts (already present).
  tasks.ts          TaskManager.defineTask calls, imported from app/_layout.tsx (M3).
```

**The enforceable rule:** nothing under `src/app/` or `src/components/` may import
`@react-native-firebase/*`. Screens get data from `src/data/` hooks. This is enforced by an
ESLint `no-restricted-imports` rule, not by good intentions, because this is the boundary that
decays first under time pressure.

Business rules live in `shared/` — written and unit-tested: unlock, scoring, `recomputeTeamTotals`,
`rankTeams`, `everyoneFinished`, `walkEndsAtMs`, `walkDistanceM`, `estimateWalkMinutes` — and are
imported by the app and by Cloud Functions. **No scoring, ranking, radius or distance arithmetic in the app.**
If a rule is needed and missing, add it to `shared/` with a test.

## 4. Data access

`src/data/` exposes hooks over Firestore `onSnapshot`, one module per aggregate: `walks`,
`stops`, `teams`, `answers`, `positions`, `alerts`, `joinCodes`.

Each module exports typed read hooks (`useWalk(walkId)`, `useStops(walkId)`,
`useTeams(walkId)`, `useMyAnswers(walkId, uid)`) and plain async write functions
(`createDraft`, `updateStop`, `joinWalk`, `submitAnswer`, `reportBlocked`). Hooks return
`{ data, loading, error }` and nothing else.

**No React Query, no Redux, no Zustand.** Firestore's native SDK is already a local cache with
a realtime push feed. A second cache layer would duplicate it and the two would disagree
offline, which is exactly the case M3 depends on. Local UI state stays in `useState`.

Types come from `@qualk/shared`. Converters live in `src/data/converters.ts` and are the only
code that knows about Firestore `Timestamp` and `GeoPoint`; everything above sees `TimestampLike`
and `LatLng`.

## 5. The write boundary

This is the core decision of M1. Three categories, and nothing moves between them casually.

**Written by the client, directly to Firestore.** These must work with no network, so they can
never be callables:

- `teams/{uid}` create (with zeroed totals and a `colorIndex`), updates to
  `name, players, pushToken, startedAt, leftAt, lastSeenAt, distanceWalkedM`, and delete before
  *Start walk*
- `users/{uid}.playing` — the walks joined on this phone, which is how Home's Playing section
  finds them. Written with the join, trimmed on *Leave walk*
- `answers/{stopId}` create — once, client fields only
- `positions/{uid}` overwrite
- `alerts/{id}` create
- `walks/{id}` and `stops/{id}` edits by the owner while `draft`/`ready`. Every batch that adds,
  removes, moves or reorders a stop also writes the walk's `stopCount` and `distanceM`
  (`walkDistanceM` from `shared`)
- the owner's `open → ended`

**Written only by Cloud Functions.** Rules reject these from clients:

- `teams/{uid}.score, correctCount, stopsDone, finishedAt`
- `answers/{stopId}.points, correct`
- `walks/{id}.status` (except `open → ended`), `joinCode`, `openFor`, `openedAt`

**Functions.** Callables only where validation or allocation must be authoritative:

| M1 function | Type | Does |
|---|---|---|
| `publishWalk` | callable | Validate (≥1 stop, every stop has a question, 2–4 non-empty options, a correct index), recompute `stopCount` and `distanceM`, allocate a unique join code, `draft → ready` |
| `openWalk` | callable | Validate again, then `ready → open` with `openFor` and a server `openedAt`. A callable because a `ready` walk can still be edited, so a client write could open a walk that no longer passes the publish checks. Opening needs a connection anyway |
| `onAnswerCreated` | trigger | Thin shell around `recomputeTeamTotals`: write `points`/`correct` on the answer and `score, correctCount, stopsDone, finishedAt` on the team |
| `hourly` | scheduled | Auto-end walks past `walkEndsAtMs(openedAt, openFor)`. Reads `walks` where `status == 'open'` and filters in code, so no composite index |

Validation is one pure function in `shared/` (`walkProblems(walk, stops)`), used by `publishWalk`,
`openWalk` and by C4 to list what blocks publishing, so the app and the server cannot disagree.
It is written in step C with its tests.

Nothing runs when a walk ends in M1: ranks are derived on each phone with `rankTeams`, and rules
stop new answers, so there is nothing to freeze. `onWalkStatusChanged` arrives in M2 for the push.

`duplicateWalk`, `deleteWalk`, `deleteAccount`, `reroute`, `generateWalk`, `swapQuestion` (once `suggestQuestion`) and
the retention job are later milestones. **App Check** (App Attest / Play Integrity) is required
on callables per §8; it is wired in M1 because retrofitting it means re-testing every call site.
Play Integrity needs the app to exist in the Play Console (§18, still open), so until then the
Android dev build runs on an App Check debug token.

### Trusting the client's clock, safely

§4 measures answer time with the phone's clock so offline answers keep their true timing. So
`elapsedMs` is client-supplied and cannot be verified. The server therefore:

1. Checks `elapsedMs` against `answeredAtClient - openedAtClient`; if they differ by more than
   2 s, it scores with no speed bonus rather than rejecting the answer.
2. Clamps it to `[0, SPEED_BONUS_WINDOW_MS]`. Both steps are `trustedElapsedMs` in `shared/`.
3. Recomputes points with `scoreAnswer` from `shared/`, from the stop's `correctIndex`. The
   client's own `points`/`correct` are never read.

The worst a cheating client achieves is a full speed bonus on a correct answer. That is an
acceptable trade for offline play in a friendly walking game; locking it down would mean a
server round trip per answer, which §9 rules out.

### Idempotent totals

`onAnswerCreated` does **not** increment. In a transaction it reads all of the team's answers
and all stops, and derives `score`, `correctCount`, `stopsDone` and `finishedAt` from scratch.
This is at most 12 stops, so cost is irrelevant, and it buys three things: retries are safe,
`skippedForAll` recalculation (M2) reuses the identical code path, and a totals bug can be
fixed by rewriting one answer doc.

The derivation is a **pure function in `shared/`** — `recomputeTeamTotals(answers, stops)` —
unit-tested there. The trigger is a thin shell around it.

## 6. Auth

Anonymous sign-in on first launch, always, for everyone. Participants never go further.

A creator signing in with Apple or Google **links** the credential to the existing anonymous
user (`linkWithCredential`), so anything they joined as a participant survives. If linking
fails with `credential-already-in-use`, sign in with that credential instead and accept that
the anonymous data is orphaned — explain it in one line rather than failing silently.
**Except when the anonymous user has a walk in progress** (`playing` holds a walk that is `ready`
or `open`): then the sign-in is refused with "Finish or leave your walk first", because orphaning
the team would throw a player out of a walk mid-way.

Apple on iOS, Google on both. Apple returns the name and email **only on the first sign-in**,
so `users/{uid}.displayName` is written at that moment or it is lost forever. Apple can also
withhold it, so the first sign-in always ends on one field, *Your name, as players see it*,
prefilled when a name came through. `walks.ownerName` is copied from it when a walk is created.

`AuthProvider` in `src/auth/` owns the state: `{ user, isCreator, loading }`. `isCreator` means
the user has a non-anonymous provider — not a role in the database.

## 7. Routes

```
src/app/
  _layout.tsx                  AuthProvider, theme, anonymous sign-in gate
  welcome.tsx                  G1 first run without a link: Join a walk / Create a walk
  index.tsx                    C1 Home — Playing first, then my walks (first-run empty state)
  settings.tsx                 S1 (no account deletion in M1)
  join.tsx                     P0 join sheet (modal), also the deep-link target
  walk/[walkId]/
    edit.tsx                   C2 create (title only in M1)
    route.tsx                  C4 route builder
    stop/[stopId].tsx          C5 edit stop
    preview.tsx                C4 Preview: P4's question view over local state, nothing written
    share.tsx                  C6 share, see who joined, open walk (confirm); once open: teams + End walk
    results.tsx                C9 results (no share card in M1)
  play/[walkId]/
    index.tsx                  P1 join this walk
    lobby.tsx                  P2 lobby
    stop.tsx                   P3 walk to stop (current stop from team progress) + walk menu
    question.tsx               P4 two steps: Arrived, then Question
    finish.tsx                 P5 finish
    results.tsx                P6 final results
```

Internally everything is addressed by `walkId`. A join **code** appears only at the entry
points: the deep link `https://qualk.dk/play?code=K72QX` and the P0 sheet. Both resolve the
code through `joinCodes/{code}` and then navigate to `play/[walkId]`. Rules allow `get` but not
`list` on `joinCodes`, and `get` requires a signed-in user, so **code resolution must happen
after anonymous sign-in completes** — the root layout gates on it.

`P3` derives the current stop from the team's answers, not from local state, so killing the app
mid-walk loses nothing. The way back in is Home's Playing section (`users/{uid}.playing`), or
entering the same code again: `join.tsx` checks for an existing `teams/{auth.uid}` and resumes
instead of showing P1 (clearing `leftAt` if the team had left).

*Leave walk* before *Start walk* deletes the team. After it, it sets `leftAt`, stops position
uploads and removes the walk from `playing`; the team keeps its score.

**The bonus clock starts on *Show question*, not on arrival.** `openedAtClient` is taken at
that tap. The Arrived step exists so a team sharing one phone can gather before the 20 seconds
run, and it is where the hint is shown. `openedAtClient` is saved to AsyncStorage under
`walkId/stopId` at the tap and read back when `question.tsx` mounts, so backing out or
restarting the app resumes the same clock instead of handing out a fresh one.

A link on first launch skips `welcome.tsx` and sign-in entirely. Sign-in is reached only from
*Create a walk* / *New quiz walk*.

## 8. Offline

Firestore persistence is on by default in the native SDK; M1 keeps it on and does not fight it.

The rule that makes offline work: **the whole walk is in the cache before the walk starts.**
P2 (lobby) reads every stop once, so P3/P4 need no network. The 20-second timer uses
`Date.now()`. Answers are written to Firestore and queued by the SDK when offline; the UI
treats a queued write as done, because it is — scoring catches up when the phone reconnects.

The one thing that visibly needs network is the leaderboard, and P5 says so rather than
spinning.

An answer still queued when the walk ends is rejected by the rules when it finally syncs (spec
§4). The SDK then rolls the local write back, so the app listens for that rejection and shows
"2 answers didn't reach us before the walk ended" on P6 instead of letting them vanish.

## 9. Location in M1

Foreground only: `watchPositionAsync` with `Accuracy.High` (`Balanced` is documented as
"accurate to within one hundred metres", useless against a 25–60 m radius). Arrival uses
`canUnlock` from `shared/`.

P3 holds the screen awake with `expo-keep-awake` and tells the player to keep Qualk open. The
"keep the phone in your pocket" copy from the mockup is an M3 promise and must not ship before.

Positions are written only after *Start walk*. The lobby's distance-to-start is local.

`src/location/` exposes `useArrival(stop)` returning `{ distanceM, accuracyM, unlocked, canImHere }`
(`canImHere` from `canUseImHere(distanceM, accuracyM)`), and `useHeading()` (`compass.ts`)
returning `{ bearingToTarget, reliable }` so P3 can swap the arrow for a text bearing. The
iPhone's heading comes from Core Location. Android's comes from the fused rotation-vector
sensor through the local module `app/modules/qualk-heading`, because expo-location's Android
heading uses the raw magnetometer and jumped on the first field test (2026-11-28). Readings are
smoothed in `shared/src/compass.ts`.
M3 adds background updates behind the same hooks without touching a screen (`pocket.ts`; how
and why in `m2-m3-delivery.md`). Geofencing was considered and not used: on iOS it needs
"Always" permission, which spec §9 rules out.

G6 "Can't reach" is in M1: *I'm here* (`distance − accuracy ≤ 150 m`, no speed bonus), *Skip*
(0 points, confirm), *Way blocked* (writes a `skipped` answer and an alert in one step, so the
team moves on; the creator acting on the alert is M2).

## 10. Rules and indexes

`firestore.rules` is deny-all today. Step A implements §7 in full — before any screen, and
including the parts whose screens arrive in M2, because rules are cheap to write and expensive to
retrofit, and every later step is then built against the real rules.

`rules-tests/firestore.test.ts` gets a positive and a negative case for **every bullet in §7**.
CI already runs it. The negative cases are the point: a participant writing `score`, a creator
editing a stop while `open`, a team creating a second answer for one stop, a stranger reading
`positions`, an owner writing `status: 'ready'` or a `joinCode` directly, a team created with a
score, `startedAt` rewritten, an answer created after the walk ended, a stranger reading a draft.

Indexes: one composite, `walks` on `ownerUid` asc + `updatedAt` desc, for C1. The leaderboard
is **not** indexed — a walk has at most a few dozen teams, so teams are read and sorted
client-side with `compareTeams` from `shared/`, which keeps one ranking implementation.

## 11. Error and empty states

| State | Where |
|---|---|
| Invalid or expired code | P0, inline under the input |
| Answers unsent when the walk ended | P6, one line with the count |
| Open blocked | C6 lists what the walk needs, as C4 does for Publish |
| Walk already ended | P1 → read-only C9/P6 |
| Location permission denied | P1, explain + open Settings (`Linking.openSettings()`, which works on both platforms) |
| Precise location off | P1 and P3. iOS reduced accuracy / Android approximate-only can never unlock a stop: explain + open Settings |
| Stop removed, or walk ended, while walking | P3 reacts to the snapshot: a notice and the next stop, or P6 |
| Publish blocked | C4 lists the stops that need a question, answers or a correct answer |
| No network while creating or editing | C2/C4/C5 banner; edits queue |
| First-run Home | C1 empty, *Join with code* and *New quiz walk* |
| Walk not open yet | P2 waiting state |

## 12. Definition of done

This is the check for step C, and so for M1 as a whole. Steps A and B have their own checks in
`implementation-plan.md`. Two phones, one walk, no code changes between them:

1. iPhone: first launch shows Welcome; *Create a walk* → sign in with Apple, create a walk, add
   3 stops on the map, write 3 questions, preview them, publish.
2. iPhone: share screen shows a 5-character code and a QR, and *Open walk* asks before opening,
   with the choice *Today* or *This week*.
3. Android: open `https://qualk.dk/play?code=…` → the app opens (not the browser), with no
   welcome screen and no sign-in → join as a team.
4. Android: lobby shows the walk, distance to start, and the team.
5. iPhone: open the walk. Android's lobby shows "Start walk" without a reload.
6. Android: walk to stop 1, the Arrived step appears within the radius, *Show question* starts
   the bonus clock, answer, see points and explanation.
   Then force-quit the app, reopen it, and get back to stop 2 from Home's Playing section.
7. Put the phone in airplane mode, answer stop 2, re-enable network, and the score catches up.
8. Answer stop 3, see P5, then the leaderboard.
9. iPhone: the share screen now lists the team with its score. End the walk. Both phones show
   final results with matching ranks.

Plus: `npm run typecheck && npm run lint && npm test && npm run test:rules` green, and CI green.

## 13. Risks

| Risk | Handling |
|---|---|
| nitro + SPM + scene lifecycle on SDK 58 is a new combination | Prove it in the first dev build, before any screen is built. If the OAuth callback does not return, fall back to `@react-native-google-signin` with SPM. |
| No ORS key in M1 means no real route | Straight lines, labelled. Do not design C4 around a polyline that is not there. |
| Dev build cycle is 30–45 min | Land every native dependency in one build. Adding a library later costs another cycle on both platforms. |
| Apple name/email arriving only once | Write `users/{uid}` in the same handler that receives the credential. |
| App Check blocking the emulator and dev builds | Register debug tokens before wiring callables, or every call fails opaquely. |
| Pocket mode (M3) may need "Always" location, against spec §9 | Step A includes a throwaway screen that starts `startLocationUpdatesAsync` with a foreground service and only When-In-Use permission, then locks the phone and walks. The result is written into spec §9 either way. |
