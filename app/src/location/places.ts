/**
 * Places for the editor: the creator's location, a label for a point, and search. Search uses
 * the platform's own geocoder through expo-location (spec §3 G2: no extra API).
 */
import type { LatLng } from '@qualk/shared';
import * as Location from 'expo-location';

import { getLocationAccess, requestLocationAccess } from './position';

/** Copenhagen's Nyhavn: where the map starts when the creator's location is unknown. */
export const FALLBACK_LOCATION: LatLng = { latitude: 55.67985, longitude: 12.5906 };

function labelFrom(a: Location.LocationGeocodedAddress | undefined): string {
  if (!a) return '';
  const street = [a.street, a.streetNumber].filter(Boolean).join(' ');
  return a.name && a.name !== street && !/^\d/.test(a.name)
    ? a.name
    : street || a.district || a.city || '';
}

/** A short, readable label for a point ("Nyhavn 17"), or '' if none is found. */
export async function labelFor(p: LatLng): Promise<string> {
  try {
    const [first] = await Location.reverseGeocodeAsync(p);
    return labelFrom(first);
  } catch {
    return '';
  }
}

/** The creator's location for the Start pin and "Add stop here". Asks for permission if needed. */
export async function currentPlace(): Promise<{
  location: LatLng;
  label: string;
  located: boolean;
}> {
  try {
    let access = await getLocationAccess();
    if (access.status === 'undetermined') access = await requestLocationAccess();
    if (access.status !== 'granted')
      return { location: FALLBACK_LOCATION, label: '', located: false };
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 100 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
    const location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    return { location, label: await labelFor(location), located: true };
  } catch {
    return { location: FALLBACK_LOCATION, label: '', located: false };
  }
}

export interface PlaceResult {
  location: LatLng;
  label: string;
}

/** Up to five places for a search, labelled from the reverse geocoder. */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const hits = (await Location.geocodeAsync(q)).slice(0, 5);
    return Promise.all(
      hits.map(async (h) => {
        const location = { latitude: h.latitude, longitude: h.longitude };
        return { location, label: (await labelFor(location)) || q };
      }),
    );
  } catch {
    return [];
  }
}
