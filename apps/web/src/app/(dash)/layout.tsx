/**
 * Dashboard shell — Maansi, H1–H3.
 * TODO: nav rail (desktop) + bottom tab bar (mobile), role switcher.
 */
import { TickProvider } from '@/hooks/tick-context';
import { PlatformBar } from '@/components/platform-bar';

export default function DashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TickProvider>
      <div className="min-h-dvh">
        <PlatformBar />
        {/* TODO(Maansi): <TopBar /> with role switcher */}
        <main className="mx-auto max-w-6xl p-4 pb-24">{children}</main>
        {/* TODO(Maansi): <BottomNav /> — mobile first, this is a PWA */}
      </div>
    </TickProvider>
  );
}
