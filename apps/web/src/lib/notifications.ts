/**
 * Local notifications — Diya, H17–H19 (client half).
 *
 * Real push delivery needs a server-side subscription store and VAPID keys
 * (POST /api/push — Rahi, still a 501 stub) plus the `push` listener already
 * wired in sw.ts. Until that lands, this fires notifications locally via the
 * Notification API so the pattern is demonstrable end-to-end in mock mode.
 * Deduped by tag so the same event never notifies twice in a session.
 */
const firedTags = new Set<string>();

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export function notify(title: string, body: string, tag: string): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (firedTags.has(tag)) return;
  firedTags.add(tag);
  new Notification(title, { body, tag, icon: '/icons/icon-192.png' });
}
