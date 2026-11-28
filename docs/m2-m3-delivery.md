# M2 wrap-up and M3 delivery notes

2026-11-27 · branch `claude/m3-pocket-mode-c44d19`, PR into `m2-m5`.

## In one paragraph

A walk now works with the phone in a pocket. After *Start walk*, QuizWalk keeps following the
team when the screen is off or another app is open, eases the GPS off when the next stop is far
away, and buzzes with a notification when the team reaches it; tapping the notification opens
the question. It needs only "While using the app" location, never "Always". When the phone
cannot buzz (notifications refused, or the background updates fail to start), the walk screen
falls back to M1's screen-on play and says so, so it never promises a buzz it cannot give.
*Directions* hands the next stop to Apple Maps or Google Maps. The M2 audit found three gaps in
the push plumbing and fixed them. All of it was run through on the iPhone simulator with a
simulated walk against the local emulators. What only a real phone can show (Android, a real
GPS in a pocket, battery, push delivery) is listed at the end as your part.

## What was built

| Area | What | Where |
|---|---|---|
| Pocket mode | Background updates after *Start walk*, two engines behind one switch, accuracy stepping, arrival notification, stops on finish, leave and walk end, and at launch if left over | `app/src/location/pocket.ts`, `app/src/tasks.ts` |
| Battery knobs | Every location number in one file, with what it does | `app/src/location/tuning.ts` |
| Shared logic | `pocketAccuracyStep` (the 300 m / 400 m stepping) and `directionsUrl`, 7 new tests (109 in all) | `shared/src/pocket.ts` |
| P3 | Copy and keep-awake follow whether pocket mode really runs; *Directions* button | `app/src/app/play/[walkId]/stop.tsx` |
| P2 | *Start walk* asks "Buzz you at each stop?"; the rules card says the phone buzzes only once notifications are allowed | `app/src/app/play/[walkId]/lobby.tsx` |
| P4 | *Next stop* always lands on the walk screen, also when the question was opened from the notification | `app/src/app/play/[walkId]/question.tsx` |
| Notifications | Tapping any notification opens its screen: the question, the lobby, the results, or the monitor | `app/src/lib/push.ts`, `app/src/lib/routes.ts` |
| Push tokens | Saved on every new team, and on the creator at every *Open walk*, once notifications are allowed | `lobby.tsx`, `OpenWalkDialog.tsx` |
| Server | `onTeamUpdated`: a team leaving can be the last one walking, so it runs the "Everyone has finished" check; 2 new tests | `functions/src/index.ts`, `functions/src/push.ts` |
| Android icon | A status-bar icon for pushes, the arrival buzz and "Guiding you to stop 4" (the app icon showed as a white blob) | `design/icon/notification.svg`, `app/assets/notification-icon.png`, `app/app.config.ts` |

## The M2 audit

Plan rows M2·2–7 against the code and the spec:

| Row | Found | Done |
|---|---|---|
| 2 · Tokens on `users` and `teams` | A token was saved only when the lobby's dialog asked. A player who had allowed notifications on an earlier walk (or in Settings) joined the next walk without one and got no "Walk is open" or "Final results" | The lobby saves the token for this team whenever notifications are already allowed; *Open walk* refreshes the creator's |
| 2 · Permission asked in the lobby and on first *Open walk* (§11) | As specified. Refusing *Notify me* said nothing | One line points to Settings |
| 2 · "Everyone has finished" | Checked only after an answer, so the last walking team *leaving* never triggered it (§4: a team that left no longer counts as walking) | `onTeamUpdated` trigger, checked in the emulator: the walk's flag is set the moment the last walker leaves |
| 2 · Per-team pushes in week-long walks | Correct | — |
| 2 · Tapping a push | Did nothing beyond opening the app | Opens the screen it is about |
| 3 · C7 live monitor | Matches §3 C7 | — |
| 4 · Skip for everyone, P3's notice | Matches; in pocket mode the next stop is guided to at once | — |
| 5 · C8 team detail | Matches | — |
| 6 · Share cards | Matches (built 27 Nov) | — |
| 7 · Duplicate and delete from Home | Matches | — |

