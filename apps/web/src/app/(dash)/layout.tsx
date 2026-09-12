import { AppShell } from '@/components/shell/app-shell';

export default function DashLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
