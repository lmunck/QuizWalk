# Seed question bank

Multiple-choice trivia for the shared question bank (spec §8 "Question bank",
[`m4-generation-design.md`](../../docs/m4-generation-design.md) §5). A script imports these files
into `questionBank`. Nothing here is read by the app directly.

**Status:** four of the eleven trivia categories are written and reviewed: History, Geography,
Science, and Nature (mammals only). 2,259 questions in all. Space, Sport, Music, Film & TV,
Food & drink, Art & books, Words & language, and Nature's other five subcategories are not written
yet. _Local_ has no seed questions: they are written per place on a walk's first visit.

## Files

One file per subcategory, at `<category>/<subcategory>.json`:

```json
{
  "category": "history",
  "subcategory": "middle-ages",
  "questions": [
    {
      "id": "history.middle-ages.kids.01",
      "difficulty": "kids",
      "question": "What did Vikings use to cross the sea?",
      "correct": "Longships",
      "wrong": ["Hot-air balloons", "Steamships", "Submarines"],
      "explanation": "Viking longships were long, narrow and light…",
      "writtenBy": "claude-sonnet-5-5",
      "checkedBy": "claude-opus-5-5"
    }
  ]
}
```

- `id` is `<category>.<subcategory>.<difficulty>.<NN>`, numbered from 01 within each difficulty.
- `difficulty` is `kids`, `mixed` or `expert`. A pool is one subcategory at one difficulty.
- `correct` and `wrong` are stored apart; the app shuffles them when a question is picked.
- `writtenBy` and `checkedBy` are the model ids. They map to `model` and `checkModel` in
  `BankQuestionDoc`.

## Categories and subcategories

| Category  | Subcategories                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| history   | ancient-world (The ancient world), middle-ages (Vikings and the Middle Ages), explorers-empires (Explorers and empires), industrial-age (Inventions and the industrial age), twentieth-century (The 20th century), nordic-history (Danish and Nordic history) |
| geography | countries-capitals (Countries and capitals), mountains-rivers (Mountains, rivers and lakes), oceans-islands (Oceans, seas and islands), world-landmarks (World landmarks), europe (Europe), flags-symbols (Flags and symbols)                                 |
| science   | human-body (The human body), chemistry (Chemistry and the elements), physics (Physics and forces), earth-weather (Earth and weather), maths (Maths and numbers), technology (Technology and computers)                                                        |
| nature    | mammals, birds, sea-life, insects (Insects and small creatures), plants (Plants and trees), dinosaurs (Dinosaurs and prehistoric life)                                                                                                                        |
| space     | planets, sun-moon, stars-galaxies, space-missions, astronauts, space-science (How space works)                                                                                                                                                                |
| sport     | football, olympics, racket-sports (Tennis and racket sports), cycling-running, winter-sports, rules-equipment                                                                                                                                                 |
| music     | classical, pop-rock, instruments, film-stage (Film and stage music), music-theory (Notes, terms and theory), world-music (Music around the world)                                                                                                             |
| film-tv   | animation (Animated films), classic-films, childrens-tv, film-making (How films are made), characters (Famous characters), fantasy-scifi (Fantasy and science fiction)                                                                                        |
| food      | fruit-veg, world-dishes, baking-sweets, food-science, food-origins (Where food comes from), drinks                                                                                                                                                            |
| art-books | painting (Painters and paintings), architecture (Sculpture and architecture), childrens-books, classic-novels, myths (Myths and legends), fairy-tales                                                                                                         |
| words     | word-origins, languages (Languages of the world), idioms (Idioms and sayings), writing-systems (Alphabets and writing), place-names (Names of places), synonyms (Opposites and synonyms)                                                                      |

These ids are the ones the files use. If `shared/src/categories.ts` ends up with other ids, one of
the two has to change before the import.

## Rules for every question

- One correct answer that can't be argued with, and three plausible answers that are clearly
  wrong. All four are different.
- The question is at most 150 characters and ends with "?". Each answer is at most 40. The
  explanation is at most 220: one or two sentences that teach something more.
- Only facts that stay true. No "current", "latest", "today" or "so far", no office holders, and
  no records, rankings or counts that can change.
- Text only, so nothing that needs a picture or a sound. A flag is described in words, and the
  description fits only one flag.
- No trick questions, no "Which of these is NOT…" and no "all of the above".
- Nothing offensive, gory or sexual, and nothing politically or religiously divisive. No alcohol
  at kids level.
- For players in Denmark and the rest of Europe, many with English as a second language: simple
  words, British spelling, and no US-only trivia. About one question in ten is Danish or Nordic.
