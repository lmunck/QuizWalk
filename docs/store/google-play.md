# Google Play Console: QuizWalk listing

2026-11-28 · for version 1.0.0 · package `com.lmunck.qualk` · personal developer account

Everything here is pasted into the [Play Console](https://play.google.com/console) by hand.
Nothing has been uploaded. The Play Console app itself does not exist yet (spec §18, M0).
Release order: [`checklist.md`](checklist.md). Review texts: [`review-notes.md`](review-notes.md).
Screenshots: [`screenshots.md`](screenshots.md).

**Spelling.** British, as in the app and the spec. Set the default language to **English
(United Kingdom) – en-GB**. Play shows it in every country that has no translation of its own.

**Every feature described here is in the app** (M1 to M5, checked against the code on
`final-pass`, 2026-11-28), including *Generate for me*, *Local* questions, *Swap* and *Report
question*. Play's metadata policy, like Apple's, refuses listings that promise features the app
does not have, so check again if a later build drops one.

**Android, step by step.** Where a step happens on the phone rather than in the Play Console,
it is spelled out, since this is your first Android phone.

---

## 1. Create the app

Play Console → **Home** → **Create app**.

| Field | Value | Why |
|---|---|---|
| App name | **QuizWalk** | Spec §1. Play names need not be unique, so the fallback is unlikely to be needed. Use the same name as the App Store in the end |
| Default language | English (United Kingdom) – en-GB | See "Spelling" |
| App or game | **Game** | It is a quiz game; matches the App Store's Games category |
| Free or paid | **Free** | No purchases in v1. Free cannot later become paid |
| Declarations | Tick the Developer Programme Policies and US export laws boxes | Required to create the app |

## 2. Main store listing

Play Console → the app → **Grow users → Store presence → Main store listing**.

### App name (30 max)

```text
QuizWalk
```

### Short description (80 max)

```text
Turn any walk into a quiz. Walk to each stop and answer when you get there.
```

(75 characters.)

### Full description (4,000 max)

```text
QuizWalk turns any walk into a quiz.

Someone makes a walk and shares a code. Teams walk from stop to stop, and each question opens when they get there. Answer quickly for bonus points, then see how your team did against the others.

PLAY A WALK
• Join with a five-letter code or a link. You don't need an account.
• Play solo or as a team.
• Walk to each stop. A map, the distance and an arrow show the way.
• The question opens when you reach the stop. Gather round first: the bonus clock only starts when you tap Show question.
• Allow notifications and your phone buzzes at each stop, so it can stay in your pocket on the way.
• Can't reach a stop? Tap I'm here, skip it, or tell the creator the way is blocked.
• Weak signal? The whole quiz is on your phone once you join, and your answers are sent when you're back online.
• See the standings so far, and the final results when the walk ends.

MAKE A WALK
• Generate for me: zoom and turn the map to set the size and direction of the walk, and QuizWalk makes a walking loop with its stops and questions.
• Pick categories, from History and Science to Film & TV, or Local questions about the places you pass. Choose Kids, Mixed or Expert.
• Swap any question you don't like for another one.
• Or build it yourself: drop the pins, write your own questions with two to four answers, and add a hint or an explanation if you like.
• Preview the questions as players will see them.
• Share the code, a QR code or a link.
• Open the walk for today, or for the whole week so teams can walk when it suits them.
• Follow the teams on a live map, skip a stop for everyone if the way is blocked, and end the walk to show the results.
• Reuse a walk for the next group.

GOOD TO KNOW
• Creators sign in with Google. Players never need an account.
• QuizWalk uses your location during a walk, to open the questions, and when you make one, to put the pins where you stand. Your position is shared only with the walk's creator, and only after you tap Start walk. Other teams never see where you are.
• While you walk, a notification shows that QuizWalk is guiding you to the next stop. It goes away when your walk ends.
• Something wrong with a question? Report it from the answer screen.
• No ads, no analytics, no tracking.
• Delete your data, or your account, in Settings at any time.
• QuizWalk is in English.
```

It differs from the App Store text in two places: Google sign-in only (Android shows no Apple
button, `sign-in.tsx`), and one line about the foreground-service notification, which Android
users see and iPhone users do not. Length: 2,353 characters.

### Graphics

| Asset | Requirement | Source |
|---|---|---|
| App icon | 512 × 512 PNG, 32-bit, up to 1 MB | `cd design/icon && rsvg-convert -w 512 -h 512 icon.svg -o play-icon.png` (as `render.sh` does at 1024). Play adds the rounded mask itself |
| Feature graphic | 1024 × 500 JPEG or 24-bit PNG (no transparency). Required | To make: the icon and "Turn any walk into a quiz" on the background colour `#F4F6F1`, accent `#1F6F4A`. No device frames, no "free" or ranking claims |
| Phone screenshots | 2 to 8, see [`screenshots.md`](screenshots.md) | Taken on the Android phone |
| Tablet screenshots | None | Optional; QuizWalk is a phone app |
| Video | None for 1.0 | |

### Category and contact details

Play Console → **Store presence → Store settings**.

| Field | Value | Why |
|---|---|---|
| App category | **Trivia** (under Games) | As on the App Store |
| Tags | Up to five from Play's list. Look for: Trivia, Quiz, Casual, Outdoor, Family | Play only offers its own list, so pick the closest it has |
| Email address | `privacy@qualk.dk` | The only address the project has. It is public on the listing. It must reach you first (checklist) |
| Phone number | Leave empty | Optional, and public |
| Website | `https://qualk.dk` | |
| External marketing | Your choice | Lets Google advertise the app outside Play. No effect on the app |

## 3. App content

Play Console → the app → **App content** (in the left menu under **Monitor and improve** or
**Policy and programmes**, depending on the Console version). Each item below is one card
there.

### Privacy policy

`https://qualk.dk/privacy`

### Ads

**No, my app does not contain ads.** Spec §13.

### App access

**All or some functionality is restricted.** Players need nothing, but making a walk needs a
Google sign-in. Paste the text from [`review-notes.md`](review-notes.md) §2.1 and the review
Google account's details (checklist step 6).

### Content rating (IARC questionnaire)

Start the questionnaire, give `privacy@qualk.dk`, and choose the category **Game** (it may be
worded "Games" or ask about "All other app types"; QuizWalk is a game). Then:

| Question (topic) | Answer | Why |
|---|---|---|
| Violence of any kind | No | Some history questions name wars or battles as facts. Nothing is shown or described in detail |
| Fear, horror | No | |
| Sexuality, nudity | No | Blocked in the question bank (`m4-backend-delivery.md`) |
| Gambling or simulated gambling | No | Points only, no stakes, no prizes |
| Language (profanity, crude humour) | No | Ruled out in the bank. Creator-written text is covered by the user-interaction answer below |
| Controlled substances: references to alcohol | **Yes, references only** | A few *Expert* questions are about drinks such as wine. Kids and Mixed have none. No use is shown and nothing encourages it |
| Controlled substances: tobacco or drugs | No | Drug themes are blocked in the bank |
| Users can interact or exchange content (text, images, audio, voice) | **Yes** | Creators write questions that the players of their walk read; team names appear on the standings. There is no chat or messaging |
| Shares the user's current location with other users | **Yes** | Once a team taps *Start walk*, the walk's creator sees its last known position on the live map (spec §3 C7). Other teams never do |
| Users can buy digital goods | No | |
| Web browser or search engine | No | |
| Mainly news or education | No | It is a game |

Expect Play to show "Users interact" and "Shares location" on the listing. Those are accurate.
Accept the ratings it computes for each region; the alcohol references may lift them a step.

### Target audience and content

| Question | Answer | Why |
|---|---|---|
| Target age groups | **16–17** and **18 and over** | Spec §13: not aimed at children. The adult who makes a walk or holds the team's phone is the user it is designed for; children play as part of a team on an adult's phone. 16 is the highest age at which GDPR lets a young person consent alone in any EU country, so no one in the target groups needs a parent's consent. Ticking anything under 13 would bring in Play's Families policy |
| Could the store listing unintentionally appeal to children? | **No** | The screenshots show adults' walks in a city, with no cartoon characters. *Kids* is a question difficulty that an adult picks for a walk they run for children |
| Appeals to children (if Play asks again) | Explain: "QuizWalk is used by adults to run quiz walks for friends, families and classes. Children may join a team on an adult's phone but do not hold accounts." | Same reason |

### News apps, government apps, financial features, health

| Card | Answer |
|---|---|
| News app | No |
| Government app | No |
| Financial features | My app doesn't provide any financial features |
| Health apps | My app does not have any health features (it measures no health data; distance walked is a game score) |
| COVID-19 contact tracing and status (if still shown) | Not one |

### Advertising ID

**No.** QuizWalk has no ads and no analytics SDK, so nothing reads the advertising ID. Check
after the first upload that no library added `com.google.android.gms.permission.AD_ID`
(checklist step 9). If one did, add it to `blockedPermissions` in `app/app.config.ts` and build
again.

### Data safety

See §4 below.

### Foreground service permissions

See §5 below.

## 4. Data safety form

Play Console → **App content → Data safety → Start**. Taken from the code on `m2-m5`, spec §6
and §13, the privacy page, and Google's own list of what Firebase collects.

### Step 1: Data collection and security

| Question | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | Firebase and Expo Push are reached over HTTPS only |
| Which methods of account creation does your app support? | **OAuth** (Sign in with Google) | Creators sign in with Google on Android. Players get an anonymous ID with no sign-up, which is not an account they create |
| Delete account URL | `https://qualk.dk/privacy` | Its "Deleting your data in the app" section has the in-app steps, what goes and what stays, and an address to write to (`privacy@qualk.dk`) for anyone who no longer has the app |
| Can users request that some or all of their data be deleted, without deleting their account? | **Yes** | Players use Settings → *Delete my data*; anyone can write to `privacy@qualk.dk` |

### Step 2: Data types

Tick these, and nothing else:

| Play category → type | What QuizWalk collects |
|---|---|
| **Location → Precise location** | A player's last known position (one point, overwritten, not a trail) from *Start walk* until the team finishes or leaves or the walk ends; kept until 30 days after the walk ends. A creator's Start pin and stops when they place them from the phone's location (*Add stop here*, the default Start pin, or the *Generate for me* map, which opens where they stand) |
| **Personal info → Name** | The creator's "name players see" and the name Google hands over at sign-in. Team names, which for a solo player are usually their own name |
| **Personal info → Email address** | The address Google hands over when a creator signs in. Kept by Firebase Authentication; shown only to the creator |
| **Personal info → User IDs** | The Firebase user ID (random per install for players, per account for creators) and the Google account ID behind a creator's sign-in |
| **App activity → Other user-generated content** | Walks that creators write (title, "When" line, stops, questions, answers, hints, explanations), team names, way-blocked reports and question reports |
| **App activity → Other actions** | Gameplay: each answer, its timing and points, distance walked, when a team joined, started, finished or left. The times of a creator's recent generate, swap and route requests (a day at most) |
| **Device or other IDs** | The push token. The Firebase installation ID and push token that Google's Firebase services handle for delivery. The IP address Google's servers see on each call, used for security |

**Not ticked:** Approximate location (the app keeps no coarse location; Android asks for
precise location and the game explains when only approximate is given), Address, Phone number,
everything under Financial info, Health and fitness, Messages, Photos and videos, Audio, Files
and docs, Calendar, Contacts, App interactions, In-app search history, Installed apps, Web
browsing, and everything under App info and performance.

### Step 3: Usage and handling, per type

For **every** ticked type, the answers to "Is this data shared?" and "Is this data processed
ephemerally?" are **Not shared** and **No**.

| Type | Collected | Required or optional | Purposes |
|---|---|---|---|
| Precise location | Yes | **Required** (a walk cannot be played without it) | App functionality |
| Name | Yes | Required | App functionality, Account management |
| Email address | Yes | Required (every Google sign-in has one) | Account management |
| User IDs | Yes | Required | App functionality, Account management |
| Other user-generated content | Yes | Required | App functionality |
| Other actions | Yes | Required | App functionality; Fraud prevention, security and compliance (the request times are kept to limit use) |
| Device or other IDs | Yes | Required (Firebase handles some of these whether or not notifications are allowed) | App functionality; Fraud prevention, security and compliance |

### Why these answers

- **Not shared.** Play does not count a transfer to a service provider that processes data for
  the developer (Google Firebase, Expo Push) as sharing. The creator seeing a team's position is
  something the player starts by tapping *Start walk*, after P1 says "Nothing about where you are
  is shared until you tap Start walk, and only with {creator}"; Play does not count a transfer
  the user starts, and expects, as sharing either. openrouteservice, Overpass, Wikipedia and
  Gemini receive points along a route, categories and place information, never anything that
  identifies a person (privacy page, "Who receives what").
- **Not ephemeral.** Everything ticked is stored: positions until 30 days after the walk, the
  request times for up to a day.
- **Distance walked** is a game score worked out on the phone from the location already
  declared. It is listed under Other actions, not Fitness info, because the app does not
  measure exercise. If Play's review disagrees, ticking Fitness info as well costs nothing.
- **App info and performance.** No crash reporter or analytics SDK is in `app/package.json`.
  Server error logs are about the server.
- **Firebase's own collection** (IP address, installation ID, push token, the "user agent" with
  device and SDK versions) is from Google's Play disclosure page for Firebase, and is covered by
  Device or other IDs.

