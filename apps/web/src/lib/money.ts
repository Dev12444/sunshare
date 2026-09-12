/**
 * Settlement arithmetic — Rahi.
 *
 * These mirror EnergyEscrow.sol exactly, and must keep mirroring it. The
 * contract works in integer Wh with truncating division; computing the same
 * figures from float kWh with rounding drifts by a paise per trade, which puts
 * the ledger page and the chain into visible disagreement and undermines the
 * whole point of settling on chain.
 *
 * Solidity:  feePaise = (deliveredWh * wheelingChargePaise) / 1000
 */

/** Energy crosses the contract boundary as integer Wh. */
export function kwhToWh(kwh: number): number {
  return Math.round(kwh * 1000);
}

/** Integer division, matching Solidity's truncation — never Math.round. */
export function paiseFor(deliveredWh: number, paisePerKwh: number): number {
  return Math.floor((deliveredWh * paisePerKwh) / 1000);
}

export interface TradeMoney {
  deliveredWh: number;
  grossPaise: number;
  wheelingFeePaise: number;
  netToSellerPaise: number;
}

export function tradeMoney(
  deliveredKwh: number,
  pricePaisePerKwh: number,
  wheelingChargePaise: number,
): TradeMoney {
  const deliveredWh = kwhToWh(deliveredKwh);
  const grossPaise = paiseFor(deliveredWh, pricePaisePerKwh);
  const wheelingFeePaise = paiseFor(deliveredWh, wheelingChargePaise);

  return {
    deliveredWh,
    grossPaise,
    wheelingFeePaise,
    netToSellerPaise: grossPaise - wheelingFeePaise,
  };
}
