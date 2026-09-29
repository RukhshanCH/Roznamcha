import { useEffect, useRef, useState } from "react";
import {
  CreditCard,
  Check,
  X,
  Zap,
  Shield,
  Star,
  Download,
  MessageCircle,
  ChevronDown,
  Sparkles,
  Loader2,
} from "lucide-react";
import "@/styles/billing.css";
import { usePlan } from "@/hooks/usePlan";
import { useAtomValue } from "jotai";
import { userAtom, subscriptionAtom } from "@/store/atoms";
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

type BillingCycle = "monthly" | "yearly";

interface Plan {
  id: string;
  name: string;
  tagline: string;
  iconBg: string;
  Icon: React.ElementType;
  iconColor: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  cta: string;
  ctaVariant: "outline" | "primary" | "current";
  popular?: boolean;
  features: { text: string; enabled: boolean }[];
}

// ── Plan Data ─────────────────────────────────────────────────────────────────

const PLANS: Plan[] = [
  {
    id: "free",
    name: "مفت",
    tagline: "چھوٹے کاروبار کے لیے بالکل مناسب شروعات",
    iconBg: "#f3f4f6",
    Icon: Shield,
    iconColor: "#6b7280",
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: "Rs",
    cta: "موجودہ پلان",
    ctaVariant: "current",
    features: [
      { text: "روزانہ ۵۰ اندراجات تک", enabled: true },
      { text: "بنیادی رپورٹیں", enabled: true },
      { text: "ایک صارف", enabled: true },
      { text: "اعداد و شمار کا خلاصہ", enabled: true },
      { text: "انوائس بنانا", enabled: false },
      { text: "بیک اپ (کلاؤڈ)", enabled: false },
      { text: "ایک سے زیادہ صارفین", enabled: false },
      { text: "ترجیحی سہارا", enabled: false },
    ],
  },
  {
    id: "pro",
    name: "پرو",
    tagline: "بڑھتے کاروبار کے لیے مکمل خصوصیات",
    iconBg: "#eff6ff",
    Icon: Zap,
    iconColor: "#3b82f6",
    monthlyPrice: 999,
    yearlyPrice: 799,
    currency: "Rs",
    cta: "پرو میں اپ گریڈ کریں",
    ctaVariant: "primary",
    popular: true,
    features: [
      { text: "لامحدود اندراجات", enabled: true },
      { text: "تفصیلی رپورٹیں و چارٹس", enabled: true },
      { text: "۳ صارفین تک", enabled: true },
      { text: "اعداد و شمار کا خلاصہ", enabled: true },
      { text: "انوائس بنانا (PDF)", enabled: true },
      { text: "خودکار بیک اپ (کلاؤڈ)", enabled: true },
      { text: "ایک سے زیادہ صارفین", enabled: false },
      { text: "ترجیحی سہارا", enabled: false },
    ],
  },
  {
    id: "business",
    name: "بزنس",
    tagline: "بڑی ٹیموں کے لیے ایڈوانسڈ ٹولز",
    iconBg: "#fefce8",
    Icon: Star,
    iconColor: "#ca8a04",
    monthlyPrice: 2499,
    yearlyPrice: 1999,
    currency: "Rs",
    cta: "بزنس میں اپ گریڈ کریں",
    ctaVariant: "outline",
    features: [
      { text: "لامحدود اندراجات", enabled: true },
      { text: "تفصیلی رپورٹیں و چارٹس", enabled: true },
      { text: "لامحدود صارفین", enabled: true },
      { text: "اعداد و شمار کا خلاصہ", enabled: true },
      { text: "انوائس بنانا (PDF)", enabled: true },
      { text: "خودکار بیک اپ (کلاؤڈ)", enabled: true },
      { text: "ایک سے زیادہ شعبے / برانچز", enabled: true },
      { text: "ترجیحی سہارا (۲۴/۷)", enabled: true },
    ],
  },
];

