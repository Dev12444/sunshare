'use client';

import { useMemo, useState } from 'react';
import { DEFAULT_TARIFF, type Bid, type Listing } from '@sunshare/shared';
import { Button, Field, Input } from '@/components/ui/controls';
import { DataRow } from '@/components/ui/metric';
import { Tag } from '@/components/ui/tag';
import { corridorVerdict } from '@/lib/domain';
import { kwh as fmtKwh, rupees, simClock } from '@/lib/format';
import { getState, logActivity, pushNotice, setState, useStore } from '@/lib/store';
import { PriceCorridor } from './corridor';

type Step = 'edit' | 'confirm' | 'done';

/* --------------------------------------------------------------- listing */

/**
 * Create a sell listing.
 *
 * The corridor preview updates as the price is typed, so the constraint is
 * visible while the decision is being made rather than as a rejection after
 * it. Submitting is two steps — compose, then confirm against the numbers —
 * because this places a real obligation to deliver energy.
 */
export function ListingForm({
  availableKwh,
  onDone,
}: {
  availableKwh: number;
  onDone?: (listing: Listing) => void;
}) {
  const market = useStore((s) => s.market);
  const user = useStore((s) => s.user);
  const t = DEFAULT_TARIFF;

  const suggested = market?.indicativePricePaise ?? t.feedInTariffPaise + 150;
  const [step, setStep] = useState<Step>('edit');
  const [energy, setEnergy] = useState(() => Math.max(0.1, Math.round(availableKwh * 90) / 100).toFixed(2));
  const [price, setPrice] = useState((suggested / 100).toFixed(2));
  const [created, setCreated] = useState<Listing | null>(null);

  const kwhValue = Number(energy);
  const pricePaise = Math.round(Number(price) * 100);
  const verdict = corridorVerdict(pricePaise, t);

  const error = useMemo(() => {
    if (!Number.isFinite(kwhValue) || kwhValue <= 0) return 'Enter the energy you want to offer.';
    if (kwhValue > availableKwh + 0.001)
      return `Only ${fmtKwh(availableKwh)} kWh of surplus is available this slot.`;
    if (!Number.isFinite(pricePaise) || pricePaise <= 0) return 'Enter an ask price.';
    if (verdict === 'BELOW_FLOOR')
      return `Below the ${rupees(t.feedInTariffPaise)} feed-in floor — you would earn more exporting to the DISCOM.`;
    if (verdict === 'ABOVE_CEILING')
      return `Above the ${rupees(t.retailTariffPaise)} retail ceiling — no buyer can clear at this price.`;
    return null;
  }, [kwhValue, availableKwh, pricePaise, verdict, t]);

  const net = Math.round(kwhValue * (pricePaise - t.wheelingChargePaise));
  const gross = Math.round(kwhValue * pricePaise);
  const versusFeedIn = Math.round(kwhValue * (pricePaise - t.wheelingChargePaise - t.feedInTariffPaise));

  if (step === 'done' && created) {
    return (
      <div className="space-y-3">
        <Tag tone="up" dot>
          Listing open
        </Tag>
        <p className="text-sm text-ink-2">
          {fmtKwh(created.kwh)} kWh offered at {rupees(created.askPricePaise)}/kWh in slot{' '}
          {created.slotId.slice(11)}. It clears if the uniform price reaches your ask.
        </p>
        <dl>
          <DataRow label="Expires">{simClock(created.expiresAtSim)}</DataRow>
          <DataRow label="Net if filled" tone="up">
            {rupees(Math.round(created.kwh * (created.askPricePaise - t.wheelingChargePaise)))}
          </DataRow>
        </dl>
        <Button variant="default" onClick={() => onDone?.(created)}>
          Done
        </Button>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="space-y-3.5">
        <p className="text-label font-semibold uppercase text-ink-3">Confirm listing</p>
        <dl>
          <DataRow label="Energy offered">{fmtKwh(kwhValue)} kWh</DataRow>
          <DataRow label="Ask price">{rupees(pricePaise)}/kWh</DataRow>
          <DataRow label="Gross if filled">{rupees(gross)}</DataRow>
          <DataRow label="Wheeling charge">−{rupees(Math.round(kwhValue * t.wheelingChargePaise))}</DataRow>
          <DataRow label="Net to you" tone="up">
            {rupees(net)}
          </DataRow>
          <DataRow label="Versus feed-in tariff" tone={versusFeedIn > 0 ? 'up' : 'neutral'}>
            +{rupees(Math.max(0, versusFeedIn))}
          </DataRow>
          <DataRow label="Slot">{market?.slotId.slice(11) ?? '—'}</DataRow>
        </dl>
        <p className="text-xs text-ink-3">
          The listing is matched by the market, not by you. If it does not clear this slot it
          expires and the energy is exported at the feed-in tariff.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setStep('edit')}>
            Back
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const s = getState();
              const listing: Listing = {
                id: `L-U-${Date.now().toString(36).toUpperCase()}`,
                sellerId: user.id,
                meterId: s.readings.find((r) => r.userId === user.id)?.meterId ?? 'M-01',
                nodeId: user.nodeId ?? 'H-01',
                kwh: Math.round(kwhValue * 100) / 100,
                askPricePaise: pricePaise,
                slotId: s.market?.slotId ?? '',
                expiresAtSim: s.market?.slotEndSim ?? '',
                status: 'OPEN',
                brokerPolicyId: null,
              };
              setState((cur) => ({ myListings: [...cur.myListings, listing] }));
              logActivity({
                tsSim: s.tick?.tsSim ?? '',
                channel: 'market',
                text: `Listed ${fmtKwh(listing.kwh)} kWh at ${rupees(listing.askPricePaise)}.`,
              });
              pushNotice({
                tsSim: s.tick?.tsSim ?? '',
                title: 'Listing submitted',
                body: `${fmtKwh(listing.kwh)} kWh at ${rupees(listing.askPricePaise)}/kWh, slot ${listing.slotId.slice(11)}.`,
                href: '/marketplace',
                tone: 'solar',
              });
              setCreated(listing);
              setStep('done');
            }}
          >
            Submit listing
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Energy" hint={`${fmtKwh(availableKwh)} kWh available`} htmlFor="listing-kwh">
          <Input
            id="listing-kwh"
            inputMode="decimal"
            value={energy}
            onChange={(e) => setEnergy(e.target.value)}
            suffix="kWh"
          />
        </Field>
        <Field
          label="Ask price"
          hint={`Indicative ${rupees(suggested)}`}
          htmlFor="listing-price"
        >
          <Input
            id="listing-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            prefix="₹"
            suffix="/kWh"
          />
        </Field>
      </div>

      <PriceCorridor
        tariff={t}
        clearingPricePaise={market?.lastClearingPricePaise ?? null}
        askPricePaise={Number.isFinite(pricePaise) ? pricePaise : null}
        height="sm"
        showLegend={false}
      />

      <dl>
        <DataRow label="Gross if filled">{rupees(Number.isFinite(gross) ? gross : 0)}</DataRow>
        <DataRow label="Net after wheeling" tone="up">
          {rupees(Number.isFinite(net) ? net : 0)}
        </DataRow>
      </dl>

      {error ? <p className="text-xs text-down">{error}</p> : null}

      <Button variant="primary" disabled={Boolean(error)} onClick={() => setStep('confirm')}>
        Review listing
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------- bid */

