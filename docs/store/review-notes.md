# Review notes: App Review and Play review

2026-11-28 · for version 1.0.0

The texts to paste into App Store Connect and the Play Console, and what a reviewer needs to try
the app. Nothing has been submitted. Where a text says `{DEMO CODE}` or `{END DATE}`, fill it in
from §3 first.

Every claim below is taken from the code on `m2-m5` and the spec. Lines marked **[M4]** describe
*Generate for me* and *Report question*, which are not in the app yet (see
[`checklist.md`](checklist.md), step 1). Delete them if the build lacks those screens.

---

## 1. App Store Connect → App Review Information

### Sign-in information

- **Sign-in required:** tick it. Players need no account, but making a walk needs one.
- **User name / password:** the review Google account from checklist step 6. Type them into the
  form yourself; they never go into the repo.
- The notes also tell the reviewer that Sign in with Apple works with any Apple ID, in case
  Google asks the reviewer's device for an extra check.

### Contact information

Your name, phone and email. Apple uses them only if the reviewer is stuck.

### Notes (4,000 max)

```text
QuizWalk is a quiz walk game. A creator makes a walk and shares a five-letter code. Teams walk to each stop, and the stop's question opens when the phone is within the stop's radius (25 to 60 m).

1) TRY IT AS A PLAYER, NO ACCOUNT
Tap Join a walk, enter {DEMO CODE}, then Allow location & join (choose "Allow While Using App"). The demo walk is in Copenhagen, so its stops are far from you: the walk screen shows the distance, map and arrow. "Can't reach it" offers I'm here (only near the stop), Skip this stop and The way is blocked. The walk is open until {END DATE}; after that the same code shows its final results.

2) PLAY A WHOLE WALK WHERE YOU ARE (about 3 minutes)
a. On Home tap New quiz walk (on the very first screen it is Create a walk). Sign in with Apple (any Apple ID) or Continue with Google (account below). Enter a name.
b. Give a title, tap Start building. In the route builder tap Add stop here, tap the new stop's row, write a question and two answers, mark the right one, Save stop.
c. Tap Publish & share, then Open walk, choose Today, Open walk.
d. Back on Home, tap Join with code and enter the code from the share screen. Join, then Start walk. The stop is where you stand, so its question opens within seconds. Indoors, if GPS is weak, use Can't reach it, then I'm here.
e. To end: Home, Live now, your walk, End walk. The results appear for the creator and the team.

LOCATION
Location is used only during a walk, to open each question at its stop. We ask only for "When In Use"; "Always" is never requested. After the player taps Start walk with the app on screen, location updates continue while the phone is locked or in a pocket (location background mode, blue indicator), so the phone can buzz with a local notification at the stop. They stop when the team finishes or leaves, when the walk ends, or when the app is closed. If notifications are refused there is no background use: the screen stays on and the app says "Keep QuizWalk open". The only location uploaded is the team's last known position (one point, overwritten, at most every 30 s), visible only to the walk's creator and deleted 30 days after the walk ends. Nothing is uploaded before Start walk.

SIGN-IN
Players never need an account. Sign-in (Apple or Google) is asked for only when someone creates a walk.

AI-GENERATED QUESTIONS (Generate for me)
Creators pick categories and a difficulty; there is no free-text prompt. Questions come from a question bank written ahead of time by language models (Google Gemini, and Claude for the seed bank). A second, stronger model fact-checks each one and failures are dropped. Local questions are written from Wikipedia text about places on the route and marked "Check this answer" for the creator. The creator sees and can edit or swap every question before publishing.

REPORTING AND MODERATION (guideline 1.2)
After answering, players can tap Report question (wrong answer, offensive, confusing). One "offensive" report hides a bank question from new walks at once, until we have reviewed it; repeated "wrong" or "confusing" reports flag it; a blocked question is never used again. Questions written by creators can be reported the same way. We are notified of every report and review it; we can block the question, remove the walk with everything in it, or disable the creator's account. Walks are private: there is no public list or search, and only people given the code see a walk. Players can leave a walk at any time. Contact: privacy@qualk.dk.

ACCOUNT DELETION
Settings, Delete account and all data (creators; on iPhone, Apple is asked to revoke the Sign in with Apple token) or Delete my data (players). Both take effect at once.

No ads, no analytics, no tracking.
```

