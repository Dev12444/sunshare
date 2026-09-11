/**
 * Dashboard shell — Maansi, H1–H3.
 * TODO: nav rail (desktop) + bottom tab bar (mobile), role switcher,
 * offline banner slot, install-prompt slot (Diya mounts into this).
 */
export default function DashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      {/* TODO(Maansi): <TopBar /> with role switcher */}
      <main className="mx-auto max-w-6xl p-4 pb-24">{children}</main>
      {/* TODO(Maansi): <BottomNav /> — mobile first, this is a PWA */}
    </div>
  );
}
