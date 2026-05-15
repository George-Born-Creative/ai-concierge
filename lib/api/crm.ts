import { apiRequest } from './client';
import type {
  Contact,
  ContactsResponse,
  DealInput,
  NormalizedLead,
  OpportunityPatch,
  TaskInput,
} from './types';

// Unified CRM endpoints. The backend resolves the user's active
// provider (GHL or HubSpot) from their subscription + connection
// and routes the call through the matching adapter.

export async function getContacts(token: string, page = 1): Promise<ContactsResponse> {
  return apiRequest<ContactsResponse>(`/crm/contacts?page=${page}`, { token });
}

export async function getContact(contactId: string, token: string): Promise<Contact> {
  return apiRequest<Contact>(`/crm/contacts/${contactId}`, { token });
}

export async function createContact(data: NormalizedLead, token: string): Promise<Contact> {
  return apiRequest<Contact>('/crm/contacts', { method: 'POST', body: data, token });
}

export async function deleteContact(contactId: string, token: string): Promise<void> {
  return apiRequest<void>(`/crm/contacts/${contactId}`, { method: 'DELETE', token });
}

export async function createDeal(data: DealInput, token: string): Promise<{ id: string }> {
  return apiRequest<{ id: string }>('/crm/deals', { method: 'POST', body: data, token });
}

export async function addNote(
  targetId: string,
  note: string,
  token: string
): Promise<{ id: string }> {
  return apiRequest<{ id: string }>('/crm/notes', {
    method: 'POST',
    body: { targetId, note },
    token,
  });
}

export async function createTask(data: TaskInput, token: string): Promise<{ id: string }> {
  return apiRequest<{ id: string }>('/crm/tasks', { method: 'POST', body: data, token });
}

export async function updateOpportunity(
  opportunityId: string,
  patch: OpportunityPatch,
  token: string
): Promise<void> {
  return apiRequest<void>(`/crm/opportunities/${opportunityId}`, {
    method: 'PATCH',
    body: patch,
    token,
  });
}
