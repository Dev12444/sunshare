// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EnergyEscrow
 * @notice Per-slot commitment, escrow and settlement for SunShare trades.
 * @dev Rahi, H6.5-H10.5.
 *
 * Design commitment carried over from Phase 1: matching happens OFF chain (it
 * is a min-cost-max-flow over a grid graph — pointless and expensive on chain).
 * What goes on chain is the part that needs to be tamper-evident:
 *
 *   1. commitSlot   — a Merkle root of the slot's order book, published before
 *                     settlement, so nobody can claim the book was different
 *                     afterwards.
 *   2. settle       — the actual trade, paying on DELIVERED energy, with the
 *                     DISCOM's wheeling charge split out explicitly.
 *
 * The price corridor is enforced here as well as off chain. A contract that
 * trusts its caller to have clamped the price is not actually enforcing an
 * invariant.
 *
 * Energy is in Wh (kWh * 1000) so everything stays integer.
 * Money is in paise.
 */
contract EnergyEscrow {
    struct Trade {
        bytes32 id;
        address seller;
        address buyer;
        uint256 contractedWh;
        uint256 deliveredWh;
        uint256 pricePaisePerKwh;
        uint256 wheelingFeePaise;
        uint64 slot;
        bool settled;
    }

    /// @notice Corridor bounds, in paise per kWh, set by the DISCOM.
    uint256 public feedInTariffPaise;
    uint256 public retailTariffPaise;
    uint256 public wheelingChargePaise;

    address public discom;
    address public relayer;

    mapping(bytes32 => Trade) public trades;
    mapping(uint64 => bytes32) public slotRoots;

    event SlotCommitted(uint64 indexed slot, bytes32 merkleRoot, uint256 orderCount);
    event TradeSettled(
        bytes32 indexed id,
        address indexed seller,
        address indexed buyer,
        uint256 deliveredWh,
        uint256 pricePaisePerKwh,
        uint256 wheelingFeePaise
    );

    error NotAuthorised();
    error PriceOutsideCorridor(uint256 price, uint256 floorPaise, uint256 ceilPaise);
    error AlreadySettled(bytes32 id);
    error DeliveredExceedsContracted(uint256 delivered, uint256 contracted);

    modifier onlyRelayer() {
        if (msg.sender != relayer && msg.sender != discom) revert NotAuthorised();
        _;
    }

    modifier onlyDiscom() {
        if (msg.sender != discom) revert NotAuthorised();
        _;
    }

    constructor(
        address _relayer,
        uint256 _feedInTariffPaise,
        uint256 _retailTariffPaise,
        uint256 _wheelingChargePaise
    ) {
        discom = msg.sender;
        relayer = _relayer;
        feedInTariffPaise = _feedInTariffPaise;
        retailTariffPaise = _retailTariffPaise;
        wheelingChargePaise = _wheelingChargePaise;
    }

    /**
     * @notice Publish the Merkle root of a slot's order book before settling it.
     * @dev TODO(Rahi, H13): called once per slot by the orchestrator.
     *      This is cut-list item #2 — if time runs out, settle() still works
     *      without it.
     */
    function commitSlot(uint64 slot, bytes32 merkleRoot, uint256 orderCount)
        external
        onlyRelayer
    {
        slotRoots[slot] = merkleRoot;
        emit SlotCommitted(slot, merkleRoot, orderCount);
    }

    /**
     * @notice Settle one matched trade on delivered energy.
     * @dev Reverts outside the corridor, on delivered > contracted, or on a
     *      repeated trade id. The wheeling fee is charged on delivered energy.
     */
    function settle(
        bytes32 id,
        address seller,
        address buyer,
        uint256 contractedWh,
        uint256 deliveredWh,
        uint256 pricePaisePerKwh,
        uint64 slot
    ) external onlyRelayer {
        if (trades[id].settled) revert AlreadySettled(id);
        if (deliveredWh > contractedWh) {
            revert DeliveredExceedsContracted(deliveredWh, contractedWh);
        }
        if (
            pricePaisePerKwh < feedInTariffPaise ||
            pricePaisePerKwh > retailTariffPaise
        ) {
            revert PriceOutsideCorridor(
                pricePaisePerKwh,
                feedInTariffPaise,
                retailTariffPaise
            );
        }

        // Charged on what actually arrived, not what was contracted — the
        // DISCOM wheeled the delivered electrons, not the lost ones.
        uint256 feePaise = (deliveredWh * wheelingChargePaise) / 1000;

        trades[id] = Trade({
            id: id,
            seller: seller,
            buyer: buyer,
            contractedWh: contractedWh,
            deliveredWh: deliveredWh,
            pricePaisePerKwh: pricePaisePerKwh,
            wheelingFeePaise: feePaise,
            slot: slot,
            settled: true
        });

        emit TradeSettled(id, seller, buyer, deliveredWh, pricePaisePerKwh, feePaise);
    }

    /// @notice Gross, wheeling and net for a settled trade, all in paise.
    function settlementBreakdown(bytes32 id)
        external
        view
        returns (uint256 grossPaise, uint256 wheelingFeePaise, uint256 netToSellerPaise)
    {
        Trade memory t = trades[id];
        grossPaise = (t.deliveredWh * t.pricePaisePerKwh) / 1000;
        wheelingFeePaise = t.wheelingFeePaise;
        netToSellerPaise = grossPaise - wheelingFeePaise;
    }

    /// @notice DISCOM updates the corridor when the tariff order changes.
    function setTariffs(
        uint256 _feedInTariffPaise,
        uint256 _retailTariffPaise,
        uint256 _wheelingChargePaise
    ) external onlyDiscom {
        feedInTariffPaise = _feedInTariffPaise;
        retailTariffPaise = _retailTariffPaise;
        wheelingChargePaise = _wheelingChargePaise;
    }
}
