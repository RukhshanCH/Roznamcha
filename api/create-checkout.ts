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

  const amount = PLAN_PRICES[planId]?.[cycle] ?? 0;
  if (amount === 0) {
    return res.status(400).json({ error: 'Invalid plan or cycle' });
  }

  const safepayEnvironment = process.env.SAFEPAY_ENV === 'production'
    ? 'production'
    : 'sandbox';
  const safepayApiHost = safepayEnvironment === 'production'
    ? 'api.getsafepay.com'
    : 'sandbox.api.getsafepay.com';
  const safepayCheckoutBase = safepayEnvironment === 'production'
    ? 'https://getsafepay.com'
    : 'https://sandbox.api.getsafepay.com';
  const safepayApiKey = process.env.SAFEPAY_API_KEY;
  const safepaySecret = process.env.SAFEPAY_SECRET_KEY;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ?? 'http';
  const appUrl = process.env.APP_URL ?? `${protocol}://${req.headers.host ?? 'localhost:5173'}`;

  if (
    !safepayApiKey ||
    safepayApiKey === 'your-safepay-api-key' ||
    !safepaySecret
  ) {
    console.error('Safepay env vars not configured');
    return res.status(500).json({ error: 'Payment gateway not configured' });
  }

  try {
    // Step 1: Create a tracker (Safepay payment session).
    const trackerRes = await fetch(`https://${safepayApiHost}/order/payments/v3/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sfpy-merchant-secret': safepaySecret,
      },
      body: JSON.stringify({
        merchant_api_key: safepayApiKey,
        intent: 'CYBERSOURCE',
        mode: 'payment',
        entry_mode: 'raw',
        amount: amount * 100,
        currency: 'PKR',
      }),
    });

    if (!trackerRes.ok) {
      const err = await trackerRes.text();
      const providerError = err.replace(/\s+/g, ' ').trim().slice(0, 500);
      console.error('Safepay tracker error:', trackerRes.status, providerError);
      return res.status(502).json({
        error: `Safepay rejected the payment session (${trackerRes.status})`,
        details: providerError || 'The provider returned an empty error response',
      });
    }

    const tracker = (await trackerRes.json()) as {
      data?: { token?: string; tracker?: { token?: string } };
    };
    const token = tracker.data?.tracker?.token ?? tracker.data?.token;
    if (!token) {
      console.error('Safepay response did not include a tracker token:', tracker);
      return res.status(502).json({
        error: 'Safepay returned an invalid payment session response',
      });
    }

    const tbtRes = await fetch(`https://${safepayApiHost}/client/passport/v1/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sfpy-merchant-secret': safepaySecret,
      },
      body: '{}',
    });

    if (!tbtRes.ok) {
      const providerError = (await tbtRes.text()).replace(/\s+/g, ' ').trim().slice(0, 500);
      console.error('Safepay checkout token error:', tbtRes.status, providerError);
      return res.status(502).json({
        error: `Safepay rejected the checkout session (${tbtRes.status})`,
        details: providerError || 'The provider returned an empty error response',
      });
    }

    const tbtResult = (await tbtRes.json()) as { data?: string };
    if (!tbtResult.data) {
      return res.status(502).json({ error: 'Safepay returned an invalid checkout token response' });
    }

    const checkoutUrl = `${safepayCheckoutBase}/embedded/?${new URLSearchParams({
      environment: safepayEnvironment,
      tracker: token,
      tbt: tbtResult.data,
      cancel_url: `${appUrl}/billing`,
      redirect_url: `${appUrl}/billing?tracker=${encodeURIComponent(token)}&plan=${encodeURIComponent(planId)}&cycle=${cycle}`,
      source: 'hosted',
    }).toString()}`;

    return res.status(200).json({ checkoutUrl, token });
  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
