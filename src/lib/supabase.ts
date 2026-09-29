/**
 * src/lib/supabase.ts
 * Supabase browser client — safe to use in the frontend (anon key only).
 * The anon key is public by design; Supabase's Row Level Security policies
 * on the `subscriptions` table ensure users can only read their own row.
 *
 * Environment variables must be set in a `.env.local` file:
 *   VITE_SUPABASE_URL=https://your-project.supabase.co
 *   VITE_SUPABASE_ANON_KEY=your-anon-key
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Roznamcha] Supabase env vars not set. Auth and subscriptions will not work.\n' +
    'Create a .env.local file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(
  supabaseUrl ?? '',
  supabaseAnonKey ?? '',
  {
    auth: {
      // Persist session in localStorage so users stay logged in across page reloads
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export type Plan = 'free' | 'pro' | 'business';

export interface Subscription {
  plan: Plan;
  billingCycle: 'monthly' | 'yearly' | null;
  expiresAt: string | null;
  isActive: boolean;
  payment?: {
    tracker: string | null;
    paidAt: string | null;
    plan: Plan;
    billingCycle: 'monthly' | 'yearly' | null;
  };
}
