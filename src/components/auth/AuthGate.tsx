import { useState, type FormEvent, type ReactNode } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { BookOpen, LoaderCircle, Mail } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { authErrorAtom, authLoadingAtom, passwordRecoveryAtom, userAtom } from '@/store/atoms';
import {
  completePasswordRecovery,
  requestMagicLink,
  requestPasswordRecovery,
  useAuthBootstrap,
} from '@/hooks/useAuth';
import '@/styles/auth.css';

export default function AuthGate({ children }: { children: ReactNode }) {
  useAuthBootstrap();

  const user = useAtomValue(userAtom);
  const loading = useAtomValue(authLoadingAtom);
  const authError = useAtomValue(authErrorAtom);
  const passwordRecovery = useAtomValue(passwordRecoveryAtom);
  const setPasswordRecovery = useSetAtom(passwordRecoveryAtom);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mode, setMode] = useState<'magic' | 'password' | 'reset'>('magic');
  const [passwordAction, setPasswordAction] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }

    setSending(true);
    setError('');
    setSuccess('');
    try {
      const supabase = getSupabaseClient();
      if (mode === 'magic') {
        await requestMagicLink(email.trim(), window.location.origin);
        setSuccess('If this email belongs to an account that can sign in with a link, a link will be sent.');
        setSent(true);
      } else if (mode === 'reset') {
        await requestPasswordRecovery(email.trim(), window.location.origin);
        setSuccess('If an account exists for this email, a recovery link will be sent.');
        setSent(true);
      } else if (passwordAction === 'sign-up') {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName.trim() },
          },
        });
        if (signUpError) throw signUpError;
        setSuccess('Account created. Check your email to confirm your address.');
        setSent(true);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (authError) {
      setError(
        mode === 'magic'
          ? 'Could not request a sign-in link. Please try again later.'
          : mode === 'reset'
            ? 'Could not request password recovery. Please try again later.'
            : authError instanceof Error ? authError.message : 'Could not complete authentication.',
      );
    } finally {
      setSending(false);
    }
  }

  async function submitRecoveredPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setSending(true);
    setError('');
    try {
      await completePasswordRecovery(password);
      setPasswordRecovery(false);
    } catch (recoveryError) {
      setError(recoveryError instanceof Error
        ? recoveryError.message
        : 'Could not update the password. Request a new recovery link and try again.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <main className="auth-page" aria-live="polite">
        <LoaderCircle className="auth-spinner" aria-hidden="true" />
        <p>Restoring your session…</p>
      </main>
    );
  }

  if (passwordRecovery && user) {
    return (
      <main dir="ltr" className="auth-page">
        <section className="auth-card" aria-labelledby="recovery-title">
          <BookOpen size={36} aria-hidden="true" />
          <h1 id="recovery-title">Choose a new password</h1>
          <form onSubmit={submitRecoveredPassword}>
            <label htmlFor="recovery-password">New password</label>
            <input
              id="recovery-password"
              autoComplete="new-password"
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <label htmlFor="recovery-confirm-password">Confirm new password</label>
            <input
              id="recovery-confirm-password"
              autoComplete="new-password"
              type="password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button type="submit" disabled={sending}>
              {sending ? 'Please wait…' : 'Update password'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (user) return <>{children}</>;

  return (
    <main dir='ltr' className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <BookOpen size={36} aria-hidden="true" />
        <h1 id="auth-title">
          {mode === 'reset'
            ? 'Reset your password'
            : mode === 'password' && passwordAction === 'sign-up'
              ? 'Create your account'
              : 'Sign in to Roznamcha'}
        </h1>
        <p>Your data is linked to your account and synced across your devices.</p>

        {!isSupabaseConfigured() ? (
          <p className="auth-error" role="alert">{authError}</p>
        ) : sent ? (
          <p className="auth-success" role="status">{success}</p>
        ) : (
          <form onSubmit={submitAuth}>
            <label htmlFor="auth-email">Email address</label>
            <div className="auth-input-row">
              <Mail size={18} aria-hidden="true" />
              <input
                id="auth-email"
                autoComplete="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {mode === 'password' && passwordAction === 'sign-up' && (
              <>
                <label htmlFor="auth-display-name">Name (optional)</label>
                <input
                  id="auth-display-name"
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </>
            )}
            {mode === 'password' && (
              <>
                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  autoComplete={passwordAction === 'sign-up' ? 'new-password' : 'current-password'}
                  type="password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </>
            )}
            {error && <p className="auth-error" role="alert">{error}</p>}
            {authError && <p className="auth-error" role="alert">{authError}</p>}
            {success && <p className="auth-success" role="status">{success}</p>}
            <button type="submit" disabled={sending}>
              {sending
                ? 'Please wait…'
                : mode === 'magic'
                  ? 'Send sign-in link'
                  : mode === 'reset'
                    ? 'Send recovery link'
                    : passwordAction === 'sign-up'
                      ? 'Create account'
                      : 'Sign in'}
            </button>
            {mode === 'password' && passwordAction === 'sign-in' && (
              <button type="button" className="auth-link" onClick={() => { setMode('reset'); setSent(false); setError(''); }}>
                Forgot password?
              </button>
            )}
            <div className="auth-actions">
              <button type="button" className="auth-link" onClick={() => { setMode('magic'); setSent(false); setError(''); }}>
                Email link
              </button>
              <button type="button" className="auth-link" onClick={() => { setMode('password'); setPasswordAction('sign-in'); setSent(false); setError(''); }}>
                Password sign-in
              </button>
              <button type="button" className="auth-link" onClick={() => { setMode('password'); setPasswordAction('sign-up'); setSent(false); setError(''); }}>
                Create account
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
