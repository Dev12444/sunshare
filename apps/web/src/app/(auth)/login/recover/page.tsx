/**
 * Password recovery — Diya.
 *
 * There is nothing to recover: SunShare stores no passwords. Rather than a
 * dead link or a form that pretends to send an email nobody will receive,
 * this says what is actually true and routes the person back to the way in.
 */
import Link from 'next/link';
import { BrandMark, Wordmark } from '@/components/shell/brand';

export default function RecoverPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="flex items-center gap-2.5">
        <BrandMark size={24} />
        <Wordmark className="text-lg" />
      </div>

      <h1 className="mt-7 font-sans text-xl font-semibold tracking-[-0.015em] text-ink">
        There is no password to reset
      </h1>
      <p className="mt-2 font-sans text-sm leading-relaxed text-ink-2">
        SunShare does not store credentials. The prototype signs you in as one of four seeded
        accounts and records the choice in a signed cookie, so there is nothing to recover and
        nothing that could be stolen.
      </p>
      <p className="mt-3 font-sans text-sm leading-relaxed text-ink-2">
        Pick the account you need on the sign-in screen. A real credential store is a backend
        change, and this screen will become a real recovery flow when that lands.
      </p>

      <Link
        href="/login"
        className="mt-7 inline-flex w-fit rounded-sm bg-[rgb(var(--ink))] px-4 py-2.5 font-sans
                   text-sm font-medium text-[rgb(var(--paper))] hover:opacity-90
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-solar/50"
      >
        Back to sign in
      </Link>
    </div>
  );
}
