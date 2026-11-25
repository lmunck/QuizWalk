/**
 * C2 Create, "Build it myself": a title, then the route builder with a Start pin at the
 * creator's location (spec §3 C2). "Generate for me" is hidden until M4.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { Field } from '@/components/ui';
import { createDraft } from '@/data/walks';
import { currentPlace } from '@/location/places';
import { colors, radius, spacing } from '@/theme/tokens';

export default function Create() {
  const { uid, displayName } = useAuth();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const create = async () => {
    if (!uid) return;
    if (title.trim().length === 0) {
      setError('Give the walk a title. You can change it later.');
      return;
    }
    setBusy(true);
    try {
      const here = await currentPlace();
      if (!here.located) toast('No location yet: drag the Start pin to where teams meet.');
      const walkId = createDraft({
        uid,
        ownerName: displayName ?? '',
        title,
        start: here.location,
        startLabel: here.label,
      });
      router.replace(`/walk/${walkId}/route`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back="close"
      largeTitle="New quiz walk"
      footer={<Button label="Start building" large loading={busy} onPress={() => void create()} />}
    >
      <Field
        label="Title"
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          setError(undefined);
        }}
        placeholder="Harbour history"
        autoFocus
        maxLength={80}
        returnKeyType="next"
        onSubmitEditing={() => void create()}
        error={error}
        helper="Players see it when they join."
      />
      <View style={styles.how}>
        <Step
          icon="pin"
          text="The Start pin goes where you are now. Teams meet there; drag it anywhere."
        />
        <Step
          icon="plus"
          text="Add stops: long-press the map, search for a place, or tap Add stop here while walking the route."
        />
        <Step
          icon="edit"
          text="Write a question with 2–4 answers for each stop, then preview and publish."
        />
      </View>
    </Screen>
  );
}

function Step({ icon, text }: { icon: 'pin' | 'plus' | 'edit'; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepIcon}>
        <Icon name={icon} size={20} color={colors.accent} />
      </View>
      <Txt variant="callout" color={colors.secondary} style={styles.flex}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  how: { gap: spacing.md, marginTop: spacing.sm },
  step: { flexDirection: 'row', gap: spacing.md - 4, alignItems: 'center' },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.successFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
