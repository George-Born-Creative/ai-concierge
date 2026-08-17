import { apiRequest } from './client';
import type {
  HubspotAuthUrlResponse,
  HubspotCompanySummary,
  HubspotCompanyBatchResponse,
  HubspotCompanyDetail,
  HubspotCompanyWriteInput,
  HubspotContactSummary,
  HubspotContactWriteInput,
  HubspotDealCreateInput,
  HubspotDealSummary,
  HubspotDealBatchResponse,
  HubspotDealDetail,
  HubspotDealWriteInput,
  HubspotPipeline,
  HubspotOrderSummary,
  HubspotPaginated,
  HubspotProductSummary,
  HubspotProductWriteInput,
  HubspotStatusResponse,
  HubspotTicketSummary,
  HubspotTicketBatchResponse,
  HubspotTicketCreateInput,
  HubspotTicketDetail,
  HubspotTicketWriteInput,
  ListHubspotParams,
  SearchHubspotContactsParams,
  SearchHubspotCompaniesParams,
  SearchHubspotDealsParams,
  SearchHubspotOrdersParams,
  SearchHubspotProductsParams,
  SearchHubspotTicketsParams,
} from './types';

// ─── OAuth lifecycle ─────────────────────────────────────────────────────────

// Returns the HubSpot OAuth URL the app should open in an in-app browser
// session. `returnUrl` is required so the backend can route the redirect
// back to the right deep link (handles aiconcierge:// and Expo Go's exp://).
export async function getAuthUrl(returnUrl: string): Promise<HubspotAuthUrlResponse> {
  const q = new URLSearchParams({ returnUrl });
  return apiRequest<HubspotAuthUrlResponse>(
    `/integrations/hubspot/auth-url?${q.toString()}`,
  );
}

export async function getStatus(): Promise<HubspotStatusResponse> {
  return apiRequest<HubspotStatusResponse>('/integrations/hubspot/status');
}

export async function disconnect(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('/integrations/hubspot/disconnect', {
    method: 'POST',
  });
}

export async function reconnect(returnUrl: string): Promise<HubspotAuthUrlResponse> {
  const q = new URLSearchParams({ returnUrl });
  return apiRequest<HubspotAuthUrlResponse>(
    `/integrations/hubspot/reconnect?${q.toString()}`,
    { method: 'POST' },
  );
}

// ─── CRM: contacts ───────────────────────────────────────────────────────────

export async function listContacts(
  params?: ListHubspotParams,
): Promise<HubspotPaginated<HubspotContactSummary>> {
  return apiRequest<HubspotPaginated<HubspotContactSummary>>(
    withQuery('/integrations/hubspot/contacts', params),
  );
}

export async function searchContacts(
  params: SearchHubspotContactsParams,
): Promise<HubspotPaginated<HubspotContactSummary>> {
  return apiRequest<HubspotPaginated<HubspotContactSummary>>(
    withQuery('/integrations/hubspot/contacts/search', params),
  );
}

export async function getContact(
  id: string,
  idProperty: 'id' | 'email' = 'id',
): Promise<HubspotContactSummary> {
  const query = idProperty === 'email' ? '?idProperty=email' : '';
  return apiRequest<HubspotContactSummary>(
    `/integrations/hubspot/contacts/${encodeURIComponent(id)}${query}`,
  );
}

export async function createContact(
  input: HubspotContactWriteInput,
): Promise<HubspotContactSummary> {
  return apiRequest<HubspotContactSummary>('/integrations/hubspot/contacts', {
    method: 'POST',
    body: input,
  });
}

export async function updateContact(
  id: string,
  input: HubspotContactWriteInput,
  idProperty: 'id' | 'email' = 'id',
): Promise<HubspotContactSummary> {
  return apiRequest<HubspotContactSummary>(
    withQuery(`/integrations/hubspot/contacts/${encodeURIComponent(id)}`, {
      idProperty: idProperty === 'id' ? undefined : idProperty,
    }),
    { method: 'PATCH', body: input },
  );
}

