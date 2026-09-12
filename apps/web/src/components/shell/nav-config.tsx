import type { Role } from '@sunshare/shared';
import {
  IconBroker,
  IconCommunity,
  IconDemand,
  IconGrid,
  IconImpact,
  IconLedger,
  IconMap,
  IconMarket,
  IconNetwork,
  IconOversight,
  IconPremises,
} from './icons';

export interface NavItem {
  href: string;
  label: string;
  /** Short form for the phone's bottom bar. */
  short: string;
  icon: (p: { className?: string; size?: number }) => React.ReactElement;
  /** Shown in the rail's second group, under a "your role" rule. */
  group: 'primary' | 'role';
}

const MARKETPLACE: NavItem = { href: '/marketplace', label: 'Marketplace', short: 'Market', icon: IconMarket, group: 'primary' };
const MAP: NavItem = { href: '/map', label: 'Energy Map', short: 'Map', icon: IconMap, group: 'primary' };
const GRID: NavItem = { href: '/grid', label: 'Grid', short: 'Grid', icon: IconGrid, group: 'primary' };
const BROKER: NavItem = { href: '/broker', label: 'Broker', short: 'Broker', icon: IconBroker, group: 'primary' };
const IMPACT: NavItem = { href: '/impact', label: 'Impact', short: 'Impact', icon: IconImpact, group: 'primary' };
const COMMUNITY: NavItem = { href: '/community', label: 'Community', short: 'Pool', icon: IconCommunity, group: 'primary' };
const LEDGER: NavItem = { href: '/ledger', label: 'Ledger', short: 'Ledger', icon: IconLedger, group: 'primary' };

/**
 * Navigation follows the role, but the market surfaces stay in the same order
 * for everyone — a DISCOM operator and a household are looking at one market
 * and should be able to talk to each other about the same screen.
 */
export function navFor(role: Role): NavItem[] {
  switch (role) {
    case 'PROSUMER':
      return [
        { href: '/prosumer', label: 'Overview', short: 'Home', icon: IconPremises, group: 'primary' },
        MARKETPLACE, MAP, GRID, BROKER, IMPACT, COMMUNITY, LEDGER,
      ];
    case 'CONSUMER':
      return [
        { href: '/consumer', label: 'Overview', short: 'Home', icon: IconDemand, group: 'primary' },
        MARKETPLACE, MAP, GRID, BROKER, IMPACT, COMMUNITY, LEDGER,
      ];
    case 'DISCOM':
      return [
        { href: '/discom', label: 'Network', short: 'Network', icon: IconNetwork, group: 'primary' },
        GRID, MAP, MARKETPLACE, COMMUNITY, LEDGER,
        { href: '/prosumer', label: 'Prosumer view', short: 'Prosumer', icon: IconPremises, group: 'role' },
      ];
    case 'REGULATOR':
      return [
        { href: '/regulator', label: 'Market oversight', short: 'Market', icon: IconOversight, group: 'primary' },
        MARKETPLACE, LEDGER, IMPACT, COMMUNITY, GRID,
        { href: '/discom', label: 'DISCOM view', short: 'DISCOM', icon: IconNetwork, group: 'role' },
      ];
  }
}

/** The five that fit a 390px bottom bar without becoming unreadable. */
export function mobileNavFor(role: Role): NavItem[] {
  const all = navFor(role);
  const wanted =
    role === 'DISCOM'
      ? ['/discom', '/grid', '/map', '/marketplace', '/ledger']
      : role === 'REGULATOR'
        ? ['/regulator', '/marketplace', '/ledger', '/impact', '/grid']
        : role === 'CONSUMER'
          ? ['/consumer', '/marketplace', '/map', '/broker', '/ledger']
          : ['/prosumer', '/marketplace', '/map', '/broker', '/ledger'];
  return wanted
    .map((href) => all.find((i) => i.href === href))
    .filter((i): i is NavItem => Boolean(i));
}

export const ALL_ROUTES = [
  '/prosumer', '/consumer', '/marketplace', '/map', '/grid',
  '/broker', '/impact', '/community', '/ledger', '/discom', '/regulator',
];
