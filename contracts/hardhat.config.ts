import '@nomicfoundation/hardhat-toolbox';
import type { HardhatUserConfig } from 'hardhat/config';

/**
 * Rahi, H6.5–H10.5.
 *
 * `localhost` (chainId 31337) is the development and fallback chain — instant
 * blocks, no faucet, nothing to go wrong on stage. `amoy` is the live demo
 * target; if it misbehaves at H19 we flip RPC_URL back to localhost and the
 * demo is unaffected. That is deliberate, see the cut-list.
 */
const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    localhost: { url: 'http://127.0.0.1:8545' },
    amoy: {
      url: process.env.RPC_URL ?? 'https://rpc-amoy.polygon.technology',
      accounts: process.env.RELAYER_PRIVATE_KEY
        ? [process.env.RELAYER_PRIVATE_KEY]
        : [],
    },
  },
};

export default config;
