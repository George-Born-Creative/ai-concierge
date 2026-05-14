import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { AppSplashScreen } from '@/components/splash/app-splash-screen';
import { StripeWrapper } from '@/components/stripe-wrapper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AssistantHistoryProvider } from '@/lib/assistant-history';
import { ToastProvider } from '@/lib/toast';

void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(auth)/signup',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isStarting, setIsStarting] = useState(true);

  useEffect(() => {
    void SplashScreen.hideAsync();

    const startupTimer = setTimeout(() => {
      setIsStarting(false);
    }, 1200);

    return () => clearTimeout(startupTimer);
  }, []);

  if (isStarting) {
    return <AppSplashScreen />;
  }

  return (
    <AssistantHistoryProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ToastProvider>
        <StripeWrapper>
          <Stack initialRouteName="(auth)/signup">
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)/signup" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)/signin" options={{ headerShown: false }} />
            <Stack.Screen name="(onboarding)/plan" options={{ headerShown: false }} />
            <Stack.Screen name="(onboarding)/payment" options={{ headerShown: false }} />
            <Stack.Screen name="(onboarding)/connect" options={{ headerShown: false }} />
            <Stack.Screen name="(onboarding)/openai-key" options={{ headerShown: false }} />
            <Stack.Screen name="(chat)/chat" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Voice Concierge' }} />
          </Stack>
          <StatusBar style="dark" />
        </StripeWrapper>
        </ToastProvider>
      </ThemeProvider>
    </AssistantHistoryProvider>
  );
}
