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
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // TODO(Rahi): users (Prosumer / Consumer / DISCOM / Regulator),
  // grid tree, meters, beneficiaries. Mirror services/engine/data/grid.json
  // so the engine and the DB agree on node ids.
  console.log('TODO(Rahi): seed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
