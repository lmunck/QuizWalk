# M4 design: generated routes and the question bank

Status: **Agreed** · 2026-11-27 · folded into [`v1-spec.md`](v1-spec.md) the same day

This document covers how *Generate for me* makes a walk. The route comes from what the creator sees on the map, and the questions come from a shared bank, so generating a walk rarely spends tokens. It replaces the generation pipeline in spec §8 and changes C2, C3, C4, C5 and P4 (spec §3). The *what* is now in the spec, and this document keeps the *how* and the reasons. Where they disagree, the spec wins and this document should be fixed. §9 lists what changed in the spec, and §10 records the decisions.

## 1. The idea

The spec's pipeline starts from places. It finds places that have a Wikipedia link, has an LLM pick some, routes through them and writes every question fresh. This design starts from the route instead.

- **The route** is geometry plus OpenRouteService (ORS), with no LLM.
- **Most questions** come from a bank that is built ahead of time and shared by every walk. A trivia question doesn't depend on where its stop is.

So the route and the quiz no longer depend on each other. A creator can get a new route without losing the questions, and can swap a question without changing the route.

## 2. The route screen

C2's *Generate for me* becomes a map screen.

- **The map** fills the screen above a sheet. Zooming sets the size of the walk and rotating the map sets its direction. The route goes "up" the screen from the start.
- **The Start pin** is fixed at the bottom centre of the visible map, and the map moves under it, like C5's *Move pin* crosshair. It opens on the creator's location, and panning picks another start.
- **The sheet** holds the quiz choices (§4): Auto or categories, difficulty, and the number of questions (4–12). The number of questions follows the view's length by default, about one per 350 m, until the creator changes it. The sheet's actions are **Refresh** and **Next**.
- **Refresh** makes a walking route with stops that fits the visible map. Nothing is drawn before the first Refresh, and moving the map changes nothing until the next one.
- After a Refresh, the sheet shows the walk's length and time, worked out as in spec §4: 4.5 km/h plus 2 minutes per stop.
- **There is no distance limit.** A 40 km walk is the creator's choice.
- **Tilt is off** on this screen. A tilted map shows more ground at the top than at the bottom, which would distort the shape.
- **Zoom and turn buttons and a compass button** sit beside the map, so the view can be set without pinching and twisting (spec §14). The compass button turns the map back to north-up.
- **Generated walks are loops.** There is no shape choice. Hand-built walks can still end anywhere.

## 3. How Refresh makes a route

1. **Corners.** The phone takes the usable map area, meaning the screen minus the sheet, the header and the safe areas, and shrinks it by about 15–20%. The four corners are the midpoints of its edges: the start at the bottom, one corner at each side and one at the top. On a phone this gives a diamond that is taller than it is wide, which fills the view. react-native-maps' `coordinateForPoint` turns the screen points into coordinates and takes care of rotation on both Apple and Google maps. The creator never sees these points.
2. **Route.** A callable sends the four points to ORS `foot-walking` as one loop: start → side → top → other side → start. ORS moves each point to the nearest walkable path. If a point is too far from any path (open water, or a park with no paths), the function moves it towards the start and tries again. The ORS key stays in Cloud Functions, as the spec already requires.
3. **Fit.** Walking routes bulge outside the straight lines between corners, which is why the area is shrunk first. If the route still goes outside the view, the function shrinks the shape and routes once more before it answers.
4. **Stops** are spaced evenly along the routed line, so every stop can be reached on foot. Stop *i* of N sits at length × *i* / N, which puts the last stop back at the start. Groups end where they met, and the distance in spec §4 (start → last stop) is the whole loop.
5. **A second Refresh on the same view** gives a different route by moving the three far corners a little. If the view has changed, Refresh makes a route for the new view.

### When Refresh is disabled

Stops have to be far enough apart that their unlock circles (up to 60 m) don't overlap, and that GPS jitter can't unlock the next stop early. The minimum is about 150 m between stops:

> loop length ≥ number of questions × 150 m

So 8 questions need about 1.2 km and 12 need 1.8 km.

- **The phone checks before any network call.** Each time the map stops moving, it works out the straight-line distance around the four corners. A walking route between the same points is almost always longer, so if the straight-line loop is long enough, the route will be too. Below the minimum, Refresh is disabled and says why: "Zoom out, or choose fewer questions." Changing either one runs the check again.
- **The server checks the real route.** Now and then two corners get moved to the same path, for example both land in a lake and are moved to the same shore path, and the route comes back shorter than the estimate. Then the previous route stays and the message says "Couldn't fit 8 stops here. Zoom out a little."

### Cost and limits

A Refresh costs one or two ORS calls and no tokens. ORS's free plan allows 2,000 routes a day, and a limit of about 30 Refreshes per creator per hour stops one creator from using it all up.

