/// <reference types="node" />
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

// Identity from docs/v1-spec.md §1. The bundle ID reuses the retired App Store record.
const IOS_BUNDLE_ID = 'com.lmunck.Qualk';
const ANDROID_PACKAGE = 'com.lmunck.qualk';
const LINK_HOST = 'qualk.dk';

/**
 * Firebase config files. The real ones come from the Firebase console (spec §18) and live in
 * app/. Until both are there, or when QUALK_EMULATORS=1, the build uses the emulator-only demo
 * files in app/firebase/emulator/ and the app talks to the local Firebase emulators.
 */
const REAL_IOS = './GoogleService-Info.plist';
const REAL_ANDROID = './google-services.json';
const DEMO_IOS = './firebase/emulator/GoogleService-Info.plist';
const DEMO_ANDROID = './firebase/emulator/google-services.json';
const hasRealConfig =
  existsSync(join(__dirname, REAL_IOS)) && existsSync(join(__dirname, REAL_ANDROID));
const useEmulators = process.env.QUALK_EMULATORS === '1' || !hasRealConfig;

/**
 * Google Maps on Android needs a key (spec §18). Without one the map is replaced by a
 * placeholder rather than crashing, so the rest of the app can still be tested.
 */
const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '';

const LOCATION_WHEN_IN_USE =
  'QuizWalk uses your location during a walk to unlock each question when you reach its stop. ' +
  'Nothing is shared before you tap Start walk.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // Store name is still open ("QuizWalk" preferred, "Qualk" fallback); code and IDs use qualk.
  name: 'QuizWalk',
  slug: 'qualk',
  owner: 'lmunck',
  scheme: 'qualk',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // Light mode only in v1 (§16).
  userInterfaceStyle: 'light',
  backgroundColor: '#F4F6F1',
  ios: {
    bundleIdentifier: IOS_BUNDLE_ID,
    supportsTablet: false,
    associatedDomains: [`applinks:${LINK_HOST}`],
    usesAppleSignIn: true,
    googleServicesFile: useEmulators ? DEMO_IOS : REAL_IOS,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      // The emulators run over plain HTTP on the Mac; only dev builds talk to them.
      NSAppTransportSecurity: useEmulators ? { NSAllowsArbitraryLoads: true } : undefined,
    },
  },
  android: {
    package: ANDROID_PACKAGE,
    googleServicesFile: useEmulators ? DEMO_ANDROID : REAL_ANDROID,
    adaptiveIcon: {
      backgroundColor: '#F4F6F1',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Only the permissions the app uses. Camera is never asked for (no in-app scanner, §16).
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.CAMERA'],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: LINK_HOST, pathPrefix: '/play' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    // React Native Firebase must come first (docs/m1-design.md §2).
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    '@react-native-firebase/app-check',
    // RNFirebase v27 is SPM-only, which needs dynamic frameworks. `static` breaks pod install.
    [
      'expo-build-properties',
      { ios: { useFrameworks: 'dynamic' }, android: { minSdkVersion: 24 } },
    ],
    'expo-router',
    [
      'expo-location',
      {
        locationWhenInUsePermission: LOCATION_WHEN_IN_USE,
        // Pocket mode (M3) keeps a session that started in the foreground running. Always is
        // never requested (spec §9), but iOS requires the string to exist.
        locationAlwaysAndWhenInUsePermission: LOCATION_WHEN_IN_USE,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
        isIosBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
    'expo-task-manager',
    ['expo-notifications', { color: '#1F6F4A' }],
    'expo-apple-authentication',
    'react-native-nitro-google-signin',
    ['react-native-maps', androidMapsKey ? { androidGoogleMapsApiKey: androidMapsKey } : {}],
    'expo-sharing',
    'expo-font',
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 168, backgroundColor: '#F4F6F1' },
    ],
  ],
  // Typed routes are off: CI typechecks without a dev server to generate the route types.
  experiments: {
    typedRoutes: false,
  },
  extra: {
    eas: {
      projectId: 'b4e33e0a-212e-4313-8c1b-90eff42dd744',
    },
    useEmulators,
    androidMapsConfigured: androidMapsKey !== '',
  },
});
