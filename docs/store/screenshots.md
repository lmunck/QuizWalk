# Screenshot plan

2026-11-28 · for version 1.0.0

Which screens to capture, in what order, with which caption, and at what size. Nothing has been
captured yet. iPhone screenshots are taken on the simulator; Android ones on your Android phone
(this Mac has no Android SDK, `m2-m3-delivery.md`).

## 1. Sizes

| Store | Set | Size | Count | Notes |
|---|---|---|---|---|
| App Store | iPhone 6.9-inch | **1320 × 2868** portrait (1290 × 2796 and 1260 × 2736 are also accepted) | 1 to 10; plan for 9 | Apple scales them down for smaller iPhones. PNG or JPEG, RGB, no transparency |
| App Store | iPad | None | — | `supportsTablet: false` in `app.config.ts`, so no iPad set is asked for |
| Google Play | Phone | **1080 × 1920** portrait | 2 to 8; plan for 8 | Each side 320–3,840 px, and the long side at most twice the short side. Four or more at 1080 px or wider make the app eligible to be featured. PNG (no transparency) or JPEG |
| Google Play | Feature graphic | 1024 × 500 | 1, required | See [`google-play.md`](google-play.md) §2 |
| Google Play | Tablet | None | — | Optional |

**Simulator:** use **iPhone 17 Pro Max**, which gives 1320 × 2868. This Mac only has an iPhone
18 Pro Max simulator set up; its screenshots may be another size, so either create a 17 Pro Max
(`xcrun simctl create "iPhone 17 Pro Max" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max`)
or check the 18's size with `sips -g pixelWidth -g pixelHeight shot.png` against the list above.

**Android:** most phones today are 20:9 (for example 1080 × 2400), which breaks Play's 2:1 rule.
That is one more reason to frame them (below): the framed image is exactly 1080 × 1920.

## 2. Framing and captions

Neither store has a caption field, so the caption is part of the image. Decision: **each
screenshot sits on a plain canvas with a caption above it**, no device frame.

- Canvas: background `#F4F6F1`, the size from §1.
- Caption: one line, at most two, in Space Grotesk Bold, ink `#16211B`, centred near the top.
  An optional smaller second line in Inter, `#4A5A50`.
- The screenshot below, scaled to about 85 % of the width, with rounded corners.
- Same layout for both stores, so one design (Keynote, Figma or a script) makes both sets.
- British spelling, sentence case, no full stop on one-line captions.

## 3. The screens, in order

The first three show up in search results, so they explain the game: walk, answer, win.

| # | Screen | Caption (second line) | What must be on screen | Store |
|---|---|---|---|---|
| 1 | P3 Walk to stop | **Walk to each stop** (The map shows the way) | The map with the next stop and its radius, the header "Stop 2 of 5 · 14 pts", the distance (about 250 m), progress marks with ✓ and ✕ | Both |
| 2 | P4 Question | **Answer when you get there** (Fast answers earn a bonus) | "Stop 4", the H.C. Andersen question, four answers, the bonus clock part-drained (about +4) | Both |
| 3 | P4 feedback | **See if you got it right** (With the points and the story behind it) | A right answer: tick, "Right!", "+14 points (10 + 4 speed bonus)", the explanation | Both |
| 4 | P6 Final results (or C9) | **See who comes out on top** | The podium with three or four teams, in their colours with initials | Both |
| 5 | C2 Generate for me | **Zoom the map, get a walk** (QuizWalk makes the route and the questions) | The map after a Refresh, the loop with its stops, the sheet with categories and "8 stops · 3 km · about 55 min" | Both |
| 6 | C4 Route builder | **Or build it yourself** (Drop the pins, write the questions) | The map with 5 stops and the sheet at half height listing them | Both |
| 7 | C6 Share | **Share a five-letter code** (Or the QR code, or a link) | The code in large letters, the QR, a few teams that have joined | Both |
| 8 | C7 Live monitor | **Follow the teams live** | The map with three team markers, the leaderboard sheet, a "Way blocked" alert. Take it within 2 minutes of adding the pretend teams: after that they show as dimmed ("seen 3 min ago"), since the script sets their last-seen time once | Both |
| 9 | P1 Join | **Join with a code. No account needed.** | The walk summary with the time estimate, Solo / Team, the team name, the location card | App Store only |