## 4. Choosing questions

### Two kinds

- **Trivia** (History, Science, Animals…) doesn't depend on the place, so one bank serves every walk. It works just as well in a forest or a village as in a city centre.
- **Place questions** are about the stop itself and are written from its Wikipedia text. They only help at that place, so they are stored under the place's Wikidata ID and reused by the next walk that passes it.

### What the creator picks

The creator picks **Auto**, or one or more categories from a fixed list. *Local* (place questions) is one of the categories.

- **Auto** mixes categories that suit the difficulty. Wherever a stop is next to a well-documented place, it uses a place question there. A city-centre walk might get 3 local and 5 trivia questions, and a walk in a forest gets all trivia. No walk fails because there aren't enough places.
- There is **no free-text topic**. A fixed list is what lets every request be answered from the bank.
- Each category has **subcategories** that the creator never sees. A walk's questions are spread across them, so choosing History doesn't give eight questions about Vikings.
- The list is typed code in `shared/`, so the app's picker and the functions read the same list. The first list is: History, Geography, Science, Nature & animals, Space, Sport, Music, Film & TV, Food & drink, Art & books, Words & language, Local.

### When it happens

Refresh only makes the route. Everything else waits for **Next**, so Refreshing never spends tokens. On Next, the app creates the draft walk with the chosen route and calls `generateWalk`, which:

1. runs one Overpass query along the route and moves each stop to a named feature within about 50 m of the path, where there is one (a fountain, church, statue or playground). That gives "Stop 3 · The fountain" rather than "Stop 3 · Vesterbrogade". A stop with no feature nearby takes its street name;
2. picks trivia questions from the bank (§5);
3. for Local, finds each stop's nearest Wikidata place and uses its stored questions, or writes them if it's the place's first walk (§5);
4. titles the walk "{Category} walk from {start}", or "Quiz walk from {start}" for Auto or several categories, for example "History walk from Kongens Nytorv". The creator can change it in C4;
5. writes the stops.

For trivia this takes a few seconds. Only a place that no walk has used before adds LLM time.

Trivia doesn't depend on the route, so a creator who goes back to the map and refreshes keeps the trivia questions. Only Local questions are picked again.

## 5. The question bank

### Why have one

At the spec's expected ~50 walks a month, writing every walk's questions fresh would cost a few dollars a month, so saving tokens isn't the main reason. A bank is better because:

- questions are checked before any player sees them;
- generating a walk is nearly instant;
- a blocked question is gone from every future walk;
- nobody can run up a token bill by calling `generateWalk` in a loop.

### Filling it

- **A script fills it ahead of time** (in `scripts/`) for every category, subcategory and difficulty, in English only (spec §1). For example, 12 categories × 6 subcategories × 3 difficulties × 40 questions is about 8,600 questions. That is roughly a million output tokens plus the fact-check pass, paid once. Check current model prices before running it.
- **A second model fact-checks every question**, as the spec already plans. A question that fails is dropped, not rewritten, because the bank only needs enough questions that pass. The `unverified` warning in C4 then only applies to place questions, so it becomes rare.
- **Each LLM call writes 20–25 questions.** Longer lists drift and repeat themselves.
- **It is topped up in the background.** When a creator has fewer than about twice a walk's worth of unused questions left for one subcategory and difficulty, a background function adds 20–25 more. Each pool gets at most one top-up at a time. The prompt includes the pool's existing correct answers, so the new questions don't repeat them.
- **Only questions that stay true.** The prompt rules out "current" facts, such as who holds an office or a record. Each question stores which model wrote it and when, so an old batch can be re-checked or retired.
- **About 5 questions per place**, written on its first walk. One Wikipedia article supports a handful of good facts, not 50. The place is recorded even when nothing good came out of it, so it isn't tried again on every walk.

### Picking questions

- **Fresh for each creator.** A question the creator used in an earlier walk is left out. The `bankQuestionId` on their earlier stops records which ones they've used.
- **Random within the pool**, using a random number stored on each question and a range query.
- **The right answer and the wrong ones are stored separately and shuffled when picked.** That adds variety for free, and it removes the LLM's habit of putting the right answer in the same slot.
- **Swapping is free.** C5's *New question* and G2's *Suggest a question* become *Swap*, which takes another question from the bank without an LLM call. Fresh writing is left for place questions only.

## 6. Reports and blocking

This is needed either way.

- Google Play's policy on AI-generated content requires a way to report offensive output inside the app.
- Questions that creators write themselves and show to players count as user-generated content under Apple's guideline 1.2. That guideline also expects a way to block abusive users, which belongs in M5.

One **Report question** link on P4's answer feedback covers both. The player chooses a reason: wrong answer, offensive, or confusing. Each person can report a question once.

Two more signals need no extra UI:

