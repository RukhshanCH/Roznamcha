/**
 * src/hooks/usePlan.ts
 *
 * Initialises auth state on app startup and exposes the current subscription
 * plan + feature-capability flags to any component that needs them.
 *
 * On mount:
 *  1. Listens to Supabase auth state changes (login / logout / token refresh).
 *  2. When a user session exists, calls GET /api/subscription to get the plan.
 *  3. Writes results into Jotai atoms so the whole tree stays in sync.
 */

import { useEffect } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { supabase } from '@/lib/supabase';
import {
  userAtom,
  planAtom,
  subscriptionAtom,
  authLoadingAtom,
} from '@/store/atoms';
import type { Plan, Subscription } from '@/lib/supabase';

// ── Fetch subscription from our serverless function ───────────────────────
async function fetchSubscription(accessToken: string): Promise<Subscription> {
  try {
    const res = await fetch('/api/subscription', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Subscription;
  } catch (err) {
    console.warn('Could not fetch subscription, defaulting to free:', err);
    return { plan: 'free', billingCycle: null, expiresAt: null, isActive: false };
  }
}

// ── Feature capability map ─────────────────────────────────────────────────
export interface PlanCapabilities {
  plan: Plan;
  canCreateInvoice: boolean;   // Invoice PDF — Pro+
  canCloudBackup: boolean;     // Cloud backup — Pro+
  isLoading: boolean;
}

function getCapabilities(plan: Plan, isLoading: boolean): PlanCapabilities {
  return {
    plan,
    canCreateInvoice: plan !== 'free',
    canCloudBackup: plan !== 'free',
    isLoading,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────
/**
 * Call once at the top of the component tree (in AuthGate) to bootstrap auth.
 * All other components call usePlanCapabilities() to read the plan only.
 */
export function useAuthBootstrap() {
  const setUser = useSetAtom(userAtom);
  const setPlan = useSetAtom(planAtom);
  const setSubscription = useSetAtom(subscriptionAtom);
  const setAuthLoading = useSetAtom(authLoadingAtom);

  useEffect(() => {
    // Get initial session (handles page refresh / magic link callback)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);

      if (session?.access_token) {
        const sub = await fetchSubscription(session.access_token);
        setPlan(sub.plan);
        setSubscription(sub);
      }

      setAuthLoading(false);
    });

    // Subscribe to ongoing auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null);

        if (session?.access_token) {
          const sub = await fetchSubscription(session.access_token);
          setPlan(sub.plan);
          setSubscription(sub);
        } else {
          setPlan('free');
          setSubscription(null);
        }

        setAuthLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [setUser, setPlan, setSubscription, setAuthLoading]);
}

/**
 * Read-only hook — call from any component to get the current plan + flags.
 */
export function usePlan(): PlanCapabilities {
  const [plan] = useAtom(planAtom);
  const [isLoading] = useAtom(authLoadingAtom);
  return getCapabilities(plan, isLoading);
}
