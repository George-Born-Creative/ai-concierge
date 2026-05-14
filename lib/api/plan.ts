import { apiRequest } from './client';
import type { Plan, SelectPlanRequest, SelectPlanResponse } from './types';

export async function getPlans(): Promise<Plan[]> {
  return apiRequest<Plan[]>('/plans');
}

export async function selectPlan(data: SelectPlanRequest, token: string): Promise<SelectPlanResponse> {
  return apiRequest<SelectPlanResponse>('/plans/select', {
    method: 'POST',
    body: data,
    token,
  });
}