- No song lyrics and no quotes from copyrighted works.
- The question doesn't give the answer away, and the right answer doesn't stand out by its length.
- No repeats: no two questions anywhere in the bank test the same fact, in any wording.

**Difficulty.** _Kids_ suits children of about 7–11. _Mixed_ gives a typical adult a fair
chance, like a good pub-quiz question. _Expert_ is hard but fair for an enthusiast, with no
obscure dates or facts that depend on the source.

## How it was made

Claude Code sessions wrote the bank on 27–28 November 2026, one subcategory at a time, about nine
in parallel.

1. **Writing.** A Sonnet 5.5 agent (`claude-sonnet-5-5`) wrote 40 questions per difficulty and a
   reserve of 6 more per difficulty, following a brief with the rules above and a scope for each
   subcategory that kept it away from its siblings.
2. **Review.** A separate Opus 5.5 agent (`claude-opus-5-5`), with fresh context and told to be
   strict, checked every question and every reserve: facts, a single right answer, difficulty,
   the rules and the limits. It fixed what a small, certain change could fix and dropped the rest,
   then refilled the pool from the checked reserves. It also compared each file with the reviewed
   files of the same category and, from halfway through, with every reviewed file.
3. **Refill.** Europe and World landmarks lost many questions that repeated other files. A second
   Sonnet round wrote new ones, and Opus checked the ones that were kept.
4. **Repeats across files.** A last pass compared every reviewed question with every other one
   and dropped one question of each pair that tested the same fact (18 pairs, such as Eureka in
   both History and Physics).
5. **Check.** `check.mjs` checks the schema, the limits, the counts and repeats across all files.

Questions that fail review are dropped, not rewritten from scratch, so a pool can end up with a
few fewer than 40. The floor is 36.

| Category  | Written (with reserves) | Dropped | Drop rate | Fixed by review | In the bank |
| --------- | ----------------------: | ------: | --------: | --------------: | ----------: |
| History   |                     828 |      54 |      6.5% |             269 |         712 |
| Geography |                     828 |      96 |     11.6% |             225 |         713 |
| Science   |                     828 |      52 |      6.3% |             233 |         714 |
| Nature    |                     138 |       9 |      6.5% |              46 |         120 |
| **Total** |               **2,622** | **211** |  **8.0%** |         **773** |   **2,259** |

"Dropped" counts questions dropped in review and in the pass for repeats across files. Unused
reserves aren't in the bank. Geography's refill round wrote 52 more questions, and 30 of them were
kept. The most common reasons for a drop were a fact that another file already asked, an answer
given away by the question, a doubtful fact, and a question too easy for expert. Most fixes were to
explanations with a wrong detail, wrong answers that could be argued right, and words like "today".

### Counts per pool

| File                         | Kids | Mixed | Expert |
| ---------------------------- | ---: | ----: | -----: |
| history/ancient-world        |   39 |    40 |     40 |
| history/middle-ages          |   39 |    40 |     40 |
| history/explorers-empires    |   40 |    40 |     40 |
| history/industrial-age       |   39 |    38 |     40 |
| history/twentieth-century    |   40 |    40 |     40 |
| history/nordic-history       |   38 |    39 |     40 |
| geography/countries-capitals |   40 |    40 |     40 |
| geography/mountains-rivers   |   39 |    40 |     40 |
| geography/oceans-islands     |   38 |    39 |     39 |
| geography/world-landmarks    |   40 |    40 |     40 |
| geography/europe             |   39 |    40 |     39 |
| geography/flags-symbols      |   40 |    40 |     40 |
| science/human-body           |   40 |    40 |     40 |
| science/chemistry            |   40 |    39 |     40 |
| science/physics              |   40 |    39 |     38 |
| science/earth-weather        |   40 |    39 |     39 |
| science/maths                |   40 |    40 |     40 |
| science/technology           |   40 |    40 |     40 |
| nature/mammals               |   40 |    40 |     40 |

## Checking

```bash
node content/question-bank/check.mjs --warnings
```

It checks every file that exists and lists the missing ones as warnings (`--complete` makes them
errors). Errors: bad fields or ids, a limit broken, a question without "?", repeated answers,
time-bound words, "NOT" questions, a pool under 36 or over 40, a missing `checkedBy`, and repeats:
the same question text anywhere after case, accents and punctuation are removed, or the same
correct answer with mostly the same words. Warnings: possible US spelling, the answer appearing in
the question, a correct answer much longer than the wrong ones, and pools under 40.
`npm run format:check` covers these files too.

## Known limits

- Facts were checked from the reviewing model's own knowledge, without looking them up. The
  in-app reports and the share of teams that answer correctly (spec §8) are the safety net.
- Repeats of the same fact across files were found by comparing answers and words, so a few pairs
  worded very differently may remain.
