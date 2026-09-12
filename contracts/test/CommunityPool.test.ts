import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const SCHOOL = 0; // BeneficiaryKind.SCHOOL
const SLOT = 42;

/** 10% of everything above 10 kWh for the day. */
const DONATION_BPS = 1_000;
const THRESHOLD_WH = 10_000;

async function deployPool() {
  const [discom, donor, otherDonor, school, stranger] = await ethers.getSigners();

  const pool = await ethers.deployContract('CommunityPool');
  await pool.waitForDeployment();

  await pool.connect(discom).verifyBeneficiary(school.address, 'Sector 21 Primary School', SCHOOL);
  await pool.connect(donor).configureDonor(DONATION_BPS, THRESHOLD_WH);

  return { pool, discom, donor, otherDonor, school, stranger };
}

describe('CommunityPool', () => {
  it('only lets the DISCOM verify a beneficiary', async () => {
    const { pool, stranger } = await loadFixture(deployPool);

    await expect(
      pool.connect(stranger).verifyBeneficiary(stranger.address, 'Self Dealing Ltd', SCHOOL),
    ).to.be.revertedWithCustomError(pool, 'NotDiscom');
  });

  it('refuses to donate to an unverified beneficiary', async () => {
    const { pool, donor, stranger } = await loadFixture(deployPool);

    await expect(
      pool.routeDonation(donor.address, stranger.address, 20_000, 5_000, SLOT),
    )
      .to.be.revertedWithCustomError(pool, 'NotVerified')
      .withArgs(stranger.address);
  });

  it('donates nothing below the daily threshold', async () => {
    const { pool, donor, school } = await loadFixture(deployPool);

    const donated = await pool.routeDonation.staticCall(
      donor.address,
      school.address,
      THRESHOLD_WH - 1,
      5_000,
      SLOT,
    );

    expect(donated).to.equal(0);
  });

  it('donates donationBps of the surplus above the threshold', async () => {
    const { pool, donor, school } = await loadFixture(deployPool);

    // 20 kWh generated, 10 kWh above threshold, 10% of that = 1 kWh.
    await pool.routeDonation(donor.address, school.address, 20_000, 5_000, SLOT);

    expect(await pool.totalDonatedWh()).to.equal(1_000);
    expect(await pool.donatedTodayWh(donor.address)).to.equal(1_000);

    const beneficiary = await pool.beneficiaries(school.address);
    expect(beneficiary.receivedWh).to.equal(1_000);
  });

  it('tops up towards the daily target instead of re-donating each slot', async () => {
    const { pool, donor, school } = await loadFixture(deployPool);

    await pool.routeDonation(donor.address, school.address, 20_000, 5_000, SLOT);
    // Same day, generation now 30 kWh: target is 2 kWh, 1 kWh already given.
    await pool.routeDonation(donor.address, school.address, 30_000, 5_000, SLOT + 1);

    expect(await pool.donatedTodayWh(donor.address)).to.equal(2_000);
  });

  it('never donates more than the slot makes available', async () => {
    const { pool, donor, school } = await loadFixture(deployPool);

    // Target would be 5 kWh but only 400 Wh is actually spare this slot.
    await pool.routeDonation(donor.address, school.address, 60_000, 400, SLOT);

    expect(await pool.donatedTodayWh(donor.address)).to.equal(400);
  });

  it('accumulates totalDonatedWh across donors', async () => {
    const { pool, donor, otherDonor, school } = await loadFixture(deployPool);

    await pool.connect(otherDonor).configureDonor(DONATION_BPS, THRESHOLD_WH);

    await pool.routeDonation(donor.address, school.address, 20_000, 5_000, SLOT);
    await pool.routeDonation(otherDonor.address, school.address, 30_000, 5_000, SLOT);

    // 1 kWh from the first donor, 2 kWh from the second.
    expect(await pool.totalDonatedWh()).to.equal(3_000);

    const beneficiary = await pool.beneficiaries(school.address);
    expect(beneficiary.receivedWh).to.equal(3_000);
  });

  it('lets the DISCOM configure a donor who holds no key', async () => {
    const { pool, discom, otherDonor, school } = await loadFixture(deployPool);

    await pool.connect(discom).configureDonorFor(otherDonor.address, DONATION_BPS, THRESHOLD_WH);
    await pool.routeDonation(otherDonor.address, school.address, 20_000, 5_000, SLOT);

    expect(await pool.donatedTodayWh(otherDonor.address)).to.equal(1_000);
  });

  it('refuses configureDonorFor from anyone but the DISCOM', async () => {
    const { pool, stranger, otherDonor } = await loadFixture(deployPool);

    await expect(
      pool.connect(stranger).configureDonorFor(otherDonor.address, DONATION_BPS, THRESHOLD_WH),
    ).to.be.revertedWithCustomError(pool, 'NotDiscom');
  });

  it('donates nothing for a donor who never opted in', async () => {
    const { pool, stranger, school } = await loadFixture(deployPool);

    const donated = await pool.routeDonation.staticCall(
      stranger.address,
      school.address,
      50_000,
      5_000,
      SLOT,
    );

    expect(donated).to.equal(0);
  });
});
