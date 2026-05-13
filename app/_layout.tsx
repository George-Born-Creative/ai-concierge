import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { AppSplashScreen } from '@/components/app-splash-screen';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AssistantHistoryProvider } from '@/lib/assistant-history';

void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
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
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="chat" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Voice Concierge' }} />
        </Stack>
        <StatusBar style="dark" />
      </ThemeProvider>
    </AssistantHistoryProvider>
  );
}
