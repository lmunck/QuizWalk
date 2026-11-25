/** The invite: code, QR and link, and the system share sheet with a ready-made message (C6). */
import { joinLink } from '@qualk/shared';
import * as Clipboard from 'expo-clipboard';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { Card } from '@/components/ui';
import type { Walk } from '@/data/walks';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

export async function shareInvite(w: Walk) {
  if (!w.joinCode) return;
  const lines = [
    `Join my quiz walk “${w.title}”!`,
    w.whenText ? `When: ${w.whenText}` : undefined,
    `Code: ${w.joinCode}`,
    joinLink(w.joinCode),
    'Get the QuizWalk app, then tap the link or type the code.',
  ].filter(Boolean);
  await Share.share({ message: lines.join('\n') });
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
