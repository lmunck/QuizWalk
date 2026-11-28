# M5 privacy delivery notes

2026-11-28 · branch `m5-privacy`, PR into `m2-m5`. Plan M5 rows 1 and 2.

## In one paragraph

Anyone can now delete what QuizWalk holds about them from Settings (S1). A player without an
account taps *Delete my data*: their teams, answers, locations, reports and the list of walks on
Home go, in every walk, and a team in a walk that is still open drops out of the standings at
once. A creator taps *Delete account and all data*: their walks go with everything in them, then
their teams elsewhere, their name and their sign-in. A daily job deletes every walk's
participant data 30 days after it ends and frees its join code. `qualk.dk/privacy` says what is
collected, why, where it is kept, who receives what, for how long, and how to delete it; S1 and
the landing page link to it. App Check on Firestore stays in monitor mode until Play Integrity
exists, and the steps to turn it on are below. The three functions and the page are deployed.

## What was built

| Area | What | Where |
|---|---|---|
| `deleteMyData` | Callable, App Check like the others, anonymous users allowed. Removes this uid's teams (with answers), positions, alerts and question reports, then `playing` and `pushToken` (the whole `users` doc when nothing else is in it) | `functions/src/privacy.ts`, `functions/src/index.ts` |
| `deleteAccount` | Callable. The account's walks recursively, open ones included, with join codes and generation jobs; then everything `deleteMyData` removes; `rateLimits/{uid}`; `users/{uid}`; last the Auth user | same |
| `daily` | Scheduled, 04:00 Copenhagen, europe-west1, 9-minute timeout. 30 days after `endedAt`: teams, answers, positions and alerts deleted, join code released, walk taken off `playing` lists, `participantDataDeletedAt` set | same |
| S1 | A *Privacy* section: *Privacy policy* (opens `qualk.dk/privacy`), and *Delete account and all data* for creators or *Delete my data* for players. Each confirms with what is lost and warns when a walk is in progress on the phone | `app/src/app/settings.tsx` |
| Apple sign-in | Before an Apple account is deleted on iPhone, Apple's sheet shows once more and the app asks Firebase to revoke the Apple token | `app/src/auth/signIn.ts` |
| Phone | After either deletion: pocket mode stops, question clocks and refused answers are forgotten, and the app goes back to Home. Account deletion signs out and starts a fresh anonymous user | `app/src/lib/storage.ts`, `app/src/data/callables.ts` |
| Privacy page | `hosting/privacy.html` with a wider, left-aligned layout; a link from the landing page | `hosting/` |
| Tests | 7 emulator tests for the three functions; 4 rules tests (allow and deny) | `functions/src/privacy.emulator.test.ts`, `rules-tests/privacy.test.ts` |

## Decisions I made, and why

1. **Deletion runs in functions, not in the rules.** A started team cannot delete its answers,
   its position or its alerts (spec §7), and that should stay true: it is what keeps a team
   from wiping a bad answer mid-walk. A callable can delete everything at once, also in walks
   the phone no longer lists. So no rule changed; the new rules tests pin down that a client
   still cannot do this work itself.

2. **How *Delete my data* finds a player's teams.** A team's id is the player's uid, but
   Firestore cannot query a collection group by document id alone. Teams can only be made while
   a walk is ready or open, and `daily` removes them 30 days after the end, so the callable
   checks every walk that is ready or open, every walk that ended in the last 60 days (twice the
   retention, in case `daily` missed some days), and the walks on the player's `playing` list.
   These are three single-field queries, so no new index is needed, and at the spec's ~50 walks
   a month it is a few hundred reads per deletion.

3. **A team leaving an open walk this way counts as leaving.** The team document goes, so the
   standings, which are worked out from the teams that exist (spec §4), update on every phone.
   If it was the last team still walking in a day walk, the creator gets "Everyone has
   finished", as when a team taps *Leave*.

4. ***Delete my data* only for players; *Delete account and all data* for creators.** A creator's
   account deletion already removes their teams in other walks. Two red buttons for a creator
   would be one too many in v1.

5. **The anonymous account stays after *Delete my data*.** Once its teams, reports and lists are
   gone, the random uid on its own says nothing about anyone, and keeping it means the phone can
   join the next walk at once. The push token goes with it.

6. **Account deletion includes walks that are open.** The confirm says so. Ending them first
   would send "Final results" pushes about a walk that is about to vanish. Players of that walk
   lose it, which is what the creator asked for.

7. **The Auth user is deleted last.** Every step can run again, so if anything fails part-way
   the creator taps again and it finishes; deleting the sign-in first would leave data nobody
   could reach.

