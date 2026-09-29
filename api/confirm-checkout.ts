/**
 * Confirms a completed Safepay tracker after the hosted checkout redirects
 * back to the billing page, then activates the authenticated user's plan.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const PLAN_PRICES: Record<string, Record<string, number>> = {
  pro: { monthly: 999, yearly: 9588 },
  business: { monthly: 2499, yearly: 23988 },
};

function getExpiresAt(cycle: 'monthly' | 'yearly'): string {
  const date = new Date();
  if (cycle === 'yearly') date.setFullYear(date.getFullYear() + 1);
  else date.setMonth(date.getMonth() + 1);
  return date.toISOString();
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization ?? '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const { tracker, beacon, planId, cycle } = req.body as {
    tracker?: string;
    beacon?: string;
    planId?: string;
    cycle?: 'monthly' | 'yearly';
  };
  const checkoutTracker = tracker ?? beacon;

  if (!accessToken || !checkoutTracker || !planId || !cycle || !PLAN_PRICES[planId]?.[cycle]) {
    const missingFields = [
      !accessToken && 'authorization',
      !checkoutTracker && 'tracker',
      !planId && 'plan',
      !cycle && 'cycle',
      planId && cycle && !PLAN_PRICES[planId]?.[cycle] && 'plan/cycle combination',
    ].filter(Boolean);
    return res.status(400).json({
      error: 'Missing or invalid checkout confirmation data',
      details: `Missing or invalid: ${missingFields.join(', ') || 'unknown fields'}`,
      missing: {
        authorization: !accessToken,
        tracker: !checkoutTracker,
        plan: !planId,
        cycle: !cycle,
      },
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!,
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const environment = process.env.SAFEPAY_ENV === 'production' ? 'production' : 'sandbox';
  const host = environment === 'production'
    ? 'api.getsafepay.com'
    : 'sandbox.api.getsafepay.com';
  const safepaySecret = process.env.SAFEPAY_SECRET_KEY;

  if (!safepaySecret) {
    console.error('Safepay secret key is not configured');
    return res.status(500).json({ error: 'Payment gateway is not configured for verification' });
  }

  try {
    let trackerResult: {
      data?: { state?: string; amount?: number | string; currency?: string };
      status?: { errors?: string[] };
    } | null = null;
    let trackerResponseOk = false;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const trackerResponse = await fetch(
        `https://${host}/reporter/api/v1/payments/${encodeURIComponent(checkoutTracker)}`,
        {
          headers: {
            Accept: 'application/json',
            'x-sfpy-merchant-secret': safepaySecret,
          },
        },
      );
      trackerResponseOk = trackerResponse.ok;
      trackerResult = (await trackerResponse.json().catch(() => null)) as typeof trackerResult;

      if (
        trackerResponseOk &&
        trackerResult?.data?.state === 'TRACKER_ENDED'
      ) {
        break;
      }

      if (attempt < 4) await wait(2000);
    }

    if (!trackerResponseOk || !trackerResult?.data) {
      return res.status(502).json({
        error: 'Could not verify the Safepay transaction',
        details: trackerResult?.status?.errors?.join(', ') ?? 'Safepay reporter request failed',
      });
    }

    if (
      trackerResult.data.state !== 'TRACKER_ENDED' ||
      Number(trackerResult.data.amount) !== PLAN_PRICES[planId][cycle] * 100 ||
      trackerResult.data.currency?.toUpperCase() !== 'PKR'
    ) {
      return res.status(409).json({
        error: 'Safepay payment is not completed or does not match this plan',
        details: `state=${trackerResult.data.state ?? 'unknown'}, amount=${trackerResult.data.amount ?? 'unknown'}, currency=${trackerResult.data.currency ?? 'unknown'}`,
      });
    }

    const { error: subscriptionError } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: user.id,
        plan: planId,
        billing_cycle: cycle,
        expires_at: getExpiresAt(cycle),
        safepay_tracker: checkoutTracker,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (subscriptionError) {
      console.error('Subscription update error:', subscriptionError);
      return res.status(500).json({ error: 'Database update failed' });
    }

    return res.status(200).json({ confirmed: true });
  } catch (error) {
    console.error('Safepay confirmation error:', error);
    return res.status(502).json({ error: 'Could not verify the Safepay transaction' });
  }
}
