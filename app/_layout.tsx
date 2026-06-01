import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { AppSplashScreen } from '@/components/splash/app-splash-screen';
import { StripeWrapper } from '@/components/stripe-wrapper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AssistantHistoryProvider } from '@/lib/assistant-history';
import { isBootstrapReady, subscribeBootstrap } from '@/lib/bootstrap-signal';
import { ToastProvider } from '@/lib/toast';

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

  // Listen for the bootstrap signal from `app/index.tsx`.
  useEffect(() => {
    const unsubscribe = subscribeBootstrap(() => setBootReady(true));
    return unsubscribe;
  }, []);

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
    <AssistantHistoryProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ToastProvider>
          <StripeWrapper>
            <Stack initialRouteName="index">
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)/signup" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)/signin" options={{ headerShown: false }} />
              <Stack.Screen name="(onboarding)/plan" options={{ headerShown: false }} />
              <Stack.Screen name="(onboarding)/connect" options={{ headerShown: false }} />
              <Stack.Screen name="oauth/[provider]" options={{ headerShown: false }} />
              <Stack.Screen name="(onboarding)/openai-key" options={{ headerShown: false }} />
              <Stack.Screen name="(chat)/chat" options={{ headerShown: false }} />
              <Stack.Screen name="settings" options={{ headerShown: false }} />
              <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
              <Stack.Screen name="chats" options={{ headerShown: false }} />
              <Stack.Screen name="hubspot" options={{ headerShown: false }} />
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
  );
}

const styles = StyleSheet.create({
  overlay: {
    // Sits above the navigation stack so the dots cover whatever screen is
    // mounting underneath while session hydration runs.
    zIndex: 1000,
  },
});
