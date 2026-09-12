/**
 * The seeded neighbourhood.
 *
 * These are the same eighteen nodes and twelve premises the engine loads from
 * services/engine/data/*.json, transcribed so the UI can render a complete,
 * believable network with no backend running at all. When mocks are off these
 * are replaced wholesale by GET /grid/topology.
 *
 * Location: Sector 21, Gandhinagar.
 */
import type {
  Beneficiary,
  GridEdge,
  GridNode,
  GridTopology,
  Role,
  User,
} from '@sunshare/shared';

export interface Household {
  meterId: string;
  userId: string;
  nodeId: string;
  name: string;
  /** Short form for tables where the full name will not fit. */
  shortName: string;
  panelKw: number;
  archetype: 'COUPLE' | 'FAMILY_3' | 'FAMILY_4' | 'FAMILY_5' | 'SCHOOL' | 'SHOP';
  role: 'PROSUMER' | 'CONSUMER';
  kind: 'RESIDENTIAL' | 'COMMUNITY' | 'COMMERCIAL';
}

export const NODES: GridNode[] = [
  { id: 'SS-1', kind: 'SUBSTATION', name: 'Substation 1', lat: 23.2156, lng: 72.6369, parentId: null, capacityKw: 500, loadKw: 0 },
  { id: 'SS-2', kind: 'SUBSTATION', name: 'Substation 2', lat: 23.228, lng: 72.65, parentId: 'SS-1', capacityKw: 500, loadKw: 0 },
  { id: 'F-1', kind: 'FEEDER', name: 'Feeder 1', lat: 23.2191, lng: 72.6329, parentId: 'SS-1', capacityKw: 60, loadKw: 0 },
  { id: 'H-01', kind: 'HOUSE', name: 'Patel Residence', lat: 23.2203, lng: 72.6314, parentId: 'F-1', capacityKw: 15, loadKw: 0 },
  { id: 'H-02', kind: 'HOUSE', name: 'Sharma Nivas', lat: 23.2211, lng: 72.6301, parentId: 'F-1', capacityKw: 15, loadKw: 0 },
  { id: 'H-03', kind: 'HOUSE', name: 'Sector 21 Primary School', lat: 23.2199, lng: 72.6277, parentId: 'F-1', capacityKw: 15, loadKw: 0 },
  { id: 'F-2', kind: 'FEEDER', name: 'Feeder 2', lat: 23.2126, lng: 72.6394, parentId: 'SS-1', capacityKw: 60, loadKw: 0 },
  { id: 'H-04', kind: 'HOUSE', name: 'Mehta Bungalow', lat: 23.2116, lng: 72.6406, parentId: 'F-2', capacityKw: 15, loadKw: 0 },
  { id: 'H-05', kind: 'HOUSE', name: 'Joshi Apartment', lat: 23.2104, lng: 72.6414, parentId: 'F-2', capacityKw: 15, loadKw: 0 },
  { id: 'H-06', kind: 'HOUSE', name: 'Trivedi House', lat: 23.2088, lng: 72.6425, parentId: 'F-2', capacityKw: 15, loadKw: 0 },
  { id: 'F-3', kind: 'FEEDER', name: 'Feeder 3', lat: 23.2168, lng: 72.6427, parentId: 'SS-1', capacityKw: 60, loadKw: 0 },
  { id: 'H-07', kind: 'HOUSE', name: 'Shah Residence', lat: 23.2174, lng: 72.6443, parentId: 'F-3', capacityKw: 15, loadKw: 0 },
  { id: 'H-08', kind: 'HOUSE', name: 'Raval Farmhouse', lat: 23.2186, lng: 72.6451, parentId: 'F-3', capacityKw: 15, loadKw: 0 },
  { id: 'H-09', kind: 'HOUSE', name: 'Bhatt Flat', lat: 23.2159, lng: 72.646, parentId: 'F-3', capacityKw: 15, loadKw: 0 },
  { id: 'F-4', kind: 'FEEDER', name: 'Feeder 4', lat: 23.2308, lng: 72.6535, parentId: 'SS-2', capacityKw: 60, loadKw: 0 },
  { id: 'H-10', kind: 'HOUSE', name: 'Chauhan House', lat: 23.2318, lng: 72.6549, parentId: 'F-4', capacityKw: 15, loadKw: 0 },
  { id: 'H-11', kind: 'HOUSE', name: 'Solanki Residence', lat: 23.2329, lng: 72.6561, parentId: 'F-4', capacityKw: 15, loadKw: 0 },
  { id: 'H-12', kind: 'HOUSE', name: 'Vyas General Store', lat: 23.2341, lng: 72.6544, parentId: 'F-4', capacityKw: 15, loadKw: 0 },
];

