#!/bin/sh
# Registers the iOS and Android apps in the Firebase project (spec §18, M1) and downloads their
# config files into app/. Safe to run again: existing registrations are reused.
#
#   sh scripts/firebase-apps.sh
#
# Needs `npx firebase login` as an owner of the project. The config files hold no secrets and
# are committed (spec §18). Once both are in app/, builds use the real project instead of the
# local emulators (app/app.config.ts).
set -e
PROJECT=qualk-a173e
IOS_BUNDLE=com.lmunck.Qualk
ANDROID_PACKAGE=com.lmunck.qualk
cd "$(dirname "$0")/.."

app_id() {
  # $1 = IOS | ANDROID, $2 = bundle id or package name, $3 = display name
  npx firebase apps:list "$1" --project "$PROJECT" --json 2>/dev/null |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s).result||[];const a=r.find(x=>x.bundleId==='$2'||x.packageName==='$2'||x.displayName==='$3');process.stdout.write(a?a.appId:'')})"
}

IOS_ID=$(app_id IOS "$IOS_BUNDLE" "QuizWalk iOS")
if [ -z "$IOS_ID" ]; then
  npx firebase apps:create IOS "QuizWalk iOS" --bundle-id "$IOS_BUNDLE" --project "$PROJECT"
  IOS_ID=$(app_id IOS "$IOS_BUNDLE" "QuizWalk iOS")
fi
ANDROID_ID=$(app_id ANDROID "$ANDROID_PACKAGE" "QuizWalk Android")
if [ -z "$ANDROID_ID" ]; then
  npx firebase apps:create ANDROID "QuizWalk Android" --package-name "$ANDROID_PACKAGE" --project "$PROJECT"
  ANDROID_ID=$(app_id ANDROID "$ANDROID_PACKAGE" "QuizWalk Android")
fi

# Optional: the Android signing SHA-1 (expo.dev → project → Credentials → Android), needed for
# Google sign-in on Android. Pass it as SHA1=AA:BB:… sh scripts/firebase-apps.sh
if [ -n "$SHA1" ]; then
  npx firebase apps:android:sha:create "$ANDROID_ID" "$SHA1" --project "$PROJECT" || true
fi

npx firebase apps:sdkconfig IOS "$IOS_ID" --project "$PROJECT" -o app/GoogleService-Info.plist
npx firebase apps:sdkconfig ANDROID "$ANDROID_ID" --project "$PROJECT" -o app/google-services.json
echo "iOS app $IOS_ID and Android app $ANDROID_ID: config files written to app/."