The two **[M4]** paragraphs are "AI-GENERATED QUESTIONS" and the first two sentences of
"REPORTING AND MODERATION". Without the M4 screens, replace that whole section with: "Walks are
private: there is no public list or search, and only people given the code see a walk. Players
can leave a walk at any time. Contact: privacy@qualk.dk." and say in the checklist's open
point that Report question is still missing (Apple may ask for it under 1.2).

Length: about 3,600 characters with the placeholders filled in. Check the count after filling
them; App Store Connect stops at 4,000.

### Attachment

If you made the iPhone version of the pocket-mode recording (see
[`google-play.md`](google-play.md) §5, the same steps with Control Centre → Screen Recording),
add its unlisted YouTube link as the last line of the notes: "Video of a walk with the phone in
a pocket: {link}". It shows the reviewer the background use they cannot walk themselves.

## 2. Google Play Console

Play has no general notes field. The review texts go into two App content cards.

### 2.1 App access → "All or some functionality is restricted"

Add one set of instructions:

| Field | Value |
|---|---|
| Name | Creating walks |
| User name, password | The review Google account (checklist step 6) |
| Any other information | The text below |

```text
Players need no account: tap Join a walk, enter {DEMO CODE} (open until {END DATE}, then it shows results). Its stops are in Copenhagen; use Can't reach it to skip. To play where you are: Create a walk, Continue with Google (account above), title, Start building, Add stop here, tap the stop, write a question, Save stop, Publish & share, Open walk, Today. Then Join with code, Join, Start walk: the question opens at once. Report question is on the answer screen.
```

The last sentence is **[M4]**. Kept under 500 characters in case the field is limited.

### 2.2 Foreground service permissions → Location

Use case: **Background location updates: Navigation**. See
[`google-play.md`](google-play.md) §5 for the video.

**Description:**

```text
QuizWalk is a quiz walk. After a player taps Start walk, with the app on screen, a location foreground service guides the team to the next stop while the screen is off or another app is open, and posts a notification when they arrive so the stop's question can open. A notification, "Guiding you to stop 4", shows while it runs. It uses the "While using the app" permission only and stops when the team finishes, leaves the walk, or the walk ends, or when the app is swiped away. If the player refuses notifications, the service is not started and the walk is played with the screen on.
```

**Impact if the task is deferred or interrupted:**

```text
The player is not told when they reach the stop, so they walk past it or stand there waiting. No data is lost: the question opens as soon as they open QuizWalk at the stop, and the walk carries on from where it was.
```

## 3. The demo walk code

A reviewer needs a code that opens a walk. **None has been made in production.** Make one the day
you submit, so it is still open while the reviewers look.

**Which kind.** Open it with *This week*: it stays open for 7 days, then ends by itself, and its
code goes on showing the final results for another 30 days, so a late reviewer never hits a dead
code. A *Today* walk would end after 12 hours. A walk left *Ready* never ends but cannot be
started.

### Option A, in the app (recommended)

It needs nothing but your phone, and you can delete the walk afterwards from Home.

1. On your iPhone or Android phone, with the production or preview build signed in as yourself:
   Home → **New quiz walk** → title **QuizWalk demo walk** → **Start building**.
2. Add 3 stops around somewhere you know (long-press the map), each with a question you are sure
   of, two to four answers, and an explanation. Keep them family-friendly; the reviewer reads
   them only if they use Preview or play your walk, but they represent the app.
3. **Publish & share**. Note the code shown.
4. **Open walk…** → **This week** → **Open walk**. The dialog says the end date ("Ends by itself
   on Sun 6 Dec"); that is `{END DATE}`.
5. Put the code and the date into the texts in §1 and §2.1.
6. After both reviews: Home → the walk → **End walk…**, then Home → ⋯ → **Delete** (only offered
   once it is not open).

### Option B, with the seed script

Only if you want a walk without using the app. It writes to the real project, so it needs Google
Cloud credentials on the Mac, and the walk belongs to a pretend creator called "Anders" that no one
can sign in as.

```bash
gcloud auth application-default login
node scripts/seed-walk.mjs --project qualk-a173e --status open --open-for week --title "QuizWalk demo walk"
```

It prints the code. Its 5 stops are around Nyhavn, called "Stop 1" to "Stop 5", with the
script's first five test questions (the houses' colours, the harbour's age, the quays, H.C.
Andersen, the Memorial Anchor). Do not ask for more than 5 stops: the sixth to eighth test
questions are placeholders. The walk ends by itself after 7 days. To remove it
afterwards, end it with `node scripts/seed-walk.mjs --project qualk-a173e --code {CODE} --status
ended` and delete `walks/{id}` (with its subcollections), `joinCodes/{CODE}` and
`users/seed-owner` in the Firebase console → Firestore.

