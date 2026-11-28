/**
 * Question categories (spec §8 "Question bank", m4-generation-design §4). The creator picks
 * Auto or one or more categories in C2's sheet; subcategories are never shown. They spread a
 * walk's questions, so History doesn't give eight questions about Vikings, and they split the
 * bank into pools of one subcategory and one difficulty.
 */
import type { Difficulty } from './types';

export const DIFFICULTIES: readonly Difficulty[] = ['kids', 'mixed', 'expert'];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  kids: 'Kids',
  mixed: 'Mixed',
  expert: 'Expert',
};

export type CategoryId =
  | 'history'
  | 'geography'
  | 'science'
  | 'nature'
  | 'space'
  | 'sport'
  | 'music'
  | 'film'
  | 'food'
  | 'art'
  | 'words'
  | 'local';

/** A category whose questions live in the bank, rather than per place. */
export type TriviaCategoryId = Exclude<CategoryId, 'local'>;

export interface Subcategory {
  id: string;
  /** What the question writer is told the pool is about. Never shown in the app. */
  topic: string;
  /** Difficulties this subcategory has no pool for, because it doesn't suit them. */
  notFor?: Difficulty[];
}

export interface Category {
  id: CategoryId;
  /** As the creator sees it in C2, and in the title "{label} walk from {start}". */
  label: string;
  /** Difficulties under which Auto may use this category. */
  auto: Difficulty[];
  subcategories: Subcategory[];
}

const ALL: Difficulty[] = ['kids', 'mixed', 'expert'];

/** The first list (spec §8). Order is the order in C2's picker. */
export const CATEGORIES: readonly Category[] = [
  {
    id: 'history',
    label: 'History',
    auto: ALL,
    subcategories: [
      { id: 'ancient', topic: 'the ancient world: Egypt, Greece, Rome, China and others' },
      { id: 'medieval', topic: 'the Middle Ages and the Vikings' },
      { id: 'exploration', topic: 'explorers, voyages and empires' },
      { id: 'modern', topic: 'the 1700s and 1800s: revolutions, industry and inventions' },
      { id: 'twentieth', topic: 'the 20th century' },
      { id: 'everyday', topic: 'everyday life in the past: homes, clothes, school, toys' },
      { id: 'nordic', topic: 'Danish and Nordic history' },
    ],
  },
  {
    id: 'geography',
    label: 'Geography',
    auto: ALL,
    subcategories: [
      { id: 'countries', topic: 'countries and capital cities' },
      { id: 'water', topic: 'rivers, lakes, seas and oceans' },
      { id: 'landforms', topic: 'mountains, volcanoes, deserts and forests' },
      { id: 'cities', topic: 'cities and famous landmarks' },
      { id: 'flags', topic: 'flags, borders and where countries are' },
      { id: 'islands', topic: 'islands, coasts and peninsulas' },
      { id: 'europe', topic: 'the countries, cities and landscapes of Europe' },
    ],
  },
  {
    id: 'science',
    label: 'Science',
    auto: ALL,
    subcategories: [
      { id: 'body', topic: 'the human body and health' },
      { id: 'chemistry', topic: 'chemistry, materials and the elements' },
      { id: 'physics', topic: 'physics: light, sound, forces and energy' },
      { id: 'inventions', topic: 'inventions and the people who made them' },
      { id: 'weather', topic: 'weather and climate' },
      { id: 'earth', topic: 'the Earth: rocks, earthquakes and the oceans' },
      { id: 'maths', topic: 'maths and numbers' },
    ],
  },
  {
    id: 'nature',
    label: 'Nature & animals',
    auto: ALL,
    subcategories: [
      { id: 'mammals', topic: 'mammals' },
      { id: 'birds', topic: 'birds' },
      { id: 'sea', topic: 'fish and sea life' },
      { id: 'small', topic: 'insects, spiders and other small creatures' },
      { id: 'plants', topic: 'plants, trees and fungi' },
      { id: 'habits', topic: 'how animals live: food, homes, migration and senses' },
      { id: 'dinosaurs', topic: 'dinosaurs and prehistoric life' },
    ],
  },
  {
    id: 'space',
    label: 'Space',
    auto: ALL,
    subcategories: [
      { id: 'solar', topic: 'the Sun and the planets of the solar system' },
      { id: 'moon', topic: 'the Moon' },
      { id: 'stars', topic: 'stars and constellations' },
      { id: 'universe', topic: 'galaxies, black holes and the universe' },
      { id: 'missions', topic: 'space missions, rockets and probes' },
      { id: 'astronauts', topic: 'astronauts and life in space' },
    ],
  },
  {
    id: 'sport',
    label: 'Sport',
    auto: ALL,
    subcategories: [
      { id: 'football', topic: 'football' },
      { id: 'olympics', topic: 'the Olympic Games' },
      { id: 'racket', topic: 'tennis, badminton and other racket sports' },
      { id: 'endurance', topic: 'cycling, running and swimming' },
      { id: 'winter', topic: 'winter sports' },
      { id: 'rules', topic: 'the rules and equipment of sports' },
    ],
  },
  {
    id: 'music',
    label: 'Music',
    auto: ALL,
    subcategories: [
      { id: 'classical', topic: 'classical music and composers' },
      { id: 'pop', topic: 'pop and rock music' },
      { id: 'instruments', topic: 'musical instruments' },
      { id: 'stage', topic: 'musicals and music in films' },
      { id: 'world', topic: 'folk and world music, and music around the world' },
      { id: 'theory', topic: 'musical terms, notes and how music is written' },
    ],
  },
  {
    id: 'film',
    label: 'Film & TV',
    auto: ALL,
    subcategories: [
      { id: 'animated', topic: 'animated films' },
      { id: 'classic', topic: 'classic films from before 1990' },
      { id: 'making', topic: 'how films are made: directors, studios and awards' },
      { id: 'series', topic: 'TV series' },
      { id: 'fantasy', topic: 'superhero, fantasy and science-fiction films' },
      { id: 'children', topic: "children's TV and family films" },
    ],
  },
  {
    id: 'food',
    label: 'Food & drink',
    auto: ALL,
    subcategories: [
      { id: 'produce', topic: 'fruit, vegetables, nuts and grains' },
      { id: 'dishes', topic: 'dishes from around the world' },
      { id: 'sweets', topic: 'baking, cakes and sweets' },
      { id: 'cooking', topic: 'cooking, kitchens and how food is made' },
      { id: 'drinks', topic: 'drinks: tea, coffee, juices and soft drinks' },
      { id: 'origins', topic: 'where foods come from and their history' },
    ],
  },
  {
    id: 'art',
    label: 'Art & books',
    auto: ALL,
    subcategories: [
      { id: 'painting', topic: 'painters and paintings' },
      { id: 'buildings', topic: 'sculpture and architecture' },
      { id: 'childrens', topic: "children's books and their authors" },
      { id: 'novels', topic: 'classic novels and their authors' },
      { id: 'poetry', topic: 'poetry and plays' },
      { id: 'myths', topic: 'myths, legends and fairy tales' },
    ],
  },
  {
    id: 'words',
    label: 'Words & language',
    auto: ['mixed', 'expert'],
    subcategories: [
      { id: 'origins', topic: 'where English words come from' },
      { id: 'meanings', topic: 'what words mean' },
      { id: 'languages', topic: 'languages of the world' },
      { id: 'idioms', topic: 'idioms and sayings' },
      { id: 'writing', topic: 'alphabets and writing systems' },
      { id: 'opposites', topic: 'opposites, synonyms and word groups' },
    ],
  },
  {
    id: 'local',
    label: 'Local',
    auto: [],
    subcategories: [],
  },
];

