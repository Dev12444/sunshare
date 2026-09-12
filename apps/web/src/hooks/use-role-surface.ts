'use client';

import { useEffect } from 'react';
import type { Role } from '@sunshare/shared';
import { getState, setRole } from '@/lib/store';

/**
 * Keep the active role and the role-specific surface in agreement.
 *
 * /consumer is the consumer's dashboard, not "the consumer dashboard rendered
 * for whoever happens to be signed in" — without this, opening it while acting
 * as the prosumer showed a household with a 7.5 kW rooftop under the heading
 * "No rooftop". Navigating to a role surface is itself a role switch, which is
 * also how the DISCOM's cross-role links are meant to behave.
 */
export function useRoleSurface(role: Role) {
  useEffect(() => {
    if (getState().role !== role) setRole(role);
  }, [role]);
}
