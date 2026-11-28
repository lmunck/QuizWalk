/**
 * S1 Settings: account, the name players see, sign out, privacy, deletion, app version
 * (spec §3 S1, §13). Creators get *Delete account and all data*; participants, who have no
 * account, get *Delete my data*. Both run in Cloud Functions (spec §8) and need a connection.
 */
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { revokeAppleSignIn, SignInCancelled, signOut, walkInProgress } from '@/auth/signIn';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { MAP_ATTRIBUTION, OSM_COPYRIGHT_URL } from '@/components/MapPieces';
import { Field, Row, RowGroup, SectionLabel } from '@/components/ui';
import { deleteAccount, deleteMyData } from '@/data/callables';
import { errorMessage } from '@/data/errors';
import { setDisplayName } from '@/data/users';
import { usingEmulators } from '@/lib/env';
import { forgetWalksOnThisPhone } from '@/lib/storage';
import { stopPocketMode } from '@/location/pocket';
import { colors, spacing } from '@/theme/tokens';

const PRIVACY_URL = 'https://qualk.dk/privacy';

type Confirm =
  | { kind: 'signOut'; walk: boolean }
  | { kind: 'deleteData'; walk: boolean }
  | { kind: 'deleteAccount'; walk: boolean };

function confirmText(c: Confirm): { title: string; text: string; action: string } {
  const walk = c.walk ? 'You are in a walk on this phone. ' : '';
  switch (c.kind) {
    case 'signOut':
      return {
        title: 'Sign out?',
        text: c.walk
          ? 'You are in a walk on this phone. If you sign out, this phone loses its place in that walk.'
          : 'Your walks stay with your account. Sign in again to see them.',
        action: 'Sign out',
      };
    case 'deleteData':
      return {
        title: 'Delete your data?',
        text:
          `${walk}This removes your teams, answers and locations from every walk joined on this ` +
          'phone, and the list of walks on Home. Your teams leave the standings, also in a walk ' +
          'that is still open. This cannot be undone.',
        action: 'Delete my data',
      };
    case 'deleteAccount':
      return {
        title: 'Delete your account?',
        text:
          `${walk}All your walks are deleted with their stops, questions, teams and results, ` +
          'including a walk that is open now. Your teams in other walks, your name and your ' +
          'sign-in go too. This cannot be undone.',
        action: 'Delete everything',
      };
  }
}

export default function Settings() {
  const { uid, isCreator, displayName, providerName, email } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName ?? '');
  const [confirm, setConfirm] = useState<Confirm>();
  const [busy, setBusy] = useState(false);

  const ask = async (kind: Confirm['kind']) => {
    setConfirm({ kind, walk: !!uid && (await walkInProgress(uid)) });
  };

  const doSignOut = async () => {
    await signOut();
    router.replace('/');
  };

  const doDeleteData = async () => {
    await stopPocketMode();
    const { teams } = await deleteMyData();
    await forgetWalksOnThisPhone();
    toast(teams > 0 ? 'Your data is deleted.' : 'There was no data to delete.');
    router.replace('/');
  };

  const doDeleteAccount = async () => {
    if (providerName === 'Apple') await revokeAppleSignIn();
    await stopPocketMode();
    await deleteAccount();
    await forgetWalksOnThisPhone();
    // The account is gone on the server; this clears it on the phone and starts afresh.
    await signOut();
    toast('Your account and all its data are deleted.');
    router.replace('/');
  };

  const run = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'signOut') await doSignOut();
      else if (confirm.kind === 'deleteData') await doDeleteData();
      else await doDeleteAccount();
      setConfirm(undefined);
    } catch (err) {
      if (err instanceof SignInCancelled) {
        setConfirm(undefined);
        return;
      }
      const fallback =
        confirm.kind === 'signOut'
          ? 'Could not sign out. Try again.'
          : 'Could not delete. Check your connection and try again.';
      toast(errorMessage(err, fallback), 'error');
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

  const dialog = confirm ? confirmText(confirm) : undefined;

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
              onPress={() => void ask('signOut')}
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
        <SectionLabel>Privacy</SectionLabel>
        <RowGroup>
          <Row
            icon="info"
            label="Privacy policy"
            detail="What QuizWalk keeps, why, and for how long."
            onPress={() => void Linking.openURL(PRIVACY_URL)}
          />
          {isCreator ? (
            <Row
              icon="trash"
              label="Delete account and all data"
              detail="Your walks, their results, your teams and your sign-in."
              destructive
              onPress={() => void ask('deleteAccount')}
              last
            />
          ) : (
            <Row
              icon="trash"
              label="Delete my data"
              detail="Your teams, answers and locations. Otherwise they go 30 days after a walk ends."
              destructive
              onPress={() => void ask('deleteData')}
              last
            />
          )}
        </RowGroup>
      </View>

      <View style={styles.block}>
        <SectionLabel>About</SectionLabel>
        <RowGroup>
          <Row label="Version" value={Constants.expoConfig?.version ?? '–'} />
          <Row
            label="Location"
            detail="Used during a walk to unlock questions, and when you build one to put pins where you stand. Shared with the walk's creator only after you tap Start walk."
          />
          <Row
            label="Map data"
            detail={`Routes and place names ${MAP_ATTRIBUTION}`}
            onPress={() => void Linking.openURL(OSM_COPYRIGHT_URL)}
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
        visible={dialog !== undefined}
        title={dialog?.title ?? ''}
        text={dialog?.text}
        onDismiss={() => (busy ? undefined : setConfirm(undefined))}
        actions={[
          {
            label: dialog?.action ?? '',
            kind: 'destructive',
            loading: busy,
            onPress: () => void run(),
          },
          {
            label: 'Cancel',
            kind: 'ghost',
            disabled: busy,
            onPress: () => setConfirm(undefined),
          },
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm + 2 },
});
