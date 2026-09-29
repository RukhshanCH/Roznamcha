/**
 * api/webhook.ts  — REWRITTEN (2026-09-29)
 * Vercel Serverless Function — receives Safepay payment webhooks.
 *
 * Safepay calls this endpoint (server-to-server) when a payment's state
 * changes. We verify the HMAC signature over the RAW request body, then
 * activate the subscription in Supabase.
 *
 * POST /api/webhook
 * Headers: x-sfpy-signature
 *
 * BUGS FIXED vs the old version:
 *  1. Old code checked `event.event === 'payment:succeeded'` — Safepay sends
 *     `type: 'payment.succeeded'`. Real events fell into the early `return 200`
 *     and were silently ignored (SafePay saw 200, so no retry).
 *  2. Old code expected `data.user_data.{user_id,plan_id,billing_cycle}` —
 *     Safepay sends `data.metadata`, and create-checkout.ts never attached any
 *     metadata, so the payment could never be linked to a user. The tracker is
 *     now created WITH metadata (see create-checkout.ts) and the webhook reads
 *     `data.metadata`.
 *  3. Old code verified the signature over `JSON.stringify(req.body)` —
 *     re-serialized by Vercel. Safepay signs the RAW body; any whitespace or
 *     key-order difference fails verification. We now disable Vercel's body
 *     parser and verify the raw bytes.
 *  4. Old code used the merchant secret key — webhooks use the separate
 *     per-endpoint webhook secret from the Safepay dashboard
 *     (Developer → Webhooks/Endpoints). Set it as SAFEPAY_WEBHOOK_SECRET.
 *  5. `timingSafeEqual` throws when the buffers differ in length — now guarded.
 *  6. Added lightweight idempotency: a tracker that already activated a plan
 *     is not processed twice.
 *
 * SETUP (do this in the Safepay sandbox dashboard):
 *  - Register endpoint URL: https://<your-app>/api/webhook
 *  - Copy the endpoint's webhook secret -> Vercel env SAFEPAY_WEBHOOK_SECRET
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

// ── We need the RAW body for signature verification, so Vercel must NOT
//    parse it for us. ────────────────────────────────────────────────────
export const config = {
  api: { bodyParser: false },
};

function getExpiresAt(cycle: 'monthly' | 'yearly'): string {
  const d = new Date();
  if (cycle === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString();
}

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Actual Safepay webhook shape:
// { token, version, type: 'payment.succeeded', data: { tracker, state,
//   metadata: { order_id: '{"user_id":"...","plan_id":"...","billing_cycle":"..."}' }, ... } }
// NOTE: create-checkout.ts packs our fields into metadata.order_id as JSON
// because SafePay rejects unknown metadata keys on tracker creation.
// ⚠️ Live shape (verified 2026-09-30): metadata.order_id arrives as an OBJECT
// { token, tracker, key, value: '<json string>', ... }, NOT the plain string
// we sent. extractMetadata() handles both shapes.
interface SafepayWebhookEvent {
  token?: string;
  type?: string;
  data?: {
    tracker?: string;
    state?: string;
    metadata?: {
      order_id?: string | { value?: string };
    };
  };
}

interface PackedMetadata {
  user_id?: string;
  plan_id?: string;
  billing_cycle?: 'monthly' | 'yearly';
}

// Unpacks the JSON stored in metadata.order_id by create-checkout.ts.
// Handles both the plain-string shape and the live object shape
// { ..., value: '<json string>' }.
function extractMetadata(event: SafepayWebhookEvent): PackedMetadata {
  const raw = event.data?.metadata?.order_id;
  const orderId = typeof raw === 'string' ? raw : raw?.value;
  if (typeof orderId !== 'string' || !orderId) return {};
  try {
    return JSON.parse(orderId) as PackedMetadata;
  } catch {
    console.error('Could not parse metadata.order_id JSON:', orderId);
    return {};
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookSecret = process.env.SAFEPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('SAFEPAY_WEBHOOK_SECRET is not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  // ── 1. Read the raw body and verify the HMAC signature ──────────────
  let rawBody: Buffer;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error('Could not read webhook body:', err);
    return res.status(400).json({ error: 'Could not read request body' });
  }

  const signature = req.headers['x-sfpy-signature'] as string | undefined;

  // Sandbox-verified: HMAC-SHA512 over the raw body, hex-encoded.
  const expectedSig = createHmac('sha512', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const sigBuf = signature ? Buffer.from(signature, 'utf8') : Buffer.alloc(0);
  const expBuf = Buffer.from(expectedSig, 'utf8');
  const valid =
    sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);

  if (!valid) {
    console.warn('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // ── 2. Parse the event ──────────────────────────────────────────────
  let event: SafepayWebhookEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  console.log(
    `Safepay webhook: type=${event.type} state=${event.data?.state} tracker=${event.data?.tracker}`,
  );

  // Only successful, fully-settled payments activate a plan.
  if (event.type !== 'payment.succeeded' || event.data?.state !== 'TRACKER_ENDED') {
    return res.status(200).json({ received: true });
  }

  const { user_id, plan_id, billing_cycle } = extractMetadata(event);
  if (!user_id || !plan_id || !billing_cycle) {
    // The tracker was created without (parseable) metadata — check create-checkout.ts.
    console.error('Webhook missing metadata (metadata.order_id):', event.data?.metadata);
    return res.status(200).json({ received: true, warning: 'missing metadata' });
  }

  // ── 3. Write the subscription (idempotent on tracker) ───────────────
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!,
  );

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('safepay_tracker')
    .eq('user_id', user_id)
    .single();

  if (existing?.safepay_tracker === event.data?.tracker) {
    console.log('Webhook already processed for tracker', event.data?.tracker);
    return res.status(200).json({ received: true, deduped: true });
  }

  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id,
      plan: plan_id,
      billing_cycle,
      expires_at: getExpiresAt(billing_cycle),
      safepay_tracker: event.data?.tracker,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('Supabase upsert error:', error);
    return res.status(500).json({ error: 'Database update failed' });
  }

  console.log(`Plan activated via webhook: user=${user_id} plan=${plan_id} cycle=${billing_cycle}`);
  return res.status(200).json({ received: true });
}
