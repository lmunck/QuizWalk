#!/usr/bin/env node
// Checks the seed question bank: schema, limits, counts and duplicates.
//
//   node content/question-bank/check.mjs              every file; all 66 must exist
//   node content/question-bank/check.mjs a.json b.json   only these files
//   --draft      don't require checkedBy (for files that haven't been reviewed yet)
//   --warnings   also print warnings (spelling, answer in question, uneven answers)
//
// Exits with 1 when there are errors.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

export const TAXONOMY = {
  history: [
    'ancient-world',
    'middle-ages',
    'explorers-empires',
    'industrial-age',
    'twentieth-century',
    'nordic-history',
  ],
  geography: [
    'countries-capitals',
    'mountains-rivers',
    'oceans-islands',
    'world-landmarks',
    'europe',
    'flags-symbols',
  ],
  science: ['human-body', 'chemistry', 'physics', 'earth-weather', 'maths', 'technology'],
  nature: ['mammals', 'birds', 'sea-life', 'insects', 'plants', 'dinosaurs'],
  space: ['planets', 'sun-moon', 'stars-galaxies', 'space-missions', 'astronauts', 'space-science'],
  sport: [
    'football',
    'olympics',
    'racket-sports',
    'cycling-running',
    'winter-sports',
    'rules-equipment',
  ],
  music: ['classical', 'pop-rock', 'instruments', 'film-stage', 'music-theory', 'world-music'],
  'film-tv': [
    'animation',
    'classic-films',
    'childrens-tv',
    'film-making',
    'characters',
    'fantasy-scifi',
  ],
  food: ['fruit-veg', 'world-dishes', 'baking-sweets', 'food-science', 'food-origins', 'drinks'],
  'art-books': [
    'painting',
    'architecture',
    'childrens-books',
    'classic-novels',
    'myths',
    'fairy-tales',
  ],
  words: ['word-origins', 'languages', 'idioms', 'writing-systems', 'place-names', 'synonyms'],
};

export const DIFFICULTIES = ['kids', 'mixed', 'expert'];
export const PER_POOL = 40;
export const MIN_PER_POOL = 36;
export const LIMITS = { question: 150, answer: 40, explanation: 220 };
export const WRITERS = ['claude-sonnet-5-5'];
export const CHECKERS = ['claude-opus-5-5'];

const KEYS = [
  'id',
  'difficulty',
  'question',
  'correct',
  'wrong',
  'explanation',
  'writtenBy',
  'checkedBy',
];