## 4. What the reviewer will and will not be able to try

| Feature | Reviewer can try | How |
|---|---|---|
| Join without an account | Yes | The demo code |
| Location permission, walk screen, map, distance, arrow | Yes | The demo code |
| Skip, way blocked | Yes | The demo code, "Can't reach it" |
| Arriving, the question, bonus clock, feedback | Yes | Their own walk at their location (§1, path 2) |
| Making, publishing, opening, ending a walk | Yes | Path 2 |
| Live monitor, results, share card | Yes | Path 2 |
| Pocket mode (buzz with the phone in a pocket) | Only by walking | The video |
| *Generate for me* **[M4]** | Yes, if the build has it | Path 2, *Generate for me* instead of building by hand |
| Week-long walk | Only the open state | The demo walk |

## 5. Reports: how you hear of them and what you can do

This is what the "REPORTING AND MODERATION" paragraph promises, and all of it exists. *Report
question* writes one `questionReports` document per person and question (spec §7).
`onQuestionReported` then:

- **Bank question** (it came from *Generate for me*, *Swap* or *Suggest a question*): updates its
  counts at once. One *offensive* report hides it from new walks; 3 *wrong answer* or 5
  *confusing* reports flag it (spec §8). Logged as `Report on a bank question`.
- **Creator-written question:** changes nothing by itself and waits for you. Logged as `Report on
  a creator-written question`.

**See the open reports** (Mac, signed in with `npx firebase login`):

```bash
npx tsx scripts/review-bank.ts list-reports --project qualk-a173e          # open ones
npx tsx scripts/review-bank.ts list-reports --all --project qualk-a173e    # closed ones too
```

It groups the reports by question, with each reason's count and the latest date. A bank question
shows its text, answers, status and counts; a creator-written one shows the walk's title, creator,
status and code, the stop, the question and its answers. Reporters are never shown.

**Act on them:**

| What | Command or place |
|---|---|
| Bank question is fine / is bad | `review-bank.ts keep <id>` / `block <id> --note "why"`. Both close its reports |
| Creator-written question is fine | `review-bank.ts close-reports stop:<walkId>/<stopId> --note "why"` |
| Remove a walk | `review-bank.ts remove-walk <walkId>`: the walk, its stops, teams, answers, positions, alerts, join code and generation job, also while open. Closes its reports |
| Stop a creator signing in | Firebase console → **Authentication** → the user (the owner id `list-reports` prints) → ⋮ → **Disable account**. Their walks stay until you remove them |

Closing a report only sets `reviewedAt` (and `reviewNote`) on it; the report itself goes with the
reporter's *Delete my data* or account deletion, as spec §13 says.

### Get an email when a report arrives

Nothing emails you by itself. Set this up once, before you submit (about 5 minutes). It is a
Cloud Logging log-based alert; Google's Cloud Monitoring pricing applies, which at a few reports a
month is pennies or nothing.

1. Open <https://console.cloud.google.com/logs/query?project=qualk-a173e> (the Google account
   that owns the Firebase project).
2. Paste this into the query box and press **Run query**:

   ```text
   jsonPayload.message=~"^Report on a (creator-written|bank) question"
   ```

   No results is normal until someone reports. To see it work, report a question in a test walk
   first; the entry shows within a minute.
3. **Actions** (above the results) → **Create log alert**.
4. **Alert details:** name "QuizWalk question report". In *Documentation* you can write: "Run
   `npx tsx scripts/review-bank.ts list-reports --project qualk-a173e`".
5. **Choose logs to include:** the query from step 2 is already there. **Next**.
6. **Set notification frequency:** *Time between notifications* 5 minutes (the shortest);
   *Incident autoclose duration* 1 day. **Next**.
7. **Who should be notified:** *Notification channels* → **Manage notification channels** → *Email*
   → **Add new** → your address (`privacy@qualk.dk` once its forward works) → **Save**. Back in the
   alert, refresh the list, tick the new channel, **OK**.
8. **Save**. The email says "QuizWalk question report" and links to the log entry, which names the
   walk and stop (or the bank question) and the reason.

If you would rather not have an alert, run `list-reports` once a week; the reports wait in
Firestore either way.
