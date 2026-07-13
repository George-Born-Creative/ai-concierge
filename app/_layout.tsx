import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppSplashScreen } from '@/components/splash/app-splash-screen';
import { StripeWrapper } from '@/components/stripe-wrapper';
import { APP_BG } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AssistantHistoryProvider } from '@/lib/assistant-history';
import { isBootstrapReady, subscribeBootstrap } from '@/lib/bootstrap-signal';
import { useNotificationTapHandler } from '@/lib/push/notification-handler';
import { initRealtime } from '@/lib/realtime/socket';
import { ToastProvider } from '@/lib/toast';

// Keep the Android system bars painted with the app background so the
// status-bar area never shows a different color from the page.
void SystemUI.setBackgroundColorAsync(APP_BG).catch(() => undefined);

// Keep the OS splash visible until the JS splash overlay is mounted, then we
// take over from JS so the dots logo can be shown instead of a static PNG.
void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [bootReady, setBootReady] = useState(() => isBootstrapReady());
  const [showOverlay, setShowOverlay] = useState(() => !isBootstrapReady());
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  // Mount the global push-notification tap handler. No-op on web; on native
  // it routes a reminder push tap to /(stack)/reminders?focus=<id>.
  useNotificationTapHandler();

  // Listen for the bootstrap signal from `app/index.tsx`.
  useEffect(() => {
    const unsubscribe = subscribeBootstrap(() => setBootReady(true));
    return unsubscribe;
  }, []);

  // Open the realtime socket while signed in (reconnects and follows sign-in /
  // sign-out via the session store).
  useEffect(() => initRealtime(), []);

  // As soon as the JS overlay paints, hide the native splash. This avoids the
  // double-flash you'd otherwise see (native logo → JS dots → app).
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  // Fade the JS overlay out once bootstrap is done, then unmount it.
  useEffect(() => {
    if (!bootReady) return;
    const animation = Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setShowOverlay(false);
    });
    return () => animation.stop();
  }, [bootReady, overlayOpacity]);

  return (
    <SafeAreaProvider>
      <AssistantHistoryProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <ToastProvider>
            <StripeWrapper>
              <Stack
                initialRouteName="index"
                screenOptions={{ contentStyle: { backgroundColor: APP_BG } }}>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)/signup" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)/signup-email" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)/signin" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)/verify-email" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)/forgot-password" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)/reset-password" options={{ headerShown: false }} />
                <Stack.Screen name="(onboarding)/plan" options={{ headerShown: false }} />
                <Stack.Screen name="(onboarding)/connect" options={{ headerShown: false }} />
                <Stack.Screen name="oauth/[provider]" options={{ headerShown: false }} />
                <Stack.Screen name="(onboarding)/openai-key" options={{ headerShown: false }} />
                <Stack.Screen name="(chat)/chat" options={{ headerShown: false }} />
                <Stack.Screen name="(stack)/settings" options={{ headerShown: false }} />
                <Stack.Screen name="(stack)/edit-profile" options={{ headerShown: false }} />
                <Stack.Screen name="(stack)/chats" options={{ headerShown: false }} />
                <Stack.Screen name="(stack)/history" options={{ headerShown: false }} />
                <Stack.Screen name="(stack)/hubspot" options={{ headerShown: false }} />
                <Stack.Screen name="(stack)/ghl" options={{ headerShown: false }} />
                <Stack.Screen name="(stack)/reminders" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Voice Concierge' }} />
              </Stack>
              <StatusBar style="dark" />
            </StripeWrapper>
          </ToastProvider>
        </ThemeProvider>

        {showOverlay && (
          <Animated.View
            pointerEvents={bootReady ? 'none' : 'auto'}
            style={[StyleSheet.absoluteFill, styles.overlay, { opacity: overlayOpacity }]}>
            <AppSplashScreen />
          </Animated.View>
        )}
      </AssistantHistoryProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    // Sits above the navigation stack so the dots cover whatever screen is
    // mounting underneath while session hydration runs.
    zIndex: 1000,
  },
});
