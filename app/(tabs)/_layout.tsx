import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import React from 'react';

import { AppHeader } from '@/components/tabs/app-header';
import { HapticTab } from '@/components/tabs/haptic-tab';
import { VoiceAssistantTabButton } from '@/components/tabs/voice-assistant-tab-button';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        tabBarActiveTintColor: '#1A73E8',
        tabBarInactiveTintColor: '#5F6368',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E8EAED',
          height: 82,
          paddingBottom: 18,
          paddingTop: 10,
        },
        header: () => <AppHeader />,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="explore"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <MaterialIcons size={27} name="history" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
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