The user-only parts of M2 are still open and listed under "What you need to do".

## Decisions I made, and why

1. **Pocket mode runs on "When In Use" on both platforms, without the A7 spike.** Nobody could
   walk a real phone tonight, so the question in spec §9 was settled from expo-location's own
   source (58.0.22, the version in the app) and the simulator:
   - iOS: `startLocationUpdatesAsync` checks only the foreground permission. Its code comment
     names the case: "As a user-initiated foreground service, this does NOT require the
     background location permission". The task's `CLLocationManager` sets
     `allowsBackgroundLocationUpdates`, which is what Apple documents for a When-In-Use app that
     starts updates on screen (blue indicator in the status bar).
   - Android: `startLocationUpdatesAsync` with a `foregroundService` requires only the
     foreground permission, as long as it starts while the app is on screen. expo-location's
     newer background session says the same.
   - On the simulator, with "While Using" permission: the app in the background kept getting
     fixes, stepped its accuracy, and posted the arrival notification at 34 m from the stop.
     Settings showed Location as "While Using" throughout; "Always" was never asked for.

   The docs page the spec quoted on 25 Nov (background updates need "Always") describes the
   general case; the code allows the foreground-started case. A real phone in a real pocket can
   still differ (iOS can stop a backgrounded app under memory pressure, Android vendors kill
   foreground services), which is what your field test checks.

2. **Two engines, one switch** (`POCKET_ENGINE` in `app/src/location/tuning.ts`):
   - iOS: `task`, expo-location's background location task.
   - Android: `session`, expo-location's newer background session (a foreground service) that
     keeps an ordinary position watch running. Chosen because Android refuses to change a
     `task`'s settings while the app is in the background without "Allow all the time", so the
     `task` engine cannot ease off far from a stop and would keep GPS on for the whole walk.
     The `session` watch can change accuracy at any time on the same permission.
   - The alternative, `task` on Android, is one word away if the session misbehaves in the
     field test: it works the same way but stays on high accuracy (more battery).
   - `off` on either platform gives screen-on play (spec §9 fallback 4), as M1 and M2 played.
   - Not used: geofencing, and expo-location's newer `LocationUpdatesHandle`. Both need "Always"
     on iOS (the latter holds an "always" service session on iOS 18), which spec §9 rules out.
     iOS's location-triggered notification (spec §9 fallback 1) cannot be scheduled through
     expo-notifications, which can only read such triggers; it would need a small native
     module. With fallback 0 working on the simulator, it stays a fallback.

3. **No buzz, no pocket promise.** Pocket mode needs notifications to buzz from a pocket. If they
   are refused, or the updates fail to start, P3 keeps the screen on and says "Keep QuizWalk
   open", and *Directions* is not offered. This is checked again whenever the app comes back to
   the screen, so allowing notifications in Settings mid-walk switches pocket mode on.
   Background tracking without a buzz was not kept: it would cost battery and show the blue
   indicator for nothing a player notices.

4. **Accuracy stepping has a gap.** High accuracy within 300 m (spec §9), back to balanced only
   beyond 400 m, so a team walking along the 300 m line does not switch the GPS on and off with
   every fix. With no usable distance it chooses high accuracy rather than giving up.

5. **On screen, P3 still opens the question itself.** The arrival notification is posted only
   when QuizWalk is in the background or another screen of it is showing. It buzzes once per
   stop.

6. **The notification opens P4, and *Next stop* goes back to the walk screen**, even if the
   question was opened from Home. The walk screen is what points pocket mode at the next stop,
   so it must be there.

