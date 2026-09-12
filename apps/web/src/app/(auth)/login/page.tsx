'use client';

/**
 * Sign in — Diya.
 *
 * Follows the brand reference's split: imagery left, a single focused panel
 * right. No GitHub, no social providers — there is no OAuth behind this
 * product and an inert button that implies otherwise is worse than none.
 *
 * The demo notice is not decoration. Passwords are not checked (see lib/auth),
 * so the screen says that where the person can read it before typing one.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Role } from '@sunshare/shared';
import { ROLE_LABEL } from '@/lib/seed';
import { ROLE_EMAIL, roleForEmail, signIn } from '@/lib/auth';
import { BrandMark, Wordmark } from '@/components/shell/brand';
import { BrandPanel } from '../brand-panel';

const ROLES: Role[] = ['PROSUMER', 'CONSUMER', 'DISCOM', 'REGULATOR'];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(ROLE_EMAIL.PROSUMER);
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState<'idle' | 'working'>('idle');
  const [error, setError] = useState<string | null>(null);

  const busy = status === 'working';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const role = roleForEmail(email);
    if (!role) {
      setError('No account matches that email. Use one of the demo accounts below.');
      return;
    }

    setStatus('working');
    const result = await signIn(role);
    if (result.ok) {
      router.push(result.landing);
      return;
    }

    setStatus('idle');
    setError(
      result.code === 'NETWORK'
        ? 'Could not reach the server. Check that the platform is running and try again.'
        : 'That account is not in the database. Run the seed, or switch to demo mode.',
    );
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />

      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[26rem]">
          <div className="flex items-center gap-2.5">
            <BrandMark size={26} />
            <div>
              <Wordmark className="block text-xl" />
              <p className="font-sans text-[11px] tracking-[0.02em] text-ink-3">
                Local Energy. Shared Prosperity.
              </p>
            </div>
          </div>

          <h1 className="mt-9 font-sans text-2xl font-semibold tracking-[-0.015em] text-ink">
            Welcome back
          </h1>
          <p className="mt-1 font-sans text-sm text-ink-2">
            Sign in to continue to your energy marketplace.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block font-sans text-xs font-medium text-ink-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'signin-error' : undefined}
                className="mt-1.5 w-full rounded-sm border border-rule/30 bg-surface px-3 py-2.5
                           font-sans text-sm text-ink outline-none
                           focus-visible:border-solar focus-visible:ring-2 focus-visible:ring-solar/35"
              />
            </div>

            <div>
              <label htmlFor="password" className="block font-sans text-xs font-medium text-ink-2">
                Password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  type={reveal ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-sm border border-rule/30 bg-surface px-3 py-2.5 pr-11
                             font-sans text-sm text-ink outline-none
                             focus-visible:border-solar focus-visible:ring-2 focus-visible:ring-solar/35"
                />
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  aria-pressed={reveal}
                  aria-label={reveal ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 px-3 font-sans text-[11px] font-medium
                             text-ink-3 hover:text-ink focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-solar/35"
                >
                  {reveal ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 font-sans text-xs text-ink-2">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[rgb(var(--solar))]"
                />
                Remember me
              </label>
              <Link
                href="/login/recover"
                className="font-sans text-xs text-ink-2 underline decoration-rule/40 underline-offset-2 hover:text-ink"
              >
                Forgot password?
              </Link>
            </div>

            {error && (
              <p
                id="signin-error"
                role="alert"
                className="border-l-2 border-down bg-down-wash/60 px-3 py-2 font-sans text-xs text-ink"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-sm bg-[rgb(var(--ink))] px-4 py-2.5 font-sans text-sm
                         font-medium text-[rgb(var(--paper))] transition-opacity
                         hover:opacity-90 disabled:opacity-55
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-solar/50"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 font-sans text-xs text-ink-2">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-medium text-ink underline decoration-solar underline-offset-2">
              Create one
            </Link>
          </p>

          <div className="mt-8 border-t border-rule/15 pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.11em] text-ink-3">
                Demo accounts
              </span>
              <span className="font-sans text-[11px] text-ink-3">Password not checked</span>
            </div>
            <p className="mt-2 font-sans text-xs leading-relaxed text-ink-2">
              SunShare has no credential store. These four seeded accounts are the whole
              identity model — picking one sets the signed role cookie.
            </p>
            <div className="mt-3 grid gap-1.5">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setEmail(ROLE_EMAIL[r])}
                  className="flex items-center justify-between gap-3 rounded-sm border border-rule/20
                             bg-surface px-3 py-2 text-left hover:border-solar/45
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-solar/35"
                >
                  <span className="font-sans text-xs font-medium text-ink">{ROLE_LABEL[r]}</span>
                  <span className="truncate font-mono text-[10.5px] text-ink-3">{ROLE_EMAIL[r]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
