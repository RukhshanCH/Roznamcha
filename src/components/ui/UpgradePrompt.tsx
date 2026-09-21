/**
 * src/components/ui/UpgradePrompt.tsx
 *
 * Shown in place of a locked feature. Displays which plan is needed
 * and a button that navigates to /billing.
 *
 * Usage:
 *   const { canCreateInvoice } = usePlan();
 *   if (!canCreateInvoice) return <UpgradePrompt feature="انوائس (PDF)" requiredPlan="pro" />;
 */

import { Lock, Zap } from 'lucide-react';
import { useNavigate } from '@/router';

interface UpgradePromptProps {
  /** Feature name shown in the message (Urdu) */
  feature: string;
  /** Which plan unlocks this feature */
  requiredPlan: 'pro' | 'business';
}

const PLAN_LABELS: Record<string, string> = {
  pro: 'پرو',
  business: 'بزنس',
};

export default function UpgradePrompt({ feature, requiredPlan }: UpgradePromptProps) {
  const navigate = useNavigate();
  const planLabel = PLAN_LABELS[requiredPlan] ?? requiredPlan;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '40px 20px',
      textAlign: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Lock icon */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 72,
        height: 72,
        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
        borderRadius: 20,
        marginBottom: 20,
        border: '1.5px solid #bfdbfe',
      }}>
        <Lock size={32} color="#3b82f6" />
      </div>

      {/* Message */}
      <h2 style={{
        fontSize: 22,
        fontWeight: 700,
        color: '#111827',
        margin: '0 0 10px 0',
        fontFamily: "'Noto Nastaliq Urdu', system-ui, sans-serif",
      }}>
        یہ خصوصیت بند ہے
      </h2>

      <p style={{
        fontSize: 15,
        color: '#6b7280',
        maxWidth: 360,
        lineHeight: 1.7,
        margin: '0 0 8px 0',
        fontFamily: "'Noto Nastaliq Urdu', system-ui, sans-serif",
      }}>
        <strong style={{ color: '#374151' }}>{feature}</strong> صرف{' '}
        <strong style={{ color: '#3b82f6' }}>{planLabel} پلان</strong> میں دستیاب ہے۔
      </p>

      <p style={{
        fontSize: 13,
        color: '#9ca3af',
        margin: '0 0 28px 0',
        fontFamily: "'Noto Nastaliq Urdu', system-ui, sans-serif",
      }}>
        ابھی اپ گریڈ کریں اور تمام خصوصیات استعمال کریں
      </p>

      {/* Upgrade button */}
      <button
        onClick={() => navigate('/billing')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
          color: '#ffffff',
          border: 'none',
          borderRadius: 12,
          padding: '13px 28px',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(59, 130, 246, 0.35)',
          transition: 'transform 0.14s, box-shadow 0.18s',
          fontFamily: "'Noto Nastaliq Urdu', system-ui, sans-serif",
        }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 22px rgba(59, 130, 246, 0.45)';
        }}
        onMouseOut={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = '';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(59, 130, 246, 0.35)';
        }}
      >
        <Zap size={16} />
        {planLabel} پلان میں اپ گریڈ کریں
      </button>

      {/* Plan comparison link */}
      <button
        onClick={() => navigate('/billing')}
        style={{
          marginTop: 16,
          background: 'none',
          border: 'none',
          color: '#6b7280',
          fontSize: 13,
          cursor: 'pointer',
          textDecoration: 'underline',
          fontFamily: "'Noto Nastaliq Urdu', system-ui, sans-serif",
        }}
      >
        تمام پلانز دیکھیں →
      </button>
    </div>
  );
}
