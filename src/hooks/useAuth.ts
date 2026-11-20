import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import {
  authErrorAtom,
  authLoadingAtom,
  passwordRecoveryAtom,
  userAtom,
} from '@/store/atoms';

export function useAuthBootstrap() {
  const setUser = useSetAtom(userAtom);
  const setLoading = useSetAtom(authLoadingAtom);
  const setError = useSetAtom(authErrorAtom);
  const setPasswordRecovery = useSetAtom(passwordRecoveryAtom);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError('Supabase is not configured. Set the required VITE_SUPABASE environment variables.');
      setLoading(false);
      return;
    }

    let active = true;
    const supabase = getSupabaseClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
      setError(null);
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      if (!active) return;
      setUser(data.session?.user ?? null);
      setError(null);
      setLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setError(error instanceof Error ? error.message : 'Could not restore the Supabase session.');
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [setError, setLoading, setPasswordRecovery, setUser]);
}

export async function signOutUser(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}

export async function updateUserProfile(
  profile: { displayName: string; password?: string },
): Promise<void> {
  const { error } = await getSupabaseClient().auth.updateUser({
    data: { display_name: profile.displayName.trim() },
    ...(profile.password ? { password: profile.password } : {}),
  });
  if (error) throw error;
}

export async function requestMagicLink(email: string, redirectTo: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
    },
  });
  if (error) throw error;
}

export async function requestPasswordRecovery(email: string, redirectTo: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function completePasswordRecovery(password: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.updateUser({ password });
  if (error) throw error;
}
