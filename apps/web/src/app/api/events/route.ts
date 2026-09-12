/**
 * GET /api/events — SSE stream of everything that is not a tick — Rahi, H4–H6.
 */
import type { ServerEvent } from '@sunshare/shared';
import { subscribe } from '@/lib/bus';

export const dynamic = 'force-dynamic';

/** Proxies and the service worker will close an idle stream without this. */
const HEARTBEAT_MS = 15_000;

export async function GET(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let open = true;

      const send = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };

      const unsubscribe = subscribe((event: ServerEvent) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      });

      const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);

      function close() {
        if (!open) return;
        open = false;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the client going away.
        }
      }

      // Opens the stream immediately so EventSource fires onopen rather than
      // sitting in CONNECTING until the first real event.
      send(': connected\n\n');

      req.signal.addEventListener('abort', close);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Nginx and similar buffer streamed responses unless told not to.
      'x-accel-buffering': 'no',
    },
  });
}
