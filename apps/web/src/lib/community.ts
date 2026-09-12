/**
 * Robin Hood community pool — Rahi, H17–H19. Feature #3.
 *
 * Once a prosumer's day generation clears their own threshold, a share of what
 * they sell is routed to a DISCOM-verified beneficiary. The contract owns the
 * arithmetic and the verification check; this file decides who is eligible in a
 * given slot and records what actually happened.
 */
import type { CommunityDonation } from '@sunshare/shared';
import { DEFAULT_TARIFF } from '@sunshare/shared';
import type { MeterReading } from '@sunshare/shared';
import type { Trade } from '@prisma/client';
import { prisma } from './prisma';
import { publish } from './bus';
import { sendToUser } from './push';
import { kwhToWh, paiseFor } from './money';
import {
  isPoolConfigured,
  readDonorConfig,
  relayDonation,
  relayDonorConfig,
  isBeneficiaryVerified,
  relayVerifyBeneficiary,
} from './relayer';

/** uint64 slot number the contract indexes by: minutes since the epoch. */
const slotNumber = (startSim: Date) => Math.floor(startSim.getTime() / 60_000);

export async function setDonorConfig(
  userId: string,
  donationBps: number,
  dailyThresholdKwh: number,
): Promise<{ txHash: string | null }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.walletAddress) throw new Error('user has no wallet address');

  if (!isPoolConfigured()) return { txHash: null };

  const txHash = await relayDonorConfig(
    user.walletAddress,
    donationBps,
    BigInt(kwhToWh(dailyThresholdKwh)),
  );

  return { txHash };
}

/**
 * Beneficiaries are taken in turn rather than always the first, so a demo that
 * runs a handful of slots shows the whole registry receiving rather than one
 * school collecting everything.
 */
function beneficiaryForIndex<T>(registry: T[], index: number): T {
  return registry[index % registry.length];
}

/**
 * The registry lives in the database but the contract refuses to pay anyone it
 * has not verified itself, so the two have to be reconciled before any routing.
 * Idempotent and cheap: it only sends a transaction for a beneficiary the chain
 * does not already know, which is normally none after the first slot.
 */
export async function syncBeneficiaries(): Promise<number> {
  if (!isPoolConfigured()) return 0;

  const beneficiaries = await prisma.beneficiary.findMany({ orderBy: { id: 'asc' } });
  let verified = 0;

  for (const b of beneficiaries) {
    try {
      if (await isBeneficiaryVerified(b.walletAddress)) continue;
      await relayVerifyBeneficiary(b.walletAddress, b.name, b.kind);
      verified += 1;
    } catch (err) {
      console.error(`could not verify beneficiary ${b.id}`, err);
    }
  }

  return verified;
}

