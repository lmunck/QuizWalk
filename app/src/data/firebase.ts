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

import { usingEmulators } from '@/lib/env';

export { usingEmulators };

/**
 * Where the local emulators are. 127.0.0.1 by default: the iOS simulator shares the Mac's
 * network, and the Android emulator reaches it after `adb reverse tcp:9099 tcp:9099` (and 8080,
 * 5001). React Native Firebase only sends auth tokens to callables on a loopback host over HTTP,
 * so a physical phone can read and write Firestore through EXPO_PUBLIC_EMULATOR_HOST=<Mac's IP>
 * but cannot call functions; test those on a simulator, or against the real project.
 */
function emulatorHost(): string {
  return process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
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
  // Dev builds use a debug token registered in the Firebase console (spec §18); store builds
  // use App Attest and Play Integrity. Test builds handed to testers before the Play Console
  // app exists set EXPO_PUBLIC_APP_CHECK_PROVIDER=debug (see docs/user-testing.md).
  const debugToken = process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN || undefined;
  const useDebug = __DEV__ || process.env.EXPO_PUBLIC_APP_CHECK_PROVIDER === 'debug';
  const provider = new ReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: { provider: useDebug ? 'debug' : 'playIntegrity', debugToken },
    apple: { provider: useDebug ? 'debug' : 'appAttestWithDeviceCheckFallback', debugToken },
  });
  try {
    initializeAppCheck(getApp(), { provider, isTokenAutoRefreshEnabled: true });
  } catch (err) {
    console.warn('App Check could not start', err);
  }
}
