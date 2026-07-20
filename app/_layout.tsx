import '@/lib/theme/runtime-styles';

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppSplashScreen } from '@/components/splash/app-splash-screen';
import { StripeWrapper } from '@/components/stripe-wrapper';
import { AssistantHistoryProvider } from '@/lib/assistant-history';
import { isBootstrapReady, subscribeBootstrap } from '@/lib/bootstrap-signal';
import { useNotificationTapHandler } from '@/lib/push/notification-handler';
import { initRealtime } from '@/lib/realtime/socket';
import {
  AppThemeProvider,
  useAppTheme,
} from '@/lib/theme/theme-provider';
import { ToastProvider } from '@/lib/toast';

// Keep the OS splash visible until the themed JS splash overlay is ready.
void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <RootLayoutContent />
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutContent() {
  const { colors, isHydrated, resolvedTheme } = useAppTheme();
  const [bootReady, setBootReady] = useState(() => isBootstrapReady());
  const [showOverlay, setShowOverlay] = useState(true);
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const ready = bootReady && isHydrated;

  const navigationTheme = useMemo(() => {
    const base = resolvedTheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: resolvedTheme === 'dark',
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
        notification: colors.danger,
      },
    };
  }, [colors, resolvedTheme]);

  // Mount the global push-notification tap handler. No-op on web.
  useNotificationTapHandler();

  useEffect(() => {
    const unsubscribe = subscribeBootstrap(() => setBootReady(true));
    return unsubscribe;
  }, []);

  useEffect(() => initRealtime(), []);

  // Keep Android system/overscroll surfaces synchronized with the theme.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(
      () => undefined,
    );
    if (typeof document !== 'undefined') {
      document.documentElement.style.backgroundColor = colors.background;
      document.documentElement.style.colorScheme = resolvedTheme;
      document.body.style.backgroundColor = colors.background;
    }
  }, [colors.background, resolvedTheme]);

  // Do not reveal the native splash until the saved preference is known.
  useEffect(() => {
    if (!isHydrated) return;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [isHydrated]);

  useEffect(() => {
    if (!ready) return;
    const animation = Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setShowOverlay(false);
    });
    return () => animation.stop();
  }, [overlayOpacity, ready]);

  return (
    <AssistantHistoryProvider>
      <ThemeProvider value={navigationTheme}>
        <ToastProvider>
          <StripeWrapper>
            <Stack
              initialRouteName="index"
              screenOptions={{
                contentStyle: { backgroundColor: colors.background },
              }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="(auth)/signup"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(auth)/signup-email"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(auth)/signin"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(auth)/verify-email"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(auth)/forgot-password"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(auth)/reset-password"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(onboarding)/plan"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(onboarding)/connect"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="oauth/[provider]"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(onboarding)/openai-key"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(chat)/chat"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(stack)/settings"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(stack)/edit-profile"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(stack)/chats"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(stack)/history"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(stack)/hubspot"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(stack)/ghl"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="(stack)/reminders"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="modal"
                options={{ presentation: 'modal', title: 'Voice Concierge' }}
              />
            </Stack>
            <StatusBar
              backgroundColor={colors.background}
              style={resolvedTheme === 'dark' ? 'light' : 'dark'}
            />
          </StripeWrapper>
        </ToastProvider>
      </ThemeProvider>

      {showOverlay ? (
        <Animated.View
          pointerEvents={ready ? 'none' : 'auto'}
          style={[
            StyleSheet.absoluteFill,
            styles.overlay,
            { opacity: overlayOpacity },
          ]}>
          <AppSplashScreen />
        </Animated.View>
      ) : null}
    </AssistantHistoryProvider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 1000,
  },
});
