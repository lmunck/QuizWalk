# M1 delivery notes

2026-11-25 · branch `m1-play-and-make` (four commits on top of `main`, not pushed).

## In one paragraph

QuizWalk can now be played and made end to end. A creator signs in, builds a walk on the
map, writes questions, previews, publishes, shares a code and QR, opens the walk for a day
or a week, watches teams live, skips a blocked stop for everyone and ends the walk. A player
joins with a code or a link (no account, no welcome screen), waits in the lobby, walks to
each stop, answers against a draining speed bonus, can resume after a restart, and sees the
standings and the final results. The security rules and the server functions behind it are
written and tested. Everything was run through on the iPhone simulator against local
Firebase emulators. What is left before real phones is account setup only (Firebase app
registration, Maps key, a deploy, the builds): see [`user-testing.md`](user-testing.md) part 2.

## What was built

| Area | What | Where |
|---|---|---|
| Security rules | Spec §7 in full; 38 allow/deny tests | `firestore.rules`, `rules-tests/` |
| Server | `publishWalk`, `openWalk`, `deleteWalk`, `duplicateWalk` (App Check), `onAnswerCreated` (idempotent totals), `onStopUpdated` (skip for everyone), `onWalkStatusChanged`, `onAlertCreated` (push), `hourly` (auto-end day and week walks); 14 tests against the emulator | `functions/src/` |
| Game logic | Publish checks, progress, team colours and names, formatting, stop insertion, distance with GPS-jump filtering; 90 tests | `shared/src/` |
| Player screens | P0 join (5-box code entry, link target), P1 join, P2 lobby (waiting and open), P3 walk (distance, compass or text bearing, map, banners, walk menu), P4 question (Arrived step, persistent bonus clock), G6 can't reach, P5 finish, P6 results, answer review | `app/src/app/play/`, `app/src/app/join.tsx` |
| Creator screens | G1 welcome and sign-in (Apple, Google, name step), C1 home, C2 create, C4 route builder, C5 edit stop with Move pin, preview, C6 share and Open walk, C7 live monitor, C8 team detail, C9 results, S1 settings | `app/src/app/` |
| Data and location | Live Firestore hooks, offline-friendly writes, auth with anonymous linking, shared location watch, arrival, heading, distance and position uploads | `app/src/data/`, `app/src/auth/`, `app/src/location/` |
| Native build | Every module the plan needs, in one build (including the background-location and notification config M2/M3 need) | `app/app.config.ts` |
| Tools | Seed script (walks, statuses, pretend teams), Firebase app registration script, emulator-only config | `scripts/`, `app/firebase/emulator/` |
| Look | New app icon, adaptive Android icon, splash; the design tokens throughout | `design/icon/`, `app/assets/` |

## How it was checked

- **Automated:** typecheck, lint, Prettier, 90 unit tests, 38 rules tests and 14 function tests
  pass; CI now also runs the function tests. The JavaScript bundles for iOS and Android build.
- **On the iPhone simulator, against the emulators:** join by code and by link; location
  permission; lobby waiting, then switching to Start walk live when the walk opened; walk to
  a stop (simulated), Arrived step with hint, bonus clock, right and wrong feedback; the
  server scoring the answers (14 points for a right answer in 6 seconds, as the rules say);
  force-reload and resume from Home; finish screen; final results appearing by themselves
  when the walk ended. As creator: sign in (test account), name step, create, add a stop by
  long-press with the place name filled in, write the question, publish (code and QR), open
  for Today, monitor with a pretend team's pin and a blocked-way alert, skip for everyone
  (scores recalculated on the server), end the walk, results with shared ranks, sign out.
- **Not checked yet:** anything on a real phone or Android (no Android SDK on this Mac), real
  Apple and Google sign-in, real GPS on a street, push notifications, App Check, the real
  Firebase project. These are the first things the user test covers.

## Bugs found and fixed while testing

| Found | Fix |
|---|---|
| Map pins and arrival distances were missing (`NaN km`) | Firestore GeoPoints keep their coordinates in getters that spreads and native views do not see; the data layer now converts them to plain `{ latitude, longitude }` (the converter the M1 design called for) |
| Callables failed against the emulator | React Native Firebase refuses to send auth tokens over plain HTTP to a non-loopback host; the emulator host is now 127.0.0.1 |
| Firebase crashed at launch in the emulator build | The placeholder API key must be exactly 39 characters |
| Teams lost their "finished" state when every stop was skipped for everyone | Totals now finish a team at its last answer in that case (tested) |
| A walk created before the creator saved a name showed an empty name | `publishWalk` and `openWalk` refresh the owner's name |
| A creator without a saved name skipped the name step | Sign-in asks for the name, and only the name |
| The Open walk screen jumped to the monitor before asking about notifications | The redirect waits for the dialog |
| Players had no visible way out of the walk screen; the map swallowed the back swipe | Home button and a re-centre button on the walk screen |
| "Offline" showed while online | Offline notices use the phone's network state, not Firestore's cache flag |
| Simulated jumps inflated the distance walked (a real GPS jump would too) | Segments faster than 25 km/h are ignored |

## Decisions I made along the way

These follow the spec; where they go beyond it, the reason is given.

1. **Built and tested against local emulators first.** The real Firebase config files did not
   exist yet, so the app carries an emulator-only config and switches to the real project as
   soon as both real files are in `app/`. No code changes are needed to switch.
2. **Pulled some of M2 forward**, because user testing is much richer with them and they were
   cheap on top of M1: the live monitor (instead of the interim team list on the share
   screen), team detail, skip for everyone, delete and duplicate, and the push functions.
3. **Reordering stops uses Move up / Move down** on each row. The spec also asks for a drag
   handle; the buttons are the accessible fallback the spec requires anyway, and the drag can
   follow once testers have used the builder.
4. **A new app icon and splash**, because the template icon would have confused testers.
   The generator is in `design/icon/`, so the icon can be changed and re-rendered.
5. **A `preview` build profile** for testers who should not need a dev server, and a switch
   that lets those builds use the App Check debug provider until Play Integrity exists.
6. **Typed routes are off**, so CI can typecheck without a running dev server.

## What you need to decide

1. ~~Go-ahead for the cloud steps~~ Done on 2026-11-26 after your go-ahead: both apps
   registered (the removed iOS app restored), rules, indexes and all nine functions deployed,
   and both `preview` builds made on EAS (the iPhone one after your Apple login, which also
   set up the Apple push key).
   Status table in `user-testing.md` part 2.
2. ~~App Check during the first tests~~ Decided: enforcement off until Play Integrity exists.
3. **Your console steps:** ~~the Android SHA-1~~ (added on 2026-11-27) and the Google Maps key.

Two fixes came out of switching to the real project: Google sign-in on iPhone now gets the
web client ID explicitly (Firebase's iOS config file does not carry it), and real builds keep
Expo's local-networking exemption so a development build can reach the Mac.

## What comes next

- First field test with the preview builds (implementation plan, field test 1); results go
  into spec §4 (radius, widening, *I'm here* distance).
- The pocket-mode spike (plan step A7) on both phones.
- M2 leftovers: image share cards, push credentials, the Play closed test.
