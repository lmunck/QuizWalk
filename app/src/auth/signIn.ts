/**
 * Creator sign-in (spec §2, m1-design §6). Apple on iOS, Google on both. The anonymous user is
 * linked so anything joined on this phone survives; if the account already exists the phone
 * switches to it, unless a walk is in progress here.
 */
import {
  AppleAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  revokeToken,
  signInAnonymously,
  signInWithCredential,
  signOut as firebaseSignOut,
  type AuthCredential,
} from '@react-native-firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
} from 'react-native-nitro-google-signin';

import { doc, getDoc } from '@react-native-firebase/firestore';

import { auth, db, usingEmulators } from '@/data/firebase';
import { readUserDoc } from '@/data/users';
import { googleWebClientId } from '@/lib/env';

export class SignInRefused extends Error {}
export class SignInCancelled extends Error {}

export interface SignInResult {
  uid: string;
  /** A name the provider handed over, to prefill "Your name, as players see it". */
  suggestedName?: string;
}

let googleConfigured = false;
function configureGoogle() {
  if (googleConfigured) return;
  GoogleOneTapSignIn.configure({ webClientId: googleWebClientId });
  googleConfigured = true;
}

/** Whether this phone has a walk joined and not yet ended (m1-design §6). */
export async function walkInProgress(uid: string): Promise<boolean> {
  const user = await readUserDoc(uid).catch(() => undefined);
  for (const walkId of user?.playing ?? []) {
    try {
      const snap = await getDoc(doc(db, 'walks', walkId));
      const status = (snap.data() as { status?: string } | undefined)?.status;
      if (status === 'ready' || status === 'open') return true;
    } catch {
      // An unreadable walk does not hold sign-in up.
    }
  }
  return false;
}

async function finish(credential: AuthCredential, suggestedName?: string): Promise<SignInResult> {
  const current = auth.currentUser;
  if (current?.isAnonymous) {
    try {
      const res = await linkWithCredential(current, credential);
      return { uid: res.user.uid, suggestedName };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'auth/credential-already-in-use' && code !== 'auth/email-already-in-use') {
        throw err;
      }
      // The account exists, so the anonymous user cannot be merged into it. Switching would
      // orphan this phone's team, so not while a walk is in progress.
      if (await walkInProgress(current.uid)) {
        throw new SignInRefused('Finish or leave your walk first, then sign in.');
      }
    }
  }
  const res = await signInWithCredential(auth, credential);
  return { uid: res.user.uid, suggestedName };
}

export async function signInWithApple(): Promise<SignInResult> {
  const rawNonce = Crypto.randomUUID() + Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let apple: AppleAuthentication.AppleAuthenticationCredential;
  try {
    apple = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new SignInCancelled();
    throw err;
  }
  if (!apple.identityToken) throw new Error('Apple did not return an identity token.');
  // Apple hands over the name only on the very first sign-in, and sometimes not at all.
  const name = [apple.fullName?.givenName, apple.fullName?.familyName]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(' ');
  const credential = AppleAuthProvider.credential(apple.identityToken, rawNonce, {
    givenName: apple.fullName?.givenName ?? null,
    familyName: apple.fullName?.familyName ?? null,
  });
  return finish(credential, name || undefined);
}

export async function signInWithGoogle(): Promise<SignInResult> {
  configureGoogle();
  await GoogleOneTapSignIn.checkPlayServices();
  let response = await GoogleOneTapSignIn.signIn();
  if (isNoSavedCredentialFoundResponse(response)) {
    response = await GoogleOneTapSignIn.createAccount();
  }
  if (isNoSavedCredentialFoundResponse(response)) {
    response = await GoogleOneTapSignIn.presentExplicitSignIn();
  }
  if (isCancelledResponse(response)) throw new SignInCancelled();
  if (!isSuccessResponse(response)) throw new SignInCancelled();
  const { idToken, user } = response.data;
  const credential = GoogleAuthProvider.credential(idToken);
  return finish(credential, user.name ?? user.givenName ?? undefined);
}

/**
 * Emulator builds only: the Auth emulator accepts an unsigned Google token, so the creator
 * flow can be tested on a simulator without a Google account.
 */
export async function signInForTesting(name: string): Promise<SignInResult> {
  if (!usingEmulators) throw new Error('Only available with the emulators.');
  const sub = name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'tester';
  const fakeToken = JSON.stringify({
    sub: `test-${sub}`,
    email: `${sub}@example.com`,
    email_verified: true,
    name,
  });
  return finish(GoogleAuthProvider.credential(fakeToken), name);
}

/**
 * Before deleting an account made with Sign in with Apple: Apple asks apps to revoke the
 * user's tokens when an account is deleted. That needs a fresh authorization code, so Apple's
 * sheet shows once more. Closing it throws SignInCancelled and nothing is deleted. Any other
 * failure (for example Firebase not set up to revoke) is logged, so deletion never depends on it.
 */
export async function revokeAppleSignIn(): Promise<void> {
  if (Platform.OS !== 'ios' || usingEmulators) return;
  let code: string | null;
  try {
    code = (await AppleAuthentication.signInAsync({ requestedScopes: [] })).authorizationCode;
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new SignInCancelled();
    console.warn('Apple did not confirm, so its token was not revoked', err);
    return;
  }
  if (!code) return;
  try {
    await revokeToken(auth, code);
  } catch (err) {
    console.warn('Apple token not revoked', err);
  }
}

/** Signs out and back in anonymously, so the app always has a user (rules need one). */
export async function signOut(): Promise<void> {
  try {
    configureGoogle();
    await GoogleOneTapSignIn.signOut();
  } catch {
    // Not signed in with Google on this phone.
  }
  await firebaseSignOut(auth);
  await signInAnonymously(auth);
}
