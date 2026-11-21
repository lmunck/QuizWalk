import type { ConfigContext, ExpoConfig } from 'expo/config';

// Identity from docs/v1-spec.md §1. The bundle ID reuses the retired App Store record.
const IOS_BUNDLE_ID = 'com.lmunck.Qualk';
const ANDROID_PACKAGE = 'com.lmunck.qualk';
const LINK_HOST = 'qualk.dk';

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
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: ANDROID_PACKAGE,
    adaptiveIcon: {
      backgroundColor: '#F4F6F1',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: LINK_HOST, pathPrefix: '/play' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: ['expo-router'],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: 'b4e33e0a-212e-4313-8c1b-90eff42dd744',
    },
  },
});
