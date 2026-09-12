'use client';

/**
 * Community Pool — Diya, H14–H16.
 * The "Robin Hood" mechanism: a slice of matched sales routes to verified
 * local beneficiaries instead of a seller's pocket. Civic and auditable,
 * not gamified.
 *
 * Registry and totals load from GET /api/community (Rahi). Live donations
 * arrive on the same event stream the Ledger reads, so the pool keeps moving
 * without a refetch.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Beneficiary, CommunityDonation } from '@sunshare/shared';
import { paiseToRupees } from '@sunshare/shared';
import { useActivity } from '@/hooks/use-activity';
import { LifecycleRail } from '@/components/lifecycle-rail';

/** GET /api/community — see communityOverview() in lib/community.ts. */
type CommunityOverview = {
  beneficiaries: (Beneficiary & { receivedKwh: number })[];
  donations: CommunityDonation[];
  leaderboard: { rank: number; donorId: string; donorName: string; kwh: number; valuePaise: number }[];
};

const KIND_LABEL: Record<string, string> = {
  SCHOOL: 'School',
  STREETLIGHT: 'Street lighting',
  HOUSEHOLD: 'Household',
  CLINIC: 'Clinic',
};

export default function CommunityPage() {
  const [overview, setOverview] = useState<CommunityOverview | null>(null);
  const [error, setError] = useState(false);
  const { events } = useActivity();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/community')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: CommunityOverview) => !cancelled && setOverview(data))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Donations streamed since load, merged over the registry by id. */
  const donations = useMemo(() => {
    const merged = new Map<string, CommunityDonation>();
    for (const d of overview?.donations ?? []) merged.set(d.id, d);
    for (const e of events) if (e.type === 'donation') merged.set(e.data.id, e.data);
    return [...merged.values()];
  }, [overview, events]);

  const totals = useMemo(() => {
    const kwh = donations.reduce((s, d) => s + d.kwh, 0);
    const valuePaise = donations.reduce((s, d) => s + d.valuePaise, 0);
    const received = new Map<string, number>();
    for (const d of donations) received.set(d.beneficiaryId, (received.get(d.beneficiaryId) ?? 0) + d.kwh);
    return {
      kwh,
      valuePaise,
      donorCount: new Set(donations.map((d) => d.donorId)).size,
      received,
    };
  }, [donations]);

  if (error) {
    return (
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">Community Pool</h1>
        <p className="tile text-sm text-grid-400">
          The community registry is unavailable right now. Donations already settled are
          unaffected — this page will fill in once the service responds.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Community Pool</h1>
        <LifecycleRail current="IMPACT" className="hidden sm:flex" />
      </div>

      {!overview ? (
        <div className="chip-neutral">Loading community registry…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Total pool" value={`${totals.kwh.toFixed(2)} kWh`} />
            <Metric label="Value routed" value={paiseToRupees(totals.valuePaise)} />
            <Metric label="Donors" value={String(totals.donorCount)} />
            <Metric label="Beneficiaries" value={String(overview.beneficiaries.length)} />
          </div>

          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-grid-400">
              Verified beneficiaries
            </h2>
            {overview.beneficiaries.length === 0 ? (
              <p className="tile text-sm text-grid-400">
                No beneficiaries are registered for this feeder yet.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {overview.beneficiaries.map((b) => (
                  <div key={b.id} className="tile">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{b.name}</div>
                        <div className="text-xs text-grid-400">
                          {KIND_LABEL[b.kind] ?? b.kind} · {b.nodeId}
                        </div>
                      </div>
                      <span className="chip-live shrink-0">Verified</span>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between border-t border-black/5 pt-2 dark:border-white/5">
                      <span className="text-xs text-grid-400">Received</span>
                      <span className="figure text-sm font-medium">
                        {(totals.received.get(b.id) ?? b.receivedKwh).toFixed(2)} kWh
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-grid-400">Verified by {b.verifiedBy}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="tile">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-grid-400">
              Donor leaderboard
            </h2>
            {overview.leaderboard.length === 0 ? (
              <p className="py-4 text-center text-sm text-grid-400">
                No donations routed yet — the pool fills as opted-in prosumers clear trades.
              </p>
            ) : (
              <ol className="space-y-0">
                {overview.leaderboard.map((d) => (
                  <li
                    key={d.donorId}
                    className="divider-row flex items-center justify-between py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span className="figure w-5 text-xs text-grid-400">{d.rank}</span>
                      {d.donorName}
                    </span>
                    <span className="figure">{d.kwh.toFixed(2)} kWh</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <div className="text-[11px] uppercase tracking-wide text-grid-400">{label}</div>
      <div className="figure mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
