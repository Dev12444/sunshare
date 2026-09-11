/**
 * Typed client for Dev's FastAPI engine — shared by both pairs.
 *
 * Everything here is a plain fetch against NEXT_PUBLIC_ENGINE_URL. When
 * NEXT_PUBLIC_USE_MOCKS is true, MSW intercepts these calls in the browser and
 * answers from src/mocks/fixtures — so the frontend pair never waits on the
 * backend pair.
 */
import type {
  BrokerPolicy,
  CarbonSummary,
  MarketState,
  MatchRequest,
  MatchResult,
} from '@sunshare/shared';

const BASE = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8000';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`engine ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export const engine = {
  health: () => call<{ status: string; simSpeed: number }>('/health'),

  marketState: () => call<MarketState>('/market/state'),

  /** Runs the uniform-price double auction + MCMF matching for one slot. */
  match: (body: MatchRequest) =>
    call<MatchResult>('/match', { method: 'POST', body: JSON.stringify(body) }),

  /** Turns a natural-language goal into a validated, corridor-clamped policy. */
  brokerPolicy: (userId: string, goal: string) =>
    call<BrokerPolicy>('/broker/policy', {
      method: 'POST',
      body: JSON.stringify({ userId, goal }),
    }),

  carbon: (userId: string) => call<CarbonSummary>(`/carbon/${userId}`),
};