/** Place a buy bid. Symmetric to the listing form, ceiling instead of floor. */
export function BidForm({
  suggestedKwh,
  onDone,
}: {
  suggestedKwh: number;
  onDone?: (bid: Bid) => void;
}) {
  const market = useStore((s) => s.market);
  const user = useStore((s) => s.user);
  const t = DEFAULT_TARIFF;

  const [step, setStep] = useState<Step>('edit');
  const [energy, setEnergy] = useState(() => Math.max(0.1, suggestedKwh).toFixed(2));
  const [price, setPrice] = useState(
    ((market?.indicativePricePaise ?? t.retailTariffPaise - 80) / 100).toFixed(2),
  );
  const [created, setCreated] = useState<Bid | null>(null);

  const kwhValue = Number(energy);
  const pricePaise = Math.round(Number(price) * 100);
  const verdict = corridorVerdict(pricePaise, t);

  const error = useMemo(() => {
    if (!Number.isFinite(kwhValue) || kwhValue <= 0) return 'Enter the energy you want to buy.';
    if (!Number.isFinite(pricePaise) || pricePaise <= 0) return 'Enter a limit price.';
    if (verdict === 'ABOVE_CEILING')
      return `Above the ${rupees(t.retailTariffPaise)} retail tariff — importing from the grid would be cheaper.`;
    if (verdict === 'BELOW_FLOOR')
      return `Below the ${rupees(t.feedInTariffPaise)} feed-in floor — no seller can clear at this price.`;
    return null;
  }, [kwhValue, pricePaise, verdict, t]);

  const cost = Math.round(kwhValue * pricePaise);
  const saving = Math.round(kwhValue * (t.retailTariffPaise - pricePaise));

  if (step === 'done' && created) {
    return (
      <div className="space-y-3">
        <Tag tone="up" dot>
          Bid open
        </Tag>
        <p className="text-sm text-ink-2">
          {fmtKwh(created.kwh)} kWh bid at up to {rupees(created.maxPricePaise)}/kWh in slot{' '}
          {created.slotId.slice(11)}. Any unfilled demand is covered by grid backfill at the retail
          tariff.
        </p>
        <Button variant="default" onClick={() => onDone?.(created)}>
          Done
        </Button>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="space-y-3.5">
        <p className="text-label font-semibold uppercase text-ink-3">Confirm bid</p>
        <dl>
          <DataRow label="Energy">{fmtKwh(kwhValue)} kWh</DataRow>
          <DataRow label="Limit price">{rupees(pricePaise)}/kWh</DataRow>
          <DataRow label="Maximum cost">{rupees(cost)}</DataRow>
          <DataRow label="Saving versus retail" tone="up">
            {rupees(Math.max(0, saving))}
          </DataRow>
          <DataRow label="Slot">{market?.slotId.slice(11) ?? '—'}</DataRow>
        </dl>
        <p className="text-xs text-ink-3">
          You pay the uniform clearing price, which may be lower than your limit. You never pay more
          than it.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setStep('edit')}>
            Back
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const s = getState();
              const bid: Bid = {
                id: `B-U-${Date.now().toString(36).toUpperCase()}`,
                buyerId: user.id,
                meterId: s.readings.find((r) => r.userId === user.id)?.meterId ?? 'M-06',
                nodeId: user.nodeId ?? 'H-06',
                kwh: Math.round(kwhValue * 100) / 100,
                maxPricePaise: pricePaise,
                slotId: s.market?.slotId ?? '',
                status: 'OPEN',
              };
              setState((cur) => ({ myBids: [...cur.myBids, bid] }));
              logActivity({
                tsSim: s.tick?.tsSim ?? '',
                channel: 'market',
                text: `Bid ${fmtKwh(bid.kwh)} kWh at up to ${rupees(bid.maxPricePaise)}.`,
              });
              pushNotice({
                tsSim: s.tick?.tsSim ?? '',
                title: 'Bid submitted',
                body: `${fmtKwh(bid.kwh)} kWh at up to ${rupees(bid.maxPricePaise)}/kWh, slot ${bid.slotId.slice(11)}.`,
                href: '/marketplace',
                tone: 'solar',
              });
              setCreated(bid);
              setStep('done');
            }}
          >
            Submit bid
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Energy" hint="Forecast shortfall this slot" htmlFor="bid-kwh">
          <Input
            id="bid-kwh"
            inputMode="decimal"
            value={energy}
            onChange={(e) => setEnergy(e.target.value)}
            suffix="kWh"
          />
        </Field>
        <Field label="Limit price" hint={`Retail ${rupees(t.retailTariffPaise)}`} htmlFor="bid-price">
          <Input
            id="bid-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            prefix="₹"
            suffix="/kWh"
          />
        </Field>
      </div>

      <PriceCorridor
        tariff={t}
        clearingPricePaise={market?.lastClearingPricePaise ?? null}
        askPricePaise={Number.isFinite(pricePaise) ? pricePaise : null}
        height="sm"
        showLegend={false}
      />

      <dl>
        <DataRow label="Maximum cost">{rupees(Number.isFinite(cost) ? cost : 0)}</DataRow>
        <DataRow label="Saving versus retail" tone="up">
          {rupees(Number.isFinite(saving) ? Math.max(0, saving) : 0)}
        </DataRow>
      </dl>

      {error ? <p className="text-xs text-down">{error}</p> : null}

      <Button variant="primary" disabled={Boolean(error)} onClick={() => setStep('confirm')}>
        Review bid
      </Button>
    </div>
  );
}
