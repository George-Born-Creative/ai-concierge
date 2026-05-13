import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AIConciergeVoiceRecorder } from '@/components/ai-concierge-voice-recorder';
import { HapticTab } from '@/components/haptic-tab';

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

function AppHeader() {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <View style={styles.logoMark}>
          <View style={[styles.logoDot, styles.blueDot]} />
          <View style={[styles.logoDot, styles.redDot]} />
          <View style={[styles.logoDot, styles.yellowDot]} />
          <View style={[styles.logoDot, styles.greenDot]} />
        </View>
        <View>
          <Text style={styles.appName}>AI-Concierge</Text>
          <Text style={styles.appTagline}>Voice assistant</Text>
        </View>
      </View>

      <Pressable style={styles.homeButton} onPress={() => router.push('/')}>
        <MaterialIcons name="home" size={22} color="#1A73E8" />
        <Text style={styles.homeButtonText}>Home</Text>
      </Pressable>
    </View>
  );
}

function VoiceAssistantTabButton() {
  const router = useRouter();

  function sendAudio(voiceUri: string) {
    router.push({
      pathname: '/chat',
      params: {
        source: 'voice',
        voiceUri,
      },
    });
  }

  return (
    <View style={styles.voiceTabButton}>
      <AIConciergeVoiceRecorder
        apiEndpoint={process.env.EXPO_PUBLIC_VOICE_API_ENDPOINT}
        onAudioRecorded={sendAudio}
        onError={(message) => Alert.alert('Voice recording', message)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderBottomColor: '#E8EAED',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 18,
    paddingHorizontal: 22,
    paddingTop: 38,
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  logoMark: {
    alignItems: 'center',
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  logoDot: {
    borderRadius: 10,
    position: 'absolute',
  },
  blueDot: {
    backgroundColor: '#4285F4',
    height: 27,
    left: 4,
    width: 27,
  },
  redDot: {
    backgroundColor: '#EA4335',
    height: 17,
    right: 6,
    top: 6,
    width: 17,
  },
  yellowDot: {
    backgroundColor: '#FBBC04',
    bottom: 6,
    height: 15,
    right: 8,
    width: 15,
  },
  greenDot: {
    backgroundColor: '#34A853',
    bottom: 10,
    height: 12,
    left: 12,
    width: 12,
  },
  appName: {
    color: '#202124',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  appTagline: {
    color: '#5F6368',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  homeButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8F0FE',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  homeButtonText: {
    color: '#1A73E8',
    fontSize: 13,
    fontWeight: '800',
  },
  voiceTabButton: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    marginTop: -36,
  },
});
