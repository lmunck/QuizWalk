# App Store Connect: QuizWalk listing

2026-11-28 · for version 1.0.0 · app record `com.lmunck.Qualk` (Team `3JMZLMZVTS`)

Everything here is pasted into [App Store Connect](https://appstoreconnect.apple.com) by hand.
Nothing has been uploaded. Release order: [`checklist.md`](checklist.md). Review notes:
[`review-notes.md`](review-notes.md). Screenshots: [`screenshots.md`](screenshots.md).

**Spelling.** The store copy uses British spelling, like the app and the spec. The first market
is Denmark and the rest of Europe, and the app itself is in British English (spec §1: English
only). Set the primary language to **English (U.K.)**. Storefronts without their own
localisation show the primary language, so one localisation covers every country.

**Marked text.** Text marked **[M4]** describes *Generate for me*, *Local* questions and
*Report question*. On `m2-m5` today those screens are not in the app yet (see
[`checklist.md`](checklist.md), step 1). If the build you submit lacks them, delete the marked
lines before you paste. Apple rejects listings that describe features the app does not have
(guideline 2.3.1).

---

## 1. App Information

| Field | Value | Why |
|---|---|---|
| Name (30 max) | **QuizWalk** | Spec §1: "QuizWalk" preferred. The app's home-screen name and all its copy already say QuizWalk (`app.config.ts` `name`) |
| Name, fallback | **Qualk** | Spec §1 fallback, if App Store Connect says "QuizWalk" is taken. Read the note below first |
| Subtitle (30 max) | **Turn any walk into a quiz** (25) | The Welcome screen's headline, word for word |
| Primary language | English (U.K.) | See "Spelling" above |
| Bundle ID | `com.lmunck.Qualk` | Reuses the retired record (spec §1). Already set; cannot change |
| SKU | Keep the one the old record has | Not shown to anyone |
| Primary category | **Games** | It is a quiz game. Trivia is how people search for it |
| Game subcategories | **Trivia**, **Family** | Trivia fits the play; Family fits "a walk shared among friends, a family or a class" (spec §4). Family is a game subcategory, not the Kids category, which spec §13 rules out |
| Secondary category | **Travel** | Walks, places and *Local* questions about what you pass |
| Content rights | See §6 | |
| Age rating | See §5 | |
| Copyright | `2026 NulKommaFire` | The privacy page names NulKommaFire as the maker |

**If you have to fall back to "Qualk".** The phone's home screen would still say "QuizWalk",
and so would every screen ("Keep QuizWalk open"). Apple can query a store name that differs
from the app's name (guideline 2.3.8). Two ways out: try a longer name that keeps the word, such
as **QuizWalk: Walking Quiz**, before "Qualk"; or, if it must be "Qualk", change `name` in
`app/app.config.ts` and the in-app copy to match. The checklist has this as a decision.

## 2. Pricing and Availability

| Field | Value | Why |
|---|---|---|
| Price | Free | No purchases in v1 |
| Availability | All countries and regions **except China mainland** | Games on the China mainland storefront need a government game licence number. Everything else is open, since the app is English only and works anywhere |
| Pre-orders | Off | |

## 3. Version page (1.0.0)

### Promotional text (170 max)

Can be changed later without a new review.

```text
Make a quiz walk and share a five-letter code. Teams walk to each stop, answer when they get there, and see who comes out on top.
```

(129 characters.)

### Description (4,000 max)

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
• Creators sign in with Apple or Google. Players never need an account.
• QuizWalk uses your location only during a walk, to open the questions. Your position is shared only with the walk's creator, and only after you tap Start walk. Other teams never see where you are.
• Something wrong with a question? Report it from the answer screen.
• No ads, no analytics, no tracking.
• Delete your data, or your account, in Settings at any time.
• QuizWalk is in English.
```

**[M4] lines** in the description: the three bullets "Generate for me…", "Pick categories…",
"Swap any question…", and "Something wrong with a question?…". Without the M4 screens, delete
those four bullets; the rest matches the app on `m2-m5` today.

Length: 2,191 characters with every line in, 1,788 without the [M4] lines.

### Keywords (100 max)

```text
trivia,scavenger hunt,treasure hunt,team building,family,school,outdoor,city tour,party game,history
```

(100 characters.) Words already in the name or subtitle ("quiz", "walk", "QuizWalk") are left
out, because Apple indexes the name and subtitle anyway. No competitor or trademark names
(for example no "geocaching").

### URLs

| Field | Value | Why |
|---|---|---|
| Support URL | `https://qualk.dk/privacy` | The only page with a contact address (`privacy@qualk.dk`), as `m5-privacy-delivery.md` says. A support page of its own can replace it later |
| Marketing URL | `https://qualk.dk` | The landing page. It says "Coming soon"; add the store badges after release (spec §12) |
| Privacy Policy URL | `https://qualk.dk/privacy` | Live since 2026-11-28. Set under **App Privacy**, not on the version page |

### Other version fields

| Field | Value |
|---|---|
| Version | 1.0.0 (matches `app.config.ts`; EAS sets the build number) |
| Screenshots | iPhone 6.9-inch only, see [`screenshots.md`](screenshots.md). No iPad set: `supportsTablet` is `false` |
| App Preview video | None for 1.0 |
| Routing app coverage file | None. QuizWalk is not a routing app; *Directions* hands over to Apple Maps |
| App Review information | Paste from [`review-notes.md`](review-notes.md) §1 |
| Version release | **Manually release this version**, so you choose the day after approval |

## 4. Sign in with Apple and account deletion

Nothing to fill in here, but App Review checks both:

- Google sign-in is offered, so Sign in with Apple must be too (guideline 4.8). It is, first, on
  iPhone (`app/src/app/sign-in.tsx`).
- Account deletion is in the app (guideline 5.1.1(v)): Settings → *Delete account and all
  data*. On iPhone it asks Apple once more and revokes the Apple token, once the Apple key is in
  Firebase (spec §18, M5).

## 5. Age rating

App Store Connect works out the rating from these answers. Apple's questionnaire changes its
wording from time to time, so match the answers by topic.

| Topic | Answer | Why |
|---|---|---|
| Parental controls | No | The app has none |
| Age assurance | No | The app does not check ages |
| Unrestricted web access | No | The app has no in-app browser. Links (a question's source, the privacy policy, *Directions*) open in Safari or Maps |
| User-generated content | **Yes** | Creators write walk titles, questions and answers; players choose team names. Players and creators of the same walk see them. The walk is reached only with its code: there is no public list of walks (spec §16) |
| Messaging and chat | No | Messaging was cut (spec §3 C7, §16). The only message is a fixed "way blocked" alert to the creator |
| Advertising | No | No ads (spec §13) |
| Cartoon or fantasy violence | None | |
| Realistic violence | None | Some history questions name wars or battles as facts. Nothing is shown or described in detail |
| Prolonged graphic or sadistic violence | None | |
| Guns or other weapons | None | |
| Profanity or crude humour | None | The bank's rules rule it out (`content/question-bank/README.md`). Creator-written text is covered by the user-generated content answer |
| Mature or suggestive themes | None | |
| Horror or fear themes | None | |
| Sexual content or nudity | None | Sex themes are blocked in the bank (`m4-backend-delivery.md`) |
| Graphic sexual content and nudity | None | |
| Alcohol, tobacco or drug use or references | **Infrequent / mild** | The question bank keeps a few alcohol questions at *Expert* level (for example about wine); they are blocked at *Kids* and *Mixed*. These are references in quiz text, never shown use |
| Medical or treatment information | None | |
| Health or wellness topics | None | Walking is part of the game, but the app gives no health advice and measures nothing about health |
| Simulated gambling | None | |
| Gambling | No | |
| Contests | No | Points and a leaderboard, but no prizes |
| Loot boxes | No | No purchases |
| Made for Kids | No | Spec §13: not submitted to the Kids category |

**Expected result: probably 13+**, mainly because of the alcohol references. Accept what App
Store Connect computes. If you want a lower rating later, block the bank's alcohol questions with
`scripts/review-bank.ts` and change that answer to None.

## 6. Content rights

**"Does your app contain, show, or access third-party content?" Yes**, and you have the rights
to use it:

| Content | Rights |
|---|---|
| Apple Maps tiles | Through Apple's MapKit, which shows its own attribution |
| Place names from OpenStreetMap (via Overpass) and walking routes from openrouteservice | Open Database Licence; needs "© OpenStreetMap contributors" shown in the app. **Not shown yet**, see the checklist |
| *Local* questions written from Wikipedia and Wikidata text | Facts are reworded into new questions, and each answer shows "Source: {article}" with a link (`question.tsx`) |
| Questions written by Gemini and by Claude Code sessions | Generated for this app; both providers' terms let the developer use the output |
| Questions written by creators | The creator's own content |

## 7. Export compliance

Already answered in the build: `ios.config.usesNonExemptEncryption: false` in `app.config.ts`
sets `ITSAppUsesNonExemptEncryption` to NO, so App Store Connect does not ask.

If it ever asks: the app uses encryption only for HTTPS connections (Firebase, Expo Push), which
is exempt. **"None of the algorithms mentioned above"**, no documentation to upload, and **No**
to "available in France".

## 8. App Privacy (the "nutrition label")

App Store Connect → the app → **App Privacy** → **Get Started**.

**"Do you or your third-party partners collect data from this app?" Yes.**

Apple counts data as collected when it leaves the phone and is kept for longer than it takes to
answer a request. Data that Firebase or Expo hold for us counts as ours. The table is taken from
the code on `m2-m5`, spec §6 and §13, and the privacy page.

| Apple data type | What QuizWalk collects | Purpose | Linked to the user | Tracking |
|---|---|---|---|---|
| **Location → Precise Location** | A player's last known position (one point, overwritten as they walk, not a trail), from *Start walk* until the team finishes or leaves or the walk ends; kept until 30 days after the walk ends (`walks/{w}/positions/{uid}`). Also the Start pin and stops a creator places, which come from their location when they use *Add stop here* or the default Start pin | App Functionality | Yes | No |
| **Contact Info → Name** | The creator's "name players see" (`users/{uid}.displayName`, `walks.ownerName`), and the name Apple or Google hands over at sign-in. Team names, which for a solo player are usually their own name | App Functionality | Yes | No |
| **Contact Info → Email Address** | The address Apple or Google hands over when a creator signs in (Apple may give a relay address). Kept by Firebase Authentication; shown only to the creator in Settings | App Functionality | Yes | No |
| **Identifiers → User ID** | The Firebase user ID: a random one per install for players, one per account for creators. The Apple or Google account ID behind a creator's sign-in | App Functionality | Yes | No |
| **Identifiers → Device ID** | The push token, when notifications are allowed (`users/{uid}.pushToken`, `teams/{uid}.pushToken`) | App Functionality | Yes | No |
| **User Content → Gameplay Content** | Team name, number of players, solo or team, colour; each answer, its timing and points; distance walked; when the team joined, started, finished or left | App Functionality | Yes | No |
| **User Content → Other User Content** | Walks that creators write: title, "When" line, stops, questions, answers, hints, explanations. Way-blocked reports and question reports | App Functionality | Yes | No |
| **Usage Data → Other Usage Data** | The times of a creator's recent generate, swap and route requests, kept for a day at most to share the routing and question services fairly (`rateLimits/{uid}`) | App Functionality | Yes | No |

**Not collected** (answer No or leave unticked): Coarse Location (the app needs precise
location and keeps nothing coarse), Phone Number, Physical Address, Other Contact Info, Health,
Fitness, Payment Info, Credit Info, Other Financial Info, Sensitive Info, Contacts, Emails or
Text Messages, Photos or Videos, Audio Data, Customer Support, Browsing History, Search History,
Product Interaction, Advertising Data, Purchases, Crash Data, Performance Data, Other Diagnostic
Data, Other Data.

**Data used to track you: none.** There are no ads, no analytics SDKs and no data brokers
(spec §13, `app/package.json`).

**Why "linked" everywhere.** Every record is filed under the Firebase user ID, and a creator's
ID is tied to their Apple or Google account. A player's ID is random, but a solo player's team
name is often their name, so "not linked" would be hard to defend.

**Why location says App Functionality only.** It opens the questions, adds up the distance
walked, and shows the creator where teams are (spec §13). Nothing else.

**Judgement calls, written down:**

- *Search History* is not declared. Place search in the editor uses iOS's own geocoder
  (`expo-location`, spec §3 G2); the query goes from iOS to Apple and is not stored by us.
- *Diagnostics* are not declared. There is no crash reporter. Firebase's SDKs send a "user
  agent" (device type, OS and SDK versions) that Google says is never linked to a user or device
  and is used only to count platform and version adoption. Server error logs (kept 30 days) are
  about the server, not collected from the phone.
- *Precise Location* includes the creator's pins, because the editor can fill them from the
  phone's location. A creator who drags the pins by hand gives no location at all.
- *Device ID* covers the push token. Apple has no category for push tokens; Device ID is the
  common, cautious choice.
- *Other Usage Data* only matters once the M4 screens call the generation functions. It does no
  harm to declare it now.
