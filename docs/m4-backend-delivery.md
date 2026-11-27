# M4 backend delivery notes

2026-11-27/28 · branch `claude/m4-backend-a1e1f1` → `m2-m5`. Design and contracts:
[`m4-generation-design.md`](m4-generation-design.md) §11 (contracts) and §12 (decisions).

## What was built

| Area | What | Where |
|---|---|---|
| Contracts and helpers | Request/response types for every callable, error reasons, rate limits; categories and subcategories (194 pools); the phone-side Refresh helpers (view points, straight-line check, default question count, summary line); polylines, spacing, route key; bank rules (validation, picking plan, shuffling, status, report ids) | `shared/src/callables.ts`, `categories.ts`, `route.ts`, `bank.ts` |
| Routing | One `WalkingRouter` interface; OpenRouteService `foot-walking` at its new address; `routeForView` (four points → loop, unroutable points moved towards the start, shrink-and-retry, stops at length × i / N, N × 150 m check, variants); `reroute` (route, distance, *Off path* / *on water*) | `functions/src/routing/` |
| Generation | `generateWalk` (Overpass naming, Wikipedia GeoSearch when Overpass fails, trivia picks, Local questions written from Wikipedia via Gemini, title, `generationJobs`), `swapQuestion` | `functions/src/generate.ts`, `swap.ts`, `places/` |
| Bank | Gemini writer and checker, prices, top-ups (`topUpQuestions`), reports (`onQuestionReported`), counts in `onAnswerCreated` and `onStopWritten`, rate limits | `functions/src/bank/`, `llm/`, `reports.ts`, `rateLimit.ts` |
| Rules and indexes | `questionBank`, `places`, bookkeeping collections closed to clients; `questionReports` create rule; `generationJobs` readable before it exists; `categories` replaces `topic`; `bankQuestionId` on stops; the bank's pick index | `firestore.rules`, `firestore.indexes.json` |
| Scripts | `fill-bank.ts` (resumable, idempotent, breadth first, rate limited, logs tokens and cost, stops at the cap); `review-bank.ts` (sample, search, flagged, keep, block, stats) | `scripts/` |

## Verification

- `npm run typecheck`, `lint`, `format:check` clean. Tests: shared 154, functions 46 unit (on recorded
  ORS, Overpass, Wikidata, Wikipedia and Gemini answers in `functions/src/fixtures/`), 43 against the
  emulator, rules 50. CI calls no live service.
- Live checks on 2026-11-27: routeForView through the real ORS (one routing call per Refresh, three
  variants gave 3.5, 3.3 and 3.1 km loops; a point in the Øresund was moved and routed); generateWalk on
  the emulator with the real services (walk made in about 25 s when Overpass timed out, which led to the
  25 s Overpass deadline and the Wikipedia fallback).
- Deployed to `qualk-a173e` on 2026-11-27: rules, indexes and all 16 functions. **Not yet deployed:** the
  last changes (Overpass deadline, Wikipedia GeoSearch fallback, no two questions on the same fact in a
  walk, stricter question checks and family rules in the prompt). Deploy with
  `npx firebase deploy --only functions --project qualk-a173e`.

## The bank and its spend

- Filled by `gemini-3.8-flash` (writer) and checked by `gemini-4-argon`, about $0.015 per batch of 25.
  Two runs (the first stopped after one round on a lost Firestore error; the script now retries and
  reports its errors). Fill spend about **$6.5** of the $10 cap (`review-bank.ts stats` has the exact
  figure from `bankMeta/spend`); about 7,800 active questions over 194 pools, close to 40 each.
- The checker dropped roughly 1 in 8 written questions, mostly for real factual slips.
- Spot-read (77 random questions across every category, plus searches of the whole bank): quality is
  high. 42 questions were blocked: drug, sex and adult-show themes; alcohol in Kids and Mixed (kept in
  Expert); 12 with the answer in the question; 3 with broken HTML; 5 inaccurate or ambiguous. Those
  faults are now refused by `writtenQuestionProblem` or ruled out in the prompt.
- Near-duplicates exist across pools (penicillin, the compass). Picking now keeps them out of one walk.

## What's left for the user

1. Deploy the last function changes (command above), after the PR is merged into `m2-m5`.
2. Read the Local questions on a real generated walk against their sources before trusting them.
3. Decide whether to keep the hand-written bank from the question-bank session: it uses different ids
   and needs a mapping onto `shared/src/categories.ts` to be imported.
4. Overpass's public servers were often busy on 2026-11-27. If naming stays unreliable, a paid or
   self-hosted Overpass is the fix (spec §19).
5. The M4 screens (C2 map, C3, Swap, Suggest a question, Report question) are the next session's work.
