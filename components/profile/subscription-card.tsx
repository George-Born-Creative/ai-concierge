import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Skeleton } from '@/components/ui/skeleton';
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
  type ResolvedTheme,
  type ThemeColors,
} from '@/constants/theme';
import type { CrmProvider, UserPlan } from '@/lib/api/types';
import { CRM_LABELS } from '@/lib/crm/labels';
import { isActiveSubscription } from '@/lib/onboarding-route';
import { useAppTheme } from '@/lib/theme/theme-provider';

export function humanizePlanStatus(status: string): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'trialing':
      return 'Trial';
    case 'past_due':
      return 'Past due';
    case 'canceled':
      return 'Canceled';
    case 'unpaid':
      return 'Unpaid';
    case 'incomplete':
      return 'Incomplete';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function formatExpiresAt(iso?: string | null): string {
  if (!iso) return 'Not available';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function subscriptionPalette(
  provider: CrmProvider,
  active: boolean,
  resolvedTheme: ResolvedTheme,
) {
  const dark = resolvedTheme === 'dark';
  if (!active) {
    return dark
      ? {
          colors: ['rgba(148,163,184,0.10)', 'rgba(148,163,184,0.04)'] as [string, string],
          text: '#F8FAFC',
          muted: '#94A3B8',
          iconBg: 'rgba(255,255,255,0.08)',
          pillBg: 'rgba(255,255,255,0.10)',
          buttonBg: 'rgba(255,255,255,0.08)',
          border: 'rgba(148,163,184,0.22)',
        }
      : {
          colors: ['rgba(15,23,42,0.04)', 'rgba(15,23,42,0.02)'] as [string, string],
          text: '#202124',
          muted: '#5F6368',
          iconBg: 'rgba(0,0,0,0.05)',
          pillBg: 'rgba(0,0,0,0.06)',
          buttonBg: 'rgba(0,0,0,0.05)',
          border: 'rgba(15,23,42,0.10)',
        };
  }
  if (provider === 'hubspot') {
    return dark
      ? {
          colors: ['rgba(255,122,89,0.18)', 'rgba(255,122,89,0.06)'] as [string, string],
          text: '#F8FAFC',
          muted: 'rgba(248,250,252,0.72)',
          iconBg: 'rgba(255,122,89,0.18)',
          pillBg: 'rgba(255,122,89,0.20)',
          buttonBg: 'rgba(255,122,89,0.16)',
          border: 'rgba(255,122,89,0.28)',
        }
      : {
          colors: ['rgba(255,122,89,0.16)', 'rgba(255,122,89,0.05)'] as [string, string],
          text: '#7C2D12',
          muted: '#9A3412',
          iconBg: 'rgba(255,122,89,0.16)',
          pillBg: 'rgba(255,122,89,0.18)',
          buttonBg: 'rgba(255,122,89,0.14)',
          border: 'rgba(232,93,61,0.28)',
        };
  }
  return dark
    ? {
        colors: ['rgba(45,212,191,0.16)', 'rgba(13,148,136,0.06)'] as [string, string],
        text: '#F8FAFC',
        muted: 'rgba(248,250,252,0.72)',
        iconBg: 'rgba(45,212,191,0.16)',
        pillBg: 'rgba(45,212,191,0.18)',
        buttonBg: 'rgba(45,212,191,0.14)',
        border: 'rgba(45,212,191,0.26)',
      }
    : {
        colors: ['rgba(13,148,136,0.14)', 'rgba(13,148,136,0.04)'] as [string, string],
        text: '#115E59',
        muted: '#0F766E',
        iconBg: 'rgba(13,148,136,0.14)',
        pillBg: 'rgba(13,148,136,0.16)',
        buttonBg: 'rgba(13,148,136,0.12)',
        border: 'rgba(15,118,110,0.24)',
      };
}

export function SubscriptionCard({
  plan,
  onUpgrade,
}: {
  plan: UserPlan;
  onUpgrade: () => void;
}) {
  const { colors, resolvedTheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, resolvedTheme), [colors, resolvedTheme]);
  const active = isActiveSubscription(plan);
  const palette = subscriptionPalette(plan.provider, active, resolvedTheme);
  const crmLabel = CRM_LABELS[plan.provider];

  return (
    <View style={[styles.card, { borderColor: palette.border }]}>
      <BlurView
        intensity={18}
        tint={resolvedTheme === 'dark' ? 'dark' : 'light'}
        style={styles.frost}
      />
      <LinearGradient
        colors={[palette.colors[0], palette.colors[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.frost}
        pointerEvents="none"
      />
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: palette.iconBg }]}>
          <MaterialIcons name="workspace-premium" size={20} color={palette.text} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {crmLabel}
          </Text>
          <Text style={[styles.subtitle, { color: palette.muted }]} numberOfLines={1}>
            {plan.name}
          </Text>
        </View>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: palette.pillBg,
              flexDirection: 'row',
              alignItems: 'center',
              gap: UiSpacing.xxs,
            },
          ]}>
          <MaterialIcons
            name={active ? 'check-circle' : 'cancel'}
            size={14}
            color={palette.text}
          />
          <Text style={[styles.pillText, { color: palette.text }]} numberOfLines={1}>
            {active ? 'Active' : humanizePlanStatus(plan.status)}
          </Text>
        </View>
      </View>

      <View style={styles.meta}>
        <Text style={[styles.subtitle, { color: palette.muted }]}>CRM</Text>
        <Text style={[styles.metaValue, { color: palette.text }]}>{crmLabel}</Text>
      </View>
      <View style={styles.meta}>
        <Text style={[styles.subtitle, { color: palette.muted }]}>Status</Text>
        <Text style={[styles.metaValue, { color: palette.text }]}>
          {active ? 'Active' : humanizePlanStatus(plan.status)}
        </Text>
      </View>
      <View style={styles.meta}>
        <Text style={[styles.subtitle, { color: palette.muted }]}>Expires</Text>
        <Text style={[styles.metaValue, { color: palette.text }]}>
          {formatExpiresAt(plan.expiresAt)}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        style={[styles.upgradeButton, { backgroundColor: palette.buttonBg }]}
        onPress={onUpgrade}>
        <MaterialIcons name="upgrade" size={18} color={palette.text} />
        <Text style={[styles.upgradeButtonText, { color: palette.text }]}>Upgrade</Text>
        <Text style={[styles.upgradeSoon, { color: palette.muted }]}>Coming soon</Text>
      </Pressable>
    </View>
  );
}

