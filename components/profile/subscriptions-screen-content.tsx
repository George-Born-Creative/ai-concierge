import { useFocusEffect } from '@react-navigation/native';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import {
  SubscriptionCard,
  SubscriptionCardSkeleton,
} from '@/components/profile/subscription-card';
import { ScreenShell } from '@/components/screen';
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
  type ResolvedTheme,
  type ThemeColors,
} from '@/constants/theme';
import { getMe } from '@/lib/api/auth';
import type { User } from '@/lib/api/types';
import { listUserSubscriptions } from '@/lib/onboarding-route';
import { getUser, refreshUser } from '@/lib/session';
import { useAppTheme } from '@/lib/theme/theme-provider';
import { useToast } from '@/lib/toast';

export function SubscriptionsScreenContent() {
  const router = useRouter();
  const { show } = useToast();
  const { colors, resolvedTheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, resolvedTheme), [colors, resolvedTheme]);

  const [user, setUser] = useState<User | null>(() => getUser());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await getMe();
      setUser(me);
      await refreshUser(me).catch(() => undefined);
    } catch {
      setUser(getUser());
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const subscriptions = listUserSubscriptions(user);

  return (
    <ScreenShell edges={['bottom']}>
      <PageHeader title="Subscriptions" showBack />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          You can pay for both GoHighLevel and HubSpot. Only one CRM can be connected
          at a time.
        </Text>

        {loading && subscriptions.length === 0 ? (
          <View style={styles.list}>
            <SubscriptionCardSkeleton />
            <SubscriptionCardSkeleton />
          </View>
        ) : subscriptions.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No subscription</Text>
            <Text style={styles.emptyBody}>
              Subscribe to a CRM plan to use GoHighLevel or HubSpot.
            </Text>
            <Pressable
              accessibilityRole="button"
              style={styles.primaryButton}
              onPress={() => router.push('/plan' as Href)}>
              <Text style={styles.primaryButtonText}>Choose a plan</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {subscriptions.map((plan) => (
              <SubscriptionCard
                key={`${plan.provider}-${plan.id}`}
                plan={plan}
                onUpgrade={() => show('Upgrade is coming soon.', 'info')}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

function makeStyles(colors: ThemeColors, resolvedTheme: ResolvedTheme) {
  return StyleSheet.create({
    content: {
      paddingBottom: UiSpacing.xxxl,
      paddingHorizontal: UiSpacing.lg,
      paddingTop: UiSpacing.lg,
    },
    intro: {
      color: colors.textSecondary,
      fontSize: UiTypography.bodySmall.fontSize,
      lineHeight: UiTypography.bodySmall.lineHeight,
      marginBottom: UiSpacing.lg,
    },
    list: {
      gap: UiSpacing.md,
    },
    empty: {
      backgroundColor: resolvedTheme === 'dark' ? colors.surfaceElevated : colors.surface,
      borderColor: resolvedTheme === 'dark' ? colors.borderStrong : colors.border,
      borderRadius: UiRadii.card,
      borderWidth: 1,
      padding: UiSpacing.md,
    },
    emptyTitle: {
      color: resolvedTheme === 'dark' ? '#FFFFFF' : colors.textPrimary,
      fontSize: UiTypography.body.fontSize,
      fontWeight: '600',
      lineHeight: UiTypography.body.lineHeight,
    },
    emptyBody: {
      color: resolvedTheme === 'dark' ? '#E2E8F0' : colors.textSecondary,
      fontSize: UiTypography.label.fontSize,
      lineHeight: UiTypography.label.lineHeight,
      marginTop: UiSpacing.xxs,
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: UiRadii.control,
      height: UiControlHeights.compactButton,
      justifyContent: 'center',
      marginTop: UiSpacing.md,
    },
    primaryButtonText: {
      color: colors.onPrimary,
      fontSize: UiTypography.button.fontSize,
      fontWeight: '700',
      lineHeight: UiTypography.button.lineHeight,
    },
  });
}
