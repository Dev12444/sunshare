'use client';

/**
 * Create account — Diya.
 *
 * Four steps, because an electricity marketplace account is not a SaaS signup:
 * who you are, what you act as, what your connection and array actually are,
 * and how you want to trade. The energy fields are the point — a marketplace
 * cannot price or route for a premises it knows nothing about.
 *
 * Where this stops being real, it says so. The profile is kept in this browser
 * and the account that gets adopted is the seeded one for the chosen role;
 * there is no user table to write to. Everything collected is shown back on
 * the account screen so nothing typed here silently disappears.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Role } from '@sunshare/shared';
import { ROLE_LABEL, ROLE_SUBTITLE } from '@/lib/seed';
import { saveProfile, signIn, type EnergyProfile } from '@/lib/auth';
import { BrandMark, Wordmark } from '@/components/shell/brand';

const ROLES: Role[] = ['PROSUMER', 'CONSUMER', 'DISCOM', 'REGULATOR'];
const STEPS = ['Identity', 'Role', 'Connection', 'Trading'] as const;

const EMPTY: EnergyProfile = {
  fullName: '',
  email: '',
  phone: '',
  role: 'PROSUMER',
  property: {
    line1: '',
    locality: 'Sector 21',
    city: 'Gandhinagar',
    state: 'Gujarat',
    postalCode: '382021',
    propertyType: 'RESIDENTIAL',
  },
  electricity: {
    discom: 'GUVNL',
    connectionType: 'LT Domestic',
    sanctionedLoadKw: '',
    phase: 'SINGLE',
  },
  solar: { capacityKw: '', inverter: '', battery: 'NONE' },
  trading: { preference: 'SELL', minPriceRupees: '', maxPriceRupees: '', autoTrade: false },
};

/** Only a prosumer has an array to describe. */
const generates = (r: Role) => r === 'PROSUMER';

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<EnergyProfile>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof EnergyProfile>(k: K, v: EnergyProfile[K]) =>
    setP((prev) => ({ ...prev, [k]: v }));

  const identityDone =
    p.fullName.trim().length > 1 && /\S+@\S+\.\S+/.test(p.email) && p.phone.trim().length >= 10;

  const canAdvance = step === 0 ? identityDone : true;

  async function finish() {
    setBusy(true);
    setError(null);
    saveProfile(p);
    const result = await signIn(p.role);
    if (result.ok) {
      router.push(result.landing);
      return;
    }
    setBusy(false);
    setError(
      result.code === 'NETWORK'
        ? 'Could not reach the server. Your details are saved — try again in a moment.'
        : 'That role has no seeded account in the database. Run the seed, or switch to demo mode.',
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-10 sm:px-8">
      <div className="flex items-center gap-2.5">
        <BrandMark size={24} />
        <div>
          <Wordmark className="block text-lg" />
          <p className="font-sans text-[11px] text-ink-3">Local Energy. Shared Prosperity.</p>
        </div>
      </div>

      <h1 className="mt-8 font-sans text-2xl font-semibold tracking-[-0.015em] text-ink">
        Create your account
      </h1>
      <p className="mt-1 max-w-xl font-sans text-sm text-ink-2">
        A marketplace account needs your connection, not just your email — price and routing
        both depend on where on the network you sit.
      </p>

      {/* Step rail. The lifecycle rail's logic, applied to a form. */}
      <ol className="mt-7 flex flex-wrap items-center gap-1.5" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-1.5">
            <span
              aria-current={i === step ? 'step' : undefined}
              className={
                'flex items-center gap-2 rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.09em] ' +
                (i === step
                  ? 'border-solar/50 bg-solar-wash text-solar-deep'
                  : i < step
                    ? 'border-up/35 bg-up-wash text-up'
                    : 'border-rule/20 text-ink-3')
              }
            >
              <span className="font-mono">{String(i + 1).padStart(2, '0')}</span>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-4 bg-rule/25" aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="mt-6 flex-1 border-t border-rule/15 pt-6">
        {step === 0 && (
          <Fields>
            <Field label="Full name" value={p.fullName} onChange={(v) => set('fullName', v)} autoComplete="name" required />
            <Field label="Email address" type="email" value={p.email} onChange={(v) => set('email', v)} autoComplete="email" required />
            <Field label="Phone" type="tel" value={p.phone} onChange={(v) => set('phone', v)} autoComplete="tel" required hint="10 digits" />
            <div className="sm:col-span-2">
              <p className="border-l-2 border-rule/30 py-1 pl-3 font-sans text-xs text-ink-2">
                No password is collected. SunShare has no credential store, so one would be
                security theatre — the demo signs you in as the seeded account for your role.
              </p>
            </div>
          </Fields>
        )}

        {step === 1 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => set('role', r)}
                aria-pressed={p.role === r}
                className={
                  'rounded-sm border px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-solar/35 ' +
                  (p.role === r ? 'border-solar/55 bg-solar-wash/50' : 'border-rule/20 bg-surface hover:border-rule/40')
                }
              >
                <div className="font-sans text-sm font-medium text-ink">{ROLE_LABEL[r]}</div>
                <div className="mt-0.5 font-sans text-xs text-ink-2">{ROLE_SUBTITLE[r]}</div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <Fields>
            <Field label="Address" value={p.property.line1} onChange={(v) => set('property', { ...p.property, line1: v })} autoComplete="street-address" hint="Your own — nothing is pre-filled" />
            <Field label="Locality" value={p.property.locality} onChange={(v) => set('property', { ...p.property, locality: v })} />
            <Field label="City" value={p.property.city} onChange={(v) => set('property', { ...p.property, city: v })} />
            <Field label="Postal code" value={p.property.postalCode} onChange={(v) => set('property', { ...p.property, postalCode: v })} inputMode="numeric" />
            <Select label="Property type" value={p.property.propertyType} onChange={(v) => set('property', { ...p.property, propertyType: v })} options={[['RESIDENTIAL','Residential'],['SHOP','Shop / business'],['SCHOOL','School'],['COMMUNITY','Community building']]} />
            <Select label="Distribution utility" value={p.electricity.discom} onChange={(v) => set('electricity', { ...p.electricity, discom: v })} options={[['GUVNL','GUVNL'],['UGVCL','UGVCL'],['MGVCL','MGVCL'],['OTHER','Other']]} />
            <Select label="Connection type" value={p.electricity.connectionType} onChange={(v) => set('electricity', { ...p.electricity, connectionType: v })} options={[['LT Domestic','LT Domestic'],['LT Commercial','LT Commercial'],['HT','HT']]} />
            <Field label="Sanctioned load" value={p.electricity.sanctionedLoadKw} onChange={(v) => set('electricity', { ...p.electricity, sanctionedLoadKw: v })} inputMode="decimal" suffix="kW" />
            <Select label="Phase" value={p.electricity.phase} onChange={(v) => set('electricity', { ...p.electricity, phase: v })} options={[['SINGLE','Single phase'],['THREE','Three phase']]} />

            {generates(p.role) && (
              <>
                <Field label="Solar capacity" value={p.solar.capacityKw} onChange={(v) => set('solar', { ...p.solar, capacityKw: v })} inputMode="decimal" suffix="kW" hint="Panel rating, not inverter" />
                <Field label="Inverter" value={p.solar.inverter} onChange={(v) => set('solar', { ...p.solar, inverter: v })} />
                <Select label="Battery" value={p.solar.battery} onChange={(v) => set('solar', { ...p.solar, battery: v })} options={[['NONE','None'],['LEAD','Lead acid'],['LI','Lithium-ion']]} />
              </>
            )}
          </Fields>
        )}

        {step === 3 && (
          <Fields>
            <Select label="I mainly want to" value={p.trading.preference} onChange={(v) => set('trading', { ...p.trading, preference: v })} options={[['SELL','Sell surplus'],['BUY','Buy local energy'],['BOTH','Both']]} />
            <Field label="Minimum acceptable price" value={p.trading.minPriceRupees} onChange={(v) => set('trading', { ...p.trading, minPriceRupees: v })} inputMode="decimal" prefix="₹" suffix="/kWh" hint="Floor is ₹2.15" />
            <Field label="Maximum acceptable price" value={p.trading.maxPriceRupees} onChange={(v) => set('trading', { ...p.trading, maxPriceRupees: v })} inputMode="decimal" prefix="₹" suffix="/kWh" hint="Ceiling is ₹6.50" />
            <div className="sm:col-span-2">
              <label className="flex items-start gap-2.5 rounded-sm border border-rule/20 bg-surface px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={p.trading.autoTrade}
                  onChange={(e) => set('trading', { ...p.trading, autoTrade: e.target.checked })}
                  className="mt-0.5 h-3.5 w-3.5 accent-[rgb(var(--solar))]"
                />
                <span>
                  <span className="block font-sans text-sm text-ink">Let the broker act for me</span>
                  <span className="mt-0.5 block font-sans text-xs text-ink-2">
                    The broker only sets a constrained policy. Deterministic code reads that policy
                    and places orders — no model ever touches money or settlement.
                  </span>
                </span>
              </label>
            </div>
          </Fields>
        )}

        {error && (
          <p role="alert" className="mt-5 border-l-2 border-down bg-down-wash/60 px-3 py-2 font-sans text-xs text-ink">
            {error}
          </p>
        )}
      </div>

      <div className="mt-7 flex items-center justify-between gap-3 border-t border-rule/15 pt-5">
        <div className="font-sans text-xs text-ink-2">
          {step === 0 ? (
            <>Already have an account? <Link href="/login" className="font-medium text-ink underline decoration-solar underline-offset-2">Sign in</Link></>
          ) : (
            <button type="button" onClick={() => setStep((s) => s - 1)} className="font-medium text-ink underline decoration-rule/40 underline-offset-2">
              Back
            </button>
          )}
        </div>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!canAdvance}
            onClick={() => setStep((s) => s + 1)}
            className="rounded-sm bg-[rgb(var(--ink))] px-5 py-2.5 font-sans text-sm font-medium
                       text-[rgb(var(--paper))] hover:opacity-90 disabled:opacity-45
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-solar/50"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void finish()}
            className="rounded-sm bg-[rgb(var(--ink))] px-5 py-2.5 font-sans text-sm font-medium
                       text-[rgb(var(--paper))] hover:opacity-90 disabled:opacity-55
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-solar/50"
          >
            {busy ? 'Opening your dashboard…' : 'Finish and enter'}
          </button>
        )}
      </div>
    </div>
  );
}

