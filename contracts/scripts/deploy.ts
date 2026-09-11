/**
 * Deploy EnergyEscrow + CommunityPool — Rahi, H9–H11.5.
 *
 *   npm run deploy:local --workspace=@sunshare/contracts
 *   npm run deploy:amoy  --workspace=@sunshare/contracts
 *
 * Prints the addresses to paste into .env. Then run export-abi.ts so Diya's
 * ledger page can decode events.
 */
import { ethers } from 'hardhat';

// Illustrative corridor — keep in sync with packages/shared/src/constants.ts
const FEED_IN_PAISE = 215;
const RETAIL_PAISE = 650;
const WHEELING_PAISE = 45;

async function main() {
  const [deployer] = await ethers.getSigners();
  const relayer = process.env.RELAYER_ADDRESS ?? deployer.address;

  const escrow = await ethers.deployContract('EnergyEscrow', [
    relayer,
    FEED_IN_PAISE,
    RETAIL_PAISE,
    WHEELING_PAISE,
  ]);
  await escrow.waitForDeployment();

  const pool = await ethers.deployContract('CommunityPool');
  await pool.waitForDeployment();

  console.log('ESCROW_ADDRESS=', await escrow.getAddress());
  console.log('COMMUNITY_POOL_ADDRESS=', await pool.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
