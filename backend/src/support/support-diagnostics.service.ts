import { Injectable, NotFoundException } from '@nestjs/common';
import { CrmProvider, SubscriptionStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  type SupportDiagnosticItem,
  type SupportDiagnosticsResponse,
} from './support-diagnostics.policy';

const ACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
];

@Injectable()
export class SupportDiagnosticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDiagnostics(userId: string): Promise<SupportDiagnosticsResponse> {
    // Keep this query deliberately narrow. In particular, never select OAuth
    // tokens, the encrypted OpenAI key, key last-four, or CRM identifiers.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailVerified: true,
        timezone: true,
        expoPushToken: true,
        subscription: {
          select: {
            status: true,
            paymentProvider: true,
            currentPeriodEnd: true,
            plan: { select: { provider: true } },
          },
        },
        integrations: {
          select: {
            provider: true,
            enabled: true,
            scopes: true,
          },
        },
        openaiKey: { select: { id: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const selectedProvider = user.subscription?.plan.provider ?? null;
    const integration = selectedProvider
      ? user.integrations.find((item) => item.provider === selectedProvider)
      : null;

    return {
      generatedAt: new Date().toISOString(),
      groups: [
        {
          key: 'service',
          label: 'Service and account',
          items: [
            {
              key: 'api',
              label: 'API service',
              status: 'ok',
              value: 'Available',
              detail: 'The authenticated diagnostics service responded.',
            },
            {
              key: 'database',
              label: 'Account data',
              status: 'ok',
              value: 'Available',
              detail: 'Stored account configuration is reachable.',
            },
            {
              key: 'email_verification',
              label: 'Email verification',
              status: user.emailVerified ? 'ok' : 'warning',
              value: user.emailVerified ? 'Verified' : 'Not verified',
            },
            this.subscriptionItem(user.subscription),
          ],
        },
        {
          key: 'configuration',
          label: 'App configuration',
          items: [
            this.integrationItem(selectedProvider, integration),
            this.scopeItem(selectedProvider, integration?.scopes ?? []),
            {
              key: 'openai_key',
              label: 'OpenAI connection',
              status: user.openaiKey ? 'ok' : 'info',
              value: user.openaiKey ? 'Configured' : 'Not configured',
              detail: 'Only whether a stored key exists is checked.',
            },
            {
              key: 'push_token',
              label: 'Push notifications',
              status: user.expoPushToken ? 'ok' : 'info',
              value: user.expoPushToken ? 'Configured' : 'Not configured',
              detail: 'Only whether a stored push token exists is checked.',
            },
            {
              key: 'timezone',
              label: 'Account timezone',
              status: user.timezone ? 'ok' : 'info',
              value: user.timezone ?? 'Not set',
            },
          ],
        },
      ],
    };
  }

  private subscriptionItem(
    subscription: {
      status: SubscriptionStatus;
      paymentProvider: string;
      currentPeriodEnd: Date | null;
    } | null,
  ): SupportDiagnosticItem {
    if (!subscription) {
      return {
        key: 'subscription',
        label: 'Subscription',
        status: 'info',
        value: 'Not configured',
      };
    }

    const active = ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status);
    const period = subscription.currentPeriodEnd
      ? ` through ${subscription.currentPeriodEnd.toISOString().slice(0, 10)}`
      : '';
    return {
      key: 'subscription',
      label: 'Subscription',
      status: active ? 'ok' : 'warning',
      value: subscription.status.toLowerCase().replace(/_/g, ' '),
      detail: `${subscription.paymentProvider.toLowerCase()} billing${period}`,
    };
  }

  private integrationItem(
    selectedProvider: CrmProvider | null,
    integration:
      | { enabled: boolean; scopes: string[] }
      | null
      | undefined,
  ): SupportDiagnosticItem {
    if (!selectedProvider) {
      return {
        key: 'crm_connection',
        label: 'CRM connection',
        status: 'info',
        value: 'No CRM selected',
      };
    }
    if (!integration) {
      return {
        key: 'crm_connection',
        label: 'CRM connection',
        status: 'warning',
        value: `${this.providerLabel(selectedProvider)} not connected`,
      };
    }

    // OAuth access-token expiry is not a disconnection signal: both providers
    // can refresh an expired access token from stored credentials. Treat only
    // the durable enabled flag as connection state without making a provider
    // call here.
    const connected = integration.enabled;
    return {
      key: 'crm_connection',
      label: 'CRM connection',
      status: connected ? 'ok' : 'warning',
      value: connected
        ? `${this.providerLabel(selectedProvider)} connected`
        : `${this.providerLabel(selectedProvider)} disabled`,
      detail: 'Based on stored connection state; no CRM request was made.',
    };
  }

  private scopeItem(
    provider: CrmProvider | null,
    scopes: string[],
  ): SupportDiagnosticItem {
    if (!provider || scopes.length === 0) {
      return {
        key: 'crm_permissions',
        label: 'CRM permissions',
        status: 'info',
        value: 'Unavailable',
      };
    }

    const normalized = scopes.map((scope) => scope.toLowerCase());
    const hasCoreRead =
      provider === CrmProvider.GHL
        ? normalized.some(
            (scope) =>
              scope.startsWith('contacts.') ||
              scope.startsWith('opportunities.') ||
              scope.startsWith('calendars.'),
          )
        : normalized.some(
            (scope) =>
              scope.includes('crm.objects.contacts.read') ||
              scope.includes('crm.objects.deals.read') ||
              scope === 'tickets',
          );

    return {
      key: 'crm_permissions',
      label: 'CRM permissions',
      status: hasCoreRead ? 'ok' : 'warning',
      value: hasCoreRead ? 'Core access available' : 'Core access may be limited',
      detail: 'Only broad permission readiness is shown; raw scopes are hidden.',
    };
  }

  private providerLabel(provider: CrmProvider): string {
    return provider === CrmProvider.GHL ? 'GoHighLevel' : 'HubSpot';
  }
}
