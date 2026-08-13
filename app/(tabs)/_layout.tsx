import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import React from 'react';

import { AppHeader } from '@/components/tabs/app-header';
import { HapticTab } from '@/components/tabs/haptic-tab';
import { VoiceAssistantTabButton } from '@/components/tabs/voice-assistant-tab-button';
import { useAppTheme } from '@/lib/theme/theme-provider';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function TabLayout() {
  const { colors } = useAppTheme();

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBackground,
          borderTopColor: colors.border,
          height: 82,
          overflow: 'visible',
          paddingBottom: 18,
          paddingTop: 10,
        },
        header: () => <AppHeader />,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <MaterialIcons size={27} name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="voice"
        options={{
          title: 'Assistant',
          tabBarButton: VoiceAssistantTabButton,
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <MaterialIcons size={27} name="person" color={color} />,
        }}
      />
    </Tabs>
  );
}
