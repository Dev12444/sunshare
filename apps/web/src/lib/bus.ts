/**
 * In-process event bus behind /api/events — Rahi, H4–H6.
 *
 * Trades, settlements, broker decisions, donations and badges are published
 * here by the route that causes them and fan out to every open SSE stream.
 * Ticks deliberately do not pass through: the browser reads those straight off
 * the engine WebSocket.
 *
 * Subscribers live in this process only, which is fine for the demo (one Node
 * server) but means a multi-instance deploy would need Redis pub/sub or similar
 * for a client to see an event raised by a different instance.
 */
import type { ServerEvent } from '@sunshare/shared';

type Subscriber = (event: ServerEvent) => void;

const globalForBus = globalThis as unknown as { subscribers?: Set<Subscriber> };

const subscribers: Set<Subscriber> = (globalForBus.subscribers ??= new Set());

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function publish(event: ServerEvent): void {
  for (const fn of subscribers) {
    // One broken stream must not stop the others from being served.
    try {
      fn(event);
    } catch {
      subscribers.delete(fn);
    }
  }
}

export function subscriberCount(): number {
  return subscribers.size;
}
