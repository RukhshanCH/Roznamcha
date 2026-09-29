/**
 * api/confirm-checkout.ts  — FIXED
 * Confirms a completed Safepay tracker after the hosted checkout redirects
 * back to the billing page, then activates the authenticated user's plan.
 *
 * RESPONSE SHAPE — READ THIS (corrected 2026-09-30 against a real sandbox
 * response): Safepay's reporter returns the tracker fields DIRECTLY under
 * `data`, NOT under `data.tracker` as the Express Checkout guide's example
 * suggests. Real response:
 *   {"ok":true,"data":{"token":"track_...","state":"TRACKER_ENDED",
 *    "purchase_totals":{"quote_amount":{"currency":"PKR","amount":99900}},...}}
 * Correct paths:
 *   state    -> data.state
 *   amount   -> data.purchase_totals.quote_amount.amount  (paisa)
 *   currency -> data.purchase_totals.quote_amount.currency
 *
 * (The original code got `data.state` right but read `data.amount` /
 * `data.currency`, which don't exist — so every payment failed the amount
 * check with a 409 and the plan stayed on free.)
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

// Shape of GET /reporter/api/v1/payments/{tracker}.
// ⚠️ The live API returns the tracker fields DIRECTLY under `data`
// ({"ok":true,"data":{"token":"track_...","state":"TRACKER_ENDED",...}}),
// NOT under `data.tracker` as the docs example suggests. Verified against a
// real sandbox response on 2026-09-30.
interface ReporterResponse {
  ok?: boolean;
  data?: {
    token?: string;
    state?: string;
    purchase_totals?: {
      quote_amount?: {
        currency?: string;
        amount?: number | string;
      };
    };
  };
  status?: { errors?: string[]; message?: string };
}

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
    let trackerState: string | undefined;
    let quoteAmount: number | undefined;
    let quoteCurrency: string | undefined;

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

      const rawBody = await trackerResponse.text().catch(() => '');
      let body: ReporterResponse | null = null;
      try {
        body = rawBody ? (JSON.parse(rawBody) as ReporterResponse) : null;
      } catch {
        body = null;
      }
      // Live API: tracker fields sit directly under `data`
      // (the docs' `data.tracker` nesting does not match reality).
      const tracker = body?.data;
      trackerState = tracker?.state;
      quoteAmount = tracker?.purchase_totals?.quote_amount?.amount != null
        ? Number(tracker.purchase_totals.quote_amount.amount)
        : undefined;
      quoteCurrency = tracker?.purchase_totals?.quote_amount?.currency;

      console.log(
        `confirm-checkout attempt ${attempt + 1}: http=${trackerResponse.status} ` +
        `state=${trackerState ?? 'unknown'} amount=${quoteAmount ?? 'unknown'} currency=${quoteCurrency ?? 'unknown'}`,
      );
      if (!trackerResponse.ok || trackerState === undefined) {
        console.log(
          `confirm-checkout attempt ${attempt + 1} response body: ` +
          rawBody.replace(/\s+/g, ' ').trim().slice(0, 500),
        );
      }

      if (trackerResponse.ok && trackerState === 'TRACKER_ENDED') {
        break;
      }

      if (attempt < 4) await wait(2000);
    }

    if (trackerState === undefined) {
      return res.status(502).json({
        error: 'Could not verify the Safepay transaction',
        details: 'Safepay reporter request failed',
      });
    }

    const expectedAmount = PLAN_PRICES[planId][cycle] * 100; // PKR -> paisa
    if (
      trackerState !== 'TRACKER_ENDED' ||
      quoteAmount !== expectedAmount ||
      quoteCurrency?.toUpperCase() !== 'PKR'
    ) {
      return res.status(409).json({
        error: 'Safepay payment is not completed or does not match this plan',
        details: `state=${trackerState}, amount=${quoteAmount ?? 'unknown'} (expected ${expectedAmount}), currency=${quoteCurrency ?? 'unknown'}`,
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

    console.log(`Plan activated via confirm-checkout: user=${user.id} plan=${planId} cycle=${cycle}`);
    return res.status(200).json({ confirmed: true });
  } catch (error) {
    console.error('Safepay confirmation error:', error);
    return res.status(502).json({ error: 'Could not verify the Safepay transaction' });
  }
}
