/**
 * Seed — Rahi, H1–H3.5.
 *
 * The grid and the households are NOT defined here. They are read straight out
 * of the engine's data files, which are the single source of truth:
 *
 *   services/engine/data/grid.json        nodes + edges
 *   services/engine/data/households.json  meters, panel sizes, archetypes
 *
 * Copying them into a second list is how the DB and the matcher end up
 * disagreeing about node ids at 3am. Everything below adds only what the engine
 * has no opinion about: the DISCOM and regulator accounts, wallet addresses,
 * and the verified beneficiary registry.
 *
 *   npm run db:seed --workspace=@sunshare/web
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, Role, GridNodeKind, BeneficiaryKind } from '@prisma/client';

const prisma = new PrismaClient();

const ENGINE_DATA = join(__dirname, '../../../services/engine/data');

const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(join(ENGINE_DATA, file), 'utf8')) as T;

interface GridNodeJson {
  id: string;
  kind: GridNodeKind;
  name: string;
  lat: number;
  lng: number;
  parentId: string | null;
  capacityKw: number;
  loadKw: number;
}

interface GridEdgeJson {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  lengthKm: number;
  capacityKw: number;
  currentLoadKw: number;
}

interface HouseholdJson {
  meterId: string;
  userId: string;
  nodeId: string;
  name: string;
  panelKw: number;
  archetype: string;
  role: 'PROSUMER' | 'CONSUMER';
  kind: 'RESIDENTIAL' | 'COMMERCIAL' | 'COMMUNITY';
}

const { nodes, edges } = readJson<{ nodes: GridNodeJson[]; edges: GridEdgeJson[] }>(
  'grid.json',
);
const { households } = readJson<{ households: HouseholdJson[] }>('households.json');

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
  '0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec',
  '0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097',
  '0xcd3B766CCDd6AE721141F452C550Ca635964ce71',
  '0x2546BcD3c84621e976D8185a91A922aE77ECEc30',
];

/** Account 0 deployed the contracts, so it is already the escrow's DISCOM. */
const DISCOM_WALLET = WALLETS[0];
const REGULATOR_WALLET = WALLETS[13];

const rootSubstation = nodes.find((n) => n.parentId === null)!;

/**
 * The engine models generation and consumption, not charity, so the registry
 * lives only here. Anchored to real nodes so donations have somewhere to go on
 * the map: the school from the household data, streetlights at a feeder (where
 * they physically connect), and one consumer household.
 */
const BENEFICIARIES = [
  {
    id: 'ben-school',
    kind: BeneficiaryKind.SCHOOL,
    nodeId: households.find((h) => h.kind === 'COMMUNITY')?.nodeId ?? 'H-03',
    name: households.find((h) => h.kind === 'COMMUNITY')?.name ?? 'Primary School',
    wallet: WALLETS[14],
  },
  {
    id: 'ben-streetlight',
    kind: BeneficiaryKind.STREETLIGHT,
    nodeId: nodes.find((n) => n.kind === GridNodeKind.FEEDER)!.id,
    name: 'Sector 21 Street Lighting',
    wallet: WALLETS[15],
  },
  {
    id: 'ben-household',
    kind: BeneficiaryKind.HOUSEHOLD,
    nodeId: households.find((h) => h.role === 'CONSUMER' && h.kind === 'RESIDENTIAL')!.nodeId,
    name: 'Supported Household',
    wallet: WALLETS[16],
  },
];

/** Parents must exist before children; SS-2 hangs off SS-1, so kind is not enough. */
function byDepth(node: GridNodeJson, index: Map<string, GridNodeJson>): number {
  let depth = 0;
  let current = node;
  while (current.parentId) {
    current = index.get(current.parentId)!;
    depth += 1;
  }
  return depth;
}

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

  // Clears whatever topology is already there, not just the nodes about to be
  // written — an earlier seed with different ids would otherwise be left
  // orphaned in the table. Peels leaves so children always go before parents.
  for (;;) {
    const remaining = await prisma.gridNode.findMany({
      select: { id: true, parentId: true },
    });
    if (remaining.length === 0) break;

    const parents = new Set(remaining.map((n) => n.parentId).filter(Boolean));
    const leaves = remaining.filter((n) => !parents.has(n.id)).map((n) => n.id);
    if (leaves.length === 0) {
      throw new Error('grid node parent cycle — cannot clear');
    }

    await prisma.gridNode.deleteMany({ where: { id: { in: leaves } } });
  }
}

async function main() {
  await wipe();

  const index = new Map(nodes.map((n) => [n.id, n]));
  const shallowestFirst = [...nodes].sort((a, b) => byDepth(a, index) - byDepth(b, index));
  for (const node of shallowestFirst) {
    await prisma.gridNode.create({
      data: {
        id: node.id,
        kind: node.kind,
        name: node.name,
        lat: node.lat,
        lng: node.lng,
        parentId: node.parentId,
        capacityKw: node.capacityKw,
        loadKw: node.loadKw,
      },
    });
  }

  await prisma.gridEdge.createMany({
    data: edges.map((e) => ({
      id: e.id,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      lengthKm: e.lengthKm,
      capacityKw: e.capacityKw,
      currentLoadKw: e.currentLoadKw,
    })),
  });

  await prisma.user.createMany({
    data: [
      ...households.map((h, i) => ({
        id: h.userId,
        name: h.name,
        role: h.role === 'PROSUMER' ? Role.PROSUMER : Role.CONSUMER,
        nodeId: h.nodeId,
        // Account 0 is the relayer/DISCOM, so households start at 1.
        walletAddress: WALLETS[i + 1],
      })),
      {
        id: 'usr-discom',
        name: 'GUVNL Operations',
        role: Role.DISCOM,
        nodeId: rootSubstation.id,
        walletAddress: DISCOM_WALLET,
      },
      {
        id: 'usr-regulator',
        name: 'GERC Regulator',
        role: Role.REGULATOR,
        nodeId: null,
        walletAddress: REGULATOR_WALLET,
      },
    ],
  });

  await prisma.meter.createMany({
    data: households.map((h) => ({
      id: h.meterId,
      userId: h.userId,
      nodeId: h.nodeId,
      panelKw: h.panelKw,
      archetype: h.archetype,
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

  const totalPanelKw = households.reduce((sum, h) => sum + h.panelKw, 0);
  const prosumers = households.filter((h) => h.role === 'PROSUMER').length;

  console.log(
    [
      `grid          ${nodes.length} nodes, ${edges.length} edges (from the engine's grid.json)`,
      `users         ${households.length + 2} across all four roles`,
      `meters        ${households.length}, ${totalPanelKw.toFixed(1)} kW across ${prosumers} prosumers`,
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
