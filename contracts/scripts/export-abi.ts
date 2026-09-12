/**
 * Copy compiled ABIs into packages/shared/src/abis so the frontend can decode
 * settlement events without depending on the Hardhat artifacts directory.
 * Rahi, H9–H11.5 — this is the handoff to Diya.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(__dirname, '../../packages/shared/src/abis');

for (const name of ['EnergyEscrow', 'CommunityPool']) {
  const artifact = JSON.parse(
    readFileSync(
      join(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`),
      'utf8',
    ),
  );
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, `${name}.json`),
    JSON.stringify({ abi: artifact.abi }, null, 2),
  );
  console.log('exported', name);
}
