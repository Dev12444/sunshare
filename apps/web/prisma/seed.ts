/**
 * Seed — Rahi, H1–H3.5.
 *
 * Four demo accounts (no real auth by design), one substation with two feeders,
 * ~8 houses with varied panel sizes and consumption archetypes, and three
 * verified community beneficiaries.
 *
 * Keep this deterministic. The pitch depends on the same numbers appearing
 * every run.
 *
 *   npm run db:seed --workspace=@sunshare/web
 */
import { PrismaClient, Role, GridNodeKind, BeneficiaryKind } from '@prisma/client';

const prisma = new PrismaClient();

/** Gandhinagar — matches DEMO_LAT/DEMO_LNG in shared constants. */
const ORIGIN = { lat: 23.2156, lng: 72.6369 };

/**
 * Edge lengths are derived from node coordinates rather than hand-written, so
 * the line losses the matcher computes can never contradict what the map draws.
 */
function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1000) / 1000;
}

/** Hardhat's well-known test accounts — public by design, never funded on mainnet. */
const WALLETS = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
  '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
  '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
  '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
  '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
  '0xBcd4042DE499D14e55001CcbB24a551F3b954096',
  '0x71bE63f3384f5fb98995898A86B02Fb2426c5788',
  '0xFABB0ac9d68B0B445fB7357272Ff202C5651694a',
];

type NodeSeed = {
  id: string;
  kind: GridNodeKind;
  name: string;
  lat: number;
  lng: number;
  parentId: string | null;
  capacityKw: number;
};

const NODES: NodeSeed[] = [
  {
    id: 'SUB-1',
    kind: GridNodeKind.SUBSTATION,
    name: 'Sector 21 Substation',
    lat: ORIGIN.lat,
    lng: ORIGIN.lng,
    parentId: null,
    capacityKw: 2000,
  },
  {
    id: 'FDR-A',
    kind: GridNodeKind.FEEDER,
    name: 'Feeder A — Sector 21',
    lat: 23.2178,
    lng: 72.6341,
    parentId: 'SUB-1',
    capacityKw: 150,
  },
  {
    id: 'FDR-B',
    kind: GridNodeKind.FEEDER,
    name: 'Feeder B — Sector 22',
    lat: 23.2131,
    lng: 72.6402,
    parentId: 'SUB-1',
    capacityKw: 150,
  },

  { id: 'H-A1', kind: GridNodeKind.HOUSE, name: '12 Sunflower Row', lat: 23.2189, lng: 72.6323, parentId: 'FDR-A', capacityKw: 15 },
  { id: 'H-A2', kind: GridNodeKind.HOUSE, name: '14 Sunflower Row', lat: 23.2195, lng: 72.6352, parentId: 'FDR-A', capacityKw: 15 },
  { id: 'H-A3', kind: GridNodeKind.HOUSE, name: '3 Neem Lane', lat: 23.2172, lng: 72.6318, parentId: 'FDR-A', capacityKw: 15 },
  { id: 'H-A4', kind: GridNodeKind.HOUSE, name: '7 Neem Lane', lat: 23.2201, lng: 72.6338, parentId: 'FDR-A', capacityKw: 15 },
  { id: 'H-B1', kind: GridNodeKind.HOUSE, name: '21 Banyan Cross', lat: 23.2118, lng: 72.6421, parentId: 'FDR-B', capacityKw: 15 },
  { id: 'H-B2', kind: GridNodeKind.HOUSE, name: '23 Banyan Cross', lat: 23.2142, lng: 72.6433, parentId: 'FDR-B', capacityKw: 15 },
  { id: 'H-B3', kind: GridNodeKind.HOUSE, name: '5 Peepal Street', lat: 23.2105, lng: 72.6395, parentId: 'FDR-B', capacityKw: 15 },
  { id: 'H-B4', kind: GridNodeKind.HOUSE, name: '9 Peepal Street', lat: 23.2126, lng: 72.6448, parentId: 'FDR-B', capacityKw: 15 },

  { id: 'BEN-1', kind: GridNodeKind.HOUSE, name: 'Sector 21 Primary School', lat: 23.2183, lng: 72.6361, parentId: 'FDR-A', capacityKw: 25 },
  { id: 'BEN-2', kind: GridNodeKind.HOUSE, name: 'Sector 22 Street Lighting', lat: 23.2137, lng: 72.6412, parentId: 'FDR-B', capacityKw: 10 },
  { id: 'BEN-3', kind: GridNodeKind.HOUSE, name: 'Sector 22 Community Clinic', lat: 23.2112, lng: 72.6440, parentId: 'FDR-B', capacityKw: 20 },
];

type UserSeed = {
  id: string;
  name: string;
  role: Role;
  nodeId: string | null;
  wallet: string;
  /** Present for the eight metered houses, absent for DISCOM/regulator. */
  meter?: { id: string; panelKw: number; archetype: string };
};

/**
 * Archetype names are set here because the seed lands before Dev's simulator.
 * `consumption_kw(archetype, ...)` must accept exactly this set.
 */
