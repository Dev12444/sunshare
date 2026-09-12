/**
 * GET/POST /api/broker — AI broker policies and the Agent Activity feed — Rahi.
 */
import { NextResponse } from 'next/server';
import { brokerFeed, createPolicy } from '@/lib/broker';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requested = new URL(req.url).searchParams.get('userId');
  const userId = requested ?? (await getSessionUser())?.id;

  if (!userId) {
    return NextResponse.json({ error: 'no active session' }, { status: 401 });
  }

  return NextResponse.json({ policies: await brokerFeed(userId) });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'no active session' }, { status: 401 });
  }

  let goal: unknown;
  try {
    ({ goal } = await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (typeof goal !== 'string' || goal.trim().length === 0) {
    return NextResponse.json({ error: 'goal is required' }, { status: 400 });
  }

  try {
    return NextResponse.json({ policy: await createPolicy(user.id, goal) }, { status: 201 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'broker unavailable', detail }, { status: 502 });
  }
}
