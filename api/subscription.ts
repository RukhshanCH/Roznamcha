/**
 * api/subscription.ts
 * Vercel Serverless Function — returns the current subscription for the
 * authenticated Supabase user.
 *
 * GET /api/subscription
 * Headers: Authorization: Bearer <supabase-access-token>
 *
 * Returns: { plan: 'free' | 'pro' | 'business', expiresAt: string | null, isActive: boolean }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Extract the user's JWT from the Authorization header ──────────
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  // ── 2. Verify the token with Supabase and get the user ───────────────
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!,
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // ── 3. Fetch subscription row ─────────────────────────────────────────
  const { data: sub, error: dbError } = await supabase
    .from('subscriptions')
    .select('plan, billing_cycle, expires_at, safepay_tracker, updated_at')
    .eq('user_id', user.id)
    .single();

  if (dbError && dbError.code !== 'PGRST116') {
    // PGRST116 = no rows found (first-time user, defaults to free)
    console.error('subscription fetch error:', dbError);
    return res.status(500).json({ error: 'Database error' });
  }

  // ── 4. Determine if subscription is currently active ──────────────────
  const now = new Date();
  const expiresAt = sub?.expires_at ? new Date(sub.expires_at) : null;
  const isActive = expiresAt ? expiresAt > now : false;

  const plan = isActive ? (sub?.plan ?? 'free') : 'free';

  return res.status(200).json({
    plan,
    billingCycle: sub?.billing_cycle ?? null,
    expiresAt: sub?.expires_at ?? null,
    isActive,
    payment: sub
      ? {
          tracker: sub.safepay_tracker ?? null,
          paidAt: sub.updated_at ?? null,
        plan: sub.plan ?? 'free',
        billingCycle: sub.billing_cycle ?? null,
      }
      : undefined,
  });
}