Play takes eight: rows 1–8. The App Store takes all nine.

**Left out on purpose:** Welcome (its illustration may read as aimed at children, see the Play
target audience), sign-in, Settings (both show "Test build" rows in an emulator build), and the
notification prompts.

## 4. iPhone: how to take them

On the Mac, against the local emulators, so no real data is touched:

1. Start the emulators (as in `user-testing.md` part 1) and build the app in the **Release**
   configuration, so the dev-only *Simulate arrive* button is not on screen:

   ```bash
   cd app && QUALK_EMULATORS=1 npx expo run:ios --configuration Release --device "iPhone 17 Pro Max"
   ```

2. Clean status bar (9:41, full battery and bars):

   ```bash
   xcrun simctl status_bar booted override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
   ```

3. In the app: *Create a walk* → **Sign in as test creator** (the emulator build's stand-in for
   Apple and Google) → name "Anders". Look up that user's uid in the Emulator UI
   (`http://127.0.0.1:4000` → Authentication).
4. Seed a walk owned by that user, open, with pretend teams for the monitor and the podium:

   ```bash
   node scripts/seed-walk.mjs --owner <uid> --status open --title "Harbour history"
   node scripts/seed-walk.mjs --code <CODE> --team "Harbour Hawks" --answered 3
   node scripts/seed-walk.mjs --code <CODE> --team "Fjord Kids" --answered 2
   node scripts/seed-walk.mjs --code <CODE> --team "Canal Crew" --answered 1 --blocked
   ```

5. Take each screen with `xcrun simctl io booted screenshot 01-walk.png` (and so on). Move the
   simulator with `xcrun simctl location booted set <lat>,<lng>`: the stops' positions are printed
   by the seed script; set a point about 250 m from a stop for shot 1 and on the stop for shots 2
   and 3. On the simulator the compass is unreliable, so P3 shows a text bearing ("north-east")
   instead of the arrow. That is fine; the Android set shows the arrow.
6. For shot 4, finish the walk on the simulator, then end it with
   `node scripts/seed-walk.mjs --code <CODE> --status ended`.
7. For shot 6, create a second walk by hand in the app (C4) with 5 stops near Nyhavn and real
   questions. Shot 5 needs the real routing and Gemini services, so take it on a build with the
   real Firebase config.
8. Afterwards: `xcrun simctl status_bar booted clear`.

Real questions read better than test ones: before shot 2, edit the seeded stop 4 (the Andersen
question) or build the walk by hand.

## 5. Android: how to take them

On your Android phone, with a production or preview build against the real project. The map
needs the Google Maps Android key first (spec §18), or it shows a placeholder.

1. As yourself, build a walk of 4–5 stops near home with good questions, publish it and open it
   (*Today*). For the monitor and podium, add pretend teams with the seed script against the real
   project (same `--team` lines as above, plus `--project qualk-a173e`). Delete the walk when you
   are done: it takes the pretend teams with it.
2. Join it yourself (*Join with code*) and walk to the stops to get shots 1–3.
3. **Take a screenshot:** press the **power** and **volume down** buttons together, briefly. It
   is saved in **Photos** (Google Photos) → **Library** → **Screenshots**.
4. Before each shot, swipe down once and clear the notifications (**Clear all**), so the status
   bar is tidy. Leave pocket mode's "Guiding you" notification; it only shows as a small icon.
5. **Get them to the Mac:** in Google Photos select them → **Share** → **Quick Share** or
   **Drive**, or open [photos.google.com](https://photos.google.com) on the Mac and download them.
6. Frame them onto 1080 × 1920 canvases as in §2.
