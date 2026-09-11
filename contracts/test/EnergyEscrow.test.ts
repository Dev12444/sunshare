import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

/**
 * Rahi, H6.5–H10.5.
 * The corridor test is the one that matters — it is the project's core claim,
 * so it must be enforced by the contract, not just by the off-chain engine.
 */
const FEED_IN_PAISE = 215;
const RETAIL_PAISE = 650;
const WHEELING_PAISE = 45;

const TRADE_ID = ethers.id('trade-1');
const SLOT = 42;
const CONTRACTED_WH = 5_200;
const DELIVERED_WH = 5_000;
const PRICE_PAISE = 430;

async function deployEscrow() {
  const [discom, relayer, seller, buyer] = await ethers.getSigners();

  const escrow = await ethers.deployContract('EnergyEscrow', [
    relayer.address,
    FEED_IN_PAISE,
    RETAIL_PAISE,
    WHEELING_PAISE,
  ]);
  await escrow.waitForDeployment();

  return { escrow, discom, relayer, seller, buyer };
}

function settleWith(
  escrow: Awaited<ReturnType<typeof deployEscrow>>['escrow'],
  relayer: Awaited<ReturnType<typeof deployEscrow>>['relayer'],
  seller: string,
  buyer: string,
  overrides: Partial<{ price: number; delivered: number; contracted: number; id: string }> = {},
) {
  return escrow
    .connect(relayer)
    .settle(
      overrides.id ?? TRADE_ID,
      seller,
      buyer,
      overrides.contracted ?? CONTRACTED_WH,
      overrides.delivered ?? DELIVERED_WH,
      overrides.price ?? PRICE_PAISE,
      SLOT,
    );
}

describe('EnergyEscrow', () => {
  it('rejects a price below the feed-in tariff', async () => {
    const { escrow, relayer, seller, buyer } = await loadFixture(deployEscrow);

    await expect(
      settleWith(escrow, relayer, seller.address, buyer.address, {
        price: FEED_IN_PAISE - 1,
      }),
    )
      .to.be.revertedWithCustomError(escrow, 'PriceOutsideCorridor')
      .withArgs(FEED_IN_PAISE - 1, FEED_IN_PAISE, RETAIL_PAISE);
  });

  it('rejects a price above the retail tariff', async () => {
    const { escrow, relayer, seller, buyer } = await loadFixture(deployEscrow);

    await expect(
      settleWith(escrow, relayer, seller.address, buyer.address, {
        price: RETAIL_PAISE + 1,
      }),
    )
      .to.be.revertedWithCustomError(escrow, 'PriceOutsideCorridor')
      .withArgs(RETAIL_PAISE + 1, FEED_IN_PAISE, RETAIL_PAISE);
  });

  it('rejects delivered > contracted', async () => {
    const { escrow, relayer, seller, buyer } = await loadFixture(deployEscrow);

    await expect(
      settleWith(escrow, relayer, seller.address, buyer.address, {
        delivered: CONTRACTED_WH + 1,
      }),
    )
      .to.be.revertedWithCustomError(escrow, 'DeliveredExceedsContracted')
      .withArgs(CONTRACTED_WH + 1, CONTRACTED_WH);
  });

  it('rejects double settlement of the same trade id', async () => {
    const { escrow, relayer, seller, buyer } = await loadFixture(deployEscrow);

    await settleWith(escrow, relayer, seller.address, buyer.address);

    await expect(settleWith(escrow, relayer, seller.address, buyer.address))
      .to.be.revertedWithCustomError(escrow, 'AlreadySettled')
      .withArgs(TRADE_ID);
  });

  it('splits the wheeling fee to the DISCOM', async () => {
    const { escrow, relayer, seller, buyer } = await loadFixture(deployEscrow);

    await settleWith(escrow, relayer, seller.address, buyer.address);

    // Fee is charged on delivered energy, not contracted.
    const expectedFee = (DELIVERED_WH * WHEELING_PAISE) / 1000;
    const expectedGross = (DELIVERED_WH * PRICE_PAISE) / 1000;

    const [gross, fee, net] = await escrow.settlementBreakdown(TRADE_ID);

    expect(fee).to.equal(expectedFee);
    expect(gross).to.equal(expectedGross);
    expect(net).to.equal(expectedGross - expectedFee);
  });

  it('emits TradeSettled with delivered energy', async () => {
    const { escrow, relayer, seller, buyer } = await loadFixture(deployEscrow);

    await expect(settleWith(escrow, relayer, seller.address, buyer.address))
      .to.emit(escrow, 'TradeSettled')
      .withArgs(
        TRADE_ID,
        seller.address,
        buyer.address,
        DELIVERED_WH,
        PRICE_PAISE,
        (DELIVERED_WH * WHEELING_PAISE) / 1000,
      );
  });

  it('refuses settlement from an address that is neither relayer nor DISCOM', async () => {
    const { escrow, seller, buyer } = await loadFixture(deployEscrow);

    await expect(
      settleWith(escrow, seller, seller.address, buyer.address),
    ).to.be.revertedWithCustomError(escrow, 'NotAuthorised');
  });
});
