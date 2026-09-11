// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CommunityPool — the "Robin Hood" protocol
 * @notice Routes a share of a prosumer's surplus to verified community
 *         beneficiaries once their daily generation clears a threshold.
 * @dev Rahi, H6.5-H10.5. Feature #3.
 *
 * The idea: a household that has already had a good solar day can let the tail
 * of its generation — say the last 10% — flow to a local school, a set of
 * streetlights, or a lower-income household, free or at the feed-in rate. The
 * donor sets both numbers themselves and can change them at any time.
 *
 * Beneficiaries must be verified by the DISCOM/regulator before they can
 * receive anything. That check is the whole reason this is on chain: a
 * "community pool" nobody can audit is just a marketing claim.
 *
 * Energy is in Wh. Basis points: 1000 bps = 10%.
 */
contract CommunityPool {
    enum BeneficiaryKind {
        SCHOOL,
        STREETLIGHT,
        HOUSEHOLD,
        CLINIC
    }

    struct Beneficiary {
        string name;
        BeneficiaryKind kind;
        address wallet;
        bool verified;
        uint256 receivedWh;
    }

    struct DonorConfig {
        /// @dev Share of generation above the threshold, in basis points.
        uint16 donationBps;
        /// @dev Donations only start once the day's generation clears this.
        uint256 dailyThresholdWh;
        bool active;
    }

    address public discom;
    mapping(address => Beneficiary) public beneficiaries;
    address[] public beneficiaryList;

    mapping(address => DonorConfig) public donors;
    mapping(address => uint256) public donatedTodayWh;
    uint256 public totalDonatedWh;

    event BeneficiaryVerified(address indexed wallet, string name, BeneficiaryKind kind);
    event BeneficiaryRevoked(address indexed wallet);
    event DonorConfigured(address indexed donor, uint16 donationBps, uint256 thresholdWh);
    event Donated(
        address indexed donor,
        address indexed beneficiary,
        uint256 wh,
        uint64 slot
    );

    error NotDiscom();
    error NotVerified(address wallet);
    error InvalidBps(uint16 bps);

    modifier onlyDiscom() {
        if (msg.sender != discom) revert NotDiscom();
        _;
    }

    constructor() {
        discom = msg.sender;
    }

    /// @notice Only the DISCOM/regulator can add a beneficiary.
    function verifyBeneficiary(
        address wallet,
        string calldata name,
        BeneficiaryKind kind
    ) external onlyDiscom {
        if (!beneficiaries[wallet].verified) beneficiaryList.push(wallet);
        beneficiaries[wallet] = Beneficiary(name, kind, wallet, true, 0);
        emit BeneficiaryVerified(wallet, name, kind);
    }

    function revokeBeneficiary(address wallet) external onlyDiscom {
        beneficiaries[wallet].verified = false;
        emit BeneficiaryRevoked(wallet);
    }

    /// @notice A prosumer opts in and sets their own generosity.
    function configureDonor(uint16 donationBps, uint256 dailyThresholdWh) external {
        if (donationBps > 10_000) revert InvalidBps(donationBps);
        donors[msg.sender] = DonorConfig(donationBps, dailyThresholdWh, donationBps > 0);
        emit DonorConfigured(msg.sender, donationBps, dailyThresholdWh);
    }

    /**
     * @notice Route a donation during settlement.
     * @dev TODO(Rahi, H10.5-H13). Must:
     *      - revert unless the beneficiary is verified
     *      - do nothing if the donor's day generation is below the threshold
     *      - compute donationBps of the surplus above the threshold
     *      - update receivedWh / donatedTodayWh / totalDonatedWh
     *      - emit Donated
     *
     * Called by EnergyEscrow during settle(), not directly by users.
     */
    function routeDonation(
        address donor,
        address beneficiary,
        uint256 dayGenerationWh,
        uint256 availableWh,
        uint64 slot
    ) external returns (uint256 donatedWh) {
        if (!beneficiaries[beneficiary].verified) revert NotVerified(beneficiary);
        // TODO(Rahi): implement the threshold + bps maths.
        revert("TODO(Rahi): implement routeDonation");
    }

    function beneficiaryCount() external view returns (uint256) {
        return beneficiaryList.length;
    }
}
