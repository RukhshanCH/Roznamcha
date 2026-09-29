/**
 * api/webhook.ts
 * Vercel Serverless Function — receives Safepay payment confirmation webhooks.
 *
 * Safepay calls this endpoint (server-to-server) after a payment succeeds.
 * We verify the HMAC signature, then update the subscription in Supabase.
 *
 * POST /api/webhook
 * Headers: x-sfpy-signature (HMAC-SHA256 of the raw body)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

// ── How long each plan lasts ──────────────────────────────────────────────
function getExpiresAt(cycle: 'monthly' | 'yearly'): string {
  const d = new Date();
  if (cycle === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString();
}

// ── Handler ───────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SAFEPAY_SECRET = process.env.SAFEPAY_SECRET_KEY!;
  const signature = req.headers['x-sfpy-signature'] as string;

  // ── 1. Verify HMAC signature ─────────────────────────────────────────
  const rawBody = JSON.stringify(req.body);
  const expectedSig = createHmac('sha256', SAFEPAY_SECRET)
    .update(rawBody)
    .digest('hex');

  if (
    !signature ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
  ) {
    console.warn('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // ── 2. Parse payload ─────────────────────────────────────────────────
  const event = req.body as {
    event: string;
    data: {
      tracker: string;
      user_data?: {
        user_id?: string;
        plan_id?: string;
        billing_cycle?: 'monthly' | 'yearly';
      };
    };
  };

  // Only handle successful payment events
  if (event.event !== 'payment:succeeded') {
    return res.status(200).json({ received: true });
  }

  const { user_id, plan_id, billing_cycle } = event.data.user_data ?? {};
  if (!user_id || !plan_id || !billing_cycle) {
    console.error('Webhook missing user_data fields', event.data);
    return res.status(400).json({ error: 'Missing user_data fields' });
  }

  // ── 3. Update subscription in Supabase ───────────────────────────────
  // Use the service key (bypasses Row Level Security) — only safe server-side
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!,
  );

  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id,
      plan: plan_id,
      billing_cycle,
      expires_at: getExpiresAt(billing_cycle),
      safepay_tracker: event.data.tracker,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('Supabase upsert error:', error);
    return res.status(500).json({ error: 'Database update failed' });
  }

  console.log(`✅ Plan activated: user=${user_id} plan=${plan_id} cycle=${billing_cycle}`);
  return res.status(200).json({ received: true });
}
