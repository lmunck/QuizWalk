// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*', 'ios/*', 'android/*']),
  expoConfig,
  {
    // docs/m1-design.md §3: routes and components never talk to Firebase. Data comes from
    // src/data/ hooks; this is the boundary that decays first under time pressure.
    files: ['src/app/**', 'src/components/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@react-native-firebase/*'],
              message: 'Screens and components get data from src/data/ (m1-design §3).',
            },
          ],
        },
      ],
    },
  },
]);
