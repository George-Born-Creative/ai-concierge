import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '@/components/screen';
import { UiRadii, UiSpacing, UiTypography } from '@/constants/theme';
import { getMe } from '@/lib/api/auth';
import { getUser, refreshUser } from '@/lib/session';
import { useAppTheme } from '@/lib/theme/theme-provider';

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
  const { colors, resolvedTheme } = useAppTheme();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await getMe();
      await refreshUser(result);
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }, []);

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
        icon: 'chat',
        title: 'Conversations',
        tint: '#10B981',
        bg: '#D1FAE5',
        href: '/ghl-conversations' as Href,
      },
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
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
                <View
                  style={[
                    styles.quickIcon,
                    {
                      backgroundColor:
                        resolvedTheme === 'dark'
                          ? colors.surfaceSelected
                          : action.bg,
                    },
                  ]}>
                  <MaterialIcons
                    name={action.icon}
                    size={22}
                    color={resolvedTheme === 'dark' ? colors.primary : action.tint}
                  />
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
            <MaterialIcons name="notifications-active" size={22} color={colors.primary} />
          </View>
          <View style={styles.reminderCopy}>
            <Text style={styles.reminderTitle}>Reminders</Text>
            <Text style={styles.reminderSubtitle}>
              Manage scheduled reminders & push notifications
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.iconMuted} />
        </Pressable>

        {/* AI Assistant Card */}
        <Animated.View
          style={[styles.aiCard, { opacity: intro, transform: [{ translateY: introTranslate }] }]}>
          <View style={styles.aiCardHeaderRow}>
            <View style={styles.aiBadge}>
              <MaterialIcons name="smart-toy" size={16} color={colors.primary} />
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

      </ScrollView>
    </ScreenShell>
  );
}

const CARD_SHADOW = {
  elevation: 2,
  shadowColor: '#0F172A',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 10,
} as const;

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    maxWidth: 720,
    paddingBottom: UiSpacing.xxl,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.lg,
    width: '100%',
  },
  // Greeting
  greeting: {
    marginBottom: UiSpacing.xxs,
  },
  greetingHello: {
    color: '#111827',
    fontSize: UiTypography.sectionHeading.fontSize,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: UiTypography.sectionHeading.lineHeight,
  },
  greetingSub: {
    color: '#6B7280',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: UiSpacing.xxs,
  },
  // Sections
  section: {
    marginTop: UiSpacing.xl,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.cardHeading.lineHeight,
    marginBottom: UiSpacing.md,
  },
  // Quick Actions
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: UiSpacing.md,
  },
  quickCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    height: 96,
    justifyContent: 'center',
    ...CARD_SHADOW,
  },
  quickCardPressed: {
    transform: [{ translateY: -2 }, { scale: 1.01 }],
  },
  quickIcon: {
    alignItems: 'center',
    borderRadius: UiRadii.icon,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  quickTitle: {
    color: '#111827',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: UiSpacing.sm,
  },
  // Reminders card
  reminderCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.md,
    marginTop: UiSpacing.xl,
    minHeight: 64,
    padding: UiSpacing.md,
    ...CARD_SHADOW,
  },
  reminderIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: UiRadii.icon,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  reminderCopy: {
    flex: 1,
  },
  reminderTitle: {
    color: '#111827',
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.cardHeading.lineHeight,
  },
  reminderSubtitle: {
    color: '#6B7280',
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
    marginTop: UiSpacing.xxs,
  },
  // AI Assistant Card
  aiCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    marginTop: UiSpacing.xl,
    padding: UiSpacing.lg,
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
    borderRadius: UiRadii.pill,
    flexDirection: 'row',
    gap: UiSpacing.xs,
    paddingHorizontal: UiSpacing.sm,
    paddingVertical: UiSpacing.xxs,
  },
  aiBadgeText: {
    color: '#1A73E8',
    fontSize: UiTypography.label.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.label.lineHeight,
  },
  waveformMini: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.xxs,
    height: 24,
  },
  waveformBar: {
    backgroundColor: '#A8C7FA',
    borderRadius: 999,
    width: 3,
  },
  aiTitle: {
    color: '#111827',
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.cardHeading.lineHeight,
    marginTop: UiSpacing.md,
  },
  trySaying: {
    color: '#6B7280',
    fontSize: UiTypography.label.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.label.lineHeight,
    marginTop: UiSpacing.sm,
  },
  tryList: {
    gap: UiSpacing.xxs,
    marginTop: UiSpacing.xs,
  },
  tryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
  },
  tryDot: {
    backgroundColor: '#1A73E8',
    borderRadius: 3,
    height: 5,
    width: 5,
  },
  tryText: {
    color: '#374151',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
  },

});
