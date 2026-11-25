/**
 * Explains location problems where they matter (spec §3 errors): permission denied, and precise
 * location switched off, which means a stop can never unlock.
 */
import { Platform } from 'react-native';

import { openAppSettings, type LocationAccess } from '@/location/position';

import { Banner } from './ui';

export function LocationNotice({ access }: { access: LocationAccess | undefined }) {
  if (!access) return null;
  if (access.status === 'denied') {
    return (
      <Banner
        kind="error"
        icon="gps"
        title="Location is off for QuizWalk"
        text="Questions unlock when you reach each stop, so QuizWalk needs your location during the walk. Turn it on in Settings."
        actionLabel="Open Settings"
        onAction={openAppSettings}
      />
    );
  }
  if (access.status === 'granted' && !access.precise) {
    return (
      <Banner
        kind="error"
        icon="gps"
        title={Platform.OS === 'ios' ? 'Precise Location is off' : 'Location is set to approximate'}
        text={
          Platform.OS === 'ios'
            ? 'With an approximate location no stop can ever unlock. Turn on Precise Location for QuizWalk in Settings.'
            : 'With an approximate location no stop can ever unlock. In Settings, open Permissions → Location and turn on “Use precise location”.'
        }
        actionLabel="Open Settings"
        onAction={openAppSettings}
      />
    );
  }
  return null;
}
