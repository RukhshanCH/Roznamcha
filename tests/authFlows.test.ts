import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

import {
  completePasswordRecovery,
  requestMagicLink,
  requestPasswordRecovery,
} from '@/hooks/useAuth';

const auth = {
  signInWithOtp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
};

describe('Supabase authentication flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.signInWithOtp.mockResolvedValue({ error: null });
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    mocks.getSupabaseClient.mockReturnValue({ auth });
  });

  it('does not create accounts through the magic-link sign-in flow', async () => {
    await requestMagicLink('person@example.test', 'http://localhost:3000');

    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'person@example.test',
      options: {
        emailRedirectTo: 'http://localhost:3000',
        shouldCreateUser: false,
      },
    });
  });

  it('sends password recovery back to the current app origin', async () => {
    await requestPasswordRecovery('person@example.test', 'http://localhost:3000');

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'person@example.test',
      { redirectTo: 'http://localhost:3000' },
    );
  });

  it('updates the password only through the authenticated recovery session', async () => {
    await completePasswordRecovery('new-secure-password');

    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-secure-password' });
  });

  it('propagates authentication request errors', async () => {
    const error = new Error('Request failed');
    auth.signInWithOtp.mockResolvedValueOnce({ error });

    await expect(requestMagicLink('person@example.test', 'http://localhost:3000'))
      .rejects.toBe(error);
  });
});
