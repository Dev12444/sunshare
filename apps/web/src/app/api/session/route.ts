/**
 * GET/POST /api/session — role switcher over four seeded accounts — Rahi, H4–H5.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  // TODO(Rahi): read signed cookie -> User
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}

export async function POST(req: Request) {
  // TODO(Rahi): set signed cookie for the chosen seeded account. No real auth
  // by design — see docs/PRD.md §2 non-goals.
  void req;
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}
