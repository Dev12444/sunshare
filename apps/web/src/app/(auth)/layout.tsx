/**
 * Auth shell — Diya.
 *
 * Deliberately outside (dash): no nav rail, no ticker, no role switcher. None
 * of those mean anything before you have chosen who you are, and the transport
 * layer should not be opening a market connection for a page that shows no
 * market data.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-paper">{children}</div>;
}
