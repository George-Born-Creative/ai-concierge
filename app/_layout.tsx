import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { StripeProvider } from '@stripe/stripe-react-native/lib/commonjs/components/StripeProvider';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { AppSplashScreen } from '@/components/splash/app-splash-screen';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AssistantHistoryProvider } from '@/lib/assistant-history';

void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: 'signup',
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
        <StripeProvider
          publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}
          urlScheme="aiconcierge">
          <Stack initialRouteName="signup">
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="chat" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Voice Concierge' }} />
            <Stack.Screen name="signin" options={{ headerShown: false }} />
            <Stack.Screen name="signup" options={{ headerShown: false }} />
            <Stack.Screen name="plan" options={{ headerShown: false }} />
            <Stack.Screen name="payment" options={{ headerShown: false }} />
            <Stack.Screen name="connect" options={{ headerShown: false }} />
            <Stack.Screen name="openai-key" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style="dark" />
        </StripeProvider>
      </ThemeProvider>
    </AssistantHistoryProvider>
  );
}