const USERS: UserSeed[] = [
  { id: 'usr-aarti', name: 'Aarti Shah', role: Role.PROSUMER, nodeId: 'H-A1', wallet: WALLETS[0], meter: { id: 'mtr-a1', panelKw: 8.0, archetype: 'FAMILY_4' } },
  { id: 'usr-prakash', name: 'Prakash Joshi', role: Role.PROSUMER, nodeId: 'H-A2', wallet: WALLETS[1], meter: { id: 'mtr-a2', panelKw: 5.5, archetype: 'FAMILY_6' } },
  { id: 'usr-meera', name: 'Meera Desai', role: Role.PROSUMER, nodeId: 'H-A3', wallet: WALLETS[2], meter: { id: 'mtr-a3', panelKw: 3.2, archetype: 'COUPLE_2' } },
  { id: 'usr-ramesh', name: 'Ramesh Patel', role: Role.CONSUMER, nodeId: 'H-A4', wallet: WALLETS[3], meter: { id: 'mtr-a4', panelKw: 0, archetype: 'SENIOR_2' } },
  { id: 'usr-kavita', name: 'Kavita Trivedi', role: Role.PROSUMER, nodeId: 'H-B1', wallet: WALLETS[4], meter: { id: 'mtr-b1', panelKw: 6.4, archetype: 'WFH_3' } },
  { id: 'usr-nikhil', name: 'Nikhil Mehta', role: Role.CONSUMER, nodeId: 'H-B2', wallet: WALLETS[5], meter: { id: 'mtr-b2', panelKw: 0, archetype: 'FAMILY_4' } },
  { id: 'usr-sanjay', name: 'Sanjay Bhatt', role: Role.CONSUMER, nodeId: 'H-B3', wallet: WALLETS[6], meter: { id: 'mtr-b3', panelKw: 0, archetype: 'STUDENT_1' } },
  { id: 'usr-divya', name: 'Divya Raval', role: Role.PROSUMER, nodeId: 'H-B4', wallet: WALLETS[7], meter: { id: 'mtr-b4', panelKw: 4.1, archetype: 'COUPLE_2' } },

  { id: 'usr-discom', name: 'GUVNL Operations', role: Role.DISCOM, nodeId: 'SUB-1', wallet: WALLETS[8] },
  { id: 'usr-regulator', name: 'GERC Regulator', role: Role.REGULATOR, nodeId: null, wallet: WALLETS[9] },
];

const BENEFICIARIES = [
  { id: 'ben-school', name: 'Sector 21 Primary School', kind: BeneficiaryKind.SCHOOL, nodeId: 'BEN-1', wallet: WALLETS[10] },
  { id: 'ben-streetlight', name: 'Sector 22 Street Lighting', kind: BeneficiaryKind.STREETLIGHT, nodeId: 'BEN-2', wallet: WALLETS[11] },
  { id: 'ben-clinic', name: 'Sector 22 Community Clinic', kind: BeneficiaryKind.CLINIC, nodeId: 'BEN-3', wallet: WALLETS[12] },
];

function nodeById(id: string): NodeSeed {
  const node = NODES.find((n) => n.id === id);
  if (!node) throw new Error(`unknown node ${id}`);
  return node;
}

/** One edge per parent link; the distribution network is a radial tree. */
const EDGES = NODES.filter((n) => n.parentId !== null).map((child) => {
  const parent = nodeById(child.parentId!);
  return {
    id: `E-${parent.id}-${child.id}`,
    fromNodeId: parent.id,
    toNodeId: child.id,
    lengthKm: haversineKm(parent, child),
    capacityKw: child.capacityKw,
  };
});

async function wipe() {
  await prisma.pushSubscription.deleteMany();
  await prisma.userBadge.deleteMany();
  await prisma.carbonLedger.deleteMany();
  await prisma.donation.deleteMany();
  await prisma.brokerDecision.deleteMany();
  await prisma.brokerPolicy.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.marketSlot.deleteMany();
  await prisma.reading.deleteMany();
  await prisma.meter.deleteMany();
  await prisma.beneficiary.deleteMany();
  await prisma.user.deleteMany();
  await prisma.gridEdge.deleteMany();
  // Self-referencing tree: children must go before their parents.
  await prisma.gridNode.deleteMany({ where: { kind: GridNodeKind.HOUSE } });
  await prisma.gridNode.deleteMany({ where: { kind: GridNodeKind.FEEDER } });
  await prisma.gridNode.deleteMany({ where: { kind: GridNodeKind.SUBSTATION } });
}

async function main() {
  await wipe();

  for (const kind of [GridNodeKind.SUBSTATION, GridNodeKind.FEEDER, GridNodeKind.HOUSE]) {
    await prisma.gridNode.createMany({
      data: NODES.filter((n) => n.kind === kind).map(({ id, name, lat, lng, parentId, capacityKw }) => ({
        id,
        kind,
        name,
        lat,
        lng,
        parentId,
        capacityKw,
      })),
    });
  }

  await prisma.gridEdge.createMany({ data: EDGES });

  await prisma.user.createMany({
    data: USERS.map(({ id, name, role, nodeId, wallet }) => ({
      id,
      name,
      role,
      nodeId,
      walletAddress: wallet,
    })),
  });

  await prisma.meter.createMany({
    data: USERS.filter((u) => u.meter).map((u) => ({
      id: u.meter!.id,
      userId: u.id,
      nodeId: u.nodeId!,
      panelKw: u.meter!.panelKw,
      archetype: u.meter!.archetype,
    })),
  });

  await prisma.beneficiary.createMany({
    data: BENEFICIARIES.map((b) => ({
      id: b.id,
      name: b.name,
      kind: b.kind,
      nodeId: b.nodeId,
      walletAddress: b.wallet,
      verifiedBy: 'usr-discom',
    })),
  });

  const totalPanelKw = USERS.reduce((sum, u) => sum + (u.meter?.panelKw ?? 0), 0);
  console.log(
    [
      `nodes         ${NODES.length} (1 substation, 2 feeders, ${NODES.filter((n) => n.kind === GridNodeKind.HOUSE).length} connection points)`,
      `edges         ${EDGES.length}`,
      `users         ${USERS.length} across all four roles`,
      `meters        ${USERS.filter((u) => u.meter).length}, ${totalPanelKw.toFixed(1)} kW of rooftop solar`,
      `beneficiaries ${BENEFICIARIES.length}`,
    ].join('\n'),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
