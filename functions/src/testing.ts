/**
 * Recorded responses for the tests, so CI never calls a live service. The fixtures in
 * src/fixtures/ were recorded on 2026-11-27 from OpenRouteService (a loop near Nyhavn, and a
 * point out in the Øresund), Overpass, Wikidata, Wikipedia and Gemini.
 */
import { readFileSync } from 'node:fs';

import { distanceM } from '@qualk/shared';

import type { Fetch } from './net';
import type { Overpass, OverpassElement } from './places/overpass';
import type { Wiki, WikiNearby } from './places/wiki';

export function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as T;
}

/** A fake fetch: the first route whose test matches the URL (and body) answers. */
export function fakeFetch(
  routes: { match: (url: string, body: string) => boolean; status?: number; body: unknown }[],
  calls: { url: string; init?: RequestInit }[] = [],
): Fetch {
  return async (url, init) => {
    calls.push({ url, init });
    const body = typeof init?.body === 'string' ? init.body : '';
    const route = routes.find((r) => r.match(url, body));
    if (!route) return new Response('not recorded', { status: 404 });
    return new Response(typeof route.body === 'string' ? route.body : JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

/** Overpass answering the naming query and the water query from the fixtures. */
export function recordedOverpass(): Overpass & { queries: string[] } {
  const naming = fixture<{ elements: OverpassElement[] }>('overpass-naming').elements;
  const water = fixture<{ elements: OverpassElement[] }>('overpass-water').elements;
  const queries: string[] = [];
  return {
    queries,
    async query(ql) {
      queries.push(ql);
      return ql.includes('is_in(') ? water : naming;
    },
  };
}

/** Wikidata and Wikipedia answering from the fixtures. */
export function recordedWiki(): Wiki & { extracts: string[] } {
  const wd = fixture<{
    entities: Record<string, { sitelinks?: Record<string, { title: string }> }>;
  }>('wikidata-sitelinks');
  const pages =
    fixture<Record<string, { query: { pages: { extract?: string }[] } }>>('wikipedia-extracts');
  const geo = fixture<Record<string, WikiNearby[]>>('wikipedia-geosearch');
  const geoAt = Object.keys(geo).map((k) => {
    const [latitude, longitude] = k.split(',').map(Number) as [number, number];
    return { key: k, p: { latitude, longitude } };
  });
  const extracts: string[] = [];
  return {
    extracts,
    async nearby(p) {
      // The recorded answer for the nearest recorded point, if it is within 50 m.
      const near = geoAt.map((g) => ({ ...g, d: distanceM(g.p, p) })).sort((a, b) => a.d - b.d)[0];
      return near && near.d < 50 ? (geo[near.key] ?? []) : [];
    },
    async sitelinks(ids) {
      const out: Record<string, Record<string, string>> = {};
      for (const id of ids) {
        const links: Record<string, string> = {};
        for (const [site, l] of Object.entries(wd.entities[id]?.sitelinks ?? {})) {
          links[site.replace(/wiki$/, '')] = l.title;
        }
        out[id] = links;
      }
      return out;
    },
    async extract(lang, title) {
      extracts.push(`${lang}:${title}`);
      return pages[`${lang}:${title}`]?.query.pages[0]?.extract;
    },
  };
}
