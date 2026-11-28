# Release checklist: from now to "submitted"

2026-11-28 · plan M5 row 4 (store listings, screenshots, privacy labels, review notes)

Your steps, in order. The texts to paste are in [`app-store.md`](app-store.md),
[`google-play.md`](google-play.md), [`review-notes.md`](review-notes.md) and
[`screenshots.md`](screenshots.md). Nothing has been uploaded or submitted.

## The steps

1. **Start the Play closed test now.** It is the longest wait: 12 testers for 14 days before a
   personal account can apply for production, and the clock runs only once they have opted in.
   Create the app as a **Game** ([`google-play.md`](google-play.md) §1), then follow
   `m2-m3-delivery.md` "What you need to do" step 7.
2. **Land the missing app pieces** (see "Code and spec mismatches" below): the M4 screens,
   including *Report question*, and the OpenStreetMap attribution. Then decide whether v1.0 ships
   with them. If not, remove the **[M4]** lines from every text before pasting.
3. **Finish the M5 account steps** in `m5-privacy-delivery.md` "What you need to do": the
   `privacy@qualk.dk` forward (the stores show it publicly), the nulkommafire.com line, and the
   Apple key for token revocation. Also the Google Maps Android key (spec §18), or Android shows
   a placeholder instead of maps.
4. **Deploy the backend from `m2-m5`** (functions, rules, indexes) and import the seed bank
   (`m4-backend-delivery.md` "What's left"). Store builds talk to the live project.
5. **Do the pocket-mode walk on both phones** (`m2-m3-delivery.md` step 3). The store texts
   promise "When In Use" only. If a phone forces one of spec §9's fallbacks, the Play
   declarations and review notes change, so know before submitting.
6. **Create a Google account for reviewers**, used only for this. Turn off 2-step verification,
   add a recovery address you read, and sign in to it once in a browser. Its details go into the
   two sign-in forms ([`review-notes.md`](review-notes.md) §1, §2.1), never into the repo.
7. **Reserve the name.** App Store Connect → the app → **App Information** → Name "QuizWalk".
   If it is taken, choose as in [`app-store.md`](app-store.md) §1 (decision below).
8. **Production builds** (EAS `production` profile) for both platforms. Send the iPhone one to
   TestFlight and the Android `.aab` to the closed test.
9. **Check the Android bundle's permissions.** Play Console → **Test and release → App bundle
   explorer** → the build → **Permissions**. Expect fine and coarse location, the location
   foreground service, notifications, internet and a few ordinary ones (network state, vibrate,
   wake lock). If `ACCESS_BACKGROUND_LOCATION` or `AD_ID` appears, add it to
   `blockedPermissions` and build again ([`google-play.md`](google-play.md) §5).
10. **Add the Play signing key** where it is needed: SHA-1 into Firebase (Google sign-in), SHA-256
    into App Check and `hosting/.well-known/assetlinks.json` ([`google-play.md`](google-play.md) §6).
11. **Record the pocket-mode video** on the Android phone, and the same on the iPhone if you like
    ([`google-play.md`](google-play.md) §5).
12. **Take the screenshots** and make the feature graphic ([`screenshots.md`](screenshots.md)).
13. **App Check:** callables first, then Firestore after a week (`m5-privacy-delivery.md`). Not
    required by either store, but planned before release (plan M5 row 2).
14. **Fill in App Store Connect:** App Information, pricing, the version page, age rating,
    content rights and App Privacy ([`app-store.md`](app-store.md)). Also the **EU Digital
    Services Act trader status** (App Store Connect → **Business**), see "Your decisions".
15. **Fill in the Play Console:** store listing, store settings and every App content card,
    including Data safety and the foreground service declaration ([`google-play.md`](google-play.md)).
16. **Make the demo walk** on the day you submit, and put its code and end date into the review
    texts ([`review-notes.md`](review-notes.md) §3).
17. **Submit.** App Store: attach the build, paste the review notes, **Manually release**, then
    **Add for Review**. Play: once the closed test has run 14 days, **Apply for production
    access**; when granted, create the production release and send it for review.
18. **After approval:** release, put the store badges on `qualk.dk` (spec §12), end and delete
    the demo walk.

## Code and spec mismatches

Found while writing these docs, against `m2-m5` at `7a3f61d`. None was changed here.

