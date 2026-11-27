/**
 * The invite: code, QR and link, and the system share sheet with a ready-made message and a
 * picture of the code (C6, and the Invite pill on C7).
 */
import { inviteLines, joinLink } from '@qualk/shared';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Icon } from '@/components/Icon';
import { InviteCard, OffscreenCard, useCardShot } from '@/components/ShareCard';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { Card } from '@/components/ui';
import type { Walk } from '@/data/walks';
import { shareImage } from '@/features/shareCard';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

function inviteMessage(w: Walk & { joinCode: string }): string {
  return [
    `Join my quiz walk “${w.title}”!`,
    w.whenText ? `When: ${w.whenText}` : undefined,
    `Code: ${w.joinCode}`,
    joinLink(w.joinCode),
    'Get the QuizWalk app, then tap the link or type the code.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Share invite. On iOS one share carries the message, the link and the picture. Android's
 * share sheet takes either text or a file, so there the message goes alone and the picture
 * has its own button (`image` from `useInvite`).
 */
async function shareInvite(w: Walk, imageUri?: string) {
  if (!w.joinCode) return;
  const message = inviteMessage({ ...w, joinCode: w.joinCode });
  await Share.share(Platform.OS === 'ios' && imageUri ? { message, url: imageUri } : { message });
}

/**
 * The invite card, drawn off-screen for capture, and the two ways to share it. `card` goes
 * into the screen outside any ScrollView.
 */
export function useInvite(w: Walk | undefined) {
  const { ref, capture } = useCardShot();
  const toast = useToast();
  const [busy, setBusy] = useState<'invite' | 'image'>();
  // A second tap while the share sheet opens would ask for a second sheet.
  const running = useRef(false);

  const run = useCallback(async (kind: 'invite' | 'image', task: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(kind);
    try {
      await task();
    } finally {
      running.current = false;
      setBusy(undefined);
    }
  }, []);

  const invite = useCallback(
    () =>
      run('invite', async () => {
        if (!w) return;
        // The picture is a bonus: if it cannot be made, the text and link still go.
        let uri: string | undefined;
        if (Platform.OS === 'ios') uri = await capture().catch(() => undefined);
        await shareInvite(w, uri);
      }),
    [run, w, capture],
  );

  const image = useCallback(
    () =>
      run('image', async () => {
        try {
          await shareImage(await capture(), 'Share invite');
        } catch (err) {
          console.warn('Sharing the invite picture failed', err);
          toast('Could not make the picture. Try again.', 'error');
        }
      }),
    [run, capture, toast],
  );

  const lines = inviteLines(w?.whenText);
  const card =
    w && w.joinCode ? (
      <OffscreenCard shotRef={ref}>
        <InviteCard
          title={w.title}
          code={w.joinCode}
          link={joinLink(w.joinCode)}
          when={lines.when}
          how={lines.how}
        />
      </OffscreenCard>
    ) : null;

  return { card, invite, image, busy };
}

export function CodeCard({ walk }: { walk: Walk }) {
  const toast = useToast();
  if (!walk.joinCode) return null;
  const link = joinLink(walk.joinCode);
  return (
    <Card dark style={styles.codeCard}>
      <Txt variant="label" color={colors.onInkMuted} caps>
        Join code
      </Txt>
      <Pressable
        onPress={() => {
          void Clipboard.setStringAsync(walk.joinCode!);
          toast('Code copied');
        }}
        accessibilityRole="button"
        accessibilityLabel={`Join code ${walk.joinCode.split('').join(' ')}. Copy.`}
      >
        <Txt style={styles.code} color={colors.white} maxFontSizeMultiplier={1.3}>
          {walk.joinCode}
        </Txt>
      </Pressable>
      <View style={styles.qr} accessibilityLabel="QR code for the join link" accessible>
        <QRCode value={link} size={168} color={colors.ink} backgroundColor={colors.white} />
      </View>
      <Pressable
        onPress={() => {
          void Clipboard.setStringAsync(link);
          toast('Link copied');
        }}
        accessibilityRole="button"
        style={styles.linkRow}
      >
        <Txt variant="caption" color={colors.onInkMuted}>
          {link.replace('https://', '')}
        </Txt>
        <Icon name="copy" size={16} color={colors.onInkMuted} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  codeCard: {
    alignItems: 'center',
    gap: spacing.md - 2,
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
  },
  code: { fontFamily: fonts.heading, fontSize: 46, lineHeight: 52, letterSpacing: 8 },
  qr: { padding: spacing.md - 4, backgroundColor: colors.white, borderRadius: radius.md },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
});