export const EDGES: GridEdge[] = [
  { id: 'e-SS-1-SS-2', fromNodeId: 'SS-1', toNodeId: 'SS-2', lengthKm: 1.9217, capacityKw: 200, currentLoadKw: 0 },
  { id: 'e-SS-1-F-1', fromNodeId: 'SS-1', toNodeId: 'F-1', lengthKm: 0.5644, capacityKw: 60, currentLoadKw: 0 },
  { id: 'e-F-1-H-01', fromNodeId: 'F-1', toNodeId: 'H-01', lengthKm: 0.2032, capacityKw: 15, currentLoadKw: 0 },
  { id: 'e-F-1-H-02', fromNodeId: 'F-1', toNodeId: 'H-02', lengthKm: 0.3624, capacityKw: 15, currentLoadKw: 0 },
  { id: 'e-F-1-H-03', fromNodeId: 'F-1', toNodeId: 'H-03', lengthKm: 0.5388, capacityKw: 15, currentLoadKw: 0 },
  { id: 'e-SS-1-F-2', fromNodeId: 'SS-1', toNodeId: 'F-2', lengthKm: 0.4202, capacityKw: 60, currentLoadKw: 0 },
  { id: 'e-F-2-H-04', fromNodeId: 'F-2', toNodeId: 'H-04', lengthKm: 0.1655, capacityKw: 15, currentLoadKw: 0 },
  { id: 'e-F-2-H-05', fromNodeId: 'F-2', toNodeId: 'H-05', lengthKm: 0.3188, capacityKw: 15, currentLoadKw: 0 },
  { id: 'e-F-2-H-06', fromNodeId: 'F-2', toNodeId: 'H-06', lengthKm: 0.5281, capacityKw: 15, currentLoadKw: 0 },
  { id: 'e-SS-1-F-3', fromNodeId: 'SS-1', toNodeId: 'F-3', lengthKm: 0.6075, capacityKw: 60, currentLoadKw: 0 },
  { id: 'e-F-3-H-07', fromNodeId: 'F-3', toNodeId: 'H-07', lengthKm: 0.1766, capacityKw: 15, currentLoadKw: 0 },
  { id: 'e-F-3-H-08', fromNodeId: 'F-3', toNodeId: 'H-08', lengthKm: 0.3166, capacityKw: 15, currentLoadKw: 0 },
  { id: 'e-F-3-H-09', fromNodeId: 'F-3', toNodeId: 'H-09', lengthKm: 0.3518, capacityKw: 15, currentLoadKw: 0 },
  { id: 'e-SS-2-F-4', fromNodeId: 'SS-2', toNodeId: 'F-4', lengthKm: 0.4742, capacityKw: 60, currentLoadKw: 0 },
  { id: 'e-F-4-H-10', fromNodeId: 'F-4', toNodeId: 'H-10', lengthKm: 0.1812, capacityKw: 15, currentLoadKw: 0 },
  { id: 'e-F-4-H-11', fromNodeId: 'F-4', toNodeId: 'H-11', lengthKm: 0.3537, capacityKw: 15, currentLoadKw: 0 },
  { id: 'e-F-4-H-12', fromNodeId: 'F-4', toNodeId: 'H-12', lengthKm: 0.3783, capacityKw: 15, currentLoadKw: 0 },
];