8. **Revoking Sign in with Apple.** Apple asks apps that offer Sign in with Apple to revoke the
   user's tokens when the account is deleted. React Native Firebase has `revokeToken`, which
   needs a fresh authorization code, so Apple's sheet shows once more. Closing it cancels the
   deletion. If the revoke itself fails (for example because Firebase's Apple provider has no
   private key yet), the deletion still goes ahead and the failure is logged: deleting someone's
   data must never depend on Apple.

9. **`daily` releases a join code only while it still points at the walk**, then removes
   `joinCode` from the walk. Without that, a code freed and later given to a new walk could be
   deleted again by the old walk's purge or by `deleteWalk`. The walk, its stops and its
   questions stay with the creator (spec §13); its results show no teams after the purge.
   `updatedAt` is left alone, so an old walk does not jump to the top of Home.

10. **`daily` is idempotent and batched.** The walk is marked `participantDataDeletedAt` last, so
    a run that stops part-way is finished by the next one; marked walks are skipped. Walks are
    read 100 at a time and every multi-document delete goes through a BulkWriter. It reads every
    walk that ended more than 30 days ago once a day (a few hundred reads a day at the spec's
    volume). If that ever grows, a composite index on `participantDataDeletedAt` would let the
    query skip finished walks.

11. **`daily` also trims `playing` lists.** The spec has the app trim them, but a phone that never
    opens QuizWalk again would keep walk ids forever. One `array-contains` query per walk does it
    on the server.

12. **Question reports and rate-limit counters count as personal data.** Reports carry the
    reporter's uid, so both deletions remove them; the counts they left on a bank question have no
    personal data and stay, as spec §8 says. `rateLimits/{uid}` (M4) goes with the account.

13. **Never-opened walks.** A team in the lobby of a walk that never opens has no `endedAt`, so
    the 30-day rule does not reach it. It goes when the creator deletes the walk or the player
    deletes their data. The privacy page says so. Not worth more code in v1.

14. **The privacy page's contact is `privacy@qualk.dk`.** Neither qualk.dk nor nulkommafire.com
    shows any contact details today, and I did not want to publish your personal address without
    asking. qualk.dk has mail at simply.com, so the address only needs creating (below). The page
    names NulKommaFire, Denmark, as responsible, and Datatilsynet for complaints.

15. **What the page says about outside services is taken from the code**, M4 included: ORS
    (HeiGIT) gets the route's points and stop coordinates; Overpass and Wikipedia/Wikidata get
    coordinates along the route; Gemini gets categories, difficulty and place information; Expo
    Push gets tokens and the notification text; Apple and Google provide sign-in, App Check and
    map images. All server calls come from functions, never the phone.

## App Check on Firestore (plan M5 row 2)

**Decision: stay in monitor mode for now, on both platforms.** Enforcement is switched on per
Firebase service (Cloud Firestore, Cloud Functions) for every app in the project at once; there
is no "iOS only" switch. Android has no Play Integrity until the Play Console app exists, and the
preview builds of both platforms use the debug provider (`EXPO_PUBLIC_APP_CHECK_PROVIDER=debug`),
so enforcing now would lock testers out. The callables are not enforced either
(`ENFORCE_APP_CHECK=false` since 26 Nov), and they should go first. I did not change anything in
the console.

The app already sends App Check tokens to Firestore (`app/src/data/firebase.ts`), so the console
is collecting the metrics enforcement needs.

**Steps to turn it on, once the Play Console app exists:**

