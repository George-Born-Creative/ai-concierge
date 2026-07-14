import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import { Skeleton, SkeletonLines } from '@/components/ui/skeleton';
import { hubspotApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import {
  crmCacheKey,
  getCrmCache,
  isCrmFresh,
  setCrmCache,
} from '@/lib/api/crm-cache';
import { CRM_LABELS, getCrmLabel } from '@/lib/crm/labels';
import type {
  HubspotCompanySummary,
  HubspotContactSummary,
  HubspotDealSummary,
  HubspotOrderSummary,
  HubspotPaginated,
  HubspotProductSummary,
  HubspotTicketSummary,
} from '@/lib/api/types';
import { useRealtimeEvent } from '@/lib/realtime/socket';
import { getUser } from '@/lib/session';
import { useToast } from '@/lib/toast';

type LoadState<T> = {
  data: T[];
  loading: boolean;
  error: string | null;
};

// Seed a section from the CRM cache: show cached rows instantly (no skeleton)
// when present, otherwise start in the loading state until the first fetch.
function seedState<T>(key: string): LoadState<T> {
  const data = getCrmCache<T>(key);
  return { data: data ?? [], loading: data === undefined, error: null };
}

// Persist a successful fetch to the cache, then apply it to component state.
// Errors are shown but not cached, so a transient failure never poisons the
// instant-render path.
function commit<T>(
  key: string,
  st: LoadState<T>,
  setter: (s: LoadState<T>) => void,
): void {
  if (st.error === null) setCrmCache(key, st.data);
  setter(st);
}

// The four HubSpot objects this screen can browse. A single screen serves both
// the combined overview (no `object` param) and a focused single-object list
// page (e.g. /hubspot?object=contacts) that the Home quick actions link to.
const OBJECT_KEYS = [
  'contacts',
  'deals',
  'companies',
  'tickets',
  'products',
  'orders',
] as const;
type ObjectKey = (typeof OBJECT_KEYS)[number];

const OBJECT_TITLES: Record<ObjectKey, string> = {
  contacts: 'Contacts',
  deals: 'Deals',
  companies: 'Companies',
  tickets: 'Tickets',
  products: 'Products',
  orders: 'Orders',
};

function isObjectKey(value: unknown): value is ObjectKey {
  return typeof value === 'string' && (OBJECT_KEYS as readonly string[]).includes(value);
}

const SKIP: HubspotPaginated<never> = { results: [], after: null };

export function HubspotDataScreenContent() {
  const router = useRouter();
  const { show } = useToast();

  const params = useLocalSearchParams<{ object?: string }>();
  // When a single object is requested, render ONLY that list; otherwise show
  // the combined overview.
  const active = isObjectKey(params.object) ? params.object : null;
  const want = useCallback((key: ObjectKey) => !active || active === key, [active]);
  // A dedicated list page can afford to fetch more rows than the overview.
  const limit = active ? 50 : 10;

  const [contacts, setContacts] = useState<LoadState<HubspotContactSummary>>(() =>
    seedState(crmCacheKey('hubspot', 'contacts')),
  );
  const [deals, setDeals] = useState<LoadState<HubspotDealSummary>>(() =>
    seedState(crmCacheKey('hubspot', 'deals')),
  );
  const [companies, setCompanies] = useState<LoadState<HubspotCompanySummary>>(() =>
    seedState(crmCacheKey('hubspot', 'companies')),
  );
  const [tickets, setTickets] = useState<LoadState<HubspotTicketSummary>>(() =>
    seedState(crmCacheKey('hubspot', 'tickets')),
  );
  const [products, setProducts] = useState<LoadState<HubspotProductSummary>>(() =>
    seedState(crmCacheKey('hubspot', 'products')),
  );
  const [orders, setOrders] = useState<LoadState<HubspotOrderSummary>>(() =>
    seedState(crmCacheKey('hubspot', 'orders')),
  );
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const initial = mode === 'initial';
      const k = (object: ObjectKey) => crmCacheKey('hubspot', object);

      // Fetch a wanted object unless this is an initial (focus) load and its
      // cache is still fresh. Pull-to-refresh (mode 'refresh') always fetches.
      const need = (object: ObjectKey) =>
        want(object) && !(initial && isCrmFresh(k(object)));

      if (initial) {
        // Show the skeleton only where there's nothing cached to display.
        const skeleton = (object: ObjectKey) =>
          want(object) && getCrmCache(k(object)) === undefined;
        setContacts((s) => ({ ...s, loading: skeleton('contacts'), error: null }));
        setDeals((s) => ({ ...s, loading: skeleton('deals'), error: null }));
        setCompanies((s) => ({ ...s, loading: skeleton('companies'), error: null }));
        setTickets((s) => ({ ...s, loading: skeleton('tickets'), error: null }));
        setProducts((s) => ({ ...s, loading: skeleton('products'), error: null }));
        setOrders((s) => ({ ...s, loading: skeleton('orders'), error: null }));
      }

      // Fetch only the objects that need a network hit. Fire in parallel — one
      // slow surface shouldn't gate the others.
      const [c, d, co, t, p, o] = await Promise.allSettled([
        need('contacts') ? hubspotApi.listContacts({ limit }) : Promise.resolve(SKIP),
        need('deals') ? hubspotApi.listDeals({ limit }) : Promise.resolve(SKIP),
        need('companies') ? hubspotApi.listCompanies({ limit }) : Promise.resolve(SKIP),
        need('tickets') ? hubspotApi.listTickets({ limit }) : Promise.resolve(SKIP),
        need('products') ? hubspotApi.listProducts({ limit }) : Promise.resolve(SKIP),
        need('orders') ? hubspotApi.listOrders({ limit }) : Promise.resolve(SKIP),
      ]);

      if (need('contacts')) commit(k('contacts'), stateFor(c), setContacts);
      if (need('deals')) commit(k('deals'), stateFor(d), setDeals);
      if (need('companies')) commit(k('companies'), stateFor(co), setCompanies);
      if (need('tickets')) commit(k('tickets'), stateFor(t), setTickets);
      if (need('products')) commit(k('products'), stateFor(p), setProducts);
      if (need('orders')) commit(k('orders'), stateFor(o), setOrders);
    },
    [want, limit],
  );

  useFocusEffect(
    useCallback(() => {
      // Settings screen / OAuth deep links may have refreshed tokens — fetch
      // fresh data every time the screen comes back into focus.
      void loadAll('initial');
    }, [loadAll]),
  );

  // Refetch a single object without a skeleton flash — keep the current rows
  // visible and swap them in on success (live update).
  const reloadObject = useCallback(
    async (key: ObjectKey) => {
      const ck = crmCacheKey('hubspot', key);
      try {
        if (key === 'contacts') {
          commit(ck, stateFor(await settle(hubspotApi.listContacts({ limit }))), setContacts);
        } else if (key === 'deals') {
          commit(ck, stateFor(await settle(hubspotApi.listDeals({ limit }))), setDeals);
        } else if (key === 'companies') {
          commit(ck, stateFor(await settle(hubspotApi.listCompanies({ limit }))), setCompanies);
        } else if (key === 'tickets') {
          commit(ck, stateFor(await settle(hubspotApi.listTickets({ limit }))), setTickets);
        } else if (key === 'products') {
          commit(ck, stateFor(await settle(hubspotApi.listProducts({ limit }))), setProducts);
        } else if (key === 'orders') {
          commit(ck, stateFor(await settle(hubspotApi.listOrders({ limit }))), setOrders);
        }
      } catch {
        // Non-fatal: keep the current rows; reconciles on next focus/refresh.
      }
    },
    [limit],
  );

  // Sprint 2: when a chat command mutates HubSpot data, refetch just the
  // affected object if it's currently rendered on this screen.
  const onCrmInvalidate = useCallback(
    (payload: { provider?: string; object?: string }) => {
      if (payload?.provider !== 'hubspot') return;
      const key = payload.object;
      if (!isObjectKey(key) || !want(key)) return;
      void reloadObject(key);
    },
    [want, reloadObject],
  );
  useRealtimeEvent('crm.invalidate', onCrmInvalidate);

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

  // Gate to HubSpot users. We don't want a non-HubSpot account opening
  // /hubspot from a stale deep link and seeing an empty browse screen.
  const provider = getUser()?.provider;
  if (provider && provider !== 'hubspot') {
    return (
      <ScreenShell edges={['bottom']}>
        <PageHeader title={`${CRM_LABELS.hubspot} data`} showBack onBack={() => router.back()} />
        <View style={styles.notFor}>
          <MaterialIcons name="info-outline" size={40} color="#80868B" />
          <Text style={styles.notForTitle}>{CRM_LABELS.hubspot} only</Text>
          <Text style={styles.notForText}>
            This view shows {CRM_LABELS.hubspot} contacts, deals, and companies. Your account is on{' '}
            {getCrmLabel(provider)} — open Settings to switch CRMs.
          </Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell edges={['bottom']}>
      <PageHeader
        title={active ? `HubSpot ${OBJECT_TITLES[active]}` : 'HubSpot data'}
        showBack
        onBack={() => router.back()}
      />
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
        {want('contacts') && (
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
        )}

        {want('deals') && (
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
        )}

        {want('companies') && (
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
        )}

        {want('tickets') && (
          <Section
            icon="confirmation-number"
            title="Tickets"
            state={tickets}
            emptyText="No tickets in your HubSpot portal yet."
            renderRow={(row) => (
              <RowCard
                key={row.id}
                title={row.subject}
                subtitle={row.content}
                meta={[row.priority, row.stage].filter(Boolean).join(' · ') || undefined}
                onPress={() => handleCopy('Ticket id', row.id)}
              />
            )}
          />
        )}

        {want('products') && (
          <Section
            icon="sell"
            title="Products"
            state={products}
            emptyText="No products in your HubSpot portal yet."
            renderRow={(row) => (
              <RowCard
                key={row.id}
                title={row.name}
                subtitle={
                  typeof row.price === 'number'
                    ? `$${row.price.toLocaleString()}`
                    : undefined
                }
                meta={
                  [row.sku ? `SKU ${row.sku}` : undefined, row.description]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                onPress={() => handleCopy('Product id', row.id)}
              />
            )}
          />
        )}

        {want('orders') && (
          <Section
            icon="receipt-long"
            title="Orders"
            state={orders}
            emptyText="No orders in your HubSpot portal yet."
            renderRow={(row) => (
              <RowCard
                key={row.id}
                title={row.name}
                subtitle={
                  typeof row.totalPrice === 'number'
                    ? `$${row.totalPrice.toLocaleString()}`
                    : undefined
                }
                meta={[row.status, row.currency].filter(Boolean).join(' · ') || undefined}
                onPress={() => handleCopy('Order id', row.id)}
              />
            )}
          />
        )}

        <Text style={styles.footnote}>
          Read-only browse view. Use the chat assistant for search and conversational
          queries against the same data.
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Wrap a single promise into a settled result so it can reuse `stateFor`
// (which turns a rejection into an error state instead of throwing).
async function settle<T>(p: Promise<T>): Promise<PromiseSettledResult<T>> {
  const [result] = await Promise.allSettled([p]);
  return result;
}

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
