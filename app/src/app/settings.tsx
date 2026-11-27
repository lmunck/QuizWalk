/**
 * S1 Settings: account, the name players see, sign out, app version (spec §3 S1). Account
 * deletion and the privacy page arrive in M5 (m1-design §1).
 */
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { signOut, walkInProgress } from '@/auth/signIn';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { Field, Row, RowGroup, SectionLabel } from '@/components/ui';
import { errorMessage } from '@/data/errors';
import { setDisplayName } from '@/data/users';
import { usingEmulators } from '@/lib/env';
import { colors, spacing } from '@/theme/tokens';

export default function Settings() {
  const { uid, isCreator, displayName, providerName, email } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName ?? '');
  const [confirmOut, setConfirmOut] = useState<'plain' | 'walk'>();
  const [busy, setBusy] = useState(false);

  const askSignOut = async () => {
    setConfirmOut(uid && (await walkInProgress(uid)) ? 'walk' : 'plain');
  };

  const doSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
      setConfirmOut(undefined);
      router.replace('/');
    } catch (err) {
      toast(errorMessage(err, 'Could not sign out. Try again.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    if (!uid || name.trim().length === 0) return;
    try {
      await setDisplayName(uid, name);
      setEditing(false);
    } catch (err) {
      toast(errorMessage(err, 'Could not save your name.'), 'error');
    }
  };

  return (
    <Screen title="Settings">
      <View style={styles.block}>
        <SectionLabel>Account</SectionLabel>
        {isCreator ? (
          <RowGroup>
            <Row
              icon="user"
              label="Name players see"
              value={displayName ?? 'Not set'}
              onPress={() => {
                setName(displayName ?? '');
                setEditing(true);
              }}
            />
            <Row
              icon="key"
              label={`Signed in with ${providerName ?? 'an account'}`}
              detail={email}
            />
            <Row
              icon="logout"
              label="Sign out"
              destructive
              onPress={() => void askSignOut()}
              last
            />
          </RowGroup>
        ) : (
          <>
            <Txt variant="callout" color={colors.secondary}>
              {"You don't need an account to play. Sign in only to create your own walks."}
            </Txt>
            <Button
              label="Sign in to create walks"
              kind="secondary"
              onPress={() => router.push({ pathname: '/sign-in', params: { next: 'create' } })}
            />
          </>
        )}
      </View>

      <View style={styles.block}>
        <SectionLabel>About</SectionLabel>
        <RowGroup>
          <Row label="Version" value={Constants.expoConfig?.version ?? '–'} />
          <Row
            label="Location"
            detail="Used only during a walk, to unlock questions. Shared with the walk's creator only after you tap Start walk."
          />
          <Row
            label="No ads, no tracking"
            detail="QuizWalk has no ads and no analytics."
            last={!usingEmulators}
          />
          {usingEmulators ? (
            <Row label="Test build" detail="Connected to the local Firebase emulators." last />
          ) : null}
        </RowGroup>
      </View>

      <Dialog
        visible={editing}
        title="Your name"
        text="Players see it on the invite and while they wait for you to open a walk."
        onDismiss={() => setEditing(false)}
        actions={[
          { label: 'Save', onPress: () => void saveName(), disabled: name.trim().length === 0 },
          { label: 'Cancel', kind: 'ghost', onPress: () => setEditing(false) },
        ]}
      >
        <Field label="Name" value={name} onChangeText={setName} maxLength={40} autoFocus />
      </Dialog>
      <Dialog
        visible={confirmOut !== undefined}
        title="Sign out?"
        text={
          confirmOut === 'walk'
            ? 'You are in a walk on this phone. If you sign out, this phone loses its place in that walk.'
            : 'Your walks stay with your account. Sign in again to see them.'
        }
        onDismiss={() => setConfirmOut(undefined)}
        actions={[
          {
            label: 'Sign out',
            kind: 'destructive',
            loading: busy,
            onPress: () => void doSignOut(),
          },
          { label: 'Cancel', kind: 'ghost', onPress: () => setConfirmOut(undefined) },
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm + 2 },
});
