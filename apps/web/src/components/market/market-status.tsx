'use client';

/**
 * Market Status — the reference's right-hand panel.
 *
 * Eight rows, all derived, none invented. Two are computed rather than read
 * straight off MarketState because the type does not carry them:
 *
 *   Next slot      slots are a fixed 15 minutes, so the next window is the
 *                  current end plus one slot.
 *   Traded volume  the live slot has not cleared yet, so the only honest
 *                  figure is the last settled slot's — labelled as such
 *                  rather than passed off as the current one.
 *
 * Buy/sell ratio is demand over supply, which is the direction that matters:
 * above 1 means buyers are competing and price is being pushed up the
 * corridor, which is exactly when a seller wants to be looking at this panel.
 */
import { SLOT_MINUTES, type MarketState, type TariffContext } from '@sunshare/shared';
import { DataRow } from '@/components/ui/metric';
import { PanelBody } from '@/components/ui/panel';
import { kwh, pricePerKwh } from '@/lib/format';

function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

/** Slot windows are fixed-width, so the next one needs no round trip. */
function plusSlot(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + SLOT_MINUTES);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function MarketStatus({
  market,
  tariff,
  lastVolumeKwh,
}: {
  market: MarketState;
  tariff: TariffContext;
  lastVolumeKwh: number | null;
}) {
  const price = market.lastClearingPricePaise ?? market.indicativePricePaise;
  const cleared = market.lastClearingPricePaise !== null;

  // Guard the divide: an all-seller slot before any bid arrives is normal at
  // dawn, and "Infinity : 1" is not a thing to show a household.
  const ratio =
    market.totalSupplyKwh > 0.001
      ? `${(market.totalDemandKwh / market.totalSupplyKwh).toFixed(2)} : 1`
      : '—';

  return (
    <PanelBody className="space-y-0">
      <dl>
      <DataRow label="Current slot">{hhmm(market.slotStartSim)}–{hhmm(market.slotEndSim)}</DataRow>
      <DataRow label="Next slot">{hhmm(market.slotEndSim)}–{plusSlot(market.slotEndSim)}</DataRow>
      <DataRow label={cleared ? 'Clearing price' : 'Indicative price'} tone={cleared ? 'up' : 'neutral'}>
        {pricePerKwh(price)}
      </DataRow>
      <DataRow label="Price corridor">
        {pricePerKwh(tariff.feedInTariffPaise)} — {pricePerKwh(tariff.retailTariffPaise)}
      </DataRow>
      <DataRow label="Buy / sell ratio">{ratio}</DataRow>
      <DataRow label="Total supply">{kwh(market.totalSupplyKwh)} kWh</DataRow>
      <DataRow label="Total demand">{kwh(market.totalDemandKwh)} kWh</DataRow>
      <DataRow label="Traded volume">
        {lastVolumeKwh === null ? 'Awaiting clear' : `${kwh(lastVolumeKwh)} kWh`}
      </DataRow>
      </dl>
    </PanelBody>
  );
}
