# M4 app delivery notes

2026-11-28 · branch `m4-app`, PR into `m2-m5`. Built against the M4 backend in
[`m4-backend-delivery.md`](m4-backend-delivery.md) and the contracts in
[`m4-generation-design.md`](m4-generation-design.md) §11. No server changes.

## In one paragraph

*Generate for me* now works from end to end. The creator picks **Generate for me**, moves,
zooms and turns a map until the Start pin sits where teams meet, and taps **Refresh** to get a
walking loop with its stops. **Next** makes the walk and shows C3 while the stops are named and
the questions picked. From there the creator reviews it in C4 or plays it at once without
seeing the questions. In C4 a generated walk can get a **New route**, which keeps its trivia
questions in order. In C5 any question can be **swapped** for another from the bank, and a new
stop can get a **suggested** one, which is a *Local* question when the stop is next to a
documented place. Players can **report** a question under the answer feedback. All of it was
run on the iPhone simulator against the local emulators, with real OpenRouteService, Overpass,
Wikipedia and Gemini calls. Android and a real phone are your part (end of this note).

## What was built

| Screen | What | Where |
|---|---|---|
| C2 choice | Two equal choices, *Generate for me* and *Build it myself*; the second asks only for a title, as before | `app/src/app/create.tsx` |
| C2 map screen | Map above a sheet; fixed Start pin at the bottom centre of the usable area; zoom, turn and north-up buttons; Auto or categories, difficulty, questions 4–12 following the view; the straight-line check; Refresh with variants; route and stop dots; the summary line; Next | `app/src/app/generate.tsx` |
| C3 Generating | Steps from `generationJobs`, can be left, failure state (*Try again*, *Add stops manually*), done state (*Review route & questions*, *Play it myself — no spoilers*) | `app/src/app/walk/[walkId]/generating.tsx` |
| C1 Home | "Generating…" on a walk whose job is running; tapping it opens C3 | `app/src/app/index.tsx` |
| C4 | *New route* on generated walks, with a confirm naming what is lost; the routed line and distance while the route matches the pins | `app/src/app/walk/[walkId]/route.tsx` |
| C5 and G2 | *Swap question* and *Suggest a question*, offered to accept or discard; editing a bank question drops its `bankQuestionId` | `app/src/app/walk/[walkId]/stop/[stopId].tsx` |
| P4 | *Report question* under the feedback: reason, one report per person, "Thanks. We'll check it." | `app/src/app/play/[walkId]/question.tsx` |
| Data | The M4 callables; the draft and New route writes; the job hooks; one generateWalk call per walk; reports | `app/src/data/callables.ts`, `generation.ts`, `reports.ts`, `walks.ts` |
| Icons | Turn left and right, compass, refresh, swap | `app/src/components/Icon.tsx` |

Accessibility (§14): every new control has a label, the map can be set with buttons alone, the
category chips are checkboxes to a screen reader, C3's steps read as "Naming stops, done", and
the Report link is 15 pt like the rest of P4.

## Decisions I made, and why

1. **The stepper follows the view, but the drawn route keeps its own count.** The spec says the
   count follows the view's length, and also that moving the map changes nothing until the next
   Refresh. Both hold: zooming changes the stepper (what the next Refresh will use), while the
   drawn route, its dots and its summary line keep the count they were made for. If the creator
   changes the stepper after a Refresh, the stops are spaced again along the same loop, exactly
   as generateWalk spaces them, so no new Refresh is needed. If the loop is too short for the new
   count, Next is disabled with "Couldn't fit 10 stops here. Zoom out a little." The spec's C2
   row now says so.
2. **Categories sit in one row that scrolls sideways.** Thirteen chips in a wrapping grid took
   half the screen; one row keeps the map large. *Auto* is exclusive: picking a category clears
   it, and clearing every category brings it back.
3. **The usable area** is the screen less the status bar, the 64 pt row with the close button
   and the hint, and the sheet, measured as it is laid out. The side buttons float over the map
   and are not taken off. The shrink is `VIEW_SHRINK` (18%) from `shared/`.
4. **Opening the map:** about 2.4 km of map from top to bottom, with the creator's location (or
   Nyhavn when it is unknown) under the Start pin rather than in the middle. *New route* fits the
   walk's route into the usable area instead.
5. **The camera buttons:** zoom halves or doubles the altitude on Apple Maps and steps the zoom
   by one on Google Maps; turn is 30° either way; the compass button's needle follows the map's
   heading and turns the map back to north-up.
6. **A generated walk is a walk with `shape: 'loop'`.** Only generated walks are loops, so that
   is what shows *New route*, and it also covers a duplicate of a generated walk.
7. **Next waits for the walk to be written** before calling generateWalk, unlike the editor's
   offline-first writes: the function reads the walk on the server, and generating needs a
   connection anyway. The title is a placeholder ("Quiz walk") that generateWalk replaces; the
   phone's own reverse geocoder gives the start label generateWalk falls back on.
8. **One generateWalk call per walk per phone.** C3 starts it, and a small registry outside the
   screen keeps it, so leaving C3 and coming back never calls twice. C3 works out its state from
   that call and the job: running while the call is in flight or the job is fresh; failed when
   the call failed, the job failed, or the job stopped updating for 6 minutes; done otherwise.
   While the call for a *New route* runs, the walk's older "done" job is not shown as done.
9. **C3 shows no question text.** The design's "Latest question" card is left out: it would spoil
   *Play it myself*, and the contract writes no question text to the job.
10. **Play it myself** publishes, opens the walk for *Today*, joins it solo under the creator's
    name and goes to the lobby, in one tap as the spec says. Opening cannot be undone, so a line
    under the button says "Opens the walk for today and joins you to it." It is offered only
    when nothing blocks publishing.
