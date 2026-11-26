/** Sharing a captured card through the system share sheet (spec §3 C6, C9, P5, P6). */
import * as Sharing from 'expo-sharing';
import { useCallback, useRef, useState } from 'react';

import { useCardShot } from '@/components/ShareCard';
import { useToast } from '@/components/Toast';

/** Opens the share sheet for a PNG on this phone. Resolves when the sheet closes. */
export async function shareImage(uri: string, dialogTitle: string): Promise<void> {
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle });
}

/**
 * Everything a screen needs to share one card: the ref for its `OffscreenCard`, a busy flag
 * for the button, and `share`, which captures the card and opens the share sheet.
 */
export function useShareCard(dialogTitle: string) {
  const { ref, capture } = useCardShot();
  const toast = useToast();
  const [sharing, setSharing] = useState(false);
  // A second tap while the share sheet opens would ask for a second sheet.
  const running = useRef(false);
  const share = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setSharing(true);
    try {
      await shareImage(await capture(), dialogTitle);
    } catch (err) {
      console.warn('Sharing the card failed', err);
      toast('Could not make the picture. Try again.', 'error');
    } finally {
      running.current = false;
      setSharing(false);
    }
  }, [capture, dialogTitle, toast]);
  return { shotRef: ref, sharing, share };
}
