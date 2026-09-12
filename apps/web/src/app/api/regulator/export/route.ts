/**
 * GET /api/regulator/export — CSV of settled trades or donations — Rahi, H17–H19.
 *
 * The regulator's view of the market: every trade with its wheeling charge and
 * on-chain receipt, in a format that opens in a spreadsheet.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** RFC 4180: quote everything containing a comma, quote or newline. */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

export async function GET(req: Request) {
  const user = await getSessionUser();

  // Market-wide data, so it is limited to the two oversight roles rather than
  // any household that happens to be signed in.
  if (!user || (user.role !== 'REGULATOR' && user.role !== 'DISCOM')) {
    return NextResponse.json(
      { error: 'regulator or DISCOM role required' },
      { status: 403 },
    );
  }

  const dataset = new URL(req.url).searchParams.get('dataset') ?? 'trades';

  if (dataset === 'donations') {
    const donations = await prisma.donation.findMany({
      include: { donor: true, beneficiary: true },
      orderBy: { createdAt: 'asc' },
    });

    const csv = toCsv(
      [
        'donation_id',
        'slot_id',
        'donor_id',
        'donor_name',
        'beneficiary_id',
        'beneficiary_name',
        'beneficiary_kind',
        'kwh',
        'value_paise',
        'tx_hash',
        'created_at',
      ],
      donations.map((d) => [
        d.id,
        d.slotId,
        d.donorId,
        d.donor.name,
        d.beneficiaryId,
        d.beneficiary.name,
        d.beneficiary.kind,
        round(d.kwh),
        d.valuePaise,
        d.txHash,
        d.createdAt.toISOString(),
      ]),
    );

    return csvResponse(csv, 'sunshare-donations.csv');
  }

  const trades = await prisma.trade.findMany({
    include: { seller: true, buyer: true, settlement: true, slot: true },
    orderBy: { createdAt: 'asc' },
  });

  const csv = toCsv(
    [
      'trade_id',
      'slot_id',
      'slot_start_sim',
      'seller_id',
      'seller_name',
      'buyer_id',
      'buyer_name',
      'contracted_kwh',
      'delivered_kwh',
      'efficiency_pct',
      'price_paise_per_kwh',
      'gross_paise',
      'wheeling_fee_paise',
      'net_to_seller_paise',
      'co2_avoided_kg',
      'status',
      'tx_hash',
      'block_number',
      'settlement_mode',
      'settled_at',
    ],
    trades.map((t) => [
      t.id,
      t.slotId,
      t.slot.startSim.toISOString(),
      t.sellerId,
      t.seller.name,
      t.buyerId,
      t.buyer.name,
      round(t.kwh),
      round(t.deliveredKwh),
      round(t.efficiencyPct, 3),
      t.pricePaise,
      t.grossPaise,
      t.wheelingFeePaise,
      t.netToSellerPaise,
      round(t.co2AvoidedKg),
      t.status,
      t.settlement?.txHash ?? '',
      t.settlement?.blockNumber ?? '',
      t.settlement?.mode ?? '',
      t.settlement?.settledAt.toISOString() ?? '',
    ]),
  );

  return csvResponse(csv, 'sunshare-trades.csv');
}

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
