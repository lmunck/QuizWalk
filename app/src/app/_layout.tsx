// Background tasks are defined before anything else runs (src/tasks.ts).
import '@/tasks';

import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { EmptyState } from '@/components/ui';
import { ToastProvider } from '@/components/Toast';
import { useNotificationRouting } from '@/lib/push';
import { releaseStalePocketMode } from '@/location/pocket';
import { colors } from '@/theme/tokens';

// The splash stays up until fonts and the anonymous sign-in are ready (Gate hides it).
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  useEffect(() => releaseStalePocketMode(), []);
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <AuthProvider>
          <ToastProvider>{fontsLoaded || fontError ? <Gate /> : <Loading />}</ToastProvider>
        </AuthProvider>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Join codes can only be resolved by a signed-in user (rules), so nothing renders until the
 * anonymous sign-in has finished (m1-design §7).
 */
function Gate() {
  const { uid, loading, error } = useAuth();
  const ready = (!loading && !!uid) || !!error;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  useNotificationRouting(!loading && !!uid);
  if (error && !uid) {
    return (
      <View style={styles.center}>
        <EmptyState icon="offline" title="No connection" text={error} />
      </View>
    );
  }
  if (loading || !uid) return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="join"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="sign-in"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      <Stack.Screen name="play/[walkId]/question" options={{ gestureEnabled: false }} />
    </Stack>
  );
}

function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: 24,
  },
});
