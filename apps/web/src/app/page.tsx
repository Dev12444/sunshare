'use client';

/**
 * Entry point — Diya.
 *
 * The product used to drop straight onto /prosumer, which skipped the question
 * of who you are. Now the front door decides: a returning session goes to its
 * own role's landing surface, a new visitor goes to sign in.
 *
 * Client-side because the marker lives in this browser, not in the signed
 * cookie — the cookie says which seeded account is active, not whether this
 * person has been through the door yet.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LANDING, isSignedIn } from '@/lib/auth';
import { useStore } from '@/lib/store';

export default function Home() {
  const router = useRouter();
  const role = useStore((s) => s.role);

  useEffect(() => {
    router.replace(isSignedIn() ? LANDING[role] : '/login');
  }, [router, role]);

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="font-sans text-sm text-ink-3">Opening SunShare…</p>
    </main>
  );
}
