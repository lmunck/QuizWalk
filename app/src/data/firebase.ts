/**
 * The one place that sets up Firebase. Every module in src/data/ and src/auth/ imports its
 * handles from here, so the emulator switch and App Check happen before any read or write.
 */
import { getApp } from '@react-native-firebase/app';
import {
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';
import { connectAuthEmulator, getAuth } from '@react-native-firebase/auth';
import { connectFirestoreEmulator, getFirestore } from '@react-native-firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from '@react-native-firebase/functions';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { usingEmulators } from '@/lib/env';

export { usingEmulators };

/**
 * The emulators run on the Mac that serves the JS bundle, so a simulator or a phone on the
 * same network reaches them at the dev server's address.
 */
function emulatorHost(): string {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host && host.length > 0) return host;
  return Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
}

export const auth = getAuth();
export const db = getFirestore();
export const functions = getFunctions(getApp(), 'europe-west1');

if (usingEmulators) {
  const host = emulatorHost();
  connectAuthEmulator(auth, `http://${host}:9099`);
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
} else {
  // Debug builds use a debug token registered in the Firebase console (spec §18); release
  // builds use App Attest and Play Integrity.
  const debugToken = process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN || undefined;
  const provider = new ReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: { provider: __DEV__ ? 'debug' : 'playIntegrity', debugToken },
    apple: { provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback', debugToken },
  });
  try {
    initializeAppCheck(getApp(), { provider, isTokenAutoRefreshEnabled: true });
  } catch (err) {
    console.warn('App Check could not start', err);
  }
}
