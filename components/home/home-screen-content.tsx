import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '@/components/screen';
import { getUser } from '@/lib/session';

type QuickAction = {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  tint: string;
  bg: string;
  // Either navigate to a real screen, or send a prefilled command to the
  // assistant chat (the command auto-runs via the /chat `command` param).
  href?: Href;
  command?: string;
};

const TRY_SAYING_GHL = [
  'Call John',
  'Schedule a meeting',
  "Show today's opportunities",
  'Create a contact',
];

const TRY_SAYING_HUBSPOT = [
  'Show my contacts',
  'Create a ticket',
  'Show my open deals',
  'Add a new company',
];

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstName(name: string | undefined): string {
  if (!name) return 'there';
  const trimmed = name.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

export function HomeScreenContent() {
  const router = useRouter();

  const user = getUser();
  const isHubspot = user?.provider === 'hubspot';
  const trySaying = isHubspot ? TRY_SAYING_HUBSPOT : TRY_SAYING_GHL;

  // Quick actions are provider-specific. HubSpot and GoHighLevel expose
  // different objects, so we never show a shortcut for something the active
  // CRM can't do (e.g. HubSpot has no calendar; GHL has no companies/tickets).
  const quickActions = useMemo<readonly QuickAction[]>(() => {
    if (isHubspot) {
      // HubSpot cards each open their OWN focused list page (via the `object`
      // param) instead of dumping every object onto one screen.
      return [
        {
          icon: 'contacts',
          title: 'Contacts',
          tint: '#1A73E8',
          bg: '#E8F0FE',
          href: { pathname: '/hubspot', params: { object: 'contacts' } } as Href,
        },
        {
          icon: 'trending-up',
          title: 'Deals',
          tint: '#7C3AED',
          bg: '#EDE9FE',
          href: { pathname: '/hubspot', params: { object: 'deals' } } as Href,
        },
        {
          icon: 'business',
          title: 'Companies',
          tint: '#06B6D4',
          bg: '#E0F7FB',
          href: { pathname: '/hubspot', params: { object: 'companies' } } as Href,
        },
        {
          icon: 'confirmation-number',
          title: 'Tickets',
          tint: '#EA4335',
          bg: '#FCE8E6',
          href: { pathname: '/hubspot', params: { object: 'tickets' } } as Href,
        },
        {
          icon: 'sell',
          title: 'Products',
          tint: '#F59E0B',
          bg: '#FEF3C7',
          href: { pathname: '/hubspot', params: { object: 'products' } } as Href,
        },
        {
          icon: 'receipt-long',
          title: 'Orders',
          tint: '#8B5CF6',
          bg: '#EDE9FE',
          href: { pathname: '/hubspot', params: { object: 'orders' } } as Href,
        },
      ];
    }

    // GoHighLevel cards each open their OWN focused list page (via the `object`
    // param), matching the HubSpot behavior, instead of routing into the chat.
    // GHL has no companies/tickets objects, so those aren't shown.
    return [
      {
        icon: 'contacts',
        title: 'Contacts',
        tint: '#1A73E8',
        bg: '#E8F0FE',
        href: { pathname: '/ghl', params: { object: 'contacts' } } as Href,
      },
      {
        icon: 'business-center',
        title: 'Opportunities',
        tint: '#7C3AED',
        bg: '#EDE9FE',
        href: { pathname: '/ghl', params: { object: 'opportunities' } } as Href,
      },
      {
        icon: 'event',
        title: 'Calendar',
        tint: '#06B6D4',
        bg: '#E0F7FB',
        href: { pathname: '/ghl', params: { object: 'calendar' } } as Href,
      },
    ];
  }, [isHubspot]);

  // Mount animation: hero content fades up.
  const intro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [intro]);

  const introTranslate = intro.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  function runQuickAction(action: QuickAction) {
    if (action.href) {
      router.push(action.href);
      return;
    }
    if (action.command) {
      router.push({ pathname: '/chat', params: { command: action.command, source: 'text' } });
    }
  }

  return (
    <ScreenShell edges={[]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical={false}
        overScrollMode="never">
        {/* Greeting */}
        <Animated.View
          style={[styles.greeting, { opacity: intro, transform: [{ translateY: introTranslate }] }]}>
          <Text style={styles.greetingHello}>
            {greetingForHour(new Date().getHours())}, {firstName(user?.name)} 👋
          </Text>
          <Text style={styles.greetingSub}>How can I help you today?</Text>
        </Animated.View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickGrid}>
            {quickActions.map((action) => (
              <Pressable
                key={action.title}
                onPress={() => runQuickAction(action)}
                style={({ pressed }) => [styles.quickCard, pressed && styles.quickCardPressed]}>
                <View style={[styles.quickIcon, { backgroundColor: action.bg }]}>
                  <MaterialIcons name={action.icon} size={24} color={action.tint} />
                </View>
                <Text style={styles.quickTitle}>{action.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Reminders */}
        <Pressable
          onPress={() => router.push('/reminders' as Href)}
          style={({ pressed }) => [styles.reminderCard, pressed && { opacity: 0.9 }]}>
          <View style={styles.reminderIcon}>
            <MaterialIcons name="notifications-active" size={24} color="#1A73E8" />
          </View>
          <View style={styles.reminderCopy}>
            <Text style={styles.reminderTitle}>Reminders</Text>
            <Text style={styles.reminderSubtitle}>
              Manage scheduled reminders & push notifications
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#9AA0A6" />
        </Pressable>

        {/* AI Assistant Card */}
        <Animated.View
          style={[styles.aiCard, { opacity: intro, transform: [{ translateY: introTranslate }] }]}>
          <View style={styles.aiCardHeaderRow}>
            <View style={styles.aiBadge}>
              <MaterialIcons name="smart-toy" size={16} color="#1A73E8" />
              <Text style={styles.aiBadgeText}>AI Assistant</Text>
            </View>
            <View style={styles.waveformMini} accessibilityElementsHidden>
              {[10, 18, 12, 22, 14, 20, 11].map((h, i) => (
                <View key={i} style={[styles.waveformBar, { height: h }]} />
              ))}
            </View>
          </View>
          <Text style={styles.aiTitle}>What would you like to do?</Text>
          <Text style={styles.trySaying}>Try saying:</Text>
          <View style={styles.tryList}>
            {trySaying.map((phrase) => (
              <View key={phrase} style={styles.tryRow}>
                <View style={styles.tryDot} />
                <Text style={styles.tryText}>{phrase}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Help Card */}
        <View style={styles.helpCard}>
          <View style={styles.helpIcon}>
            <MaterialIcons name="help-outline" size={24} color="#1A73E8" />
          </View>
          <View style={styles.helpCopy}>
            <Text style={styles.helpTitle}>Need Help?</Text>
            <Text style={styles.helpDescription}>
              Learn how to use voice commands and manage your CRM.
            </Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/chat',
                  params: {
                    command: 'What can you help me with? Show me example voice commands.',
                    source: 'text',
                  },
                })
              }
              style={({ pressed }) => [styles.helpButton, pressed && { opacity: 0.9 }]}>
              <Text style={styles.helpButtonText}>View Help</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const CARD_SHADOW = {
  elevation: 3,
  shadowColor: '#0F172A',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.06,
  shadowRadius: 16,
} as const;

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 138,
    paddingTop: 24,
  },
  // Greeting
  greeting: {
    marginBottom: 4,
  },
  greetingHello: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  greetingSub: {
    color: '#6B7280',
    fontSize: 15,
    marginTop: 4,
  },
  // Sections
  section: {
    marginTop: 26,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 14,
  },
  // Quick Actions
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  quickCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    height: 110,
    justifyContent: 'center',
    ...CARD_SHADOW,
  },
  quickCardPressed: {
    transform: [{ translateY: -2 }, { scale: 1.01 }],
  },
  quickIcon: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  quickTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  // Reminders card
  reminderCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginTop: 26,
    padding: 16,
    ...CARD_SHADOW,
  },
  reminderIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  reminderCopy: {
    flex: 1,
  },
  reminderTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  reminderSubtitle: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  // AI Assistant Card
  aiCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 26,
    padding: 20,
    ...CARD_SHADOW,
  },
  aiCardHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  aiBadge: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  aiBadgeText: {
    color: '#1A73E8',
    fontSize: 12,
    fontWeight: '700',
  },
  waveformMini: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    height: 24,
  },
  waveformBar: {
    backgroundColor: '#A8C7FA',
    borderRadius: 999,
    width: 3,
  },
  aiTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 14,
  },
  trySaying: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },
  tryList: {
    gap: 6,
    marginTop: 8,
  },
  tryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  tryDot: {
    backgroundColor: '#1A73E8',
    borderRadius: 3,
    height: 5,
    width: 5,
  },
  tryText: {
    color: '#374151',
    fontSize: 14,
  },
  // Help Card
  helpCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginTop: 26,
    padding: 20,
    ...CARD_SHADOW,
  },
  helpIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  helpCopy: {
    flex: 1,
  },
  helpTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  helpDescription: {
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  helpButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 20,
  },
  helpButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
