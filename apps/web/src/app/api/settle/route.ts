/**
 * POST /api/settle — relayer settles a matched trade on chain — Rahi, H10.5–H13.
 */
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  // TODO(Rahi): ethers v6 relayer -> EnergyEscrow.settle(), persist
  // SettlementReceipt, fall back to mode:'simulated' if the RPC is down.
  void req;
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}