7. **Pocket mode stops** when the team finishes (P5), leaves (walk menu), when the walk ends
   (P6), and at launch if an earlier run left it registered (iOS restores background tasks by
   itself). Swiping QuizWalk away ends it: iOS stops "When In Use" updates for a closed app, and
   the Android session is set to stop with it, so its notification never lingers.

8. ***Directions* only in pocket mode.** It sends QuizWalk to the background, where screen-on
   play cannot unlock anything. The links are `https://maps.apple.com/?daddr=…&dirflg=w` and
   `https://www.google.com/maps/dir/?api=1&destination=…&travelmode=walking`: walking
   directions, opening the maps app when installed and the browser otherwise, with no list of
   apps to ask the phone about.

9. **Copy.** P3 in pocket mode: "The question opens within 40 m. Your phone buzzes at the stop,
   so it can stay in your pocket." The *Start walk* prompt: "Buzz you at each stop? Then your
   phone can stay in your pocket on the way. You'll also hear when the results are in." The
   notification: "You're at stop 4" / "Nyhavn. Tap to open the question." Android's service
   notification: "Guiding you to stop 4" / "{walk}. Your phone buzzes when you get there."

10. **Development builds log pocket mode** (`[pocket]` lines in Metro: distance, accuracy, step
    changes, arrival), so a field test with a development build can be read afterwards.

## Battery knobs

All in `app/src/location/tuning.ts`. Defaults, and what moving them does:

| Knob | Default | Effect |
|---|---|---|
| `POCKET_ENGINE` | iOS `task`, Android `session` | Which pocket mode runs, or `off` for screen-on play |
| `NEAR_STOP_M` | 300 m (spec §9) | Where high accuracy starts. Larger: earlier GPS warm-up, more battery |
| `FAR_AGAIN_M` | 400 m | Where it eases off again. Keep it above `NEAR_STOP_M` |
| `POCKET_STEPS.far` | Balanced, 10 m filter, 10 s (Android) | Between stops. iOS Balanced is about 100 m (Wi-Fi and cell); Android's is block level |
| `POCKET_STEPS.near` | High, 5 m filter, 3 s (Android) | Close to a stop, where unlocking needs a 25–60 m radius |
| `POCKET_STEPS.*.profile` | `default` far, `fitness` near | The same two steps for the Android `session` engine |
| `ANDROID_TASK_STEP` | `near` | The one setting the Android `task` alternative keeps all walk |
| `FOREGROUND_WATCH` | High, 2 m, 2 s | On screen only; stops by itself in the background |

Two more that already existed and affect battery and data: position uploads at most every 30 s
and after moving 20 m (`shared/src/geo.ts`), and distance walked written at most once a minute
(`app/src/location/tracking.ts`). Distance walked counts only fixes better than 30 m, so while
eased off it adds the straight line between good fixes rather than every step.

## How it was checked

- **Automated:** typecheck, lint, Prettier, 109 shared tests, 2 new function unit tests,
  38 rules tests and 14 function tests against the emulator, all green.
- **iPhone simulator, against the emulators, with `xcrun simctl location … start` walking the
  phone north at 5 m/s:**
  - Join by link, location "Allow While Using App", *Start walk* asks "Buzz you at each stop?",
    allow. P3 shows the pocket copy and *Directions*; the screen is no longer kept awake.
  - App sent to the background at 700 m: fixes kept arriving, accuracy stepped from far to near
    at 300 m, and "You're at stop 1" arrived at 34 m. Tapping it opened the Arrived step of
    stop 1. *Next stop* went to the walk screen for stop 2.
  - Walking to stop 2 with the app on screen: P3 opened the question itself and no notification
    was posted.
  - Notifications switched off in Settings mid-walk: back in the app, P3 switched to "Keep
    QuizWalk open", kept the screen on and hid *Directions*.
  - Finishing the walk stopped the background updates (the location arrow left the status bar).
    A relaunch stops updates left over from an earlier run.
  - The Apple Maps link opens Maps.
  - A test push of each kind opens the right screen (checked for the arrival kind; the others
    share the same code).
