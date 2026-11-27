import { decodePolyline, distanceM, lineLengthM, projectOntoLine, spaceStops } from '@qualk/shared';
import { describe, expect, it } from 'vitest';

import { fakeFetch, fixture, recordedWiki } from '../testing';
import { MIN_GAP_M, nameStops, streetNameAt } from './naming';
import {
  featureScore,
  isNotable,
  namingQuery,
  overpassClient,
  parseSurroundings,
  parseWater,
  waterQuery,
  type OverpassElement,
} from './overpass';
import { chooseArticle, placeTexts, trimArticle, wikiClient } from './wiki';

const naming = fixture<{ elements: OverpassElement[] }>('overpass-naming').elements;
const water = fixture<{ elements: OverpassElement[] }>('overpass-water').elements;
const route = decodePolyline(
  fixture<{ body: { routes: { geometry: string }[] } }>('ors-loop').body.routes[0]!.geometry,
);

describe('Overpass', () => {
  it('builds one naming query for every point, bounded by the points', () => {
    const q = namingQuery([
      { latitude: 55.1, longitude: 12.2 },
      { latitude: 55.3, longitude: 12.4 },
    ]);
    expect(q).toContain('nwr(around:90,55.100000,12.200000)[name]');
    expect(q).toContain('[wikidata]');
    expect(q).toContain('way(around:35,55.300000,12.400000)[highway][name]');
    expect(q).toMatch(/out tags center;.*out tags geom;$/);
  });

  it('reads features, documented places and streets from the recorded answer', () => {
    const env = parseSurroundings(naming);
    expect(env.features.length).toBeGreaterThan(50);
    expect(env.streets.length).toBeGreaterThan(3);
    const tower = env.features.find((f) => f.name === 'Taarnet på Kongens Nytorv');
    expect(tower?.score).toBeGreaterThan(0);
    const nyhavn = env.features.find((f) => f.wikidata === 'Q943946');
    expect(nyhavn?.notable).toBe(true);
  });

  it('scores landmarks and leaves shops, hotels and offices out of Local', () => {
    expect(featureScore({ amenity: 'fountain' })).toBe(5);
    expect(featureScore({ amenity: 'fountain', wikidata: 'Q1' })).toBe(7);
    expect(featureScore({ amenity: 'restaurant' })).toBe(0);
    expect(featureScore({ tourism: 'gallery' })).toBe(0);
    expect(featureScore({ historic: 'wayside_shrine' })).toBe(3);
    expect(isNotable({ tourism: 'hotel', wikidata: 'Q1' })).toBe(false);
    expect(isNotable({ office: 'government', wikidata: 'Q1' })).toBe(false);
    expect(isNotable({ highway: 'residential', wikidata: 'Q1' })).toBe(true);
  });

  it('tells water from land with the recorded is_in answer', () => {
    // Peblinge Sø, the Nyhavn canal, the City Hall Square, the harbour.
    expect(parseWater(water, 4)).toEqual([true, true, false, true]);
    expect(waterQuery([{ latitude: 55.1, longitude: 12.2 }])).toContain(
      'make pin idx="0";out;is_in(55.100000,12.200000)',
    );
  });

  it('posts the query form-encoded with a User-Agent, and falls back to the next server', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const client = overpassClient(
      ['https://one.example/api', 'https://two.example/api'],
      fakeFetch(
        [
          { match: (u) => u.startsWith('https://one'), status: 400, body: 'bad' },
          { match: () => true, body: { elements: water } },
        ],
        calls,
      ),
    );
    const out = await client.query('[out:json];');
    expect(out).toHaveLength(water.length);
    expect(calls.map((c) => c.url)).toEqual(['https://one.example/api', 'https://two.example/api']);
    expect((calls[1]!.init!.headers as Record<string, string>)['User-Agent']).toMatch(/^Qualk/);
    expect(calls[1]!.init!.body).toBe('data=%5Bout%3Ajson%5D%3B');
  });
});

