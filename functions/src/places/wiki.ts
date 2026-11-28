/**
 * Wikidata and Wikipedia (spec §8 Next, step 2): a place's questions are written only from its
 * Wikipedia text, in English where there is an article, otherwise in the local language.
 */
import type { LatLng } from '@qualk/shared';

import { requestJson, USER_AGENT, type Fetch } from '../net';
import type { OsmFeature, OsmSurroundings } from './overpass';

export interface PlaceText {
  title: string;
  url: string;
  lang: string;
  /** Plain text, cut to MAX_PLACE_TEXT characters. */
  text: string;
}

/** A place is "documented" with at least this much text: enough for a handful of questions. */
export const MIN_PLACE_TEXT = 800;
/** What the writer is given; one article supports a handful of facts, not 50. */
export const MAX_PLACE_TEXT = 6000;

/** Wikipedias tried, in order, when there is no English article and no OSM `wikipedia` tag. */
const FALLBACK_LANGS = ['da', 'sv', 'nb', 'de', 'nl', 'fr', 'es', 'it', 'pl', 'fi'];

/** An English Wikipedia article with coordinates near a point. */
export interface WikiNearby {
  pageid: number;
  title: string;
  location: LatLng;
  wikidata?: string;
}

export interface Wiki {
  /** English Wikipedia articles within `radiusM` of a point (the GeoSearch API). */
  nearby(p: LatLng, radiusM: number): Promise<WikiNearby[]>;
  /** Sitelinks for Wikidata items: `{ Q123: { en: 'Title', da: 'Titel' } }`. */
  sitelinks(ids: string[]): Promise<Record<string, Record<string, string>>>;
  /** A page's plain text, or undefined when it has none. */
  extract(lang: string, title: string): Promise<string | undefined>;
}

const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };

export function wikiClient(fetchImpl?: Fetch): Wiki {
  return {
    async nearby(p, radiusM) {
      const url =
        'https://en.wikipedia.org/w/api.php?action=query&generator=geosearch' +
        `&ggscoord=${p.latitude.toFixed(6)}%7C${p.longitude.toFixed(6)}` +
        `&ggsradius=${Math.round(Math.min(10_000, Math.max(10, radiusM)))}&ggslimit=10` +
        '&prop=coordinates%7Cpageprops&ppprop=wikibase_item&format=json&formatversion=2';
      const res = await requestJson<{
        query?: {
          pages?: {
            pageid: number;
            title: string;
            coordinates?: { lat: number; lon: number }[];
            pageprops?: { wikibase_item?: string };
          }[];
        };
      }>(
        url,
        { headers },
        { service: 'wikipedia', timeoutMs: 10_000, retries: 1, fetch: fetchImpl },
      );
      return (res.query?.pages ?? [])
        .filter((pg) => pg.coordinates?.[0])
        .map((pg) => ({
          pageid: pg.pageid,
          title: pg.title,
          location: { latitude: pg.coordinates![0]!.lat, longitude: pg.coordinates![0]!.lon },
          ...(pg.pageprops?.wikibase_item ? { wikidata: pg.pageprops.wikibase_item } : {}),
        }));
    },

    async sitelinks(ids) {
      if (ids.length === 0) return {};
      const url =
        'https://www.wikidata.org/w/api.php?action=wbgetentities&props=sitelinks' +
        `&format=json&formatversion=2&ids=${ids.slice(0, 50).join('|')}`;
      const res = await requestJson<{
        entities?: Record<string, { sitelinks?: Record<string, { title: string }> }>;
      }>(
        url,
        { headers },
        {
          service: 'wikidata',
          timeoutMs: 15_000,
          retries: 1,
          fetch: fetchImpl,
        },
      );
      const out: Record<string, Record<string, string>> = {};
      for (const [id, entity] of Object.entries(res.entities ?? {})) {
        const links: Record<string, string> = {};
        for (const [site, link] of Object.entries(entity.sitelinks ?? {})) {
          const m = /^([a-z_]+)wiki$/.exec(site);
          if (m && m[1] !== 'commons' && m[1] !== 'species')
            links[m[1]!.replace('_', '-')] = link.title;
        }
        out[id] = links;
      }
      return out;
    },

    async extract(lang, title) {
      const url =
        `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1` +
        `&exsectionformat=plain&redirects=1&format=json&formatversion=2` +
        `&titles=${encodeURIComponent(title)}`;
      const res = await requestJson<{ query?: { pages?: { extract?: string }[] } }>(
        url,
        { headers },
        { service: 'wikipedia', timeoutMs: 15_000, retries: 1, fetch: fetchImpl },
      );
      const text = res.query?.pages?.[0]?.extract?.trim();
      return text ? text : undefined;
    },
  };
}