- **Emulator:** the last walking team leaving sets the walk's "Everyone has finished" flag via
  `onTeamUpdated`.
- **Not checked, no way to here:** Android (no Android SDK on this Mac), a real GPS in a real
  pocket, how long iOS and Android let a backgrounded walk run, battery, Google Maps links on
  Android, push delivery through Expo with the real credentials.

## What changed in the docs

- Spec §3 P3, §8 (`onTeamUpdated`), §9 (pocket mode as built, and what is proven), §11, §19.
- Implementation plan: "Where things stand", and the A7 open point.
- `user-testing.md`: the new builds, what to try in pocket mode, and the simulator's keychain
  reset.

## What you need to do

1. **Deploy one function.** My deploy was refused by this session's permission rules, so the new
   `onTeamUpdated` trigger is not live yet. Until it is, everything works except the "Everyone
   has finished" push when the last walking team leaves rather than finishes:

   ```bash
   npx firebase deploy --only functions:onTeamUpdated --project qualk-a173e
   ```

2. **Install the new preview builds** (started 27 Nov, about 30–45 minutes each):
   [Android](https://expo.dev/accounts/lmunck/projects/qualk/builds/b1c74371-eb31-4e72-b422-63e51c3ab631)
   and [iPhone](https://expo.dev/accounts/lmunck/projects/qualk/builds/d51266f8-56f9-4033-94a1-9e490a459ae0).
   On Android, installing over the old one keeps your data; allow notifications when asked.

3. **The pocket-mode check (replaces A7), on each phone:** seed or build a walk with a stop
   about 500 m away. Start walk, allow notifications, lock the phone, put it in a pocket and
   walk there. It should buzz near the stop; the lock-screen notification opens the question.
   - iPhone: the blue location pill shows while walking and disappears after the last stop.
   - Android: a "Guiding you to stop 1" notification stays while walking. If the phone never
     buzzes, open Settings → Apps → QuizWalk → Battery and choose **Unrestricted**, then try
     again, and tell me which phone it is. If it still fails, switch `POCKET_ENGINE.android` to
     `task` (one word in `app/src/location/tuning.ts`) and build again.
   - Note the distance at which it buzzed and whether it ever buzzed late or not at all.

4. **Battery, 60 minutes:** a full walk in a pocket on each phone. Note the battery at the start
   and the end, and whether the phone got warm. The knobs to turn are in the table above.

5. **A week-long walk** left open for several days, with teams starting on different days
   (plan M3·5): check the per-team pushes, standings so far, and that the walk ends by itself.

6. **Android push credentials (FCM V1 key).** Without it, Android phones get no pushes (iPhone
   already has its key). In the [Firebase console](https://console.firebase.google.com/) →
   project **qualk-a173e** → the gear → **Project settings** → **Service accounts** →
   **Generate new private key**. That downloads a JSON file: it is a secret, keep it out of the
   repo and chat. Then on [expo.dev](https://expo.dev) → project **qualk** → **Credentials** →
   **Android** → `com.lmunck.qualk` → **FCM V1 service account key** → **Add** → upload the
   file. No new build is needed.

7. **Start the Play closed test** (12 testers for 14 days before a personal account may
   release; the clock runs only once testers have opted in). In the Play Console: create the
   app `com.lmunck.qualk` if it is not there yet, then **Testing → Closed testing → Create
   track**, add your testers' Google addresses, and upload an Android App Bundle. Preview builds
   are APKs, which Play does not take; say the word and I start a `production` Android build
   (it makes the `.aab`).

8. **The three-phone M2 check** (plan M2): one creator watching the monitor, one team reporting
   a blocked way, the stop skipped for everyone, scores recalculated on every screen, and pushes
   arriving with the app closed (needs step 6 for Android).
