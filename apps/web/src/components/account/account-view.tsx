'use client';

/**
 * Account and energy profile — Diya.
 *
 * The signup flow collects fifteen fields about a premises and, until this
 * screen existed, wrote them to localStorage and never showed them again:
 * loadProfile() had no caller. Filling in a sanctioned load and never seeing
 * it back is a dead end, so this is the other half of that flow.
 *
 * Two sources, deliberately kept apart on screen:
 *
 *   From the network — meter, feeder, substation, panel rating, archetype.
 *     Facts about the connection rather than preferences, so they are
 *     read-only; editing "which feeder am I on" in a form would be fiction.
 *   Declared — everything the household actually chooses: address, utility,
 *     connection details, price floor and ceiling. Editable, saved locally,
 *     and left blank until someone fills them in rather than pre-populated
 *     with a street address nobody gave us.
 */
import { useEffect, useState } from 'react';
import { DataRow } from '@/components/ui/metric';
import { Panel, PanelBody, PanelHead, PageHead } from '@/components/ui/panel';
import { Button } from '@/components/ui/controls';
import { Tag } from '@/components/ui/tag';
import { loadProfile, saveProfile, type EnergyProfile } from '@/lib/auth';
import { HOUSEHOLDS, ROLE_LABEL, feederOf, substationOf } from '@/lib/seed';
import { useStore } from '@/lib/store';
import { useMyReading } from '@/hooks/use-derived';
import { kw } from '@/lib/format';

const BLANK = '—';

/** FAMILY_4 -> "Family of 4"; SHOP -> "Shop". Beats shouting the enum. */
function archetypeLabel(a: string): string {
  const m = a.match(/^FAMILY_(\d)$/);
  if (m) return `Family of ${m[1]}`;
  return a.charAt(0) + a.slice(1).toLowerCase();
}

