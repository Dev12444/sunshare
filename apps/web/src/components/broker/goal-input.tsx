'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/controls';
import { GOAL_EXAMPLES, parseGoal } from '@/lib/mock/broker';
import { getState, logActivity, pushNotice, setState, useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

/**
 * Goal input.
 *
 * A single field with worked examples underneath — not a chat transcript. You
 * are not having a conversation with this thing; you are writing a standing
 * instruction that will be compiled into constraints and then executed without
 * you. The examples are there because the useful thing to learn is what kind
 * of constraint the parser can actually hold.
 */
export function GoalInput({ onCreated }: { onCreated?: () => void }) {
  const user = useStore((s) => s.user);
  const simMinutes = useStore((s) => s.simMinutes);
  const mocked = useStore((s) => s.mocked);
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const text = goal.trim();
    if (text.length < 8) {
      setError(
        'Describe what you want in a sentence — the parser needs an objective and ideally a price.',
      );
      return;
    }
    setBusy(true);
    setError(null);

    try {
      let policy = parseGoal(user.id, text, simMinutes);

      if (!mocked) {
        // The engine's LLM path. On failure we keep the rule-based policy and
        // say so rather than blocking the user behind a model outage.
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8000'}/broker/policy`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ userId: user.id, goal: text }),
            },
          );
          if (res.ok) policy = await res.json();
          else
            setError('Policy service unavailable — interpreted with the rule-based parser instead.');
        } catch {
          setError('Policy service unreachable — interpreted with the rule-based parser instead.');
        }
      }

      setState({ policy, brokerPaused: false, decisions: [] });
      logActivity({
        tsSim: getState().tick?.tsSim ?? policy.createdAt,
        channel: 'policy',
        text: `Policy created — floor ₹${(policy.minPricePaise / 100).toFixed(2)}, valid to ${policy.validUntilSim.slice(11, 16)}.`,
      });
      pushNotice({
        tsSim: policy.createdAt,
        title: 'Broker policy active',
        body: `Minimum ₹${(policy.minPricePaise / 100).toFixed(2)}/kWh until ${policy.validUntilSim.slice(11, 16)}. The broker will not trade outside these bounds.`,
        href: '/broker',
        tone: 'solar',
      });
      setGoal('');
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label htmlFor="broker-goal" className="block text-label font-semibold uppercase text-ink-3">
        What should the broker do with your surplus?
      </label>
      <textarea
        id="broker-goal"
        rows={2}
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
        }}
        placeholder="Sell fast before sunset, but never below ₹4.50."
        className={cn(
          'w-full resize-y rounded-sm border border-rule/25 bg-surface px-3 py-2.5 text-base text-ink',
          'outline-none placeholder:text-ink-3 focus:border-solar focus:ring-1 focus:ring-solar/40',
        )}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={submit} disabled={busy}>
          {busy ? 'Interpreting…' : 'Create policy'}
        </Button>
        <span className="text-xs text-ink-3">⌘↵ to submit</span>
      </div>

      {error ? <p className="text-xs text-warn">{error}</p> : null}

      <div>
        <p className="text-label font-semibold uppercase text-ink-3">Examples</p>
        <ul className="mt-1.5 space-y-1">
          {GOAL_EXAMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                onClick={() => setGoal(ex)}
                className="w-full border-l-2 border-rule/20 px-2.5 py-1 text-left text-sm text-ink-2 hover:border-solar hover:bg-sunken hover:text-ink"
              >
                {ex}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