// The same list as writtenQuestionProblem in shared/src/bank.ts, plus a few more.
const TIME_BOUND =
  /\b(current(ly)?|nowadays|as of|this year|last year|latest|most recent|recently|today'?s?|reigning|incumbent|so far|to date|still holds?|at the moment|right now|record holder|holds the record)\b/i;
const NOT_QUESTION = /\b(NOT|EXCEPT)\b|\bwhich (of these|one) (is|was|does|did|has|can) not\b/;
const ABOVE = /\b(all|none|both) of (the )?(above|these|them)\b/i;
const US_SPELLING =
  /\b(color(s|ed|ful)?|center(s|d)?|(kilo|centi|milli)?meters?|liters?|favorite(s)?|gray|theater(s)?|defense|neighbor(s|ing)?|honor(s|ed)?|labor|harbor(s)?|humor|flavor(s)?|jewelry|aluminum|catalog|traveled|traveling|organiz\w*|recogniz\w*|realiz\w*|apologiz\w*|civiliz\w*|specializ\w*|behavior(s)?|armor|rumor|fiber|plow|cozy|soccer|candy|candies|mom)\b/i;

export function normalise(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const words = (s) =>
  new Set(
    normalise(s)
      .split(' ')
      .filter((w) => w.length > 2),
  );

function similar(a, b) {
  const x = words(a);
  const y = words(b);
  const shared = [...x].filter((w) => y.has(w)).length;
  const union = new Set([...x, ...y]).size;
  return union > 0 ? shared / union : 0;
}

function listFiles() {
  const files = [];
  for (const cat of readdirSync(ROOT)) {
    const dir = join(ROOT, cat);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) if (f.endsWith('.json')) files.push(join(dir, f));
  }
  return files.sort();
}

export function check(paths, { draft = false, requireAll = false } = {}) {
  const errors = [];
  const warnings = [];
  const counts = {};
  const all = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

  if (requireAll) {
    for (const [cat, subs] of Object.entries(TAXONOMY)) {
      for (const sub of subs) {
        if (!existsSync(join(ROOT, cat, `${sub}.json`))) err(`${cat}/${sub}.json`, 'missing');
      }
    }
  }

  for (const path of paths) {
    const rel = relative(ROOT, path).split(sep).join('/');
    const m = rel.match(/^([a-z-]+)\/([a-z-]+)\.json$/);
    if (!m) {
      err(rel, 'not at <category>/<subcategory>.json');
      continue;
    }
    const [, cat, sub] = m;
    if (!TAXONOMY[cat]?.includes(sub)) err(rel, 'not in the taxonomy');
    let data;
    try {
      data = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      err(rel, `not valid JSON: ${e.message}`);
      continue;
    }
    const top = Object.keys(data).sort().join(',');
    if (top !== 'category,questions,subcategory') err(rel, `top-level keys are ${top}`);
    if (data.category !== cat) err(rel, `category is ${data.category}`);
    if (data.subcategory !== sub) err(rel, `subcategory is ${data.subcategory}`);
    if (!Array.isArray(data.questions)) {
      err(rel, 'questions is not a list');
      continue;
    }
    const perDifficulty = Object.fromEntries(DIFFICULTIES.map((d) => [d, 0]));
    for (const [i, q] of data.questions.entries()) {
      const where = `${rel} ${q?.id ?? `#${i}`}`;
      if (!q || typeof q !== 'object') {
        err(where, 'not an object');
        continue;
      }
      const keys = Object.keys(q);
      const extra = keys.filter((k) => !KEYS.includes(k));
      const missing = KEYS.filter((k) => !keys.includes(k) && !(draft && k === 'checkedBy'));
      if (extra.length) err(where, `unknown fields ${extra.join(', ')}`);
      if (missing.length) err(where, `missing fields ${missing.join(', ')}`);
      if (!DIFFICULTIES.includes(q.difficulty)) err(where, `difficulty is ${q.difficulty}`);
      else perDifficulty[q.difficulty]++;
      const idPattern = new RegExp(`^${cat}\\.${sub}\\.${q.difficulty}\\.\\d{2}$`);
      if (typeof q.id !== 'string' || !idPattern.test(q.id)) err(where, 'id does not match');

      const texts = { question: q.question, correct: q.correct, explanation: q.explanation };
      for (const [k, v] of Object.entries(texts)) {
        if (typeof v !== 'string' || v.trim() === '') err(where, `${k} is empty`);
      }
      if (!Array.isArray(q.wrong) || q.wrong.length !== 3) {
        err(where, 'wrong needs exactly three answers');
        continue;
      }
      if (q.wrong.some((w) => typeof w !== 'string' || w.trim() === '')) {
        err(where, 'a wrong answer is empty');
        continue;
      }
      if (typeof q.question !== 'string' || typeof q.correct !== 'string') continue;
      const answers = [q.correct, ...q.wrong];
      for (const s of [q.question, ...answers, q.explanation ?? '']) {
        if (s !== s.trim() || /\s{2,}/.test(s)) err(where, `extra spaces in "${s}"`);
      }
      if (q.question.length > LIMITS.question) {
        err(where, `question is ${q.question.length} characters`);
      }
      for (const a of answers) {
        if (a.length > LIMITS.answer) err(where, `answer "${a}" is ${a.length} characters`);
      }
      if ((q.explanation ?? '').length > LIMITS.explanation) {
        err(where, `explanation is ${q.explanation.length} characters`);
      }
      if (!q.question.endsWith('?')) err(where, 'question does not end with "?"');
      if (new Set(answers.map(normalise)).size !== 4) err(where, 'answers are not all different');
      if (TIME_BOUND.test(q.question) || TIME_BOUND.test(q.correct)) {
        err(where, 'time-bound wording');
      }
      if (NOT_QUESTION.test(q.question)) err(where, '"NOT" question');
      if (ABOVE.test(answers.join(' | '))) err(where, '"all/none of the above" answer');
      if (!WRITERS.includes(q.writtenBy)) err(where, `writtenBy is ${q.writtenBy}`);
      if (!draft && !CHECKERS.includes(q.checkedBy)) err(where, `checkedBy is ${q.checkedBy}`);

      const prose = [q.question, ...answers, q.explanation ?? ''].join(' ');
      const us = prose.match(US_SPELLING);
      if (us) warn(where, `US spelling? "${us[0]}"`);
      const c = normalise(q.correct);
      if (c.length >= 4 && ` ${normalise(q.question)} `.includes(` ${c} `)) {
        warn(where, `correct answer appears in the question`);
      }
      const longestWrong = Math.max(...q.wrong.map((w) => w.length));
      if (q.correct.length > longestWrong * 1.8 && q.correct.length - longestWrong > 12) {
        warn(where, 'correct answer is much longer than the wrong ones');
      }
      all.push({ where, pool: `${cat}.${sub}.${q.difficulty}`, file: rel, ...q });
    }
    for (const d of DIFFICULTIES) {
      const n = perDifficulty[d];
      counts[`${cat}.${sub}.${d}`] = n;
      if (n > PER_POOL || n < MIN_PER_POOL) err(rel, `${n} ${d} questions`);
      else if (n < PER_POOL) warn(rel, `${n} ${d} questions`);
    }
    const ids = data.questions.map((q) => q.id);
    const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupIds.length) err(rel, `repeated ids ${[...new Set(dupIds)].join(', ')}`);
  }

  // Duplicates: the same question text anywhere, or the same correct answer with mostly the
  // same words (as repeatsExisting in shared/src/bank.ts does within a pool).
  const byText = new Map();
  for (const q of all) {
    const key = normalise(q.question);
    if (byText.has(key)) err(q.where, `same question as ${byText.get(key).where}`);
    else byText.set(key, q);
  }
  const byAnswer = new Map();
  for (const q of all) {
    const key = normalise(q.correct);
    if (!byAnswer.has(key)) byAnswer.set(key, []);
    byAnswer.get(key).push(q);
  }
  for (const group of byAnswer.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i], group[j]];
        if (normalise(a.question) === normalise(b.question)) continue;
        if (similar(a.question, b.question) >= 0.5) {
          err(b.where, `repeats ${a.where} ("${a.question}" / "${b.question}")`);
        }
      }
    }
  }
  return { errors, warnings, counts, total: all.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const named = args.filter((a) => !a.startsWith('--')).map((a) => resolve(a));
  const paths = named.length ? named : listFiles();
  const { errors, warnings, counts, total } = check(paths, {
    draft: flags.has('--draft'),
    requireAll: named.length === 0,
  });
  if (flags.has('--warnings')) for (const w of warnings) console.log(`warning  ${w}`);
  for (const e of errors) console.log(`error    ${e}`);
  const pools = Object.keys(counts).length;
  console.log(
    `${paths.length} files, ${pools} pools, ${total} questions: ` +
      `${errors.length} errors, ${warnings.length} warnings`,
  );
  process.exit(errors.length ? 1 : 0);
}
