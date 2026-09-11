/**
 * Ethers relayer — Rahi, H10.5–H13.
 *
 * Users never hold a wallet or sign anything: the platform relays settlement on
 * their behalf, which is what keeps the demo free of MetaMask popups. The trade
 * off is that this one key is the only thing that can settle, so the nonce
 * queue below matters — two concurrent settlements sharing a nonce means one
 * silently replaces the other.
 */
import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import EnergyEscrowArtifact from '@sunshare/shared/abis/EnergyEscrow.json';

export type SettlementMode = 'onchain' | 'local' | 'simulated';

export interface RelayedSettlement {
  txHash: string;
  blockNumber: number;
  chainId: number;
  gasUsed: string;
  mode: SettlementMode;
}

export interface SettleArgs {
  tradeId: string;
  seller: string;
  buyer: string;
  contractedWh: bigint;
  deliveredWh: bigint;
  pricePaisePerKwh: bigint;
  slot: number;
}

function config() {
  return {
    rpcUrl: process.env.RPC_URL,
    privateKey: process.env.RELAYER_PRIVATE_KEY,
    escrowAddress: process.env.ESCROW_ADDRESS,
    chainId: Number(process.env.CHAIN_ID ?? 31337),
  };
}

/** False when the chain is not wired up; callers fall back to simulated mode. */
export function isChainConfigured(): boolean {
  const { rpcUrl, privateKey, escrowAddress } = config();
  return Boolean(rpcUrl && privateKey && escrowAddress);
}

/**
 * Serialises transactions through one promise chain. Every settlement uses the
 * same relayer key, so overlapping calls would otherwise read the same pending
 * nonce and one would drop.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}

export async function relaySettlement(args: SettleArgs): Promise<RelayedSettlement> {
  const { rpcUrl, privateKey, escrowAddress, chainId } = config();

  if (!rpcUrl || !privateKey || !escrowAddress) {
    throw new Error('chain is not configured');
  }

  return enqueue(async () => {
    const provider = new JsonRpcProvider(rpcUrl);
    const wallet = new Wallet(privateKey, provider);
    const escrow = new Contract(escrowAddress, EnergyEscrowArtifact.abi, wallet);

    const tx = await escrow.settle(
      args.tradeId,
      args.seller,
      args.buyer,
      args.contractedWh,
      args.deliveredWh,
      args.pricePaisePerKwh,
      args.slot,
    );
    const receipt = await tx.wait();

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      chainId,
      gasUsed: receipt.gasUsed.toString(),
      mode: chainId === 31337 ? 'local' : 'onchain',
    } satisfies RelayedSettlement;
  });
}

export function explorerUrl(txHash: string, mode: SettlementMode): string | null {
  if (mode !== 'onchain') return null;

  const base = process.env.NEXT_PUBLIC_CHAIN_EXPLORER;
  return base ? `${base}/tx/${txHash}` : null;
}