export const CATEGORY_IDS: readonly CategoryId[] = CATEGORIES.map((c) => c.id);

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function isCategoryId(v: unknown): v is CategoryId {
  return typeof v === 'string' && BY_ID.has(v as CategoryId);
}

export function categoryById(id: CategoryId): Category {
  return BY_ID.get(id) as Category;
}

export function categoryLabel(id: CategoryId): string {
  return categoryById(id).label;
}

/** One pool in the bank: a subcategory at one difficulty. */
export interface PoolRef {
  category: TriviaCategoryId;
  subcategory: string;
  difficulty: Difficulty;
}

/** "history.medieval.kids": the pool's id in logs, top-up locks and the fill script. */
export function poolKey(p: PoolRef): string {
  return `${p.category}.${p.subcategory}.${p.difficulty}`;
}

export function parsePoolKey(key: string): PoolRef | undefined {
  const [category, subcategory, difficulty] = key.split('.');
  const pool = { category, subcategory, difficulty } as PoolRef;
  return allPools().some((p) => poolKey(p) === poolKey(pool)) ? pool : undefined;
}

/** Subcategories with a pool at this difficulty. */
export function subcategoriesFor(id: CategoryId, difficulty: Difficulty): Subcategory[] {
  return categoryById(id).subcategories.filter((s) => !s.notFor?.includes(difficulty));
}

/** Every pool in the bank, in category order. */
export function allPools(): PoolRef[] {
  const pools: PoolRef[] = [];
  for (const c of CATEGORIES) {
    if (c.id === 'local') continue;
    for (const difficulty of DIFFICULTIES) {
      for (const s of subcategoriesFor(c.id, difficulty)) {
        pools.push({ category: c.id, subcategory: s.id, difficulty });
      }
    }
  }
  return pools;
}

/** The trivia categories Auto mixes at a difficulty. */
export function autoCategories(difficulty: Difficulty): TriviaCategoryId[] {
  return CATEGORIES.filter((c) => c.id !== 'local' && c.auto.includes(difficulty)).map(
    (c) => c.id as TriviaCategoryId,
  );
}

/**
 * The categories as stored on a walk: known ids only, no repeats, in picker order. Empty means
 * Auto (spec §6).
 */
export function normaliseCategories(input: unknown): CategoryId[] {
  if (!Array.isArray(input)) return [];
  const wanted = new Set(input.filter(isCategoryId));
  return CATEGORY_IDS.filter((id) => wanted.has(id));
}

/**
 * A generated walk's title (spec §8 Next, step 3): "{Category} walk from {start}" for one
 * category, "Quiz walk from {start}" for Auto or several. Without a start label, the part
 * after "walk" is left out.
 */
export function generatedWalkTitle(categories: CategoryId[], startLabel: string): string {
  const head = categories.length === 1 ? `${categoryLabel(categories[0]!)} walk` : 'Quiz walk';
  const start = startLabel.trim();
  const title = start ? `${head} from ${start}` : head;
  return title.length <= 80 ? title : head;
}