export function SubscriptionCardSkeleton() {
  const { colors, resolvedTheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, resolvedTheme), [colors, resolvedTheme]);
  return (
    <View style={styles.skeleton}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Skeleton width={22} height={22} radius={6} />
        </View>
        <View style={styles.copy}>
          <Skeleton width="50%" height={14} radius={6} />
          <Skeleton width="72%" height={11} radius={6} style={{ marginTop: 8 }} />
        </View>
        <Skeleton width={64} height={22} radius={999} />
      </View>
      <View style={styles.meta}>
        <Skeleton width={36} height={11} radius={6} />
        <Skeleton width={88} height={12} radius={6} />
      </View>
      <View style={styles.meta}>
        <Skeleton width={48} height={11} radius={6} />
        <Skeleton width={56} height={12} radius={6} />
      </View>
      <View style={styles.meta}>
        <Skeleton width={52} height={11} radius={6} />
        <Skeleton width={96} height={12} radius={6} />
      </View>
      <Skeleton
        height={UiControlHeights.compactButton}
        radius={UiRadii.control}
        style={{ marginTop: UiSpacing.xs }}
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors, resolvedTheme: ResolvedTheme) {
  return StyleSheet.create({
    card: {
      borderRadius: UiRadii.card,
      borderWidth: 1,
      gap: UiSpacing.sm,
      overflow: 'hidden',
      padding: UiSpacing.md,
      width: '100%',
    },
    frost: {
      ...StyleSheet.absoluteFillObject,
    },
    skeleton: {
      backgroundColor: resolvedTheme === 'dark' ? colors.surfaceElevated : colors.surface,
      borderColor: resolvedTheme === 'dark' ? colors.borderStrong : colors.border,
      borderRadius: UiRadii.card,
      borderWidth: 1,
      gap: UiSpacing.sm,
      padding: UiSpacing.md,
      width: '100%',
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: UiSpacing.md,
    },
    icon: {
      alignItems: 'center',
      backgroundColor: resolvedTheme === 'dark' ? colors.surfaceMuted : colors.primaryMuted,
      borderRadius: UiRadii.icon,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    copy: {
      flex: 1,
    },
    title: {
      fontSize: UiTypography.body.fontSize,
      fontWeight: '600',
      lineHeight: UiTypography.body.lineHeight,
    },
    subtitle: {
      fontSize: UiTypography.label.fontSize,
      lineHeight: UiTypography.label.lineHeight,
      marginTop: UiSpacing.xxs,
    },
    pill: {
      borderRadius: UiRadii.pill,
      paddingHorizontal: UiSpacing.sm,
      paddingVertical: UiSpacing.xs,
    },
    pillText: {
      fontSize: UiTypography.label.fontSize,
      fontWeight: '600',
      lineHeight: UiTypography.label.lineHeight,
    },
    meta: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: UiSpacing.xxs,
    },
    metaValue: {
      fontSize: UiTypography.label.fontSize,
      fontWeight: '600',
      lineHeight: UiTypography.label.lineHeight,
    },
    upgradeButton: {
      alignItems: 'center',
      borderRadius: UiRadii.control,
      flexDirection: 'row',
      gap: UiSpacing.xs,
      height: UiControlHeights.compactButton,
      justifyContent: 'center',
      marginTop: UiSpacing.xs,
    },
    upgradeButtonText: {
      fontSize: UiTypography.button.fontSize,
      fontWeight: '700',
      lineHeight: UiTypography.button.lineHeight,
    },
    upgradeSoon: {
      fontSize: UiTypography.caption.fontSize,
      fontWeight: '600',
      lineHeight: UiTypography.caption.lineHeight,
    },
  });
}
