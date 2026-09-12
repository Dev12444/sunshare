'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { BrandMark, Wordmark } from './brand';
import { navFor } from './nav-config';
import { SimControls } from './sim-controls';

/**
 * Desktop navigation rail.
 *
 * Fixed width, hairline separated, labels always visible. An icon-only rail
 * looks tidier in a screenshot and costs a beat of recognition every single
 * time in use.
 */
export function NavRail() {
  const role = useStore((s) => s.role);
  const pathname = usePathname();
  const items = navFor(role);
  const primary = items.filter((i) => i.group === 'primary');
  const roleItems = items.filter((i) => i.group === 'role');

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 hidden h-dvh w-[208px] shrink-0 flex-col bg-forest lg:flex"
    >
      <Link
        href={items[0].href}
        className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[.09] px-4"
      >
        <BrandMark size={22} />
        <Wordmark tone="onDark" className="text-md" />
      </Link>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <ul>
          {primary.map((item) => (
            <RailItem key={item.href} item={item} active={pathname === item.href} />
          ))}
        </ul>

        {roleItems.length > 0 ? (
          <>
            <div className="mt-4 px-4 pb-1 text-label font-semibold uppercase text-forest-ink-2/70">
              Cross-role
            </div>
            <ul>
              {roleItems.map((item) => (
                <RailItem key={item.href} item={item} active={pathname === item.href} />
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-white/[.09] px-4 py-3">
        <SimControls tone="dark" />
      </div>

    </nav>
  );
}

function RailItem({
  item,
  active,
}: {
  item: ReturnType<typeof navFor>[number];
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex items-center gap-2.5 px-4 py-[7px] text-sm transition-colors duration-120',
          active
            ? 'bg-forest-2 font-medium text-forest-ink'
            : 'text-forest-ink-2 hover:bg-forest-2/55 hover:text-forest-ink',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 left-0 w-[2px]',
            active ? 'bg-solar' : 'bg-transparent',
          )}
        />
        <Icon className={cn(active ? 'text-solar' : 'text-forest-ink-2/75')} />
        {item.label}
      </Link>
    </li>
  );
}
