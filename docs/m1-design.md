# M1 design: manual walk, end to end

The architecture M1 establishes, decided before implementation so the details have something
to hang on. Scope is `docs/v1-spec.md` §17 M1. This document covers **how**; the spec covers
**what**. Where they disagree, the spec wins and this document is wrong and should be fixed.

Everything here was checked against the Expo SDK 58 and React Native Firebase docs on
2026-11-24. Versions move; re-check before changing a dependency.

## 1. What M1 delivers

Sign in · create a walk by hand · add stops on a map · write questions · publish · join by
code and link · walk with foreground location unlock · answer · score · finish · leaderboard.

Screens: **C1, C2, C4, C5, C6, S1, P0, P1, P2, P3, P4, P5, P6, G2, G6** and the error and
empty states in §3 of the spec.

Out of M1, by milestone: live monitor and team detail (C7/C8, M2) · push notifications (M2) ·
results share card (C9 share image, M2) · background location, offline-first hardening and
weak-GPS widening in the field (M3) · all AI generation and C3 (M4) · account deletion and the
privacy page (M5).

**Two things M1 cannot have, and must not pretend to have.** The OpenRouteService key is an M4
manual task (§18), so M1 has no path snapping, no walking route, no `route.polyline` and no
"off path" / "on water" warnings. `walks/{id}.route` stays `null` and C4 draws straight lines
between stops in map order. Distance shown to the creator is the sum of straight-line legs,
labelled as such. The `reroute` callable is not written in M1.

## 2. Dependencies, and why

| Need | Choice | Why |
|---|---|---|
| Firestore + Auth | `@react-native-firebase/app`, `/auth`, `/firestore` | Offline persistence and background work need the native SDK. The JS SDK is Expo Go-friendly but we already require a dev build. |
| Maps | `react-native-maps` 1.29.11 | **`expo-maps` cannot do this job.** `AppleMapsMarker` has no `draggable` property — drag is Android-only — and C4/C5 are built on dragging pins. Apple Maps marker callbacks there also need iOS 18. |
| Apple sign-in | `expo-apple-authentication` ~58.0.3 | §2. iOS only, which matches the spec. |
| Google sign-in | `react-native-nitro-google-signin` | Android Credential Manager is free here. The legacy `play-services-auth` SDK that `@react-native-google-signin`'s free tier uses on Android is deprecated by Google; Credential Manager is behind that library's paid tier. |
| Location | `expo-location` ~58.0.22 | Foreground in M1; the same module does background and geofencing in M3. |
| Background tasks | `expo-task-manager` ~58.0.14 | M3 needs it. Added in M1 only if M1 ends up importing it; otherwise M3 adds it. |
| QR | `react-native-qrcode-svg` + `react-native-svg` | C6 shows a join QR. |
| QR scanning | `expo-camera` | P0 scans a code. |

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

Business rules live in `shared/` — already written and unit-tested — and are imported by the
app and by Cloud Functions. **No scoring, ranking, radius or distance arithmetic in the app.**
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

- `teams/{uid}` create, and updates to `name, players, pushToken, startedAt, lastSeenAt, distanceWalkedM`
- `answers/{stopId}` create — once, client fields only
- `positions/{uid}` overwrite
- `alerts/{id}` create
- `walks/{id}` and `stops/{id}` edits by the owner while `draft`/`ready`

**Written only by Cloud Functions.** Rules reject these from clients:

- `teams/{uid}.score, correctCount, stopsDone, finishedAt`
- `answers/{stopId}.points, correct`
- `walks/{id}.joinCode`, and `status` transitions other than the owner's `open → ended`

**Callables.** Only where validation or allocation must be authoritative:

| M1 function | Type | Does |
|---|---|---|
| `publishWalk` | callable | Validate (≥1 stop, every stop has a question, 2–4 options, a correct index), allocate a unique join code, `draft → ready` |
| `onAnswerCreated` | trigger | Score the answer, recompute the team's totals, set `finishedAt` when all stops are done or skipped |
| `onWalkStatusChanged` | trigger | On `ended`, freeze final ranks. **No push in M1** (M2 adds it) |
| `daily` | scheduled | Auto-end walks open longer than 12 h. **No retention deletion in M1** (M5) |

`duplicateWalk`, `deleteAccount`, `reroute`, `generateWalk` and `suggestQuestion` are later
milestones. **App Check** (App Attest / Play Integrity) is required on callables per §8; it is
wired in M1 because retrofitting it means re-testing every call site.

### Trusting the client's clock, safely

§4 measures answer time with the phone's clock so offline answers keep their true timing. So
`elapsedMs` is client-supplied and cannot be verified. The server therefore:

1. Clamps `elapsedMs` to `[0, SPEED_BONUS_WINDOW_MS]`.
2. Checks it against `answeredAtClient - openedAtClient`; if they differ by more than 2 s,
   it scores with no speed bonus rather than rejecting the answer.
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
unit-tested there. The trigger is a thin shell around it. Same for final ranks.

## 6. Auth

Anonymous sign-in on first launch, always, for everyone. Participants never go further.

A creator signing in with Apple or Google **links** the credential to the existing anonymous
user (`linkWithCredential`), so anything they joined as a participant survives. If linking
fails with `credential-already-in-use`, sign in with that credential instead and accept that
the anonymous data is orphaned — explain it in one line rather than failing silently.

Apple on iOS, Google on both. Apple returns the name and email **only on the first sign-in**,
so `users/{uid}.displayName` is written at that moment or it is lost forever.

