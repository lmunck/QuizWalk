/**
 * C2 Create: two equal choices, Generate for me (the map screen) and Build it myself (spec §3
 * C2). Build it myself asks only for a title, then opens the route builder with a Start pin at
 * the creator's location.
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
import { Card, Field } from '@/components/ui';
import { createDraft } from '@/data/walks';
import { currentPlace } from '@/location/places';
import { colors, radius, spacing } from '@/theme/tokens';

export default function Create() {
  const { uid, displayName } = useAuth();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [manual, setManual] = useState(false);

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

  if (!manual) {
    return (
      <Screen back="close" largeTitle="New quiz walk">
        <Choice
          icon="sparkle"
          title="Generate for me"
          text="Choose an area on the map. The route, stops and questions are made for you, and you can change them all."
          onPress={() => router.replace('/generate')}
        />
        <Choice
          icon="edit"
          title="Build it myself"
          text="Put the stops where you want them and write your own questions."
          onPress={() => setManual(true)}
        />
      </Screen>
    );
  }

  return (
    <Screen
      back="back"
      onBack={() => setManual(false)}
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

function Choice({
  icon,
  title,
  text,
  onPress,
}: {
  icon: 'sparkle' | 'edit';
  title: string;
  text: string;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} accessibilityLabel={`${title}. ${text}`} style={styles.choice}>
      <View style={styles.stepIcon}>
        <Icon name={icon} size={22} color={colors.accent} />
      </View>
      <View style={styles.flex}>
        <Txt variant="subheading">{title}</Txt>
        <Txt variant="callout" color={colors.secondary}>
          {text}
        </Txt>
      </View>
      <Icon name="chevronRight" size={20} color={colors.secondary} />
    </Card>
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
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4, minHeight: 96 },
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
