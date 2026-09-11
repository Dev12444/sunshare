/**
 * GET/POST /api/session — role switcher over four seeded accounts — Rahi, H4–H5.
 */
import { NextResponse } from 'next/server';
import type { User } from '@sunshare/shared';
import { prisma } from '@/lib/prisma';
import { SESSION_COOKIE, getSessionUser, serialiseSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** The switcher lists every seeded account, so it doubles as the account picker. */
export async function GET() {
  const [current, accounts] = await Promise.all([
    getSessionUser(),
    prisma.user.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] }),
  ]);

  const toUser = (u: (typeof accounts)[number]): User => ({
    id: u.id,
    name: u.name,
    role: u.role,
    nodeId: u.nodeId,
    walletAddress: u.walletAddress,
  });

  return NextResponse.json({
    user: current ? toUser(current) : null,
    accounts: accounts.map(toUser),
  });
}

export async function POST(req: Request) {
  let userId: unknown;
  try {
    ({ userId } = await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (typeof userId !== 'string' || userId.length === 0) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  // Only seeded accounts are switchable — no real auth by design, but also no
  // inventing users by POSTing an arbitrary id.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: 'unknown account' }, { status: 404 });
  }

  const res = NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      nodeId: user.nodeId,
      walletAddress: user.walletAddress,
    } satisfies User,
  });

  res.cookies.set(SESSION_COOKIE, serialiseSession(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  });

  return res;
}
