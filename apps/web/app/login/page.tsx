'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { apiRequest } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);

    try {
      await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: data.get('email'),
          organizationSlug: data.get('organizationSlug'),
          password: data.get('password'),
        }),
      });
      router.push('/security');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-heading">
        <p className="eyebrow">COOKIE SESSION · SERVER-SIDE ROLE</p>
        <h1 id="login-heading">Enter the correct tenant.</h1>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Organization slug
            <input name="organizationSlug" autoComplete="organization" minLength={3} required />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" disabled={pending}>
            {pending ? 'Verifying…' : 'Sign in'}
          </button>
        </form>
        <p className="form-footnote">
          New association? <Link href="/onboarding">Create it securely</Link>
        </p>
      </section>
    </main>
  );
}
