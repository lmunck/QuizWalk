/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
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
 * Google sign-in asks for the project's web OAuth client (its tokens are what Firebase Auth
 * accepts). Android finds it in google-services.json by itself, but Firebase's iOS plist does
 * not carry it, so it is read here and handed to the app through `extra`.
 */
function googleWebClientId(): string | undefined {
  if (useEmulators) return undefined;
  const json = JSON.parse(readFileSync(join(__dirname, REAL_ANDROID), 'utf8')) as {
    client?: { oauth_client?: { client_id: string; client_type: number }[] }[];
  };
  return json.client?.[0]?.oauth_client?.find((c) => c.client_type === 3)?.client_id;
}

/**
 * Google Maps on Android needs a key (spec §18). Without one the map is replaced by a
 * placeholder rather than crashing, so the rest of the app can still be tested.
 */
const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '';

/**
 * Release builds run R8 (Expo's template turns it on). react-native-maps brings in WorkManager
 * 2.9 with Room 2.5, and Room creates WorkManager's generated database class by reflection. The
 * stricter R8 in AGP 9 removed that class's no-argument constructor, so the Android preview
 * build crashed at launch ("Failed to create an instance of …WorkDatabase", 2026-11-27).
 * WorkManager creates its input mergers by class name in the same way.
 */
const EXTRA_PROGUARD_RULES = [
  '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
  '-keep class * extends androidx.work.InputMerger { <init>(); }',
].join('\n');

/**
 * Android draws a notification's small icon from its alpha channel only, so the full-colour app
 * icon would show as a white blob in the status bar. Used for pushes, the arrival buzz and
 * pocket mode's "Guiding you to stop 4" (design/icon/notification.svg).
 */
const NOTIFICATION_ICON = './assets/notification-icon.png';

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
      // The emulators run over plain HTTP on the Mac; only dev builds talk to them. Otherwise
      // keep Expo's template value: local networking is how a dev build reaches Metro.
      NSAppTransportSecurity: useEmulators
        ? { NSAllowsArbitraryLoads: true }
        : { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true },
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
    // Firebase Auth 25 for Android ships Kotlin 2.4 metadata, which React Native's default
    // Kotlin 2.2 cannot read; 2.4.0 is also RNFirebase's own default. Expo picks the KSP version.
    [
      'expo-build-properties',
      {
        ios: { useFrameworks: 'dynamic' },
        android: {
          minSdkVersion: 24,
          kotlinVersion: '2.4.0',
          extraProguardRules: EXTRA_PROGUARD_RULES,
        },
      },
    ],
    'expo-router',
    [
      'expo-location',
      {
        locationWhenInUsePermission: LOCATION_WHEN_IN_USE,
        // Pocket mode (M3, src/location/pocket.ts) keeps updates that started on screen running
        // in the background: iOS's `location` background mode, Android's foreground service.
        // Both work on "When In Use". Always is never requested (spec §9), but iOS requires the
        // string to exist.
        locationAlwaysAndWhenInUsePermission: LOCATION_WHEN_IN_USE,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
        isIosBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        isAndroidBackgroundLocationEnabled: false,
        androidForegroundServiceIcon: NOTIFICATION_ICON,
      },
    ],
    'expo-task-manager',
    ['expo-notifications', { color: '#1F6F4A', icon: NOTIFICATION_ICON }],
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
    googleWebClientId: googleWebClientId(),
  },
});
