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
| Scripts | `import-question-bank.ts` (the Claude-written seed bank: validation, mapping onto the live taxonomy, duplicates skipped, `--dry-run`, a report); `fill-bank.ts` (resumable, idempotent, breadth first, rate limited, logs tokens and cost, stops at the cap); `review-bank.ts` (sample, search, flagged, keep, block, stats, tag/flag/unflag a `seedBatch`) | `scripts/` |

## Verification

- `npm run typecheck`, `lint`, `format:check` clean. Tests: shared 161, functions 48 unit (on recorded
  ORS, Overpass, Wikidata, Wikipedia and Gemini answers in `functions/src/fixtures/`), 46 against the
  emulator (including the importer, on a fixture folder in the files' format), rules 50. CI calls
  no live service.
- Live checks on 2026-11-27: routeForView through the real ORS (one routing call per Refresh, three
  variants gave 3.5, 3.3 and 3.1 km loops; a point in the Øresund was moved and routed); generateWalk on
  the emulator with the real services (walk made in about 25 s when Overpass timed out, which led to the
  25 s Overpass deadline and the Wikipedia fallback).
- Deployed to `qualk-a173e` on 2026-11-27: rules, indexes and all 16 functions. **Not yet deployed:** the
  last changes (Overpass deadline, Wikipedia GeoSearch fallback, no two questions on the same fact in a
  walk, stricter question checks and family rules in the prompt). Deploy with
  `npx firebase deploy --only functions --project qualk-a173e`.

## The bank and its spend

- **The Gemini fill ran in volume before the user's "no Gemini at volume" instruction reached this
  session.** Written by `gemini-3.8-flash` and checked by `gemini-4-argon`, about $0.015 per batch of 25,
  in two runs (the first stopped after one round on a lost Firestore error; the script now retries and
  reports its errors). **Spend: $6.99** over 990 calls (1.10 M input, 1.01 M output tokens), under the
  $10 cap. **8,305 questions**, all tagged `seedBatch: 'gemini-2026-11-27'`; 8,263 active, about 40 in
  each of the 194 pools of that night's taxonomy.
- They stay active. To retire them in one step: `npx tsx scripts/review-bank.ts flag-batch
  gemini-2026-11-27 --project qualk-a173e` (and `unflag-batch` to undo; questions flagged by reports are
  left alone).
- The seed bank going forward is the Claude-written files, loaded with `scripts/import-question-bank.ts`
  (tested on the emulator, not run against production). Its mapping and the four subcategories added for
  it are in `functions/src/bank/importBank.ts` and `shared/src/categories.ts`.
- Small live Gemini test of the in-app path: *Local* questions for 2 Copenhagen places (Kongens Nytorv,
  Charlottenborg Palace), 10 questions kept after the check, 4 calls, 15 s, **$0.015**. They read well
  and are taken from the articles; one ("Which embassy is housed inside Thott Palace?") is a fact that
  can change, which is why *Local* stops carry `unverified`.
- The checker dropped roughly 1 in 8 written questions, mostly for real factual slips.
- Spot-read (77 random questions across every category, plus searches of the whole bank): quality is
  high. 42 questions were blocked: drug, sex and adult-show themes; alcohol in Kids and Mixed (kept in
  Expert); 12 with the answer in the question; 3 with broken HTML; 5 inaccurate or ambiguous. Those
  faults are now refused by `writtenQuestionProblem` or ruled out in the prompt.
- Near-duplicates exist across pools (penicillin, the compass). Picking now keeps them out of one walk.

## What's left for the user

1. Deploy the last function changes (command above), after the PR is merged into `m2-m5`.
1. Import the seed bank once its branch is merged: `npx tsx scripts/import-question-bank.ts --project qualk-a173e --dry-run`, then without `--dry-run`.
2. Read the Local questions on a real generated walk against their sources before trusting them.
3. Decide whether to keep the Gemini batch active alongside the seed bank, or retire it with `flag-batch`.
4. Overpass's public servers were often busy on 2026-11-27. If naming stays unreliable, a paid or
   self-hosted Overpass is the fix (spec §19).
5. The M4 screens (C2 map, C3, Swap, Suggest a question, Report question) are the next session's work.
