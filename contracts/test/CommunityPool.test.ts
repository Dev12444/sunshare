import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('CommunityPool', () => {
  it('only lets the DISCOM verify a beneficiary');
  it('refuses to donate to an unverified beneficiary');
  it('donates nothing below the daily threshold');
  it('donates donationBps of the surplus above the threshold');
  it('accumulates totalDonatedWh across donors');
});