describe('naming stops', () => {
  const env = parseSurroundings(naming);
  const planned = spaceStops(route, 8);
  const named = nameStops(route, planned, env.features, env.streets);
  const length = lineLengthM(route);

  it('keeps every stop on the route', () => {
    expect(named).toHaveLength(8);
    for (const s of named) expect(projectOntoLine(route, s.location).offsetM).toBeLessThan(1);
  });

  it('moves stops to landmarks and names the rest after their street', () => {
    const names = named.map((s) => s.placeName);
    expect(names).toContain('Taarnet på Kongens Nytorv');
    expect(names).toContain('Borgergade');
    expect(named.filter((s) => s.featureId).length).toBeGreaterThanOrEqual(3);
    expect(named.filter((s) => s.placeName).length).toBeGreaterThanOrEqual(6);
  });

  it('keeps stops at least 120 m apart along the route and moves none more than 80 m', () => {
    const along = named.map((s) => s.alongM);
    for (let i = 1; i < along.length; i++) {
      expect(along[i]! - along[i - 1]!).toBeGreaterThanOrEqual(MIN_GAP_M);
    }
    named.forEach((s, i) => {
      const d = Math.abs(s.alongM - planned[i]!.alongM);
      expect(Math.min(d, length - d)).toBeLessThanOrEqual(80);
    });
  });

  it('gives each documented place to one stop at most, landmarks first', () => {
    const places = named.map((s) => s.place?.wikidata).filter(Boolean);
    expect(new Set(places).size).toBe(places.length);
    expect(named[0]!.place?.name).toBe('Kongens Nytorv');
  });

  it('finds the nearest street within reach', () => {
    const street = env.streets[0]!;
    expect(streetNameAt(street.points[0]!, env.streets)).toBeTruthy();
    expect(streetNameAt({ latitude: 0, longitude: 0 }, env.streets)).toBe('');
  });

  it('copes with no features at all', () => {
    const bare = nameStops(route, planned, [], []);
    expect(bare.map((s) => s.placeName)).toEqual(new Array(8).fill(''));
    bare.forEach((s, i) => expect(distanceM(s.location, planned[i]!.location)).toBe(0));
  });
});

describe('Wikipedia', () => {
  it('prefers English, then the OSM tag, then a nearby language', () => {
    expect(chooseArticle({ en: 'Nyhavn', da: 'Nyhavn' })).toEqual({ lang: 'en', title: 'Nyhavn' });
    expect(chooseArticle({ da: 'Kvæsthusbroen' }, 'da:Kvæsthusbroen')).toEqual({
      lang: 'da',
      title: 'Kvæsthusbroen',
    });
    expect(chooseArticle({ de: 'X', sv: 'Y' })).toEqual({ lang: 'sv', title: 'Y' });
    expect(chooseArticle({})).toBeUndefined();
  });

  it('cuts the reference tail and the length', () => {
    const t = trimArticle('Intro.\n\n\n\nHistory\nOld.\nReferences\n[1] x');
    expect(t).toBe('Intro.\n\nHistory\nOld.');
    expect(trimArticle('x'.repeat(9000))).toHaveLength(6000);
  });

  it('reads sitelinks and extracts through the recorded API answers', async () => {
    const texts = await placeTexts(recordedWiki(), [
      { wikidata: 'Q1589941' },
      { wikidata: 'Q943946', wikipedia: 'da:Nyhavn' },
      { wikidata: 'Q404' },
    ]);
    expect(texts.get('Q1589941')).toMatchObject({
      lang: 'en',
      title: 'Kongens Nytorv',
      url: 'https://en.wikipedia.org/wiki/Kongens_Nytorv',
    });
    expect(texts.get('Q1589941')!.text.length).toBeGreaterThan(2000);
    expect(texts.has('Q404')).toBe(false);
  });

  it('asks Wikidata for sitelinks with a User-Agent', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const wiki = wikiClient(
      fakeFetch(
        [
          {
            match: (u) => u.includes('wikidata'),
            body: {
              entities: {
                Q1: { sitelinks: { enwiki: { title: 'A' }, commonswiki: { title: 'B' } } },
              },
            },
          },
        ],
        calls,
      ),
    );
    expect(await wiki.sitelinks(['Q1'])).toEqual({ Q1: { en: 'A' } });
    expect(calls[0]!.url).toContain('ids=Q1');
    expect((calls[0]!.init!.headers as Record<string, string>)['User-Agent']).toMatch(/^Qualk/);
  });
});