`AuthProvider` in `src/auth/` owns the state: `{ user, isCreator, loading }`. `isCreator` means
the user has a non-anonymous provider — not a role in the database.

## 7. Routes

```
src/app/
  _layout.tsx                  AuthProvider, theme, anonymous sign-in gate
  index.tsx                    C1 Home — my walks (first-run empty state)
  settings.tsx                 S1 (no account deletion in M1)
  join.tsx                     P0 join sheet (modal), also the deep-link target
  walk/[walkId]/
    edit.tsx                   C2 create / edit details
    route.tsx                  C4 route builder
    stop/[stopId].tsx          C5 edit stop
    share.tsx                  C6 share and open walk
    results.tsx                C9 results (no share card in M1)
  play/[walkId]/
    index.tsx                  P1 join this walk
    lobby.tsx                  P2 lobby
    stop.tsx                   P3 walk to stop (current stop from team progress)
    question.tsx               P4 question
    finish.tsx                 P5 finish
    results.tsx                P6 final results
```

Internally everything is addressed by `walkId`. A join **code** appears only at the entry
points: the deep link `https://qualk.dk/play?code=K72QX` and the P0 sheet. Both resolve the
code through `joinCodes/{code}` and then navigate to `play/[walkId]`. Rules allow `get` but not
`list` on `joinCodes`, and `get` requires a signed-in user, so **code resolution must happen
after anonymous sign-in completes** — the root layout gates on it.

`P3` derives the current stop from the team's answers, not from local state, so killing the app
mid-walk loses nothing.

## 8. Offline

Firestore persistence is on by default in the native SDK; M1 keeps it on and does not fight it.

The rule that makes offline work: **the whole walk is in the cache before the walk starts.**
P2 (lobby) reads every stop once, so P3/P4 need no network. The 20-second timer uses
`Date.now()`. Answers are written to Firestore and queued by the SDK when offline; the UI
treats a queued write as done, because it is — scoring catches up when the phone reconnects.

The one thing that visibly needs network is the leaderboard, and P5 says so rather than
spinning.

## 9. Location in M1

Foreground only: `watchPositionAsync` with `Accuracy.High` (`Balanced` is documented as
"accurate to within one hundred metres", useless against a 25–60 m radius). Arrival uses
`canUnlock` from `shared/`.

`src/location/` exposes `useArrival(stop)` returning `{ distanceM, accuracyM, unlocked, canImHere }`.
M3 replaces the implementation with background updates and geofencing without touching a
screen. Geofencing is available in `expo-location` and iOS allows 20 regions, comfortably
above the 12-stop maximum — M3's problem, but the boundary is drawn for it now.

G6 "Can't reach" is in M1: *I'm here* (≤150 m, no speed bonus), *Skip* (0 points), *Way
blocked* (writes an alert; the creator acting on it is M2).

## 10. Rules and indexes

`firestore.rules` is deny-all today. M1 implements §7 in full — including the parts whose
screens arrive in M2, because rules are cheap to write and expensive to retrofit.

`rules-tests/firestore.test.ts` gets a positive and a negative case for **every bullet in §7**.
CI already runs it. The negative cases are the point: a participant writing `score`, a creator
editing a stop while `open`, a team creating a second answer for one stop, a stranger reading
`positions`.

Indexes: one composite, `walks` on `ownerUid` asc + `updatedAt` desc, for C1. The leaderboard
is **not** indexed — a walk has at most a few dozen teams, so teams are read and sorted
client-side with `compareTeams` from `shared/`, which keeps one ranking implementation.

## 11. Error and empty states

| State | Where |
|---|---|
| Invalid or expired code | P0, inline under the input |
| Walk already ended | P1 → read-only C9/P6 |
| Location permission denied | P1, explain + open Settings (`Linking.openURL('app-settings:')`) |
| No network while creating or editing | C2/C4/C5 banner; edits queue |
| First-run Home | C1 empty, "New quiz walk" |
| Walk not open yet | P2 waiting state |

## 12. Definition of done

Two phones, one walk, no code changes between them:

1. iPhone: sign in with Apple, create a walk, add 3 stops on the map, write 3 questions, publish.
2. iPhone: share sheet shows a 5-character code and a QR.
3. Android: open `https://qualk.dk/play?code=…` → the app opens (not the browser) → join as a team.
4. Android: lobby shows the walk, distance to start, and the team.
5. iPhone: open the walk. Android's lobby shows "Start walk" without a reload.
6. Android: walk to stop 1, question unlocks within the radius, answer, see points and explanation.
7. Put the phone in airplane mode, answer stop 2, re-enable network, and the score catches up.
8. Answer stop 3, see P5, then the leaderboard.
9. iPhone: end the walk. Both phones show final results with matching ranks.

Plus: `npm run typecheck && npm run lint && npm test && npm run test:rules` green, and CI green.

## 13. Risks

| Risk | Handling |
|---|---|
| nitro + SPM + scene lifecycle on SDK 58 is a new combination | Prove it in the first dev build, before any screen is built. If the OAuth callback does not return, fall back to `@react-native-google-signin` with SPM. |
| No ORS key in M1 means no real route | Straight lines, labelled. Do not design C4 around a polyline that is not there. |
| Dev build cycle is 30–45 min | Land every native dependency in one build. Adding a library later costs another cycle on both platforms. |
| Apple name/email arriving only once | Write `users/{uid}` in the same handler that receives the credential. |
| App Check blocking the emulator and dev builds | Register debug tokens before wiring callables, or every call fails opaquely. |
