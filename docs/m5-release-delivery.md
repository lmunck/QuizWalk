# M4/M5 final pass: delivery notes

2026-11-28 · branch `final-pass`, PR into `m2-m5`. Done overnight on my own decisions, as you
asked; each is written down below with its reason. Nothing was uploaded or submitted to Apple or
Google.

## In one paragraph

The last pieces the store texts describe are in. The map now credits "© OpenStreetMap
contributors · openrouteservice" in C2, C4 and Settings. C4 routes the walk along streets and
paths once the pins settle after an edit, and marks stops that are *Off path* or *on water*.
Reports have a way to be seen and closed (`review-bank.ts list-reports`), and every report is
logged so you can have it emailed to you. The privacy page and spec §13 say that the editor uses
the creator's location. The store docs lost their **[M4]** markers and were checked against the
code. An accessibility pass fixed the text floors and the screens that broke at the largest text
size. Eight of the nine iPhone screenshots are taken and captioned. All checks are green, the
two changed functions and the privacy page are deployed, and no new EAS build was needed.

## What was built

| Area | What | Where |
|---|---|---|
| Attribution (§10) | The credit over the map just above the sheet in C4 (it moves with the sheet), under the top bar in C2, and a *Map data* row in Settings → About that opens openstreetmap.org/copyright. The sheet got an `above` slot for it | `components/MapPieces.tsx`, `components/Sheet.tsx`, `app/generate.tsx`, `app/walk/[walkId]/route.tsx`, `app/settings.tsx` |
| Reroute on save (plan M4·2, app side) | `useRerouteOnSave`: about 2 s after the last change to the pins, and at once on Publish or on leaving C4, it waits for the queued writes and calls `reroute`. The summary line shows "Routing…" meanwhile; a failure shows a quiet banner. Rows show every warning with an icon | `features/useReroute.ts`, `data/callables.ts`, `route.tsx` |
| Stale warnings | Moving a pin drops its old *Off path* / *on water* mark in the same write; `reroute` checks it again | `data/walks.ts` `updateStop` |
| `reroute` (server) | When a stop has no path near it and is left out of the route, the walk's distance is now straight lines, as `publishWalk` and the app work it out. Before, it was the shorter route without that stop | `functions/src/routing/reroute.ts`, one new test assertion |
| Reports | `list-reports [--all]`: open reports grouped by question, bank and creator-written, with each reason's count, the question and answers, and the walk's title, creator, status and code. `close-reports <target>`, `remove-walk <walkId>`; `keep` and `block` now close a bank question's reports. Bank reports are now logged too ("Report on a bank question") | `scripts/review-bank.ts`, `functions/src/reports.ts` |
| Privacy wording | One line on the privacy page, in spec §13 and in Settings' *Location* row: the editor can put the Start pin and stops where the creator stands, and *Generate for me* opens there | `hosting/privacy.html`, `app/settings.tsx` |
| Accessibility (M5·3) | See "The accessibility pass" below | Many files in `app/src` |
| Screenshots | Eight iPhone shots, framed with captions; the framing script | `docs/store/screenshots/ios/`, `scripts/frame-screenshot.swift` |
| Store docs | **[M4]** markers gone, claims checked, mismatches 1–4 marked fixed, the report email steps | `docs/store/*.md` |

## Decisions I made, and why

1. **"On save" means when the pins settle.** C4 has no Save button: every drag, reorder and add
   is written at once, offline-first. So the app waits until the pins have stayed put for about
   2 seconds and calls `reroute` once, however many drags came before. It also routes at once on
   *Publish & share* (so players see the routed distance) and when the creator leaves C4. This
   keeps well inside the 60 reroutes an hour, and spec §3 C4 now says so.
2. **The writes go first.** `reroute` reads the stops on the server, so the app waits for its
   queued writes (`waitForPendingWrites`) before calling. Nothing is called offline; the
   distance says "as the crow flies" until the connection is back.
