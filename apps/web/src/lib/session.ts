/**
 * Role-switcher session — Rahi, H4–H5.
 *
 * Deliberately not real auth: the demo switches between seeded accounts and no
 * password exists to steal. See docs/PRD.md §2 non-goals. The cookie is still
 * signed so a viewer cannot hand themselves the DISCOM role by editing it,
 * which is what keeps the regulator-only screens honest during the demo.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from './prisma';

export const SESSION_COOKIE = 'sunshare_session';

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET is not set');
  return value;
}

function sign(userId: string): string {
  return createHmac('sha256', secret()).update(userId).digest('base64url');
}

export function serialiseSession(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

/** Returns the user id only if the signature still matches. */
export function parseSession(raw: string | undefined): string | null {
  if (!raw) return null;

  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return null;

  const userId = raw.slice(0, separator);
  const provided = Buffer.from(raw.slice(separator + 1));
  const expected = Buffer.from(sign(userId));

  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? userId : null;
}

/** The signed-in seeded account, or null when the cookie is absent or forged. */
export async function getSessionUser() {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = parseSession(raw);
  if (!userId) return null;

  return prisma.user.findUnique({ where: { id: userId } });
}
