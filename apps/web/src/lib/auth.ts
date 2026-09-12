'use client';

/**
 * Demo sign-in — Diya.
 *
 * There is no password authentication in SunShare and this file does not
 * pretend otherwise. `lib/session.ts` states the position: the demo switches
 * between four seeded accounts, the cookie is signed so a viewer cannot hand
 * themselves the DISCOM role, and no password exists to steal.
 *
 * What this adds is the front door the product was missing — a way to arrive
 * as a chosen identity rather than being dropped straight onto a dashboard —
 * built on that same mechanism. The password field is accepted and discarded,
 * and every screen that offers it says so in plain words. Wiring a real
 * credential store is a backend change and is deliberately out of scope.
 *
 * Two paths, same result, because the app runs both ways:
 *   mocks off  POST /api/session, so the server cookie decides what the
 *              role-gated API routes will return.
 *   mocks on   no database exists, so the client store is the whole truth.
 */
import type { Role, User } from '@sunshare/shared';
import { SESSIONS } from '@/lib/seed';
import { setRole } from '@/lib/store';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

const PROFILE_KEY = 'sunshare-profile';
const SIGNED_IN_KEY = 'sunshare-signed-in';

/** Where each role's story starts. Mirrors nav-config's first item. */
export const LANDING: Record<Role, string> = {
  PROSUMER: '/prosumer',
  CONSUMER: '/consumer',
  DISCOM: '/discom',
  REGULATOR: '/regulator',
};

export const ROLE_EMAIL: Record<Role, string> = {
  PROSUMER: 'anita.patel@sunshare.demo',
  CONSUMER: 'rakesh.trivedi@sunshare.demo',
  DISCOM: 'operations@guvnl.demo',
  REGULATOR: 'oversight@gerc.demo',
};

/** The account an email belongs to, or null if it matches none of them. */
export function roleForEmail(email: string): Role | null {
  const needle = email.trim().toLowerCase();
  const hit = (Object.keys(ROLE_EMAIL) as Role[]).find(
    (r) => ROLE_EMAIL[r].toLowerCase() === needle,
  );
  return hit ?? null;
}

/** Everything the signup flow collects. Local to this browser, never sent. */
export interface EnergyProfile {
  fullName: string;
  email: string;
  phone: string;
  role: Role;
  property: {
    line1: string;
    locality: string;
    city: string;
    state: string;
    postalCode: string;
    propertyType: string;
  };
  electricity: {
    discom: string;
    connectionType: string;
    sanctionedLoadKw: string;
    phase: string;
  };
  solar: { capacityKw: string; inverter: string; battery: string };
  trading: {
    preference: string;
    minPriceRupees: string;
    maxPriceRupees: string;
    autoTrade: boolean;
  };
}

export function saveProfile(profile: EnergyProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Private browsing or storage denied — sign-in still works, the profile
    // simply is not remembered for next time.
  }
}

export function loadProfile(): EnergyProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as EnergyProfile) : null;
  } catch {
    return null;
  }
}

export function isSignedIn(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function signOut(): void {
  try {
    localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    /* nothing to clear */
  }
}

export type SignInResult =
  | { ok: true; user: User; landing: string }
  | { ok: false; code: 'UNKNOWN_ACCOUNT' | 'NETWORK' };

/**
 * Adopt a role. `email` only selects which seeded account; the password is not
 * checked because there is nothing to check it against.
 */
export async function signIn(role: Role): Promise<SignInResult> {
  const user = SESSIONS[role];
  if (!user) return { ok: false, code: 'UNKNOWN_ACCOUNT' };

  if (!USE_MOCKS) {
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      // A 4xx here means the seeded account is missing from the database —
      // worth surfacing rather than silently continuing with a client-only
      // role the API routes will disagree with.
      if (!res.ok) return { ok: false, code: 'UNKNOWN_ACCOUNT' };
    } catch {
      return { ok: false, code: 'NETWORK' };
    }
  }

  setRole(role);
  try {
    localStorage.setItem(SIGNED_IN_KEY, 'true');
  } catch {
    /* remembering the session is optional */
  }

  return { ok: true, user, landing: LANDING[role] };
}