export function wikipediaUrl(lang: string, title: string): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/** Which article to use: English, then the OSM tag's language, then a nearby language. */
export function chooseArticle(
  links: Record<string, string>,
  osmWikipedia?: string,
): { lang: string; title: string } | undefined {
  if (links.en) return { lang: 'en', title: links.en };
  const tag = /^([a-z-]+):(.+)$/.exec(osmWikipedia ?? '');
  if (tag) return { lang: tag[1] as string, title: links[tag[1] as string] ?? (tag[2] as string) };
  for (const lang of FALLBACK_LANGS) {
    if (links[lang]) return { lang, title: links[lang] };
  }
  const [lang, title] = Object.entries(links)[0] ?? [];
  return lang && title ? { lang, title } : undefined;
}

/** Drops reference and see-also tails, collapses blank lines and cuts to the maximum. */
export function trimArticle(text: string): string {
  const cut = text.search(
    /\n(References|See also|External links|Further reading|Notes|Kilder|Se også|Eksterne henvisninger|Litteratur)\n/,
  );
  const body = (cut > 0 ? text.slice(0, cut) : text).replace(/\n{3,}/g, '\n\n').trim();
  return body.length <= MAX_PLACE_TEXT ? body : body.slice(0, MAX_PLACE_TEXT);
}

/** The Wikipedia text for each Wikidata item that has one. Failures leave an item out. */
export async function placeTexts(
  wiki: Wiki,
  items: { wikidata: string; wikipedia?: string }[],
): Promise<Map<string, PlaceText>> {
  const out = new Map<string, PlaceText>();
  if (items.length === 0) return out;
  const links = await wiki.sitelinks(items.map((i) => i.wikidata));
  await Promise.all(
    items.map(async (item) => {
      const article = chooseArticle(links[item.wikidata] ?? {}, item.wikipedia);
      if (!article) return;
      try {
        const text = await wiki.extract(article.lang, article.title);
        if (!text) return;
        out.set(item.wikidata, {
          title: article.title,
          url: wikipediaUrl(article.lang, article.title),
          lang: article.lang,
          text: trimArticle(text),
        });
      } catch {
        // One missing article doesn't stop the others.
      }
    }),
  );
  return out;
}

/** Articles that aren't something to stand next to and quiz about. */
const NOT_A_PLACE =
  /\b(embassy|consulate|agency|authority|ministry|association|federation|organi[sz]ation|hotel|hostel|restaurant|caf[eé]|company|bank|school|exhibition|festival|list of)\b/i;

/** "Memorial Anchor, Copenhagen" → "Memorial Anchor"; "Nyhavn 17 (building)" → "Nyhavn 17". */
export function placeNameFromTitle(title: string): string {
  return title
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/,\s*[A-Z][\p{L}-]+(\s[A-Z][\p{L}-]+)?$/u, '')
    .trim();
}

/**
 * Named, documented places near the stops from Wikipedia's GeoSearch, used when Overpass
 * doesn't answer: every article is a landmark worth a stop's name and a Local question.
 * Streets come only from Overpass, so a stop with no article nearby goes unnamed.
 */
export async function surroundingsFromWikipedia(
  wiki: Wiki,
  points: LatLng[],
  radiusM = 120,
): Promise<OsmSurroundings> {
  const results = await Promise.allSettled(points.map((p) => wiki.nearby(p, radiusM)));
  const features = new Map<string, OsmFeature>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const a of r.value) {
      if (!a.wikidata || NOT_A_PLACE.test(a.title)) continue;
      features.set(a.wikidata, {
        id: `enwiki/${a.pageid}`,
        name: placeNameFromTitle(a.title).slice(0, 80),
        location: a.location,
        score: 4,
        wikidata: a.wikidata,
        wikipedia: `en:${a.title}`,
        notable: true,
      });
    }
  }
  if (features.size === 0 && results.every((r) => r.status === 'rejected')) {
    throw (
      (results[0] as PromiseRejectedResult | undefined)?.reason ?? new Error('wikipedia failed')
    );
  }
  return { features: [...features.values()], streets: [] };
}
