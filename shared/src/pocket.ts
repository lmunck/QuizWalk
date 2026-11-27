/**
 * Pocket mode and Directions (spec §9, §3 P3). Pure decisions; the app feeds them fixes and
 * turns the answers into location requests and links.
 */
import type { LatLng } from './types';

/** How hard the GPS works in pocket mode. */
export type PocketAccuracy = 'far' | 'near';

/** Spec §9: high accuracy only within 300 m of the stop. */
export const POCKET_NEAR_STOP_M = 300;
/**
 * Back to `far` only beyond this, so a player walking along the 300 m line does not flip the
 * GPS on and off with every fix.
 */
export const POCKET_FAR_AGAIN_M = 400;

/**
 * Which accuracy step a fix calls for. `near` within `nearM` of the stop, `far` beyond `farM`,
 * and no change in between. Without a usable distance it stays `near`: a phone that cannot
 * tell how far it is should look harder, not give up.
 */
export function pocketAccuracyStep(
  distanceToStopM: number | undefined,
  current: PocketAccuracy,
  nearM: number = POCKET_NEAR_STOP_M,
  farM: number = POCKET_FAR_AGAIN_M,
): PocketAccuracy {
  if (distanceToStopM === undefined || !Number.isFinite(distanceToStopM)) return 'near';
  if (distanceToStopM <= nearM) return 'near';
  if (distanceToStopM > farM) return 'far';
  return current;
}

/** Map apps that *Directions* can open. */
export type MapsApp = 'apple' | 'google';

const coord = (n: number) => n.toFixed(6);

/**
 * A walking-directions link to a stop. Both are https links, so they open the maps app when it
 * is installed and the browser otherwise, without asking the phone which apps it has.
 */
export function directionsUrl(app: MapsApp, to: LatLng): string {
  const at = `${coord(to.latitude)},${coord(to.longitude)}`;
  if (app === 'apple') return `https://maps.apple.com/?daddr=${at}&dirflg=w`;
  return `https://www.google.com/maps/dir/?api=1&destination=${at}&travelmode=walking`;
}
