import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Skeleton, SkeletonLines } from '@/components/ui/skeleton';
import { hubspotApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type {
  HubspotCompanySummary,
  HubspotContactSummary,
  HubspotDealSummary,
} from '@/lib/api/types';
import { getUser } from '@/lib/session';
import { useToast } from '@/lib/toast';

type LoadState<T> = {
  data: T[];
  loading: boolean;
  error: string | null;
};

const INITIAL = <T,>(): LoadState<T> => ({ data: [], loading: true, error: null });

export function HubspotDataScreenContent() {
  const router = useRouter();
  const { show } = useToast();

  const [contacts, setContacts] = useState<LoadState<HubspotContactSummary>>(INITIAL);
  const [deals, setDeals] = useState<LoadState<HubspotDealSummary>>(INITIAL);
  const [companies, setCompanies] = useState<LoadState<HubspotCompanySummary>>(INITIAL);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') {
      setContacts((s) => ({ ...s, loading: true, error: null }));
      setDeals((s) => ({ ...s, loading: true, error: null }));
      setCompanies((s) => ({ ...s, loading: true, error: null }));
    }

    // Fire all three in parallel — one slow surface shouldn't gate the others.
    const [c, d, co] = await Promise.allSettled([
      hubspotApi.listContacts({ limit: 10 }),
      hubspotApi.listDeals({ limit: 10 }),
      hubspotApi.listCompanies({ limit: 10 }),
    ]);

    setContacts(stateFor(c));
    setDeals(stateFor(d));
    setCompanies(stateFor(co));
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Settings screen / OAuth deep links may have refreshed tokens — fetch
      // fresh data every time the screen comes back into focus.
      void loadAll('initial');
    }, [loadAll]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await loadAll('refresh');
    } finally {
      setRefreshing(false);
    }
  }

  function handleCopy(label: string, value?: string) {
    if (!value) return;
    void Clipboard.setStringAsync(value).then(() =>
      show(`${label} copied to clipboard.`, 'success'),
    );
  }

  // Gate to HubSpot users. We don't want a GHL user opening /hubspot from a
  // stale deep link and seeing an empty browse screen.
  const provider = getUser()?.provider;
  if (provider && provider !== 'hubspot') {
    return (
      <SafeAreaView style={styles.screen}>
        <PageHeader title="HubSpot data" showBack onBack={() => router.back()} />
        <View style={styles.notFor}>
          <MaterialIcons name="info-outline" size={40} color="#80868B" />
          <Text style={styles.notForTitle}>HubSpot only</Text>
          <Text style={styles.notForText}>
            This view shows HubSpot contacts, deals, and companies. Your account is on
            GoHighLevel — open Settings to switch CRMs.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <PageHeader title="HubSpot data" showBack onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor="#1A73E8"
          />
        }>
        <Section
          icon="people"
          title="Contacts"
          state={contacts}
          emptyText="No contacts in your HubSpot portal yet."
          renderRow={(row) => (
            <RowCard
              key={row.id}
              title={row.name}
              subtitle={[row.email, row.phone].filter(Boolean).join(' · ') || undefined}
              meta={row.company}
              onPress={() => handleCopy('Contact id', row.id)}
            />
          )}
        />

        <Section
          icon="trending-up"
          title="Deals"
          state={deals}
          emptyText="No deals in your HubSpot portal yet."
          renderRow={(row) => (
            <RowCard
              key={row.id}
              title={row.name}
              subtitle={
                typeof row.amount === 'number'
                  ? `$${row.amount.toLocaleString()}`
                  : undefined
              }
              meta={[row.stage, row.pipeline].filter(Boolean).join(' · ') || undefined}
              onPress={() => handleCopy('Deal id', row.id)}
            />
          )}
        />

        <Section
          icon="business"
          title="Companies"
          state={companies}
          emptyText="No companies in your HubSpot portal yet."
          renderRow={(row) => (
            <RowCard
              key={row.id}
              title={row.name}
              subtitle={row.domain}
              meta={[row.industry, row.city, row.country].filter(Boolean).join(' · ') || undefined}
              onPress={() => handleCopy('Company id', row.id)}
            />
          )}
        />

        <Text style={styles.footnote}>
          Read-only browse view. Use the chat assistant for search and conversational
          queries against the same data.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stateFor<T>(
  settled: PromiseSettledResult<{ results: T[]; after: string | null }>,
): LoadState<T> {
  if (settled.status === 'fulfilled') {
    return { data: settled.value.results, loading: false, error: null };
  }
  const reason = settled.reason;
  const message =
    reason instanceof ApiError
      ? reason.message
      : reason instanceof Error
        ? reason.message
        : 'Could not load from HubSpot.';
  return { data: [], loading: false, error: message };
}

// ─── Section ──────────────────────────────────────────────────────────────────

type SectionProps<T> = {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  state: LoadState<T>;
  emptyText: string;
  renderRow: (row: T) => React.ReactNode;
};

function Section<T>({ icon, title, state, emptyText, renderRow }: SectionProps<T>) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <MaterialIcons name={icon} size={18} color="#1A73E8" />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!state.loading && state.error === null ? (
          <Text style={styles.sectionCount}>
            {state.data.length} {state.data.length === 1 ? 'item' : 'items'}
          </Text>
        ) : null}
      </View>

      <View style={styles.sectionBody}>
        {state.loading ? (
          <SectionSkeleton />
        ) : state.error ? (
          <View style={styles.errorCard}>
            <MaterialIcons name="error-outline" size={18} color="#B00020" />
            <Text style={styles.errorText}>{state.error}</Text>
          </View>
        ) : state.data.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{emptyText}</Text>
          </View>
        ) : (
          state.data.map((row) => renderRow(row))
        )}
      </View>
    </View>
  );
}

function SectionSkeleton() {
  return (
    <View style={{ gap: 10 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton width="60%" height={14} radius={6} />
          <SkeletonLines lines={2} lineHeight={10} gap={6} lastLineWidth="40%" />
        </View>
      ))}
    </View>
  );
}

// ─── RowCard ──────────────────────────────────────────────────────────────────

type RowCardProps = {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
};

function RowCard({ title, subtitle, meta, onPress }: RowCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.rowCard, pressed && { opacity: 0.85 }]}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <MaterialIcons name="content-copy" size={16} color="#80868B" />
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F2F4F8' },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 48,
    gap: 18,
  },

  section: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderBottomColor: '#E8EAED',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sectionIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  sectionTitle: {
    color: '#202124',
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  sectionCount: {
    color: '#80868B',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionBody: {
    gap: 1,
    padding: 12,
  },

  rowCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EEF0F3',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { color: '#202124', fontSize: 14, fontWeight: '600' },
  rowSubtitle: { color: '#5F6368', fontSize: 12 },
  rowMeta: { color: '#80868B', fontSize: 11 },

  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  emptyText: { color: '#5F6368', fontSize: 13, textAlign: 'center' },

  errorCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FDEDED',
    borderColor: '#F5C2C7',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  errorText: { color: '#5F2120', flex: 1, fontSize: 13, lineHeight: 18 },

  skeletonRow: {
    backgroundColor: '#F8FAFF',
    borderRadius: 12,
    gap: 8,
    padding: 12,
  },

  notFor: {
    alignItems: 'center',
    gap: 12,
    padding: 32,
  },
  notForTitle: { color: '#202124', fontSize: 18, fontWeight: '600' },
  notForText: {
    color: '#5F6368',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 280,
    textAlign: 'center',
  },

  footnote: {
    color: '#80868B',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 4,
    textAlign: 'center',
  },
});