1. **Play Integrity.** Play Console → the app → **Test and release → App integrity** → **Play
   Integrity API** → **Link a Cloud project** → `qualk-a173e`. On the same page, under **App
   signing**, copy the **SHA-256** of the app-signing key. Then Firebase console → **App Check →
   Apps** → the Android app `com.lmunck.qualk` → **Play Integrity** → paste the SHA-256 →
   **Save**. (The same SHA-256 also goes into `hosting/.well-known/assetlinks.json`, and its
   SHA-1 into the Android app's fingerprints, spec §18.)
2. **App Attest** for iOS is registered already (26 Nov). Check that **App Check → Apps** shows
   the iOS app as registered with App Attest.
3. **Builds without the debug provider.** Store builds (`production` profile) leave
   `EXPO_PUBLIC_APP_CHECK_PROVIDER` unset, so they use App Attest and Play Integrity. Get these to
   testers through TestFlight and the Play closed test.
4. **Callables first.** Set `ENFORCE_APP_CHECK=true` in `functions/.env`, then
   `npx firebase deploy --only functions --project qualk-a173e`. Check that publishing, opening
   and generating a walk still work on both phones.
5. **Watch Firestore for about a week.** Firebase console → **App Check → APIs → Cloud
   Firestore** shows verified and unverified requests. Wait until nearly all requests from current
   builds are verified. Unverified ones from old debug builds are fine to lose.
6. **Enforce.** On the same page → **Enforce** → confirm. It takes up to 15 minutes. Then join and
   play a walk on each phone. If something breaks, **Unenforce** on the same page undoes it.
7. **Tidy debug tokens.** App Check → each app → **Manage debug tokens**: delete any token that
   was put into a build given to testers (it can be read out of the build). Keep only the ones
   for your own simulator or emulator.

## How it was checked

- **Automated, after merging `origin/m2-m5` (with M4):** typecheck, lint and Prettier on every
  workspace; 161 `shared` and 48 function unit tests; 54 rules tests (50 + 4 new); 53 function
  tests against the emulator (46 + 7 new). All green. `npm run validate:hosting` passes.
- **Emulator tests cover:** *Delete my data* across open, ready, recently ended and long-ended
  (listed) walks, leaving other teams untouched; the "Everyone has finished" check when the last
  walking team goes; a creator keeping their name; running twice. Account deletion of draft,
  ready and open walks with join codes, generation jobs, rate limits and other users' `playing`
  lists, with the Auth user deleted last; a retry after a failure. The purge at 31 days but not
  29, codes released, stops kept, `updatedAt` untouched, a second run doing nothing, paging, and
  a code now held by another walk left alone.
- **Privacy page:** checked in a browser at desktop and phone width (no sideways scrolling).
  Live at `https://qualk.dk/privacy` (it answered with a cached "not found" for a few minutes
  after the deploy, then 200).
- **Not checked:** the S1 flows in the app on a simulator or phone (no build was run tonight),
  and the Apple revoke, which needs a real Apple sign-in on an iPhone.

## Deployed

- Functions `deleteMyData`, `deleteAccount` and `daily` to `qualk-a173e` (europe-west1), created
  2026-11-28. Nothing else was deployed from this branch.
- Hosting: `privacy.html`, the landing-page link and the stylesheet.
- Rules: not deployed from here, and none changed. The merged `m2-m5` rules go out with the
  integration deploy.

## What changed in the docs

- Spec: status line; §3 S1; §6 (`participantDataDeletedAt`); §7 (App Check decision, deletion is
  server-only); §8 (`deleteAccount`, new `deleteMyData`, `daily`); §12; §13 (more rows, outside
  services, never-opened walks); §18 (new M5 tasks).
- Implementation plan: "Where things stand" and M5 rows 1 and 2.

## What you need to do

1. **Make `privacy@qualk.dk` reach you.** The privacy page gives it as the contact. At
   [simply.com](https://www.simply.com) → **Control panel** → `qualk.dk` → **Email** → create
   `privacy@qualk.dk` as a forward to the address you read. If you would rather use another
   address, tell me and I change one line and redeploy.

2. **nulkommafire.com.** Edit the shared privacy page (the "Privacy & Cookies Policy" linked from
   the cookie banner; `/privacy-policy/` is not its address) so the Qualk line links to
   `https://qualk.dk/privacy`.

3. **App Store Connect** ([appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps**
   → the `com.lmunck.Qualk` app):
   - **App Privacy** → **Privacy Policy URL** → `https://qualk.dk/privacy` → **Save**.
   - **App Store** tab → the version being prepared → **Support URL** → `https://qualk.dk/privacy`
     (it has the contact address) and **Marketing URL** → `https://qualk.dk` → **Save**.
   - Later, in Google Play Console → **Policy and programs → App content → Privacy policy**, the
     same URL.

4. **Let Firebase revoke Sign in with Apple.** Firebase console → **Authentication → Sign-in
   method → Apple**. If the **OAuth code flow configuration** (Services ID, Apple team ID
   `3JMZLMZVTS`, Key ID and private key) is empty, fill it in: in the
   [Apple Developer portal](https://developer.apple.com/account/resources/authkeys/list) →
   **Keys** → **+** → tick **Sign in with Apple** → **Configure** → primary App ID
   `com.lmunck.Qualk` → **Save** → **Continue** → **Register** → **Download** the `.p8` file
   (only once; it is a secret, keep it out of the repo and chat). Paste its contents and the Key
   ID into Firebase. Until then, account deletion works but the Apple sign-in is not revoked.

5. **Try both deletions on a phone** with the next build (S1 is in the app code, so it needs a
   new dev or preview build): as a player, join a walk on a second phone, start it, then *Delete
   my data* and watch the team leave the first phone's monitor and standings. As a creator, make a
   throwaway account, publish a walk and delete the account.

6. **App Check enforcement**, once the Play Console app exists: the seven steps above.

## Left open

- The S1 flows have not been run on a simulator or phone (step 5).
- Plan M5 rows 3–5 (accessibility pass, store listings and privacy labels, release) are next. The
  privacy page and spec §13 have what the Apple privacy labels and the Play Data safety form need.
- `deleteWalk` (in `core.ts`) leaves the walk's `generationJobs/{walkId}` document behind. It holds
  no personal data beyond the owner's uid and goes with account deletion; worth tidying with M4's
  screens.