The preview Play shows at the end should read: "No data shared with third parties", "Data is
encrypted in transit", "You can request that data be deleted", and the types above.

## 5. Location permissions and the foreground service

### What the app declares

From `app/app.config.ts` and expo-location 58.0.22's config plugin:

| Permission | In the manifest | Why |
|---|---|---|
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Yes | Location during a walk. Asked at runtime as "While using the app" |
| `ACCESS_BACKGROUND_LOCATION` | **No** | `isAndroidBackgroundLocationEnabled: false`. "Allow all the time" is never asked (spec §9) |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` | Yes | Pocket mode's foreground service (`isAndroidForegroundServiceEnabled: true`) |
| `POST_NOTIFICATIONS` | Yes | The arrival buzz, pushes, and the service's notification |
| `CAMERA`, `RECORD_AUDIO` | Blocked | `blockedPermissions`; no in-app scanner (spec §16) |

### Background location declaration: not needed

Play asks for the background location declaration (with its 30-second video and prominent
disclosure) only when the app bundle declares `ACCESS_BACKGROUND_LOCATION`. QuizWalk's does not.
Play does review location use from a foreground service against the same policy, and accepts it
when the service starts from a user action on screen and stops when that task is done. That is
how pocket mode works: it starts on *Start walk*, with the app on screen, and stops when the team
finishes or leaves, when the walk ends, or when QuizWalk is swiped away
(`app/src/location/pocket.ts`, `killServiceOnDestroy: true`).

If the Play Console still shows a **Location permissions** card after the upload, check the
bundle's permissions (checklist step 9). If `ACCESS_BACKGROUND_LOCATION` is there, a library added
it and it must be blocked, not declared.

### Foreground service declaration: needed

Apps that target Android 14 or later must declare every foreground service type they use.
Play Console → **App content → Foreground service permissions → Start**.

| Field | Value |
|---|---|
| Foreground service type | **Location** |
| Use case | **Background location updates: Navigation**. Pocket mode guides the team to the next stop and tells them when they arrive, which is navigation. The creator's live map is a side effect, not the purpose |
| Description of the feature | Paste [`review-notes.md`](review-notes.md) §2.2 "Description" |
| Impact if deferred or interrupted | Paste [`review-notes.md`](review-notes.md) §2.2 "Impact" |
| Video link | An unlisted YouTube link to the recording described below |

### The video

Google asks the video to show the steps a user takes to start the feature. For navigation, that
is starting the guidance. It sets no length; keep it to about a minute by cutting the walking.

What it must show, in this order:

1. QuizWalk open on a walk's join screen (P1) with the card "Your location unlocks the
   questions", then **Allow location & join**, and Android's prompt answered **While using the
   app**. This is the disclosure before the system prompt.
2. The lobby: **Start walk**, the "Buzz you at each stop?" question, and Android's notification
   prompt answered **Allow**.
3. The walk screen with "Your phone buzzes at the stop, so it can stay in your pocket".
4. The **Home** gesture, then the notification shade pulled down, showing **"Guiding you to stop
   1"**.
5. The arrival: **"You're at stop 1"** arriving as a notification, and tapping it opening the
   question.
6. After the last answer, the shade again, with the "Guiding you" notification gone.

**How to record it on the Android phone:**

1. Make a walk with one stop about 100 m from where you stand: Home → *New quiz walk* → a
   title → long-press the map about 100 m away to add the stop → tap its row and write a
   question. *Publish & share*, then *Open walk* → *Today*. Join it yourself with *Join with
   code* on the same phone.
2. Add the screen recorder to Quick Settings once: swipe down from the top of the screen
   **twice** to open Quick Settings, tap the **pencil** (edit) icon, find **Screen record**
   (Samsung calls it **Screen recorder**), drag it into the tiles, then go back.
3. Swipe down twice, tap **Screen record**. If it asks, choose **Record entire screen** (not one
   app, or the notification shade will not show), turn on **Show touches** if offered, then
   **Start**. A countdown follows.
4. Run steps 1–6 above. Keep the screen on while you walk: a locked screen records as black.
5. To stop, swipe down and tap the recording notification's **Stop**. The video is in **Photos**
   (or Files) under **Movies → Screen recordings**.
6. Trim the start and end in Google Photos: open the video → **Edit** → drag the ends. A
   minute or two of walking in the middle is fine; reviewers can skip it.
7. Upload to [YouTube](https://studio.youtube.com) as **Unlisted** (not Private: reviewers must
   be able to open it) and paste the link.

The same recording, made on the iPhone, can go into the App Review notes (see
[`review-notes.md`](review-notes.md)).

## 6. Releases (for reference)

- A personal developer account must run a **closed test with at least 12 testers for 14 days**
  before it can apply for production access (spec §18). Production → **Apply for production
  access** opens once that is done, and asks a few questions about the test.
- Upload `.aab` files from the EAS `production` profile. Preview builds are APKs, which Play
  does not take (`m2-m3-delivery.md`).
- Play App Signing is on by default. After the first upload, copy its SHA-1 and SHA-256: they go
  into Firebase (Google sign-in), App Check (Play Integrity) and `hosting/.well-known/assetlinks.json`
  (spec §12, §18).