// ── FAQ Data ──────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "کیا میں کسی بھی وقت پلان تبدیل کر سکتا ہوں؟",
    a: "جی ہاں، آپ جب چاہیں اپ گریڈ یا ڈاؤن گریڈ کر سکتے ہیں۔ اپ گریڈ فوری اثر انداز ہوتا ہے اور بقیہ وقت کا حساب لگا کر بل کیا جائے گا۔",
  },
  {
    q: "سالانہ پلان کتنی بچت دیتا ہے؟",
    a: "سالانہ پلان خریدنے پر آپ کو تقریباً ۲۰٪ رعایت ملتی ہے جو ماہانہ ادائیگی کے مقابلے میں نمایاں بچت ہے۔",
  },
  {
    q: "کیا میرا ڈیٹا محفوظ رہے گا اگر میں پلان ختم کر دوں؟",
    a: "ہاں، آپ کا تمام ڈیٹا ۳۰ دن تک محفوظ رکھا جائے گا۔ اس دوران آپ اسے برآمد (Export) کر سکتے ہیں۔",
  },
  {
    q: "ادائیگی کے کون سے طریقے قبول کیے جاتے ہیں؟",
    a: "ہم EasyPaisa، JazzCash، بینک ٹرانسفر، اور کریڈٹ/ڈیبٹ کارڈ قبول کرتے ہیں۔",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = { free: 'مفت', pro: 'پرو', business: 'بزنس' };
const PLAN_PRICES: Record<string, Record<string, number>> = {
  pro: { monthly: 999, yearly: 9588 },
  business: { monthly: 2499, yearly: 23988 },
};
const PENDING_CHECKOUT_KEY = 'roznamcha.pending-checkout';

export default function BillingPage() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const checkoutConfirmationStarted = useRef(false);

  // Real plan data from atoms (populated by useAuthBootstrap in AuthGate)
  const { plan: currentPlan, isLoading: planLoading } = usePlan();
  const user = useAtomValue(userAtom);
  const subscription = useAtomValue(subscriptionAtom);
  const billingHistory = subscription?.payment?.paidAt && subscription.payment.plan !== 'free'
    ? [{
        id: subscription.payment.tracker ?? `SUB-${subscription.payment.paidAt}`,
        date: new Date(subscription.payment.paidAt).toLocaleDateString('ur-PK', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        plan: PLAN_LABELS[subscription.payment.plan] ?? subscription.payment.plan,
        amount: `Rs ${(PLAN_PRICES[subscription.payment.plan]?.[subscription.payment.billingCycle ?? 'monthly'] ?? 0).toLocaleString('en-PK')}`,
        status: 'paid',
      }]
    : [];

  useEffect(() => {
    if (checkoutConfirmationStarted.current) return;

    const params = new URLSearchParams(window.location.search);
    const pendingCheckout = (() => {
      try {
        const value = window.localStorage.getItem(PENDING_CHECKOUT_KEY);
        return value ? JSON.parse(value) as {
          tracker?: string;
          planId?: string;
          cycle?: BillingCycle;
        } : null;
      } catch {
        return null;
      }
    })();
    const tracker = params.get('tracker')
      ?? params.get('beacon')
      ?? params.get('token')
      ?? pendingCheckout?.tracker;
    const planId = params.get('plan') ?? pendingCheckout?.planId;
    const cycle = (params.get('cycle') as BillingCycle | null) ?? pendingCheckout?.cycle;

    if (!tracker || (planId !== 'pro' && planId !== 'business') || !cycle) return;
    checkoutConfirmationStarted.current = true;
    setCheckoutError(null);

    let cancelled = false;
    const confirmationRequest = (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;

      const response = await fetch('/api/confirm-checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tracker, beacon: tracker, planId, cycle }),
      });

      if (response.ok && !cancelled) {
        window.localStorage.removeItem(PENDING_CHECKOUT_KEY);
        window.history.replaceState({}, '', '/billing');
        // Auth bootstrap fetches the subscription on a full reload. Keeping
        // the reload here also handles a stale plan atom after checkout.
        window.location.reload();
      } else if (!response.ok) {
        const result = await response.json().catch(() => null) as {
          error?: string;
          details?: string;
        } | null;
        const message = [result?.error, result?.details].filter(Boolean).join(': ');
        console.error('Checkout confirmation failed:', message || `HTTP ${response.status}`);
        if (!cancelled) {
          setCheckoutError(message || 'ادائیگی کی تصدیق نہیں ہو سکی۔ براہ کرم دوبارہ کوشش کریں۔');
        }
      }
    })();

    void confirmationRequest.catch((error: unknown) => {
      console.error('Checkout confirmation request failed:', error);
      if (!cancelled) {
        setCheckoutError('ادائیگی کی تصدیق کے دوران خرابی پیش آئی۔ براہ کرم دوبارہ کوشش کریں۔');
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const formatPrice = (price: number) =>
    price === 0 ? "مفت" : price.toLocaleString("en-PK");

  const getPrice = (plan: Plan) =>
    cycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;

  const yearlySaving = (plan: Plan) =>
    plan.monthlyPrice > 0
      ? Math.round(((plan.monthlyPrice - plan.yearlyPrice) / plan.monthlyPrice) * 100)
      : 0;

  // Format expiry date
  const formatExpiry = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('ur-PK', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // ── Checkout handler ────────────────────────────────────────────────────────
  const handleUpgrade = async (planId: string) => {
    if (!user) return;
    setCheckoutLoading(planId);
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          cycle,
          userId: user.id,
          email: user.email,
        }),
      });
      const result = (await res.json().catch(() => null)) as
        | { checkoutUrl?: string; token?: string; error?: string; details?: string }
        | null;
      if (!res.ok) {
        const message = [result?.error, result?.details].filter(Boolean).join(': ');
        throw new Error(message || `Checkout failed (${res.status})`);
      }
      if (!result?.checkoutUrl) {
        throw new Error('Checkout response did not include a URL');
      }
      const { checkoutUrl } = result;
      if (!result.token) {
        throw new Error('Checkout response did not include a tracker token');
      }
      window.localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({
        tracker: result.token,
        planId,
        cycle,
      }));
      window.location.href = checkoutUrl;
    } catch (err) {
      console.error('Checkout error:', err);
      const message = err instanceof Error ? err.message : 'Unknown checkout error';
      alert(`ادائیگی کا عمل شروع نہیں ہو سکا: ${message}`);
    } finally {
      setCheckoutLoading(null);
    }
  };

  // Determine CTA variant per plan based on current subscription
  const getCtaVariant = (planId: string): 'current' | 'primary' | 'outline' => {
    if (planId === currentPlan) return 'current';
    if (planId === 'pro') return 'primary';
    return 'outline';
  };

  const getCtaLabel = (plan: Plan): string => {
    if (plan.id === currentPlan) return 'موجودہ پلان';
    if (plan.id === 'free') return 'مفت پلان پر جائیں';
    return plan.cta;
  };

  return (

    <div dir="ltr" className="billing-page">
    {checkoutError && (
      <div
        role="alert"
        style={{
          marginBottom: 16,
          padding: '12px 16px',
          borderRadius: 8,
          background: '#fef2f2',
          color: '#b91c1c',
          border: '1px solid #fecaca',
        }}
      >
        {checkoutError}
      </div>
    )}
    {/* ── Page Header ── */}
      <div className="billing-header">
        <div className="billing-header-icon">
          <CreditCard size={28} />
        </div>
        <h2>بلنگ اور پلانز</h2>
        <p>اپنے کاروبار کے لیے موزوں پلان منتخب کریں</p>
      </div>

      {/* ── Current Plan Banner ── */}
      <div className="billing-current-plan">
        <span className="billing-current-plan-badge">
          <Shield size={12} /> موجودہ پلان
        </span>
        <div className="billing-current-plan-info">
          {planLoading ? (
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> لوڈ ہو رہا ہے…
            </h3>
          ) : (
            <>
              <h3>{PLAN_LABELS[currentPlan] ?? currentPlan} پلان</h3>
              <p>
                {subscription?.isActive && subscription.expiresAt
                  ? `اگلی تجدید: ${formatExpiry(subscription.expiresAt)}`
                  : currentPlan === 'free'
                  ? 'اپ گریڈ کریں مزید خصوصیات کے لیے'
                  : 'سبسکرپشن فعال ہے'}
              </p>
            </>
          )}
        </div>
        {currentPlan === 'free' && !planLoading && (
          <button className="billing-renew-btn" onClick={() => handleUpgrade('pro')}>
            <Sparkles size={15} /> اپ گریڈ کریں
          </button>
        )}
      </div>

      {/* ── Billing Cycle Toggle ── */}
      <div className="billing-toggle-wrap">
        <span className={`billing-toggle-label ${cycle === "monthly" ? "active" : ""}`}>
          ماہانہ
        </span>
        <label className="billing-toggle">
          <input
            type="checkbox"
            checked={cycle === "yearly"}
            onChange={(e) => setCycle(e.target.checked ? "yearly" : "monthly")}
          />
          <span className="billing-toggle-slider" />
        </label>
        <span className={`billing-toggle-label ${cycle === "yearly" ? "active" : ""}`}>
          سالانہ
        </span>
        {cycle === "yearly" && (
          <span className="billing-save-badge">۲۰٪ بچت</span>
        )}
      </div>

      {/* ── Plans Grid ── */}
      <div className="billing-plans-grid">
        {PLANS.map((plan) => {
          const PlanIcon = plan.Icon;
          const price = getPrice(plan);
          const saving = yearlySaving(plan);

          return (
            <div
              key={plan.id}
              className={`billing-plan-card ${plan.popular ? "popular" : ""}`}
            >
              {plan.popular && (
                <div className="billing-popular-badge">⭐ مقبول ترین</div>
              )}

              {/* Icon + Name */}
              <div>
                <div
                  className="billing-plan-icon"
                  style={{ background: plan.iconBg }}
                >
                  <PlanIcon size={22} color={plan.iconColor} />
                </div>
                <h3 className="billing-plan-name">{plan.name}</h3>
                <p className="billing-plan-tagline">{plan.tagline}</p>
              </div>

              {/* Price */}
              <div>
                <div className="billing-plan-price">
                  {price > 0 && (
                    <span className="billing-plan-currency">{plan.currency}</span>
                  )}
                  <span className="billing-plan-amount">
                    {formatPrice(price)}
                  </span>
                  {price > 0 && (
                    <span className="billing-plan-period">
                      /{cycle === "yearly" ? "مہ" : "مہ"}
                    </span>
                  )}
                </div>
                {cycle === "yearly" && saving > 0 && (
                  <p className="billing-plan-yearly-note">
                    سالانہ ادائیگی پر{" "}
                    <span>{saving}٪ بچت</span>
                  </p>
                )}
                {cycle === "monthly" && plan.yearlyPrice > 0 && (
                  <p className="billing-plan-yearly-note">
                    سالانہ میں{" "}
                    <span>Rs {plan.yearlyPrice.toLocaleString("en-PK")}/مہ</span>
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className="billing-features-list">
                {plan.features.map((f, i) => (
                  <li
                    key={i}
                    className={`billing-feature-item ${f.enabled ? "" : "disabled"}`}
                  >
                    {f.enabled ? (
                      <Check size={16} className="billing-feature-check" />
                    ) : (
                      <X size={16} className="billing-feature-cross" />
                    )}
                    {f.text}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                className={`billing-plan-btn ${getCtaVariant(plan.id)}`}
                disabled={plan.id === currentPlan || checkoutLoading === plan.id}
                onClick={() => plan.id !== 'free' && plan.id !== currentPlan && handleUpgrade(plan.id)}
              >
                {checkoutLoading === plan.id ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> جاری ہے…
                  </span>
                ) : (
                  getCtaLabel(plan)
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Billing History ── */}
      <div className="billing-history-section">
        <h3 className="billing-section-title">
          <CreditCard size={18} /> ادائیگی کی تاریخ
        </h3>
        <table className="billing-history-table">
          <thead>
            <tr>
              <th>رسید نمبر</th>
              <th>تاریخ</th>
              <th>پلان</th>
              <th>رقم</th>
              <th>حیثیت</th>
              <th>ڈاؤنلوڈ</th>
            </tr>
          </thead>
          <tbody>
            {billingHistory.length > 0 ? billingHistory.map((row) => (
                <tr key={row.id}>
                  <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{row.id}</td>
                  <td>{row.date}</td>
                  <td>{row.plan}</td>
                  <td>{row.amount}</td>
                  <td>
                    <span className={`billing-status-badge ${row.status}`}>
                      ✓ ادا شدہ
                    </span>
                  </td>
                  <td>
                    <button className="billing-download-btn">
                      <Download size={14} /> PDF
                    </button>
                  </td>
                </tr>
            )) : (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '24px' }}>
                  ابھی کوئی ادائیگی موجود نہیں
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── FAQ ── */}
      <div className="billing-faq-section">
        <h3 className="billing-section-title">اکثر پوچھے گئے سوالات</h3>
        <div className="billing-faq-list">
          {FAQS.map((faq, i) => (
            <div key={i} className="billing-faq-item">
              <button
                className="billing-faq-question"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                {faq.q}
                <ChevronDown
                  size={18}
                  className={`billing-faq-chevron ${openFaq === i ? "open" : ""}`}
                />
              </button>
              {openFaq === i && (
                <div className="billing-faq-answer">{faq.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Contact CTA ── */}
      <div className="billing-contact-cta">
        <h3>مزید سوالات ہیں؟</h3>
        <p>ہماری ٹیم آپ کی مدد کے لیے ہمہ وقت تیار ہے</p>
        <button className="billing-contact-btn">
          <MessageCircle size={18} /> ہم سے رابطہ کریں
        </button>
      </div>
    </div>
  );
}
