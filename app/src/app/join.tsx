/**
 * P0 join sheet. Upper-cases, ignores spaces and submits on the fifth character. Also the
 * target of qualk.dk/play?code=… links. A code already joined on this phone resumes the walk
 * (spec §3 P0).
 */
import { isValidJoinCode, JOIN_CODE_LENGTH, normalizeJoinCode } from '@qualk/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Banner } from '@/components/ui';
import { readTeam, resumeTeam } from '@/data/teams';
import { resolveJoinCode } from '@/data/users';
import { readWalk } from '@/data/walks';
import { playerHref } from '@/lib/routes';
import { markWelcomeSeen } from '@/lib/storage';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

export default function Join() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { uid } = useAuth();
  const [code, setCode] = useState(() =>
    normalizeJoinCode(params.code ?? '').slice(0, JOIN_CODE_LENGTH),
  );
  const [state, setState] = useState<'idle' | 'checking' | 'invalid' | 'offline' | 'error'>('idle');
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  const submit = async (value: string) => {
    if (!uid) return;
    if (!isValidJoinCode(value)) {
      setState('invalid');
      return;
    }
    setState('checking');
    try {
      const found = await resolveJoinCode(value);
      if (found.kind !== 'found') {
        setState(found.kind);
        return;
      }
      const walk = await readWalk(found.walkId);
      if (!walk) {
        setState('invalid');
        return;
      }
      await markWelcomeSeen();
      const team = await readTeam(walk.id, uid);
      // The same code again resumes this phone's team instead of joining twice.
      if (team?.leftAt && walk.status !== 'ended') resumeTeam(walk.id, uid);
      const resumed = team ? { ...team, leftAt: undefined } : undefined;
      router.replace(playerHref(walk, resumed));
    } catch (err) {
      console.warn('Join failed', err);
      setState('error');
    }
  };

  // A link arrives with the code filled in.
  useEffect(() => {
    if (!params.code || !isValidJoinCode(code)) return;
    const t = setTimeout(() => void submit(code), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.code, uid]);

  const onChange = (text: string) => {
    const next = normalizeJoinCode(text).slice(0, JOIN_CODE_LENGTH);
    setCode(next);
    setState('idle');
    if (next.length === JOIN_CODE_LENGTH) void submit(next);
  };

  const message =
    state === 'invalid'
      ? 'No walk has that code. Check it and try again. Codes never use 0, O, 1, I or L.'
      : state === 'offline'
        ? "You're offline. Joining needs a connection once; after that the walk works offline."
        : state === 'error'
          ? 'Something went wrong. Try again.'
          : undefined;

  return (
    <Screen modal back="close" largeTitle="Join a walk">
      <Txt variant="body" color={colors.secondary}>
        Type the 5-letter code from your invite. Scanned a QR code? Then you are already in.
      </Txt>
      <Pressable
        onPress={() => input.current?.focus()}
        accessible={false}
        style={styles.boxes}
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: JOIN_CODE_LENGTH }, (_, i) => {
          const ch = code[i] ?? '';
          const active = i === Math.min(code.length, JOIN_CODE_LENGTH - 1) && state !== 'checking';
          return (
            <View
              key={i}
              style={[
                styles.box,
                active ? styles.boxActive : null,
                state === 'invalid' ? styles.boxError : null,
              ]}
            >
              <Txt style={styles.boxText} maxFontSizeMultiplier={1.4}>
                {ch}
              </Txt>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={input}
        value={code}
        onChangeText={onChange}
        autoFocus
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        maxLength={JOIN_CODE_LENGTH + 4}
        keyboardType="default"
        returnKeyType="go"
        onSubmitEditing={() => void submit(code)}
        accessibilityLabel="Join code"
        accessibilityHint="Five letters and digits. Joins as soon as all five are typed."
        style={styles.hiddenInput}
        caretHidden
      />
      {state === 'checking' ? (
        <View style={styles.checking}>
          <ActivityIndicator color={colors.accent} />
          <Txt variant="callout" color={colors.secondary}>
            Finding the walk…
          </Txt>
        </View>
      ) : null}
      {message ? <Banner kind={state === 'offline' ? 'warning' : 'error'} text={message} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.md },
  box: {
    flex: 1,
    maxWidth: 62,
    aspectRatio: 0.82,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.accent, borderWidth: 2.5 },
  boxError: { borderColor: colors.error },
  boxText: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 36, color: colors.ink },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  checking: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
