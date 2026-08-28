'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { apiRequest } from '../lib/api';

export default function OnboardingPage() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);

    try {
      await apiRequest('/auth/onboard', {
        method: 'POST',
        body: JSON.stringify({
          organizationName: data.get('organizationName'),
          organizationSlug: data.get('organizationSlug'),
          displayName: data.get('displayName'),
          email: data.get('email'),
          password: data.get('password'),
        }),
      });
      router.push('/security');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Onboarding failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="onboarding-heading">
        <p className="eyebrow">MILESTONE 0.2 · SECURE ONBOARDING</p>
        <h1 id="onboarding-heading">Create your association boundary.</h1>
        <p className="lede">
          The first account becomes the owner. Passwords are screened privately and stored with
          Argon2id.
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Association name
            <input name="organizationName" minLength={2} maxLength={160} required />
          </label>
          <label>
            URL slug
            <input
              name="organizationSlug"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="strada-independentei-12"
              minLength={3}
              maxLength={80}
              required
            />
          </label>
          <label>
            Your name
            <input name="displayName" minLength={2} maxLength={120} autoComplete="name" required />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" maxLength={320} required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" disabled={pending}>
            {pending ? 'Creating secure boundary…' : 'Create organization'}
          </button>
        </form>
        <p className="form-footnote">
          Already onboarded? <Link href="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