| # | What | Spec | Code | Effect on the stores |
|---|---|---|---|---|
| 1 | **The M4 screens are not in the app**: *Generate for me* is hidden, and there is no *Swap*, *Suggest a question* or ***Report question*** | §3 C2, C5, G2, P4; §8 "Reports and blocking" | `app/src/app/create.tsx` ("hidden until M4"); no report code in `app/src` | Google Play's AI-generated content policy needs in-app reporting once AI questions reach players. Apple 1.2 expects a way to report user-generated content, and today there is none, also for creator-written questions. Ship with *Report question*, or expect Apple to ask |
| 2 | **No OpenStreetMap / openrouteservice attribution** in the app | §10: "shown in C4 and in Settings" | Settings' About has none; nothing in `app/src` | Needed by the ODbL as soon as routes or place names from OSM are shown (M4). The content-rights answer assumes it |
| 3 | **Reports on creator-written questions are only logged** | §8: review is "a script or the Firestore console" | `functions/src/reports.ts`: "Creator-written ones are only logged"; the report is kept in `questionReports` | The review notes say we review reports. Nothing tells you when one arrives: check `questionReports` in the Firestore console regularly, or set a Cloud Logging alert on "Report on a creator-written question" |
| 4 | **The creator's location is used for pins** | §13: "Location is only collected during an active walk" | `app/src/location/places.ts`: the Start pin and *Add stop here* use the phone's location | Declared in both privacy forms. The privacy page and §13 could say so in one line: "When you build a walk, the app can place the Start pin and stops at your location." |
| 5 | **The store name may not match the app's name** | §1: "QuizWalk" preferred, "Qualk" fallback | `app.config.ts` `name: 'QuizWalk'`, and "QuizWalk" all through the copy | If the store name becomes "Qualk", the home screen and screens still say QuizWalk (Apple 2.3.8) |
| 6 | **P1's location card does not mention the pocket** | §9 pocket mode | P1: "Each question opens when you reach its stop…" | Not wrong, but adding "…also with the phone in your pocket, after Start walk" would make the background use plain to both reviewers before the system prompt |

## Decisions made for you, and why

1. **British spelling in all store copy, en-GB as the primary language.** The app and spec are
   British, and the first market is Denmark and Europe.
2. **Games → Trivia** on both stores (App Store subcategories Trivia and Family, secondary
   Travel). It is a quiz game; Family fits walks for families and classes and is not the Kids
   category.
3. **All App Store countries except China mainland**, where games need a licence number.
4. **Free**, and **Manually release** on the App Store, so you pick the day.
5. **Name fallback order:** "QuizWalk", then "QuizWalk: Walking Quiz", then "Qualk" with the
   app renamed to match. Keeps the store and home-screen names alike.
6. **Support URL is the privacy page**, as `m5-privacy-delivery.md` decided: it is the only page
   with a contact address. **`privacy@qualk.dk` is also the public contact on Play**, so one
   address reaches you.
7. **Privacy forms are cautious:** everything is declared as linked to the user (records are
   filed under a user ID); push tokens count as Device ID; distance walked is a game score, not
   fitness data; Firebase's anonymous "user agent" and the OS geocoder are not declared. Reasons
   in [`app-store.md`](app-store.md) §8 and [`google-play.md`](google-play.md) §4.
8. **Alcohol references are declared** (*Infrequent* on Apple, "references" on Play) because a
   few *Expert* bank questions are about drinks. Expect 13+ on the App Store. Blocking them in
   the bank would allow a lower rating.
9. **Play target audience 16–17 and 18+.** Not aimed at children (spec §13), out of the Families
   policy, and above every EU country's GDPR age of consent.
10. **Foreground service use case "Navigation"**; no background location declaration, because the
    bundle has no `ACCESS_BACKGROUND_LOCATION`.
11. **A dedicated Google account for reviewers**, because Play's reviewers can only sign in with
    Google on Android, and it spares Apple's reviewer their own Apple ID.
12. **The demo walk is opened *This week* on submission day, in the app.** It lasts 7 days, and
    afterwards the code still shows results, so a slow review never meets a dead code. The seed
    script is the alternative.
13. **Screenshots are captioned on a plain canvas** in the app's colours, 1320 × 2868 and
    1080 × 1920, so one design serves both stores and Android's tall screens fit Play's 2:1 rule.

## Your decisions

- **EU trader status (App Store Connect → Business → Digital Services Act).** Apple will not
  show the app in EU storefronts without it. If NulKommaFire is a trader (a business), Apple
  publishes its address, phone and email on the EU listing. Only you can answer this.
- **Ship v1.0 with or without the M4 screens** (mismatch 1). Without *Report question*, Apple's
  review may stop at 1.2.
- **The demo walk's questions**: yours to write (in the app), or the seed script's.