- **A creator replacing or deleting a bank question** in C4 or C5 counts as a vote against it.
- **The share of teams that answer correctly.** `onAnswerCreated` already scores every answer, and it also adds to the bank question's counts. When only 5% of teams get a question right, the wrong answer is usually marked as correct. These counts are totals with no personal data, so they are kept after answers are deleted at 30 days.

What happens next:

- One *offensive* report hides the question until it has been reviewed.
- A few *wrong answer* reports, or an unusual share of correct answers, flags it for review.
- A blocked question is never picked again, and the background top-up refills its pool.
- In v1, review is a script or the Firestore console, with no admin screen.
- Reports about questions that creators wrote themselves go to the same review.

Walks keep **copying** question text into their stops, as they do now, and also store the `bankQuestionId`. Offline play and creator edits keep working, and blocking a question never changes a walk that a team is halfway through.

## 7. Data model additions

```
questionBank/{questionId}            // read and written by functions only
  kind: 'trivia' | 'place'
  category, subcategory, difficulty: 'kids' | 'mixed' | 'expert'
  placeKey?                          // 'wikidata:Q12345', place questions only
  question, correct, wrong: string[3], explanation, source?: { title, url }
  status: 'active' | 'flagged' | 'blocked'
  stats: { used, answered, correct, reports, replaced }
  model, createdAt, rand             // rand: random picks with a range query

places/{placeKey}                    // functions only
  name, location: GeoPoint, generatedAt, questionCount

questionReports/{reportId}           // id built from the question and the uid: one per person
  uid, reason: 'wrong' | 'offensive' | 'confusing', createdAt
  questionId?                        // a bank question
  walkId?, stopId?                   // a question the creator wrote
  // created by that uid; no client reads, updates or deletes

walks/{walkId}
  - topic?                           // removed: no free text
  + categories?: string[]            // missing or empty = Auto

walks/{walkId}/stops/{stopId}
  + bankQuestionId?                  // origin stays 'ai'
```

## 8. Functions

| Function | Type | Purpose |
|---|---|---|
| `routeForView` | callable | Refresh: four points → ORS loop fitted to the view, with stop positions and the spacing check. Writes nothing. About 30 per creator per hour. |
| `generateWalk` | callable | Next: names the stops, picks questions, writes place questions for places no walk has used before, writes the stops. The spec's limit of 20 per creator per day stays. |
| `swapQuestion` | callable | *Swap* in C5 and *Suggest a question* in G2: another bank question for one stop. Replaces `suggestQuestion`. |
| `onQuestionReported` | Firestore trigger | Updates the question's counts and status (§6). |
| `topUpQuestions` | background | Adds 20–25 questions to one pool (§5). |
| `reroute` | callable | Unchanged: runs after edits in C4. |

There is also a script, run by hand, that fills the bank.

## 9. What changed in the spec

- **§1 Content:** the LLM fills a checked bank instead of writing each walk. Wikipedia is used for Local questions only.
- **§3 C2:** *Generate for me* becomes the map screen (§2). The topic, walk length, start and shape fields go.
- **§3 C3:** shrinks to a short wait. The four steps and the "only found N places" state go, because stops no longer depend on places.
- **§3 C4:** *New route* opens the map screen again and keeps the trivia questions.
- **§3 C5 and G2:** *New question* and *Suggest a question* become *Swap*.
- **§3 P4:** gets *Report question* on the answer feedback.
- **§6 and §7:** the collections and rules in §7 of this document.
- **§8:** the functions table and the generation pipeline are replaced by §3–§5 and §8 of this document.
- **§15:** LLM cost becomes mostly the one-off fill plus top-ups.
- **§16:** free-text topics, one-way generated walks and an admin screen for reports are listed as not in v1.
- **§17 and the M4 plan:** the work becomes the routing module and `routeForView`, the map screen, the bank and its script, `generateWalk`, *Swap*, and reporting.
- **§19:** "thin OSM/Wikipedia coverage" and "English questions from Danish sources" now only affect Local questions.

## 10. Decisions

Agreed on 2026-11-27, following the recommendations:

1. **Trivia is the backbone and Local is one category**, instead of the spec's all-local questions.
2. **No free-text topic in v1.** If it's wanted later, one cheap LLM call can sort free text into a category so the bank can still be used.
3. **The bank is filled ahead of time and topped up**, not only filled on demand.
4. **Generated walks are loops.** Hand-built walks can still end anywhere.
5. **Zoom and turn buttons and a compass button sit beside the map** (spec §14).
6. **The default number of questions follows the length**: about one per 350 m, within 4–12, until the creator changes it.
7. **A generated walk's title** is "{Category} walk from {start}", or "Quiz walk from {start}" for Auto or several categories. It can be changed in C4.
8. **The category list** starts as the one in §4.