export const TOPOLOGY: GridTopology = { nodes: NODES, edges: EDGES };

export const HOUSEHOLDS: Household[] = [
  { meterId: 'M-01', userId: 'U-01', nodeId: 'H-01', name: 'Patel Residence', shortName: 'Patel', panelKw: 7.5, archetype: 'FAMILY_4', role: 'PROSUMER', kind: 'RESIDENTIAL' },
  { meterId: 'M-02', userId: 'U-02', nodeId: 'H-02', name: 'Sharma Nivas', shortName: 'Sharma', panelKw: 5, archetype: 'FAMILY_3', role: 'PROSUMER', kind: 'RESIDENTIAL' },
  { meterId: 'M-03', userId: 'U-03', nodeId: 'H-03', name: 'Sector 21 Primary School', shortName: 'S21 School', panelKw: 0, archetype: 'SCHOOL', role: 'CONSUMER', kind: 'COMMUNITY' },
  { meterId: 'M-04', userId: 'U-04', nodeId: 'H-04', name: 'Mehta Bungalow', shortName: 'Mehta', panelKw: 10, archetype: 'FAMILY_4', role: 'PROSUMER', kind: 'RESIDENTIAL' },
  { meterId: 'M-05', userId: 'U-05', nodeId: 'H-05', name: 'Joshi Apartment', shortName: 'Joshi', panelKw: 3, archetype: 'COUPLE', role: 'PROSUMER', kind: 'RESIDENTIAL' },
  { meterId: 'M-06', userId: 'U-06', nodeId: 'H-06', name: 'Trivedi House', shortName: 'Trivedi', panelKw: 0, archetype: 'FAMILY_4', role: 'CONSUMER', kind: 'RESIDENTIAL' },
  { meterId: 'M-07', userId: 'U-07', nodeId: 'H-07', name: 'Shah Residence', shortName: 'Shah', panelKw: 6, archetype: 'FAMILY_3', role: 'PROSUMER', kind: 'RESIDENTIAL' },
  { meterId: 'M-08', userId: 'U-08', nodeId: 'H-08', name: 'Raval Farmhouse', shortName: 'Raval', panelKw: 8.5, archetype: 'FAMILY_5', role: 'PROSUMER', kind: 'RESIDENTIAL' },
  { meterId: 'M-09', userId: 'U-09', nodeId: 'H-09', name: 'Bhatt Flat', shortName: 'Bhatt', panelKw: 0, archetype: 'COUPLE', role: 'CONSUMER', kind: 'RESIDENTIAL' },
  { meterId: 'M-10', userId: 'U-10', nodeId: 'H-10', name: 'Chauhan House', shortName: 'Chauhan', panelKw: 4.5, archetype: 'FAMILY_3', role: 'PROSUMER', kind: 'RESIDENTIAL' },
  { meterId: 'M-11', userId: 'U-11', nodeId: 'H-11', name: 'Solanki Residence', shortName: 'Solanki', panelKw: 9, archetype: 'FAMILY_4', role: 'PROSUMER', kind: 'RESIDENTIAL' },
  { meterId: 'M-12', userId: 'U-12', nodeId: 'H-12', name: 'Vyas General Store', shortName: 'Vyas Store', panelKw: 0, archetype: 'SHOP', role: 'CONSUMER', kind: 'COMMERCIAL' },
];

export const HOUSEHOLD_BY_USER = new Map(HOUSEHOLDS.map((h) => [h.userId, h]));
export const HOUSEHOLD_BY_NODE = new Map(HOUSEHOLDS.map((h) => [h.nodeId, h]));
export const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));

export function displayName(userId: string): string {
  return HOUSEHOLD_BY_USER.get(userId)?.shortName ?? userId;
}

export function fullName(userId: string): string {
  return HOUSEHOLD_BY_USER.get(userId)?.name ?? userId;
}

