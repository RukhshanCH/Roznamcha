/**
 * src/components/auth/AuthGate.tsx
 *
 * Wraps the entire app. Shows a login screen (magic link via email) when
 * the user is not authenticated, and the app when they are.
 *
 * On first load the auth state is "loading" — we show a spinner to avoid
 * a flash of the login screen for returning users who already have a session.
 */

import { type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { userAtom, authLoadingAtom } from '@/store/atoms';
import { useAuthBootstrap } from '@/hooks/usePlan';
import { BookOpen, Mail, Loader2, CheckCircle } from 'lucide-react';
import Logo from '@/assets/Logo.webp';

// ── Styles (inline to keep this component self-contained) ──────────────────
const styles = `
  .auth-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%);
    font-family: system-ui, -apple-system, sans-serif;
    padding: 16px;
  }
  .auth-card {
    background: #ffffff;
    border-radius: 20px;
    padding: 40px 36px;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.10);
    text-align: center;
  }
  .auth-logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    border-radius: 18px;
    margin-bottom: 16px;
  }
  .auth-logo img {
    width: 44px;
    height: 44px;
    object-fit: contain;
    border-radius: 8px;
  }
  .auth-title {
    font-size: 24px;
    font-weight: 700;
    color: #111827;
    margin: 0 0 6px 0;
    font-family: 'Noto Nastaliq Urdu', serif;
  }
  .auth-subtitle {
    font-size: 14px;
    color: #6b7280;
    margin: 0 0 28px 0;
  }
  .auth-input-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
    text-align: left;
  }
  .auth-label {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
  }
  .auth-input {
    padding: 12px 14px;
    border: 1.5px solid #d1d5db;
    border-radius: 10px;
    font-size: 15px;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    width: 100%;
    box-sizing: border-box;
  }
  .auth-input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }
  .auth-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 13px;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    color: #ffffff;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.18s, transform 0.14s;
    margin-bottom: 16px;
  }
  .auth-btn:hover:not(:disabled) {
    opacity: 0.92;
    transform: translateY(-1px);
  }
  .auth-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .auth-success {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 20px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 12px;
    color: #15803d;
    font-size: 14px;
    line-height: 1.6;
  }
  .auth-divider {
    font-size: 12px;
    color: #9ca3af;
    margin-bottom: 6px;
  }
  .auth-loading-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f9fafb;
  }
  .auth-spinner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: #6b7280;
    font-size: 14px;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .spin { animation: spin 1s linear infinite; }
`;

// ── Component ──────────────────────────────────────────────────────────────
export default function AuthGate({ children }: { children: ReactNode }) {
  useAuthBootstrap(); // Bootstrap auth listeners once at the top

  const user = useAtomValue(userAtom);
  const isLoading = useAtomValue(authLoadingAtom);

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSendLink = async () => {
    if (!email.trim()) {
      setError('براہ کرم اپنا ای میل درج کریں۔');
      return;
    }
    setSending(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    setSending(false);

    if (authError) {
      setError('لنک بھیجنے میں خرابی۔ دوبارہ کوشش کریں۔');
      console.error(authError);
    } else {
      setSent(true);
    }
  };

  // ── Still resolving session (e.g. returning user or magic link callback) ──
  if (isLoading) {
    return (
      <>
        <style>{styles}</style>
        <div className="auth-loading-page">
          <div className="auth-spinner">
            <Loader2 size={32} className="spin" color="#3b82f6" />
            لوڈ ہو رہا ہے…
          </div>
        </div>
      </>
    );
  }

  // ── Authenticated → render the app ────────────────────────────────────
  if (user) return <>{children}</>;

  // ── Not authenticated → login form ────────────────────────────────────
  return (
    <>
      <style>{styles}</style>
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <img src={Logo} alt="روزنامچہ" />
          </div>

          <h1 className="auth-title">روزنامچہ</h1>
          <p className="auth-subtitle">
            لاگ ان کریں — آپ کے ای میل پر ایک لنک بھیجا جائے گا
          </p>

          {sent ? (
            <div className="auth-success">
              <CheckCircle size={32} />
              <div>
                <strong>لنک بھیج دیا گیا!</strong>
                <br />
                اپنا ای میل چیک کریں اور لنک پر کلک کریں۔
                <br />
                <small style={{ color: '#6b7280' }}>
                  (اسپیم فولڈر بھی دیکھیں)
                </small>
              </div>
            </div>
          ) : (
            <>
              <div className="auth-input-group">
                <label className="auth-label">
                  <Mail size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  ای میل ایڈریس
                </label>
                <input
                  className="auth-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  dir="ltr"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendLink();
                  }}
                  autoFocus
                />
                {error && (
                  <p style={{ color: '#dc2626', fontSize: 13, margin: 0 }}>{error}</p>
                )}
              </div>

              <button
                className="auth-btn"
                onClick={handleSendLink}
                disabled={sending}
              >
                {sending ? (
                  <><Loader2 size={16} className="spin" /> بھیج رہے ہیں…</>
                ) : (
                  <><BookOpen size={16} /> لنک بھیجیں</>
                )}
              </button>

              <p className="auth-divider">
                پاس ورڈ کی ضرورت نہیں — ای میل لنک سے لاگ ان کریں
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
