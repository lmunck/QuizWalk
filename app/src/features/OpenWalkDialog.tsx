/**
 * The Open walk confirm (spec §3 C6). Opening cannot be undone, and the creator picks how long
 * the walk stays open: Today (12 h, default) or This week (7 days). Also asks, once, for
 * notifications: "So you hear when a team is stuck or everyone has finished" (§11).
 */
import { formatDayDate, OPEN_FOR_MS, type WalkOpenFor } from '@qualk/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { ChoiceCard } from '@/components/ui';
import { problemsFrom, openWalk } from '@/data/callables';
import { errorMessage } from '@/data/errors';
import { setUserPushToken } from '@/data/users';
import { pushPermission, pushTokenIfAllowed, requestPushToken } from '@/lib/push';
import { colors, spacing } from '@/theme/tokens';

export function OpenWalkDialog({
  visible,
  walkId,
  onDismiss,
  onOpened,
}: {
  visible: boolean;
  walkId: string;
  onDismiss: () => void;
  onOpened: () => void;
}) {
  const { uid } = useAuth();
  const [openFor, setOpenFor] = useState<WalkOpenFor>('day');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string[]>();
  const [askPush, setAskPush] = useState(false);
  const [weekEnds] = useState(() => formatDayDate(Date.now() + OPEN_FOR_MS.week));

  const open = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await openWalk(walkId, openFor);
      const permission = await pushPermission();
      if (permission === 'undetermined') {
        setAskPush(true);
        return;
      }
      // Already allowed (an earlier walk, or Settings): keep the token current, without asking.
      if (permission === 'granted' && uid) {
        void pushTokenIfAllowed().then((token) => token && setUserPushToken(uid, token));
      }
      onOpened();
    } catch (err) {
      const problems = problemsFrom(err);
      setError(
        problems.length > 0
          ? problems.map((p) => p.message)
          : [errorMessage(err, 'Could not open the walk. Check your connection and try again.')],
      );
    } finally {
      setBusy(false);
    }
  };

  const finishPush = async (allow: boolean) => {
    if (allow) {
      const res = await requestPushToken();
      if (res.token && uid) setUserPushToken(uid, res.token);
    }
    setAskPush(false);
    onOpened();
  };

  return (
    <>
      <Dialog
        visible={visible && !askPush}
        title="Open the walk?"
        text="Teams can start as soon as it is open. This can't be undone, but you can end the walk early."
        onDismiss={onDismiss}
        actions={[
          { label: 'Open walk', onPress: () => void open(), loading: busy },
          { label: 'Not yet', kind: 'ghost', onPress: onDismiss },
        ]}
      >
        <View style={styles.choices}>
          <ChoiceCard
            icon="clock"
            title="Today"
            text="Everyone walks at the same time. Ends by itself after 12 hours."
            selected={openFor === 'day'}
            onPress={() => setOpenFor('day')}
          />
          <ChoiceCard
            icon="walk"
            title="This week"
            text={`Teams walk when it suits them. Ends by itself on ${weekEnds}.`}
            selected={openFor === 'week'}
            onPress={() => setOpenFor('week')}
          />
        </View>
        {error ? (
          <View style={styles.errors}>
            {error.map((e, i) => (
              <View key={i} style={styles.errorRow}>
                <Icon name="warning" size={18} color={colors.errorText} />
                <Txt variant="callout" color={colors.errorText} style={styles.flex}>
                  {e}
                </Txt>
              </View>
            ))}
          </View>
        ) : null}
      </Dialog>
      <Dialog
        visible={visible && askPush}
        title="The walk is open"
        text="Get a notification when a team reports a blocked way, or when everyone has finished and it is time to end the walk?"
        onDismiss={() => void finishPush(false)}
        actions={[
          { label: 'Allow notifications', onPress: () => void finishPush(true) },
          { label: 'Not now', kind: 'ghost', onPress: () => void finishPush(false) },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  choices: { gap: spacing.sm + 2, marginTop: spacing.xs },
  errors: { gap: spacing.xs },
  errorRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
});