export function AccountView() {
  const user = useStore((s) => s.user);
  const role = useStore((s) => s.role);
  const reading = useMyReading();

  const household = HOUSEHOLDS.find((h) => h.userId === user.id) ?? null;

  const [profile, setProfile] = useState<EnergyProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EnergyProfile | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  function startEdit() {
    setDraft(
      profile ?? {
        fullName: user.name,
        email: '',
        phone: '',
        role,
        property: {
          line1: '',
          locality: 'Sector 21',
          city: 'Gandhinagar',
          state: 'Gujarat',
          postalCode: '382021',
          propertyType: household?.kind ?? 'RESIDENTIAL',
        },
        electricity: {
          discom: 'GUVNL',
          connectionType: 'LT Domestic',
          sanctionedLoadKw: '',
          phase: 'SINGLE',
        },
        solar: {
          capacityKw: household ? String(household.panelKw) : '',
          inverter: '',
          battery: 'NONE',
        },
        trading: { preference: 'SELL', minPriceRupees: '', maxPriceRupees: '', autoTrade: false },
      },
    );
    setEditing(true);
    setSaved(false);
  }

  function commit() {
    if (!draft) return;
    saveProfile(draft);
    setProfile(draft);
    setEditing(false);
    setSaved(true);
  }

  const p = editing ? draft : profile;
  const show = (v?: string) => (v && v.trim() ? v : BLANK);

  return (
    <div className="space-y-4">
      <PageHead
        title="Account"
        subtitle={`${ROLE_LABEL[role]} · ${user.id}${household ? ` · ${household.name}` : ''}`}
        aside={
          editing ? (
            <div className="flex gap-2">
              <Button onClick={() => setEditing(false)}>Cancel</Button>
              <Button variant="primary" onClick={commit}>Save</Button>
            </div>
          ) : (
            <Button onClick={startEdit}>{profile ? 'Edit profile' : 'Complete profile'}</Button>
          )
        }
      />

      {saved ? (
        <p className="border-l-2 border-up bg-up-wash/50 px-3 py-2 text-xs text-ink">
          Saved to this device. SunShare has no account store, so these details stay in this
          browser rather than syncing to a server.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHead title="Connection" meta="From the network" />
          <PanelBody className="space-y-0">
            <DataRow label="Account">{user.id}</DataRow>
            <DataRow label="Role">{ROLE_LABEL[role]}</DataRow>
            <DataRow label="Meter">{household?.meterId ?? BLANK}</DataRow>
            <DataRow label="Premises node">{household?.nodeId ?? BLANK}</DataRow>
            <DataRow label="Feeder">{household ? feederOf(household.nodeId) : BLANK}</DataRow>
            <DataRow label="Substation">
              {household ? substationOf(household.nodeId) : BLANK}
            </DataRow>
            <DataRow label="Meter state" tone={reading ? 'up' : 'neutral'}>
              {reading ? 'Reading' : 'No readings'}
            </DataRow>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHead title="Solar" meta="From the network" />
          <PanelBody className="space-y-0">
            <DataRow label="Panel rating">
              {household ? `${household.panelKw} kW` : BLANK}
            </DataRow>
            <DataRow label="Consumption profile">
              {household ? archetypeLabel(household.archetype) : BLANK}
            </DataRow>
            <DataRow label="Generating now" tone="solar">
              {reading ? `${kw(reading.generationKw)} kW` : BLANK}
            </DataRow>
            <DataRow label="Surplus now" tone={(reading?.surplusKw ?? 0) > 0 ? 'up' : 'neutral'}>
              {reading ? `${kw(reading.surplusKw)} kW` : BLANK}
            </DataRow>
            <DataRow label="Wallet">
              {user.walletAddress
                ? `${user.walletAddress.slice(0, 10)}…${user.walletAddress.slice(-6)}`
                : BLANK}
            </DataRow>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHead title="Property" meta={profile ? 'Declared' : 'Not provided yet'} />
          <PanelBody className="space-y-0">
            {editing && draft ? (
              <>
                <Edit label="Address" value={draft.property.line1} onChange={(v) => setDraft({ ...draft, property: { ...draft.property, line1: v } })} />
                <Edit label="Locality" value={draft.property.locality} onChange={(v) => setDraft({ ...draft, property: { ...draft.property, locality: v } })} />
                <Edit label="City" value={draft.property.city} onChange={(v) => setDraft({ ...draft, property: { ...draft.property, city: v } })} />
                <Edit label="Postal code" value={draft.property.postalCode} onChange={(v) => setDraft({ ...draft, property: { ...draft.property, postalCode: v } })} />
              </>
            ) : (
              <>
                <DataRow label="Address">{show(p?.property.line1)}</DataRow>
                <DataRow label="Locality">{show(p?.property.locality)}</DataRow>
                <DataRow label="City">{show(p?.property.city)}</DataRow>
                <DataRow label="Postal code">{show(p?.property.postalCode)}</DataRow>
                <DataRow label="Property type">{show(p?.property.propertyType)}</DataRow>
              </>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHead title="Supply and trading" meta={profile ? 'Declared' : 'Not provided yet'} />
          <PanelBody className="space-y-0">
            {editing && draft ? (
              <>
                <Edit label="Distribution utility" value={draft.electricity.discom} onChange={(v) => setDraft({ ...draft, electricity: { ...draft.electricity, discom: v } })} />
                <Edit label="Connection type" value={draft.electricity.connectionType} onChange={(v) => setDraft({ ...draft, electricity: { ...draft.electricity, connectionType: v } })} />
                <Edit label="Sanctioned load (kW)" value={draft.electricity.sanctionedLoadKw} onChange={(v) => setDraft({ ...draft, electricity: { ...draft.electricity, sanctionedLoadKw: v } })} />
                <Edit label="Minimum price (Rs/kWh)" value={draft.trading.minPriceRupees} onChange={(v) => setDraft({ ...draft, trading: { ...draft.trading, minPriceRupees: v } })} />
                <Edit label="Maximum price (Rs/kWh)" value={draft.trading.maxPriceRupees} onChange={(v) => setDraft({ ...draft, trading: { ...draft.trading, maxPriceRupees: v } })} />
              </>
            ) : (
              <>
                <DataRow label="Distribution utility">{show(p?.electricity.discom)}</DataRow>
                <DataRow label="Connection type">{show(p?.electricity.connectionType)}</DataRow>
                <DataRow label="Sanctioned load">
                  {p?.electricity.sanctionedLoadKw ? `${p.electricity.sanctionedLoadKw} kW` : BLANK}
                </DataRow>
                <DataRow label="Phase">{show(p?.electricity.phase)}</DataRow>
                <DataRow label="Preference">{show(p?.trading.preference)}</DataRow>
                <DataRow label="Price floor">
                  {p?.trading.minPriceRupees ? `₹${p.trading.minPriceRupees}/kWh` : BLANK}
                </DataRow>
                <DataRow label="Price ceiling">
                  {p?.trading.maxPriceRupees ? `₹${p.trading.maxPriceRupees}/kWh` : BLANK}
                </DataRow>
                <DataRow label="Broker may act">
                  <Tag tone={p?.trading.autoTrade ? 'up' : 'neutral'}>
                    {p?.trading.autoTrade ? 'Yes' : 'No'}
                  </Tag>
                </DataRow>
              </>
            )}
          </PanelBody>
        </Panel>
      </div>

      {!profile && !editing ? (
        <p className="text-xs text-ink-2">
          Nothing declared yet. The connection and solar panels above come from the network and
          are always accurate; the rest is filled in at signup, or here.
        </p>
      ) : null}
    </div>
  );
}

function Edit({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, '-');
  return (
    <div className="data-row">
      <label htmlFor={id} className="text-sm text-ink-2">{label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-44 rounded-sm border border-rule/30 bg-surface px-2 py-1 text-right font-mono
                   text-sm text-ink outline-none focus-visible:border-solar
                   focus-visible:ring-2 focus-visible:ring-solar/35"
      />
    </div>
  );
}