export async function routeDonationsForSlot(
  trades: Trade[],
  readings: MeterReading[],
  slot: { id: string; startSim: Date },
): Promise<CommunityDonation[]> {
  if (!isPoolConfigured() || trades.length === 0) return [];

  const beneficiaries = await prisma.beneficiary.findMany({ orderBy: { id: 'asc' } });
  if (beneficiaries.length === 0) return [];

  await syncBeneficiaries();

  // What each seller actually delivered this slot caps what they can give.
  const deliveredBySeller = new Map<string, number>();
  for (const trade of trades) {
    deliveredBySeller.set(
      trade.sellerId,
      (deliveredBySeller.get(trade.sellerId) ?? 0) + trade.deliveredKwh,
    );
  }

  const dayGenerationByUser = new Map(
    readings.map((r) => [r.userId, r.dayGenerationKwh]),
  );

  const sellers = await prisma.user.findMany({
    where: { id: { in: [...deliveredBySeller.keys()] } },
  });

  const donations: CommunityDonation[] = [];
  let index = 0;

  for (const seller of sellers) {
    if (!seller.walletAddress) continue;

    let config;
    try {
      config = await readDonorConfig(seller.walletAddress);
    } catch (err) {
      console.error(`donor config read failed for ${seller.id}`, err);
      continue;
    }
    if (!config.active) continue;

    const beneficiary = beneficiaryForIndex(beneficiaries, index);
    index += 1;

    try {
      const { txHash, donatedWh } = await relayDonation({
        donor: seller.walletAddress,
        beneficiary: beneficiary.walletAddress,
        dayGenerationWh: BigInt(kwhToWh(dayGenerationByUser.get(seller.id) ?? 0)),
        availableWh: BigInt(kwhToWh(deliveredBySeller.get(seller.id) ?? 0)),
        slot: slotNumber(slot.startSim),
      });

      if (donatedWh === 0n) continue;

      const kwh = Number(donatedWh) / 1000;
      // Valued at the feed-in tariff: what the donor gave up by not exporting.
      const valuePaise = paiseFor(Number(donatedWh), DEFAULT_TARIFF.feedInTariffPaise);

      const row = await prisma.donation.create({
        data: {
          donorId: seller.id,
          beneficiaryId: beneficiary.id,
          kwh,
          slotId: slot.id,
          valuePaise,
          txHash,
        },
      });

      const donation: CommunityDonation = {
        id: row.id,
        donorId: seller.id,
        donorName: seller.name,
        beneficiaryId: beneficiary.id,
        beneficiaryName: beneficiary.name,
        kwh,
        slotId: slot.id,
        valuePaise,
        txHash,
        createdAt: row.createdAt.toISOString(),
      };

      donations.push(donation);
      publish({ type: 'donation', data: donation });

      await sendToUser(seller.id, {
        title: 'Community pool funded',
        body: `${kwh.toFixed(2)} kWh routed to ${beneficiary.name}`,
        url: '/community',
        tag: `donation-${row.id}`,
        icon: '/icons/icon-192.png',
      });
    } catch (err) {
      // A pool failure must never take the slot's trades down with it.
      console.error(`donation failed for ${seller.id}`, err);
    }
  }

  return donations;
}

export async function communityOverview() {
  const [beneficiaries, donations, leaderboard] = await Promise.all([
    prisma.beneficiary.findMany({
      include: { donations: { select: { kwh: true } } },
      orderBy: { id: 'asc' },
    }),
    prisma.donation.findMany({
      include: { donor: true, beneficiary: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.donation.groupBy({
      by: ['donorId'],
      _sum: { kwh: true, valuePaise: true },
      orderBy: { _sum: { kwh: 'desc' } },
      take: 10,
    }),
  ]);

  const donorNames = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: leaderboard.map((row) => row.donorId) } },
        select: { id: true, name: true },
      })
    ).map((u) => [u.id, u.name]),
  );

  return {
    beneficiaries: beneficiaries.map((b) => ({
      id: b.id,
      name: b.name,
      kind: b.kind,
      nodeId: b.nodeId,
      walletAddress: b.walletAddress,
      verifiedBy: b.verifiedBy,
      verifiedAt: b.verifiedAt.toISOString(),
      receivedKwh: b.donations.reduce((sum, d) => sum + d.kwh, 0),
    })),
    donations: donations.map((d) => ({
      id: d.id,
      donorId: d.donorId,
      donorName: d.donor.name,
      beneficiaryId: d.beneficiaryId,
      beneficiaryName: d.beneficiary.name,
      kwh: d.kwh,
      slotId: d.slotId,
      valuePaise: d.valuePaise,
      txHash: d.txHash,
      createdAt: d.createdAt.toISOString(),
    })) satisfies CommunityDonation[],
    leaderboard: leaderboard.map((row, i) => ({
      rank: i + 1,
      donorId: row.donorId,
      donorName: donorNames.get(row.donorId) ?? row.donorId,
      kwh: row._sum.kwh ?? 0,
      valuePaise: row._sum.valuePaise ?? 0,
    })),
  };
}
