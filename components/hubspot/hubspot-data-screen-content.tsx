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
import { UiRadii, UiSpacing, UiTypography } from '@/constants/theme';
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
import { useAppTheme } from '@/lib/theme/theme-provider';
import { useToast } from '@/lib/toast';

type LoadState<T> = {
  data: T[];
  loading: boolean;
  error: string | null;
  after?: string | null;
};

// Seed a section from the CRM cache: show cached rows instantly (no skeleton)
// when present, otherwise start in the loading state until the first fetch.
function seedState<T>(key: string): LoadState<T> {
  const data = getCrmCache<T>(key);
  return { data: data ?? [], loading: data === undefined, error: null, after: null };
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
  const { colors } = useAppTheme();
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
  const [loadingMoreCompanies, setLoadingMoreCompanies] = useState(false);
  const [loadingMoreTickets, setLoadingMoreTickets] = useState(false);
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);

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

  async function loadMoreTickets() {
    if (!tickets.after || loadingMoreTickets) return;
    setLoadingMoreTickets(true);
    try {
      const page = await hubspotApi.listTickets({ limit, after: tickets.after });
      const data = [
        ...tickets.data,
        ...page.results.filter(
          (row) => !tickets.data.some((existing) => existing.id === row.id),
        ),
      ];
      commit(
        crmCacheKey('hubspot', 'tickets'),
        { data, loading: false, error: null, after: page.after },
        setTickets,
      );
    } catch (error) {
      show(error instanceof Error ? error.message : 'Could not load more tickets.', 'error');
    } finally {
      setLoadingMoreTickets(false);
    }
  }

  async function loadMoreCompanies() {
    if (!companies.after || loadingMoreCompanies) return;
    setLoadingMoreCompanies(true);
    try {
      const page = await hubspotApi.listCompanies({ limit, after: companies.after });
      const data = [
        ...companies.data,
        ...page.results.filter(
          (row) => !companies.data.some((existing) => existing.id === row.id),
        ),
      ];
      commit(
        crmCacheKey('hubspot', 'companies'),
        { data, loading: false, error: null, after: page.after },
        setCompanies,
      );
    } catch (error) {
      show(error instanceof Error ? error.message : 'Could not load more companies.', 'error');
    } finally {
      setLoadingMoreCompanies(false);
    }
  }

  async function loadMoreProducts() {
    if (!products.after || loadingMoreProducts) return;
    setLoadingMoreProducts(true);
    try {
      const page = await hubspotApi.listProducts({ limit, after: products.after });
      const data = [
        ...products.data,
        ...page.results.filter(
          (row) => !products.data.some((existing) => existing.id === row.id),
        ),
      ];
      commit(
        crmCacheKey('hubspot', 'products'),
        { data, loading: false, error: null, after: page.after },
        setProducts,
      );
    } catch (error) {
      show(error instanceof Error ? error.message : 'Could not load more products.', 'error');
    } finally {
      setLoadingMoreProducts(false);
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
          <MaterialIcons name="info-outline" size={40} color={colors.icon} />
          <Text style={styles.notForTitle}>{CRM_LABELS.hubspot} only</Text>
          <Text style={styles.notForText}>
            This view shows {CRM_LABELS.hubspot} contacts, deals, and companies. Your account is on{' '}
            {getCrmLabel(provider)} — switch CRMs in Settings.
          </Text>
          <Pressable
            style={[styles.notForButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/settings/crm')}>
            <Text style={[styles.notForButtonText, { color: colors.onPrimary }]}>
              Open CRM provider
            </Text>
          </Pressable>
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
          tintColor={colors.primary}
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
                    ? formatDealAmount(row.amount, row.currency)
                    : undefined
                }
                meta={
                  [row.stageLabel ?? row.stage, row.pipelineLabel ?? row.pipeline]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                onPress={() => handleCopy('Deal id', row.id)}
              />
            )}
          />
        )}

        {want('companies') && (
          <View style={styles.paginatedSection}>
            <Section
              icon="business"
              title="Companies"
              state={companies}
              emptyText="No companies in your HubSpot portal yet."
              renderRow={(row) => (
                <CompanyCard
                  key={row.id}
                  company={row}
                  onPress={() => handleCopy('Company id', row.id)}
                />
              )}
            />
            {active === 'companies' && companies.after ? (
              <Pressable
                disabled={loadingMoreCompanies}
                onPress={() => void loadMoreCompanies()}
                style={({ pressed }) => [
                  styles.loadMoreButton,
                  (pressed || loadingMoreCompanies) && { opacity: 0.7 },
                ]}>
                <Text style={styles.loadMoreText}>
                  {loadingMoreCompanies ? 'Loading…' : 'Load more companies'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {want('tickets') && (
          <View style={styles.paginatedSection}>
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
                  meta={
                    [row.priority, row.pipelineLabel, row.stageLabel ?? row.stage]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  onPress={() => handleCopy('Ticket id', row.id)}
                />
              )}
            />
            {active === 'tickets' && tickets.after ? (
              <Pressable
                disabled={loadingMoreTickets}
                onPress={() => void loadMoreTickets()}
                style={({ pressed }) => [
                  styles.loadMoreButton,
                  (pressed || loadingMoreTickets) && { opacity: 0.7 },
                ]}>
                <Text style={styles.loadMoreText}>
                  {loadingMoreTickets ? 'Loading…' : 'Load more tickets'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {want('products') && (
          <View style={styles.paginatedSection}>
            <Section
              icon="sell"
              title="Products"
              state={products}
              emptyText="No products in your HubSpot portal yet."
              renderRow={(row) => (
                <ProductCard
                  key={row.id}
                  product={row}
                  onPress={() => handleCopy('Product id', row.id)}
                />
              )}
            />
            {active === 'products' && products.after ? (
              <Pressable
                disabled={loadingMoreProducts}
                onPress={() => void loadMoreProducts()}
                style={({ pressed }) => [
                  styles.loadMoreButton,
                  (pressed || loadingMoreProducts) && { opacity: 0.7 },
                ]}>
                <Text style={styles.loadMoreText}>
                  {loadingMoreProducts ? 'Loading…' : 'Load more products'}
                </Text>
              </Pressable>
            ) : null}
          </View>
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
          Browse and copy record IDs here. Use the voice or chat assistant to search,
          create, update, archive, or add a product to a deal as a line item.
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

function formatDealAmount(amount: number, currency?: string): string {
  if (!currency) return amount.toLocaleString();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }

}

function formatProductPricing(product: HubspotProductSummary): string | undefined {
  if (product.pricingModel) {
    const count = product.tierRanges?.length ?? 0;
    return `${product.pricingModel} tier pricing${count ? ` · ${count} tiers` : ''}`;
  }
  return typeof product.price === 'number'
    ? `Price ${product.price.toLocaleString()}`
    : undefined;
}

function formatProductMeta(product: HubspotProductSummary): string | undefined {
  return [
    product.sku ? `SKU ${product.sku}` : undefined,
    typeof product.cost === 'number' ? `Cost ${product.cost.toLocaleString()}` : undefined,
    product.recurringBillingPeriod ? `Billing ${product.recurringBillingPeriod}` : undefined,
    formatProductTiers(product),
    product.description,
  ]
    .filter(Boolean)
    .join(' · ') || undefined;
}

function formatProductTiers(product: HubspotProductSummary): string | undefined {
  if (!product.tierRanges?.length || !product.tierPrices?.length) return undefined;
  return product.tierPrices
    .map((tier) => {
      const range = product.tierRanges?.[tier.index];
      if (!range) return undefined;
      const label = range.end === undefined ? `${range.start}+` : `${range.start}–${range.end}`;
      return `${label}: ${tier.price.toLocaleString()}${tier.currency ? ` ${tier.currency}` : ''}`;
    })
    .filter(Boolean)
    .join('; ');
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
    return {
      data: settled.value.results,
      loading: false,
      error: null,
      after: settled.value.after,
    };
  }
  const reason = settled.reason;
  const message =
    reason instanceof ApiError
      ? reason.message
      : reason instanceof Error
        ? reason.message
        : 'Could not load from HubSpot.';
  return { data: [], loading: false, error: message, after: null };
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
  const { colors } = useAppTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <MaterialIcons name={icon} size={18} color={colors.primary} />
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
            <MaterialIcons name="error-outline" size={18} color={colors.danger} />
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
  const { colors } = useAppTheme();
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
      <MaterialIcons name="content-copy" size={16} color={colors.icon} />
    </Pressable>
  );
}

type CompanyCardProps = {
  company: HubspotCompanySummary;
  onPress?: () => void;
};

function CompanyCard({ company, onPress }: CompanyCardProps) {
  const { colors } = useAppTheme();
  const details = [
    { label: 'Company owner', value: displayCompanyValue(company.ownerId) },
    { label: 'Created date', value: formatHubspotDate(company.createdAt) ?? '—' },
    { label: 'Phone number', value: displayCompanyValue(company.phone) },
    {
      label: 'Last activity date',
      value: formatHubspotDate(company.lastActivityAt) ?? '—',
    },
    { label: 'City', value: displayCompanyValue(company.city) },
    { label: 'Country/region', value: displayCompanyValue(company.country) },
    { label: 'Industry', value: displayCompanyValue(company.industry) },
  ];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.companyCard, pressed && { opacity: 0.85 }]}>
      <View style={styles.companyHeader}>
        <View style={styles.rowCopy}>
          <Text style={styles.companyTitle}>{company.name}</Text>
        </View>
        <MaterialIcons name="content-copy" size={16} color={colors.icon} />
      </View>

      <View style={styles.companyDetails}>
        {details.map((detail) => (
          <View key={detail.label} style={styles.companyDetailRow}>
            <Text style={styles.companyDetailLabel}>{detail.label}</Text>
            <Text selectable style={styles.companyDetailValue}>
              {detail.value}
            </Text>
          </View>
        ))}
      </View>

    </Pressable>
  );
}

type ProductCardProps = {
  product: HubspotProductSummary;
  onPress?: () => void;
};

function ProductCard({ product, onPress }: ProductCardProps) {
  const { colors } = useAppTheme();
  const details = [
    { label: 'Product ID', value: product.id },
    { label: 'Price', value: formatProductPricing(product) ?? '—' },
    { label: 'SKU', value: product.sku ?? '—' },
    {
      label: 'Cost of goods',
      value: typeof product.cost === 'number' ? product.cost.toLocaleString() : '—',
    },
    { label: 'Billing period', value: product.recurringBillingPeriod ?? '—' },
    { label: 'Pricing model', value: product.pricingModel ?? 'Standard' },
    { label: 'Tier prices', value: formatProductTiers(product) ?? '—' },
    { label: 'Description', value: product.description ?? '—' },
    { label: 'Created', value: formatHubspotDate(product.createdAt) ?? '—' },
    { label: 'Last updated', value: formatHubspotDate(product.updatedAt) ?? '—' },
    { label: 'Status', value: product.archived ? 'Archived' : 'Active' },
  ];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.companyCard, pressed && { opacity: 0.85 }]}>
      <View style={styles.companyHeader}>
        <View style={styles.rowCopy}>
          <Text style={styles.companyTitle}>{product.name}</Text>
          <Text style={styles.rowSubtitle}>{formatProductMeta(product) ?? 'No additional details'}</Text>
        </View>
        <MaterialIcons name="content-copy" size={16} color={colors.icon} />
      </View>

      <View style={styles.companyDetails}>
        {details.map((detail) => (
          <View key={detail.label} style={styles.companyDetailRow}>
            <Text style={styles.companyDetailLabel}>{detail.label}</Text>
            <Text selectable style={styles.companyDetailValue}>
              {detail.value}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function formatHubspotDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function displayCompanyValue(value?: string): string {
  const normalized = value?.trim();
  return normalized || '—';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    gap: UiSpacing.lg,
    maxWidth: 720,
    paddingBottom: UiSpacing.xxxl,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.sm,
    width: '100%',
  },

  section: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  paginatedSection: { gap: UiSpacing.sm },
  loadMoreButton: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: UiRadii.card,
    paddingVertical: UiSpacing.sm,
  },
  loadMoreText: {
    color: '#1967D2',
    fontSize: UiTypography.label.fontSize,
    fontWeight: '600',
  },
  sectionHeader: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderBottomColor: '#E8EAED',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.sm,
  },
  sectionIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: UiRadii.icon,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  sectionTitle: {
    color: '#202124',
    flex: 1,
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  sectionCount: {
    color: '#80868B',
    fontSize: UiTypography.label.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.label.lineHeight,
  },
  sectionBody: {
    gap: 1,
    padding: UiSpacing.md,
  },

  rowCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EEF0F3',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    minHeight: 52,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.sm,
  },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { color: '#202124', fontSize: UiTypography.bodySmall.fontSize, fontWeight: '600', lineHeight: UiTypography.bodySmall.lineHeight },
  rowSubtitle: { color: '#5F6368', fontSize: UiTypography.label.fontSize, lineHeight: UiTypography.label.lineHeight },
  rowMeta: { color: '#80868B', fontSize: UiTypography.caption.fontSize, lineHeight: UiTypography.caption.lineHeight },

  companyCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E3E7ED',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    gap: UiSpacing.md,
    padding: UiSpacing.md,
  },
  companyHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: UiSpacing.sm,
  },
  companyTitle: {
    color: '#202124',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  companyDetails: {
    borderTopColor: '#EEF0F3',
    borderTopWidth: 1,
    gap: UiSpacing.xs,
    paddingTop: UiSpacing.sm,
  },
  companyDetailRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: UiSpacing.md,
  },
  companyDetailLabel: {
    color: '#80868B',
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.caption.lineHeight,
    width: 112,
  },
  companyDetailValue: {
    color: '#3C4043',
    flex: 1,
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderRadius: UiRadii.card,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.lg,
  },
  emptyText: { color: '#5F6368', fontSize: UiTypography.label.fontSize, lineHeight: UiTypography.label.lineHeight, textAlign: 'center' },

  errorCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FDEDED',
    borderColor: '#F5C2C7',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    padding: UiSpacing.md,
  },
  errorText: { color: '#5F2120', flex: 1, fontSize: UiTypography.label.fontSize, lineHeight: UiTypography.label.lineHeight },

  skeletonRow: {
    backgroundColor: '#F8FAFF',
    borderRadius: UiRadii.card,
    gap: UiSpacing.sm,
    padding: UiSpacing.md,
  },

  notFor: {
    alignItems: 'center',
    gap: UiSpacing.md,
    padding: UiSpacing.xxxl,
  },
  notForTitle: { color: '#202124', fontSize: UiTypography.cardHeading.fontSize, fontWeight: '600', lineHeight: UiTypography.cardHeading.lineHeight },
  notForText: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    maxWidth: 280,
    textAlign: 'center',
  },
  notForButton: {
    borderRadius: UiRadii.control,
    marginTop: UiSpacing.sm,
    paddingHorizontal: UiSpacing.lg,
    paddingVertical: UiSpacing.sm,
  },
  notForButtonText: {
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },

  footnote: {
    color: '#80868B',
    fontSize: UiTypography.caption.fontSize,
    lineHeight: UiTypography.caption.lineHeight,
    paddingHorizontal: UiSpacing.xxs,
    textAlign: 'center',
  },
});
