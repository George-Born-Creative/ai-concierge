import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { type Href, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getUser } from '@/lib/session';

type FeatureCard = {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  description: string;
  href: Href | null;
};

const BASE_CARDS: ReadonlyArray<FeatureCard> = [
  {
    icon: 'record-voice-over',
    title: 'Voice commands',
    description: 'Hold the mic and ask AI-Concierge to handle contact tasks hands free.',
    href: null,
  },
  {
    icon: 'contacts',
    title: 'Contact actions',
    description: 'List, identify, create, fetch, and delete contacts from one assistant flow.',
    href: null,
  },
  {
    icon: 'history',
    title: 'Activity history',
    description: 'Review previous chats grouped by Today, Yesterday, and earlier.',
    href: '/chats',
  },
];

export function HomeScreenContent() {
  const router = useRouter();

  // HubSpot users get an extra tile that opens the read-only browse screen
  // for contacts / deals / companies. GHL users don't see it — there's no
  // equivalent screen for them (they use the chat directly).
  const featureCards = useMemo<ReadonlyArray<FeatureCard>>(() => {
    if (getUser()?.provider === 'hubspot') {
      return [
        ...BASE_CARDS,
        {
          icon: 'hub',
          title: 'HubSpot data',
          description: 'Browse your recent HubSpot contacts, deals, and companies.',
          href: '/hubspot',
        },
      ];
    }
    return BASE_CARDS;
  }, []);
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={styles.logoMark}>
          <View style={[styles.logoDot, styles.blueDot]} />
          <View style={[styles.logoDot, styles.redDot]} />
          <View style={[styles.logoDot, styles.yellowDot]} />
          <View style={[styles.logoDot, styles.greenDot]} />
        </View>

        <Text style={styles.greeting}>How can I help?</Text>
        <Text style={styles.subtitle}>
          Start a chat by speaking or typing. The assistant will convert the command to text,
          execute it, and show the response.
        </Text>

        <View style={styles.cardsGrid}>
          {featureCards.map((card) => {
            const inner = (
              <>
                <View style={styles.cardIcon}>
                  <MaterialIcons name={card.icon} size={24} color="#1A73E8" />
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.cardDescription}>{card.description}</Text>
                </View>
                {card.href ? (
                  <MaterialIcons name="chevron-right" size={22} color="#BDC1C6" />
                ) : null}
              </>
            );
            const href = card.href;
            if (href) {
              return (
                <Pressable
                  key={card.title}
                  style={({ pressed }) => [
                    styles.featureCard,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => router.push(href)}>
                  {inner}
                </Pressable>
              );
            }
            return (
              <View key={card.title} style={styles.featureCard}>
                {inner}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFF',
  },
  content: {
    alignItems: 'center',
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingBottom: 138,
    paddingTop: 62,
  },
  logoMark: {
    alignItems: 'center',
    height: 96,
    justifyContent: 'center',
    marginBottom: 28,
    width: 96,
  },
  logoDot: {
    borderRadius: 20,
    position: 'absolute',
  },
  blueDot: {
    backgroundColor: '#4285F4',
    height: 56,
    left: 8,
    width: 56,
  },
  redDot: {
    backgroundColor: '#EA4335',
    height: 36,
    right: 12,
    top: 12,
    width: 36,
  },
  yellowDot: {
    backgroundColor: '#FBBC04',
    bottom: 12,
    height: 32,
    right: 18,
    width: 32,
  },
  greenDot: {
    backgroundColor: '#34A853',
    bottom: 20,
    height: 24,
    left: 24,
    width: 24,
  },
  greeting: {
    color: '#202124',
    fontSize: 36,
    fontWeight: '600',
    letterSpacing: -1.1,
    textAlign: 'center',
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    maxWidth: 330,
    textAlign: 'center',
  },
  cardsGrid: {
    gap: 14,
    marginTop: 34,
    width: '100%',
  },
  featureCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8F0FE',
    borderRadius: 14,
    borderWidth: 1,
    elevation: 4,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    shadowColor: '#174EA6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  cardIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    color: '#202124',
    fontSize: 16,
    fontWeight: '600',
  },
  cardDescription: {
    color: '#5F6368',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
});
