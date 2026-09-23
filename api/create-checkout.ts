/**
 * api/create-checkout.ts
 * Vercel Serverless Function — creates a Safepay payment tracker and
 * returns the hosted checkout URL for the frontend to redirect to.
 *
 * POST /api/create-checkout
 * Body: { planId: 'pro' | 'business', cycle: 'monthly' | 'yearly', userId: string, email: string }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Plan price table (PKR) ─────────────────────────────────────────────────
const PLAN_PRICES: Record<string, Record<string, number>> = {
  pro: { monthly: 999, yearly: 9588 },        // 799/mo × 12
  business: { monthly: 2499, yearly: 23988 }, // 1999/mo × 12
};

// ── Handler ───────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { planId, cycle, userId, email } = req.body as {
    planId: string;
    cycle: 'monthly' | 'yearly';
    userId: string;
    email: string;
  };

  if (!planId || !cycle || !userId || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const priceInPaisa = (PLAN_PRICES[planId]?.[cycle] ?? 0) * 100; // Safepay uses paisa
  if (priceInPaisa === 0) {
    return res.status(400).json({ error: 'Invalid plan or cycle' });
  }

  const SAFEPAY_SECRET = process.env.SAFEPAY_SECRET_KEY;
  const SAFEPAY_TRACKER = process.env.SAFEPAY_TRACKER;

  if (!SAFEPAY_SECRET || !SAFEPAY_TRACKER) {
    console.error('Safepay env vars not configured');
    return res.status(500).json({ error: 'Payment gateway not configured' });
  }

  try {
    // Step 1: Create a tracker (Safepay payment session)
    const trackerRes = await fetch('https://sandbox.api.getsafepay.com/order/v1/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SFPY-MERCHANT-SECRET': SAFEPAY_SECRET,
      },
      body: JSON.stringify({
        client: { email },
        order: {
          currency: 'PKR',
          amount: priceInPaisa,
        },
        // Store metadata so the webhook knows what to activate
        user_data: {
          user_id: userId,
          plan_id: planId,
          billing_cycle: cycle,
        },
      }),
    });

    if (!trackerRes.ok) {
      const err = await trackerRes.text();
      console.error('Safepay tracker error:', err);
      return res.status(502).json({ error: 'Failed to create payment session' });
    }

    const tracker = (await trackerRes.json()) as { data: { tracker: string } };
    const token = tracker.data.tracker;

    // Step 2: Build the hosted checkout URL
    // Switch to https://api.getsafepay.com for production
    const checkoutUrl =
      `https://sandbox.api.getsafepay.com/embedded?tracker=${token}` +
      `&source=custom` +
      `&redirect_url=${encodeURIComponent(process.env.APP_URL + '/billing')}` +
      `&cancel_url=${encodeURIComponent(process.env.APP_URL + '/billing')}`;

    return res.status(200).json({ checkoutUrl, token });
  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