export async function deleteContact(
  id: string,
): Promise<{ id: string; deleted: true }> {
  return apiRequest(`/integrations/hubspot/contacts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ─── CRM: deals ──────────────────────────────────────────────────────────────

export async function listDeals(
  params?: ListHubspotParams,
): Promise<HubspotPaginated<HubspotDealSummary>> {
  return apiRequest<HubspotPaginated<HubspotDealSummary>>(
    withQuery('/integrations/hubspot/deals', params),
  );
}

export async function listRecentDeals(
  params?: ListHubspotParams,
): Promise<HubspotPaginated<HubspotDealSummary>> {
  return apiRequest<HubspotPaginated<HubspotDealSummary>>(
    withQuery('/integrations/hubspot/deals/recent', params),
  );
}

export async function searchDeals(
  params: SearchHubspotDealsParams,
): Promise<HubspotPaginated<HubspotDealSummary>> {
  return apiRequest<HubspotPaginated<HubspotDealSummary>>(
    withQuery('/integrations/hubspot/deals/search', params),
  );
}

export async function getDeal(
  id: string,
  idProperty: string = 'id',
): Promise<HubspotDealSummary> {
  return apiRequest<HubspotDealSummary>(
    withQuery(`/integrations/hubspot/deals/${encodeURIComponent(id)}`, {
      idProperty: idProperty === 'id' ? undefined : idProperty,
    }),
  );
}

export async function getDealDetail(
  id: string,
  params?: {
    idProperty?: string;
    properties?: string;
    propertiesWithHistory?: string;
    associations?: string;
  },
): Promise<HubspotDealDetail> {
  return apiRequest<HubspotDealDetail>(
    withQuery(`/integrations/hubspot/deals/${encodeURIComponent(id)}/detail`, params),
  );
}

export async function listDealPipelines(): Promise<HubspotPipeline[]> {
  return apiRequest<HubspotPipeline[]>('/integrations/hubspot/deals/pipelines');
}

export async function createDeal(input: HubspotDealCreateInput) {
  return apiRequest<HubspotDealSummary>('/integrations/hubspot/deals', {
    method: 'POST',
    body: input,
  });
}

export async function updateDeal(
  id: string,
  input: HubspotDealWriteInput,
  idProperty: string = 'id',
) {
  return apiRequest<HubspotDealSummary>(
    withQuery(`/integrations/hubspot/deals/${encodeURIComponent(id)}`, {
      idProperty: idProperty === 'id' ? undefined : idProperty,
    }),
    { method: 'PATCH', body: input },
  );
}

export async function deleteDeal(id: string): Promise<{ id: string; deleted: true }> {
  return apiRequest(`/integrations/hubspot/deals/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function batchReadDeals(input: {
  ids: string[];
  idProperty?: string;
  properties?: string[];
  propertiesWithHistory?: string[];
}): Promise<HubspotDealBatchResponse> {
  return apiRequest('/integrations/hubspot/deals/batch/read', { method: 'POST', body: input });
}

export async function batchUpdateDeals(input: {
  inputs: { id: string; idProperty?: string; properties: HubspotDealWriteInput }[];
}): Promise<HubspotDealBatchResponse> {
  return apiRequest('/integrations/hubspot/deals/batch/update', { method: 'POST', body: input });
}

export async function batchArchiveDeals(ids: string[]): Promise<{ ids: string[]; archived: true }> {
  return apiRequest('/integrations/hubspot/deals/batch/archive', {
    method: 'POST',
    body: { ids },
  });
}

export async function associateDeal(
  dealId: string,
  toObjectType: string,
  toObjectId: string,
): Promise<{ ok: true }> {
  return apiRequest(
    `/integrations/hubspot/deals/${encodeURIComponent(dealId)}/associations/${encodeURIComponent(
      toObjectType,
    )}/${encodeURIComponent(toObjectId)}`,
    { method: 'PUT' },
  );
}

export async function disassociateDeal(
  dealId: string,
  toObjectType: string,
  toObjectId: string,
): Promise<{ ok: true }> {
  return apiRequest(
    `/integrations/hubspot/deals/${encodeURIComponent(dealId)}/associations/${encodeURIComponent(
      toObjectType,
    )}/${encodeURIComponent(toObjectId)}`,
    { method: 'DELETE' },
  );
}

// ─── CRM: companies ──────────────────────────────────────────────────────────

export async function listCompanies(
  params?: ListHubspotParams,
): Promise<HubspotPaginated<HubspotCompanySummary>> {
  return apiRequest<HubspotPaginated<HubspotCompanySummary>>(
    withQuery('/integrations/hubspot/companies', params),
  );
}

export async function listRecentCompanies(
  params?: ListHubspotParams,
): Promise<HubspotPaginated<HubspotCompanySummary>> {
  return apiRequest(withQuery('/integrations/hubspot/companies/recent', params));
}

export async function searchCompanies(
  params: SearchHubspotCompaniesParams,
): Promise<HubspotPaginated<HubspotCompanySummary>> {
  return apiRequest(withQuery('/integrations/hubspot/companies/search', params));
}

export async function getCompany(
  id: string,
  idProperty: string = 'id',
): Promise<HubspotCompanySummary> {
  return apiRequest<HubspotCompanySummary>(
    withQuery(`/integrations/hubspot/companies/${encodeURIComponent(id)}`, {
      idProperty: idProperty === 'id' ? undefined : idProperty,
    }),
  );
}

export async function getCompanyDetail(
  id: string,
  params?: {
    idProperty?: string;
    properties?: string;
    propertiesWithHistory?: string;
    associations?: string;
  },
): Promise<HubspotCompanyDetail> {
  return apiRequest(
    withQuery(`/integrations/hubspot/companies/${encodeURIComponent(id)}/detail`, params),
  );
}

export async function createCompany(
  input: HubspotCompanyWriteInput,
): Promise<HubspotCompanySummary> {
  return apiRequest('/integrations/hubspot/companies', { method: 'POST', body: input });
}

export async function updateCompany(
  id: string,
  input: HubspotCompanyWriteInput,
  idProperty: string = 'id',
): Promise<HubspotCompanySummary> {
  return apiRequest(
    withQuery(`/integrations/hubspot/companies/${encodeURIComponent(id)}`, {
      idProperty: idProperty === 'id' ? undefined : idProperty,
    }),
    { method: 'PATCH', body: input },
  );
}

export async function deleteCompany(id: string): Promise<{ id: string; deleted: true }> {
  return apiRequest(`/integrations/hubspot/companies/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function batchReadCompanies(input: {
  ids: string[];
  idProperty?: string;
  properties?: string[];
  propertiesWithHistory?: string[];
}): Promise<HubspotCompanyBatchResponse> {
  return apiRequest('/integrations/hubspot/companies/batch/read', { method: 'POST', body: input });
}

export async function batchUpdateCompanies(input: {
  inputs: { id: string; idProperty?: string; properties: HubspotCompanyWriteInput }[];
}): Promise<HubspotCompanyBatchResponse> {
  return apiRequest('/integrations/hubspot/companies/batch/update', {
    method: 'POST',
    body: input,
  });
}

export async function batchArchiveCompanies(
  ids: string[],
): Promise<{ ids: string[]; archived: true }> {
  return apiRequest('/integrations/hubspot/companies/batch/archive', {
    method: 'POST',
    body: { ids },
  });
}

export async function associateCompany(
  companyId: string,
  toObjectType: string,
  toObjectId: string,
): Promise<{ ok: true }> {
  return apiRequest(
    `/integrations/hubspot/companies/${encodeURIComponent(companyId)}/associations/${encodeURIComponent(
      toObjectType,
    )}/${encodeURIComponent(toObjectId)}`,
    { method: 'PUT' },
  );
}

export async function disassociateCompany(
  companyId: string,
  toObjectType: string,
  toObjectId: string,
): Promise<{ ok: true }> {
  return apiRequest(
    `/integrations/hubspot/companies/${encodeURIComponent(companyId)}/associations/${encodeURIComponent(
      toObjectType,
    )}/${encodeURIComponent(toObjectId)}`,
    { method: 'DELETE' },
  );
}

// ─── CRM: tickets ────────────────────────────────────────────────────────────

export async function listTickets(
  params?: ListHubspotParams,
): Promise<HubspotPaginated<HubspotTicketSummary>> {
  return apiRequest<HubspotPaginated<HubspotTicketSummary>>(
    withQuery('/integrations/hubspot/tickets', params),
  );
}

export async function searchTickets(
  params: SearchHubspotTicketsParams,
): Promise<HubspotPaginated<HubspotTicketSummary>> {
  return apiRequest<HubspotPaginated<HubspotTicketSummary>>(
    withQuery('/integrations/hubspot/tickets/search', params),
  );
}

export async function getTicket(id: string): Promise<HubspotTicketSummary> {
  return apiRequest<HubspotTicketSummary>(
    `/integrations/hubspot/tickets/${encodeURIComponent(id)}`,
  );
}

export async function getTicketDetail(
  id: string,
  params?: {
    idProperty?: string;
    properties?: string;
    propertiesWithHistory?: string;
    associations?: string;
    archived?: boolean;
  },
): Promise<HubspotTicketDetail> {
  return apiRequest(
    withQuery(`/integrations/hubspot/tickets/${encodeURIComponent(id)}/detail`, params),
  );
}

export async function listTicketPipelines(): Promise<HubspotPipeline[]> {
  return apiRequest('/integrations/hubspot/tickets/pipelines');
}

export async function listTicketProperties(): Promise<unknown> {
  return apiRequest('/integrations/hubspot/tickets/properties');
}

export async function createTicket(input: HubspotTicketCreateInput): Promise<HubspotTicketSummary> {
  return apiRequest('/integrations/hubspot/tickets', { method: 'POST', body: input });
}

export async function updateTicket(
  id: string,
  input: HubspotTicketWriteInput,
  idProperty = 'id',
): Promise<HubspotTicketSummary> {
  return apiRequest(
    withQuery(`/integrations/hubspot/tickets/${encodeURIComponent(id)}`, {
      idProperty: idProperty === 'id' ? undefined : idProperty,
    }),
    { method: 'PATCH', body: input },
  );
}

export async function archiveTicket(id: string): Promise<{ id: string; archived: true }> {
  return apiRequest(`/integrations/hubspot/tickets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function batchReadTickets(input: {
  ids: string[];
  idProperty?: string;
  properties?: string[];
  propertiesWithHistory?: string[];
}): Promise<HubspotTicketBatchResponse> {
  return apiRequest('/integrations/hubspot/tickets/batch/read', { method: 'POST', body: input });
}

export async function batchUpdateTickets(input: {
  inputs: { id: string; idProperty?: string; properties: HubspotTicketWriteInput }[];
}): Promise<HubspotTicketBatchResponse> {
  return apiRequest('/integrations/hubspot/tickets/batch/update', { method: 'POST', body: input });
}

export async function batchArchiveTickets(
  ids: string[],
): Promise<{ ids: string[]; archived: true }> {
  return apiRequest('/integrations/hubspot/tickets/batch/archive', {
    method: 'POST',
    body: { ids },
  });
}

export async function associateTicket(
  ticketId: string,
  toObjectType: string,
  toObjectId: string,
  associationTypeId?: number,
): Promise<{ ok: true }> {
  return apiRequest(
    withQuery(
      `/integrations/hubspot/tickets/${encodeURIComponent(ticketId)}/associations/${encodeURIComponent(
        toObjectType,
      )}/${encodeURIComponent(toObjectId)}`,
      { associationTypeId },
    ),
    { method: 'PUT' },
  );
}

export async function disassociateTicket(
  ticketId: string,
  toObjectType: string,
  toObjectId: string,
  associationTypeId?: number,
): Promise<{ ok: true }> {
  return apiRequest(
    withQuery(
      `/integrations/hubspot/tickets/${encodeURIComponent(ticketId)}/associations/${encodeURIComponent(
        toObjectType,
      )}/${encodeURIComponent(toObjectId)}`,
      { associationTypeId },
    ),
    { method: 'DELETE' },
  );
}

export async function listTicketAssociationLabels(toObjectType: string): Promise<unknown> {
  return apiRequest(
    `/integrations/hubspot/tickets/associations/${encodeURIComponent(toObjectType)}/labels`,
  );
}

// ─── CRM: products ───────────────────────────────────────────────────────────

export async function listProducts(
  params?: ListHubspotParams,
): Promise<HubspotPaginated<HubspotProductSummary>> {
  return apiRequest<HubspotPaginated<HubspotProductSummary>>(
    withQuery('/integrations/hubspot/products', params),
  );
}

export async function searchProducts(
  params: SearchHubspotProductsParams,
): Promise<HubspotPaginated<HubspotProductSummary>> {
  return apiRequest<HubspotPaginated<HubspotProductSummary>>(
    withQuery('/integrations/hubspot/products/search', params),
  );
}

export async function getProduct(id: string): Promise<HubspotProductSummary> {
  return apiRequest<HubspotProductSummary>(
    `/integrations/hubspot/products/${encodeURIComponent(id)}`,
  );
}

export async function listProductProperties(): Promise<unknown> {
  return apiRequest('/integrations/hubspot/products/properties');
}

export async function createProduct(
  input: HubspotProductWriteInput & { name: string },
): Promise<HubspotProductSummary> {
  return apiRequest('/integrations/hubspot/products', { method: 'POST', body: input });
}

export async function updateProduct(
  id: string,
  input: HubspotProductWriteInput,
): Promise<HubspotProductSummary> {
  return apiRequest(`/integrations/hubspot/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

export async function deleteProduct(id: string): Promise<{ id: string; deleted: true }> {
  return apiRequest(`/integrations/hubspot/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function addProductToDeal(
  productId: string,
  input: { dealId: string; quantity?: number; name?: string },
): Promise<unknown> {
  return apiRequest(
    `/integrations/hubspot/products/${encodeURIComponent(productId)}/line-items`,
    { method: 'POST', body: input },
  );
}

// ─── CRM: orders ─────────────────────────────────────────────────────────────

export async function listOrders(
  params?: ListHubspotParams,
): Promise<HubspotPaginated<HubspotOrderSummary>> {
  return apiRequest<HubspotPaginated<HubspotOrderSummary>>(
    withQuery('/integrations/hubspot/orders', params),
  );
}

export async function searchOrders(
  params: SearchHubspotOrdersParams,
): Promise<HubspotPaginated<HubspotOrderSummary>> {
  return apiRequest<HubspotPaginated<HubspotOrderSummary>>(
    withQuery('/integrations/hubspot/orders/search', params),
  );
}

export async function getOrder(id: string): Promise<HubspotOrderSummary> {
  return apiRequest<HubspotOrderSummary>(
    `/integrations/hubspot/orders/${encodeURIComponent(id)}`,
  );
}

// ─── Internals ───────────────────────────────────────────────────────────────

function withQuery(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!params) return path;
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    q.set(key, String(value));
  }
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}
