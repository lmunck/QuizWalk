/**
 * G1 sign-in, reached only from Create a walk / New quiz walk (spec §2). The first sign-in
 * ends with one field, "Your name, as players see it", prefilled when a name came through.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import {
  SignInCancelled,
  SignInRefused,
  signInForTesting,
  signInWithApple,
  signInWithGoogle,
  type SignInResult,
} from '@/auth/signIn';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Banner, Field } from '@/components/ui';
import { errorMessage } from '@/data/errors';
import { readUserDoc, setDisplayName } from '@/data/users';
import { usingEmulators } from '@/lib/env';
import { colors, radius, spacing } from '@/theme/tokens';

export default function SignIn() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { uid, isCreator, displayName, userLoaded } = useAuth();
  const [step, setStep] = useState<'choose' | 'name'>('choose');
  const [busy, setBusy] = useState<'apple' | 'google' | 'test' | 'name'>();
  const [error, setError] = useState<string>();
  const [name, setName] = useState('');
  const [signedUid, setSignedUid] = useState<string>();
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const done = () => {
    if (next === 'create') router.replace('/create');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // Already signed in with a name: nothing to do here.
  useEffect(() => {
    if (step === 'choose' && isCreator && userLoaded && displayName) done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreator, userLoaded, displayName]);

  const run = async (which: 'apple' | 'google' | 'test', fn: () => Promise<SignInResult>) => {
    setBusy(which);
    setError(undefined);
    try {
      const res = await fn();
      // A returning creator already has a name; only a first sign-in asks for it.
      const existing = (await readUserDoc(res.uid).catch(() => undefined))?.displayName;
      if (existing) {
        done();
        return;
      }
      setSignedUid(res.uid);
      setName(res.suggestedName ?? '');
      setStep('name');
    } catch (err) {
      if (err instanceof SignInCancelled) return;
      if (err instanceof SignInRefused) setError(err.message);
      else
        setError(errorMessage(err, 'Sign-in did not work. Check your connection and try again.'));
    } finally {
      setBusy(undefined);
    }
  };

  // A creator who signed in before but never saved a name is asked for it, and only for it.
  const nameUid = signedUid ?? (isCreator ? uid : undefined);
  const askName = step === 'name' || (isCreator && userLoaded && !displayName);

  const saveName = async () => {
    if (!nameUid) return;
    if (name.trim().length === 0) {
      setError('Add the name players will see.');
      return;
    }
    setBusy('name');
    try {
      await setDisplayName(nameUid, name);
      done();
    } catch (err) {
      setError(errorMessage(err, 'Could not save your name. Try again.'));
    } finally {
      setBusy(undefined);
    }
  };

  if (askName) {
    return (
      <Screen
        modal
        back="close"
        largeTitle="What should players call you?"
        footer={
          <Button
            label="Continue"
            large
            loading={busy === 'name'}
            onPress={() => void saveName()}
          />
        }
      >
        <Txt variant="body" color={colors.secondary}>
          Players see it on the invite and while they wait: “Waiting for {name.trim() || 'you'} to
          open the walk”. You can change it in Settings.
        </Txt>
        <Field
          label="Your name, as players see it"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(undefined);
          }}
          autoFocus
          autoCapitalize="words"
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={() => void saveName()}
          error={error}
        />
      </Screen>
    );
  }

  return (
    <Screen modal back="close" largeTitle="Sign in to create walks">
      <Txt variant="body" color={colors.secondary}>
        Your walks are kept with your account so you can edit them, open them and see the results.
        Players never need an account.
      </Txt>
      {error ? <Banner kind="error" text={error} /> : null}
      <View style={styles.buttons}>
        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={28}
            style={styles.apple}
            onPress={() => void run('apple', signInWithApple)}
          />
        ) : null}
        <Button
          label="Continue with Google"
          kind="secondary"
          large
          loading={busy === 'google'}
          onPress={() => void run('google', signInWithGoogle)}
        />
        {usingEmulators ? (
          <View style={styles.dev}>
            <Txt variant="caption" color={colors.muted}>
              Emulator build: Apple and Google need the real Firebase config. Use a test account
              instead.
            </Txt>
            <Button
              label="Sign in as test creator"
              kind="ghost"
              loading={busy === 'test'}
              onPress={() => void run('test', () => signInForTesting('Anders'))}
            />
          </View>
        ) : null}
      </View>
      <Txt variant="caption" color={colors.muted}>
        If you have joined a walk on this phone, it stays yours after signing in.
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: spacing.sm + 4, marginTop: spacing.sm },
  apple: { height: 56, width: '100%' },
  dev: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.controlBorder,
    gap: spacing.xs,
  },
});