function Fields({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">{children}</div>;
}

function Field({
  label, value, onChange, type = 'text', hint, suffix, prefix, required, autoComplete, inputMode,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; hint?: string;
  suffix?: string; prefix?: string; required?: boolean; autoComplete?: string;
  inputMode?: 'numeric' | 'decimal' | 'tel';
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, '-');
  return (
    <div>
      <label htmlFor={id} className="block font-sans text-xs font-medium text-ink-2">
        {label}{required && <span className="text-solar-deep"> *</span>}
      </label>
      <div className="mt-1.5 flex items-center rounded-sm border border-rule/30 bg-surface
                      focus-within:border-solar focus-within:ring-2 focus-within:ring-solar/35">
        {prefix && <span className="pl-3 font-mono text-sm text-ink-3">{prefix}</span>}
        <input
          id={id} type={type} value={value} required={required}
          autoComplete={autoComplete} inputMode={inputMode}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent px-3 py-2.5 font-sans text-sm text-ink outline-none"
        />
        {suffix && <span className="pr-3 font-mono text-xs text-ink-3">{suffix}</span>}
      </div>
      {hint && <p className="mt-1 font-sans text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, '-');
  return (
    <div>
      <label htmlFor={id} className="block font-sans text-xs font-medium text-ink-2">{label}</label>
      <select
        id={id} value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-sm border border-rule/30 bg-surface px-3 py-2.5
                   font-sans text-sm text-ink outline-none
                   focus-visible:border-solar focus-visible:ring-2 focus-visible:ring-solar/35"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
