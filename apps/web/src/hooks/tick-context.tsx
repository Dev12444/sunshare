'use client';

/**
 * Single shared tick subscription — Diya.
 *
 * useTicks() opens a WebSocket (or, in mock mode, a setInterval emitter).
 * Every dashboard needs the same live numbers, so this context wraps one
 * useTicks() call at the dash layout and every page reads from it instead of
 * each page opening its own connection.
 */
import { createContext, useContext } from 'react';
import { useTicks, type TickState } from './use-ticks';

const TickContext = createContext<TickState | null>(null);

export function TickProvider({ children }: { children: React.ReactNode }) {
  const state = useTicks();
  return <TickContext.Provider value={state}>{children}</TickContext.Provider>;
}

export function useTickContext(): TickState {
  const ctx = useContext(TickContext);
  if (!ctx) throw new Error('useTickContext must be used within <TickProvider>');
  return ctx;
}
