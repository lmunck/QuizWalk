/** A short notice at the top of the screen, for writes that failed and other one-liners. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { onWriteError } from '@/data/errors';
import { colors, radius, spacing } from '@/theme/tokens';

import { Icon } from './Icon';
import { Txt } from './Txt';

type Show = (message: string, kind?: 'error' | 'info') => void;
const ToastContext = createContext<Show>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; kind: 'error' | 'info' }>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback<Show>((message, kind = 'info') => {
    setToast({ message, kind });
    AccessibilityInfo.announceForAccessibility(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(undefined), 4_000);
  }, []);

  useEffect(() => onWriteError((m) => show(m, 'error')), [show]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <View pointerEvents="none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
          <View style={[styles.toast, toast.kind === 'error' ? styles.error : null]}>
            <Icon
              name={toast.kind === 'error' ? 'warning' : 'info'}
              size={20}
              color={colors.white}
            />
            <Txt variant="calloutStrong" color={colors.white} style={styles.text}>
              {toast.message}
            </Txt>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): Show {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    maxWidth: 520,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  error: { backgroundColor: colors.errorText },
  text: { flexShrink: 1 },
});
