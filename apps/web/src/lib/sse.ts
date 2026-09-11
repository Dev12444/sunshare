/**
 * SSE subscriber for /api/events — everything that is not a tick.
 * Rahi produces, Maansi and Diya consume.
 */
import type { ServerEvent } from '@sunshare/shared';

export function subscribeToEvents(
  onEvent: (e: ServerEvent) => void,
  onError?: (e: Event) => void,
): () => void {
  const source = new EventSource('/api/events');

  source.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data) as ServerEvent);
    } catch {
      // Ignore malformed frames rather than killing the stream mid-demo.
    }
  };
  source.onerror = (err) => onError?.(err);

  return () => source.close();
}