/** Feeder a premise hangs off, for the order book's "feeder" column. */
export function feederOf(nodeId: string): string {
  const node = NODE_BY_ID.get(nodeId);
  if (!node) return '—';
  if (node.kind === 'FEEDER') return node.id;
  if (node.kind === 'SUBSTATION') return node.id;
  return node.parentId ?? '—';
}

export function substationOf(nodeId: string): string {
  const feeder = NODE_BY_ID.get(feederOf(nodeId));
  return feeder?.parentId ?? feeder?.id ?? '—';
}

/* ------------------------------------------------------------------ roles */

/**
 * Four seeded identities. No authentication — the role switcher is the login
 * screen, which is the correct trade-off for a demo of a market, not of a
 * login form.
 */
export const SESSIONS: Record<Role, User> = {
  PROSUMER: {
    id: 'U-01',
    name: 'Anita Patel',
    role: 'PROSUMER',
    nodeId: 'H-01',
    walletAddress: '0x7A21f3C4e1B8d90A5c2E4f6B8d1A3c5E7f9B2d40',
  },
  CONSUMER: {
    id: 'U-06',
    name: 'Rakesh Trivedi',
    role: 'CONSUMER',
    nodeId: 'H-06',
    walletAddress: '0x3E9c1B7a5F2d8C4e6A0b3D5f7C9e1A4b6D8f0C22',
  },
  DISCOM: {
    id: 'U-DIS',
    name: 'Sector 21 Distribution',
    role: 'DISCOM',
    nodeId: 'SS-1',
    walletAddress: '0x91Ad4E2c6B8f0A3d5C7e9B1f3A5c7E9b1D3f5A70',
  },
  REGULATOR: {
    id: 'U-REG',
    name: 'State Electricity Commission',
    role: 'REGULATOR',
    nodeId: null,
    walletAddress: null,
  },
};

export const ROLE_LABEL: Record<Role, string> = {
  PROSUMER: 'Prosumer',
  CONSUMER: 'Consumer',
  DISCOM: 'DISCOM',
  REGULATOR: 'Regulator',
};

export const ROLE_SUBTITLE: Record<Role, string> = {
  PROSUMER: 'Patel Residence · 7.5 kW rooftop',
  CONSUMER: 'Trivedi House · Feeder 2',
  DISCOM: 'Network operator · Substation 1',
  REGULATOR: 'Market oversight · read only',
};

/* ----------------------------------------------------------- beneficiaries */

export const BENEFICIARIES: Beneficiary[] = [
  {
    id: 'ben-school',
    name: 'Sector 21 Primary School',
    kind: 'SCHOOL',
    nodeId: 'H-03',
    walletAddress: '0x5C3a7E9b1D4f6A8c0B2e4D6f8A0c2E4b6D8f0A11',
    verifiedBy: 'Gandhinagar Municipal Corporation',
    verifiedAt: '2026-08-14T10:20:00+05:30',
  },
  {
    id: 'ben-streetlight',
    name: 'Sector 21 Street Lighting',
    kind: 'STREETLIGHT',
    nodeId: 'F-1',
    walletAddress: '0x8B1d3F5a7C9e1B3d5F7a9C1e3B5d7F9a1C3e5B77',
    verifiedBy: 'Sector 21 Distribution',
    verifiedAt: '2026-08-14T10:34:00+05:30',
  },
  {
    id: 'ben-household',
    name: 'Supported Household',
    kind: 'HOUSEHOLD',
    nodeId: 'H-06',
    walletAddress: '0x2F4b6D8a0C2e4B6d8F0a2C4e6B8d0F2a4C6e8B99',
    verifiedBy: 'Ward 7 Welfare Office',
    verifiedAt: '2026-08-21T16:05:00+05:30',
  },
];

export const BENEFICIARY_KIND_LABEL: Record<Beneficiary['kind'], string> = {
  SCHOOL: 'School',
  STREETLIGHT: 'Streetlight circuit',
  HOUSEHOLD: 'Low-income household',
  CLINIC: 'Health centre',
};