11. ***Suggest a question* lives in C5.** The existing *Add stop* flow already opens C5 for the
    new stop, so the one button above the question reads *Suggest a question* while the stop has
    none (G2; it sends the pin so a *Local* question can be found) and *Swap question* once it
    has one. *Write my own* is just typing. The dialog offers *Use this question*, *Show
    another* (the ids already offered are excluded) and *Keep mine* or *Discard*.
12. **Accepting fills the editor; Save writes it.** Nothing is written until the creator saves,
    and leaving with unsaved changes still asks first. On save the bank fields go with it
    (`bankQuestionId`, `origin`, `source`, and the proposal's `unverified` in place of the old
    one). A suggested *Local* question also names the stop after its place. When the creator
    changes the text or answers of a bank question, `bankQuestionId` is deleted in the same
    write, as the contract asks.
13. **Report question is not awaited**, like every player write, so it works offline. The thanks
    show at once. A second report from the same person is refused by the rules and treated as
    already reported, with no error.
14. **Fixed on the way: saving a stop threw the routed distance away.** Every stop edit wrote
    the straight-line distance onto the walk, even when no pin moved, so a generated walk showed
    1.6 km instead of its 2.6 km loop after a question was swapped. The walk now keeps the
    routed distance while the route still matches the pins (`route.key`), as spec §4 says, and
    C4 draws the routed line and drops "as the crow flies" while it does.

## How it was checked

- **Automated:** typecheck, lint, Prettier, 161 shared tests, 48 function unit tests, 54 rules
  tests and 53 function tests against the emulator (after merging M5's privacy work), all green.
- **iPhone simulator (iPhone 18 Pro, iOS 27) against the emulators**, with the seed bank
  imported into the emulator and the real ORS and Gemini keys in `functions/.secret.local`
  (git-ignored, now listed in `.gitignore`). A screenshot was taken of each state below; they are
  not committed.
  - C2: the map opened with Nyhavn under the Start pin. Refresh gave "8 stops · 3.5 km · about
    1 h 2 min" with the loop and seven dots (the eighth is at the start). Zoom, turn and north-up
    worked; on a map turned 30° the loop still went "up" the screen. A second Refresh on the same
    view gave a different loop (2.3 km, then 2.6 km). Zoomed in with 8 questions, Refresh was
    disabled with "Zoom out, or choose fewer questions" while the drawn route stayed.
  - Next → C3 with *Naming stops* and *Picking questions*; leaving showed "Generating…" on Home,
    and tapping it reopened C3. Overpass timed out, as it often did on 27 Nov, and the Wikipedia
    fallback named 6 of 8 stops; *Writing local questions* appeared for the four new places. Done
    in 43 s: "Quiz walk from Verrayon House · 8 questions · 2.6 km loop".
  - C4 showed the routed line and "2.6 km". *Swap* on stop 5 offered two questions in turn; the
    second was accepted and saved with its new `bankQuestionId`. *New route* asked first, opened
    C2 on the walk's area with its choices, and after Refresh and Next the four trivia questions
    came back in their order (including the swapped one) while the four *Local* ones were
    replaced for the new places.
  - *Play it myself* published, opened and joined; *Start walk*, *Simulate arrive*, answer, then
    *Report question* → *Confusing* → "Thanks. We'll check it." The `questionReports` document
    has the right id and fields, and `onQuestionReported` counted it on the bank question.
  - A hand-built walk: *Add stop here* at Nyhavn → *Suggest a question* found a *Local* question
    about Nyhavn (37 s, Overpass timed out again) with its source and "Check the answer before
    you publish"; accepted and saved with `unverified`. Adding a word to the question and saving
    deleted its `bankQuestionId`, and the bank counted one replacement.
- **Real-service use:** 4 Refreshes (one ORS call each), 2 generated walks and 3 swaps. Gemini
  wrote questions for 9 new places and one background top-up ran: under $0.10 at the prices
  measured in `m4-backend-delivery.md`.
- **Not checked:** C3's failure state on the simulator (it is the same screen with the job's
  error, and *Try again* calls the same function), VoiceOver itself, larger text sizes on the
  new screens, Android, and a real phone's GPS and compass.

## What changed in the docs

- Spec §3 C2: changing the number of questions after a Refresh spaces the stops again along the
  same loop.
- `m4-generation-design.md` §11: the same, for Next's count.
- Implementation plan: "Where things stand" and M4.
- `user-testing.md` part 1: running the M4 screens on the simulator.

## What's left for you

1. **The map screen on a real iPhone.** Open *New quiz walk → Generate for me* outdoors. Check
   that the map opens where you stand, that pinching and twisting move the map under the Start
   pin, that the buttons do the same, and that Refresh draws a loop that fits what you see. Try
   a city street, a park and somewhere near water. Then make one walk and walk a few stops.
2. **Android, once the Google Maps key is in (`user-testing.md` part 2, step C).** Without the
   key Android shows a placeholder instead of any map, so C2 cannot work there yet. With it:
   install the next Android build (it is an APK: open the link from expo.dev on the phone, allow
   "Install unknown apps" for the browser when Android asks, then tap the file), sign in, and do
   the same checks as on the iPhone. Google Maps turns the map with a two-finger twist; the turn
   buttons should do the same. Tell me if the loop ever goes "down" the screen instead of up, or
   if zoom steps feel too big.
3. **Reroute on save in C4** (plan M4·2's app side) was built in the final pass: see
   [`m5-release-delivery.md`](m5-release-delivery.md).
4. **Deploy and import, from `m4-backend-delivery.md`**, still apply: deploy the functions from
   `m2-m5`, and import the seed bank into `qualk-a173e`. This PR changes neither.
