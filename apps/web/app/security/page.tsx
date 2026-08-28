'use client';

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

type Profile = Readonly<{
  user: { email: string; displayName: string };
  organization: { id: string; name: string; slug: string; role: string };
  session: { id: string; stepUpVerifiedAt: string | null };
  passkeyCount: number;
}>;

export default function SecurityPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setProfile(await apiRequest<Profile>('/auth/me'));
    } catch {
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function perform(action: () => Promise<string>): Promise<void> {
    setPending(true);
    setError(undefined);
    setMessage(undefined);
    try {
      setMessage(await action());
      await loadProfile();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Security action failed.');
    } finally {
      setPending(false);
    }
  }

  async function registerPasskey(): Promise<string> {
    const options = await apiRequest<PublicKeyCredentialCreationOptionsJSON>(
      '/auth/passkeys/registration/options',
      { method: 'POST' },
    );
    const response = await startRegistration({ optionsJSON: options });
    await apiRequest('/auth/passkeys/registration/verify', {
      method: 'POST',
      body: JSON.stringify({ response, deviceName: 'Primary passkey' }),
    });
    return 'Passkey registered. You can now perform recent step-up verification.';
  }

  async function stepUp(): Promise<string> {
    const options = await apiRequest<PublicKeyCredentialRequestOptionsJSON>(
      '/auth/step-up/options',
      { method: 'POST' },
    );
    const response = await startAuthentication({ optionsJSON: options });
    await apiRequest('/auth/step-up/verify', {
      method: 'POST',
      body: JSON.stringify({ response }),
    });
    return 'Identity verified with a passkey for the next five minutes.';
  }

  async function logout(all: boolean): Promise<void> {
    await apiRequest(all ? '/auth/logout-all' : '/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <main className="security-shell">
      <nav aria-label="Security navigation">
        <span className="brand">BLOCTRUST</span>
        <span className="milestone">Identity boundary 0.2.0</span>
      </nav>
      <section className="security-grid">
        <div>
          <p className="eyebrow">ACTIVE TENANT CONTEXT</p>
          <h1>{profile?.organization.name ?? 'Loading secure context…'}</h1>
          <p className="lede">
            {profile
              ? `${profile.user.displayName} · ${profile.organization.role} · ${profile.organization.slug}`
              : 'Validating the server-side session and membership.'}
          </p>
        </div>
        <div className="security-panel">
          <p>
            <strong>Registered passkeys</strong>
            <span>{profile?.passkeyCount ?? '—'}</span>
          </p>
          <p>
            <strong>Recent step-up</strong>
            <span>{profile?.session.stepUpVerifiedAt ?? 'Not verified'}</span>
          </p>
          {message ? <p className="form-success">{message}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          <div className="button-row">
            <button disabled={pending} onClick={() => void perform(registerPasskey)}>
              Register passkey
            </button>
            <button disabled={pending} className="secondary" onClick={() => void perform(stepUp)}>
              Verify step-up
            </button>
            <button disabled={pending} className="quiet" onClick={() => void logout(false)}>
              Log out
            </button>
            <button disabled={pending} className="quiet" onClick={() => void logout(true)}>
              Log out everywhere
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