3. **Each set of pins is tried once per visit.** A failure, or a route that had to leave out a
   stop, is not retried until the pins change, so C4 never loops on a broken walk. The failure
   is a quiet info banner ("Couldn't find a walking route just now…", or "The Start pin isn't
   near a path…"), and never blocks publishing: warnings never do (§3 C4).
4. **The M4 rule is kept:** nothing is called while `route.key` matches the pins, so editing a
   question keeps the routed distance. C4 now works the straight-line distance out itself when
   the route does not match, rather than trusting the walk's `distanceM`.
5. **A moved pin loses its old mark at once.** A stale "Pin is on water" after the creator moved
   the pin onto land would be wrong until the next reroute, and wrong for good offline.
6. **The server fix is deployed** (`reroute`), since a walk with an unreachable stop otherwise
   showed a distance that skipped it.
7. **Where the credit sits.** In C4 it rides on the sheet's top edge, left, and hides when the
   sheet is at full height (the map is covered then). In C2 it sits under the top bar, because
   just above the sheet it covered the fixed Start pin. It is 13 pt, grows to 1.4× at most, and
   takes no touches, so the map under it still pans. Settings has the full line with a link.
8. **A report is open until someone closes it.** Closing only sets `reviewedAt` (and
   `reviewNote`) on the report documents; the reports themselves still go with the reporter's
   *Delete my data*, as §13 says. Reports are read whole and filtered in the script: there are
   few, and a missing field cannot be queried.
9. **`remove-walk` also removes open walks.** It mirrors `deleteWalk` (walk, subcollections,
   join code) plus the generation job, but skips the "not while open" rule, because a walk
   reported for an offensive question may be live. Disabling a creator stays in the Firebase
   console: it is rare, one click, and can be undone there.
10. **Both kinds of report are logged** with a message starting "Report on a", so one log-based
    alert covers them. Bank reports were silent before. The alert itself is not created, as you
    asked; `docs/store/review-notes.md` §5 has the steps.
11. **The review notes promise only what exists:** "We are notified of every report and review
    it; we can block the question, remove the walk with everything in it, or disable the
    creator's account." "Notified" holds once you set up the alert (checklist step 2).
12. **Titles grow less than body text at large sizes.** Body text still grows all the way
    (about 3×). Titles and numbers stop at 1.8–2.8× and button labels at 2×, which is roughly
    what iOS's own Large Title and Title styles do. Without it, "My walks" filled the screen.
13. **At the largest sizes, side-by-side things stack** (when the system text scale is over
    1.6): P3's header and buttons, C2's buttons, segmented choices and Settings' values. P3's
    card and C2's sheet scroll inside a part of the screen, so the map stays usable.
14. **A few things in fixed shapes over a map are capped** at 1.3–1.8×: the answer letters in
    their circles, P3's big distance, C2's hint and the map credit.
15. **Screenshots on the iPhone 18 Pro**, framed onto the 1320 × 2868 canvas that App Store
    Connect asks for. The simulator tool needs your approval per device, and only the 18 Pro had
    it. Shot 3 is stop 1's right answer (the Andersen question is in shot 2). On P3 the
    notification prompt was answered *Don't Allow*, so it shows the screen-on copy; I did not
    grant permissions on your simulator.
16. **C2's screenshot was not taken.** Refresh needs openrouteservice, and the emulator had no
    key: the CLI refused to read it from Secret Manager while you were away, and I did not work
    around that.
17. **No EAS build.** Since `7dd6a6e` (the last preview builds) neither `app/app.config.ts` nor
    any native dependency changed; only the root dev dependency `tsx` was added. The JS changes
    reach phones with the next build you make.
18. **v1.0 ships with the M4 screens** (checklist decision 14): they are built and merged, and
    *Report question* is what Apple 1.2 and Play's AI-content policy ask for.

## The accessibility pass

Every screen in `app/src/app/` was read for labels, roles, right/wrong cues, gesture-only
actions and text floors. P3, P4, C2 and S1 were then run on the simulator at the largest
accessibility size (`accessibility-extra-extra-extra-large`).

| Found | Fixed |
|---|---|
| Text players read while walking below 15 pt: P4's "You're here" and "Look around" labels, the bonus note, the source link, the answer letters (14 pt); the walk menu's offline line; *Can't reach it*'s options; the answers list's stop labels; the walk menu's standings | All 15 pt (a `labelWalk` style for the small capitals) |
| Map team initials 12 pt; C4 Preview's answer letters 14 pt | 13 pt and 15 pt |
| Pressable rows read only their label, not the detail under it | The detail is the hint (Settings' *Map data*, *Privacy policy*, the delete rows) |
| Home's *Join with code* pill, C5's *Save* and C6's link row had no label of their own | Labelled |
| Huge titles at the largest size; Home's top row ran off the screen | Title caps (decision 12); the row wraps |
| P3: the card grew taller than the screen and covered the header and buttons | The card's text scrolls in 30 % of the screen; header and buttons stack |
| P4: the seconds were pushed off the screen; answer letters spilled out of their circles | The bonus line wraps; letters capped |
| C2: the sheet covered the whole map; "Kids / Mixed / Expert" and "Refresh" broke mid-word | The sheet scrolls in 30 % of the screen with the summary inside it; choices and buttons stack |
| S1: label and value side by side squeezed the label to a letter a line | The value goes under the label |
| Podium rank and C9's stats clipped at the top at every size (line height from the body style) | Line heights set |

Already right, and checked: right/wrong in P4 and the answers list use an icon and words, not
only colour; reordering has *Move up* / *Move down*; stops can be added with *Add stop here* or
*Search* instead of a long-press; pins can be placed with *Move pin*'s crosshair; the C2 map has
zoom, turn and north-up buttons; the sheet has an Expand / Collapse button. VoiceOver itself was
not run.

## How it was checked

- **Automated, all green:** typecheck, lint, 161 shared tests, 48 function unit tests, 54 rules
  tests, 53 function tests against the emulator (one new assertion), Prettier, and
  `npm run validate:hosting`.
- **iPhone simulator against the emulators:** the credit in C2, C4 and Settings; C4 opening a
  hand-built walk with no route, calling `reroute` 2 seconds later (seen in the emulator log)
  and, with no ORS key there, showing the failure banner; P3, P4, C2 and S1 at the largest text
  size, before and after the fixes; the whole player flow again for the screenshots.
- **Reports:** `list-reports`, `keep` and `remove-walk` run against the emulator with seeded
  bank and creator-written reports; the counts, the closing and the removal were right.
- **Deploy:** `reroute` and `onQuestionReported` updated in `qualk-a173e`, and the privacy page
  live on both `qualk.dk/privacy` and `qualk-a173e.web.app/privacy` with the new line.
- **Not checked:** `reroute`'s success path from a phone (the routed line replacing the dashed
  one, and the warnings appearing): the emulator had no ORS key. The server side is covered by
  the emulator tests with a recorded router. Also not checked: VoiceOver, Android, a real phone.

## What was deployed and built

- **Functions:** `reroute` and `onQuestionReported`, with `firebase deploy --only
  functions:reroute,functions:onQuestionReported`. No function was deleted.
- **Hosting:** the privacy page.
- **EAS:** nothing (decision 17).
- **Your simulator:** the iPhone 18 Pro has the debug build from 26 November back on it, its text
  size is back to the default and its status bar override is cleared. An "iPhone 17 Pro Max"
  simulator was added (for the screenshot size); delete it in Xcode → Window → Devices and
  Simulators if you do not want it.

## What changed in the docs

- Spec §3 C4 (how reroute on save works), §8 "Reports and blocking" (the review tools and the
  log line), §13 (the editor's use of location), §14 (how text grows at large sizes).
- `docs/store/`: every **[M4]** marker removed; the location lines, content rights, the
  reviewer's path through *Build it myself*, the description lengths; `review-notes.md` §5 on
  reports and the email alert; `checklist.md` step 2, mismatches 1–4 fixed, decision 14;
  `screenshots.md` §6.
- Implementation plan: "Where things stand".

## What you need to do

1. **Review and merge the PR** into `m2-m5`.
2. **Set up the report email** (about 5 minutes): `docs/store/review-notes.md` §5. Before you
   submit, since the review notes say you are notified.
3. **Try reroute on a real build** (the next preview build has it). Open a hand-built walk in
   C4, drag a stop, and wait two seconds: "Routing…" shows, then the distance loses "as the crow
   flies" and the line follows the streets. Drag a stop into the harbour: its row says "Pin is
   on water". Tell me if the 2-second wait feels too long or too short.
4. **Take the C2 screenshot** (shot 5) on a build with the real config: *New quiz walk →
   Generate for me*, zoom to about 3 km, *Refresh*. Then frame it as `screenshots.md` §6 shows.
5. **Android screenshots** follow `screenshots.md` §5 once the Google Maps key is in. On the
   phone: press **power** and **volume down** together briefly to take one; they land in
   **Photos → Library → Screenshots**; share them to the Mac with **Quick Share** or Google
   Drive. Frame them with the same script and `1080 1920`.
6. **Look at the captions** in `docs/store/screenshots/ios/`. Change any you like; the script
   makes a new one in a second.
7. **One open point to know about:** Apple Maps draws its "Legal" link and logo at the map's
   bottom-left, which the sheets in C2, C4, C7 and P3 mostly cover. Apple has not asked about it
   so far; if review does, the fix is the map's `mapPadding`.
8. The checklist's other steps are unchanged, and mismatches 5 (the store name) and 6 (P1's
   pocket line) are still yours to decide.
