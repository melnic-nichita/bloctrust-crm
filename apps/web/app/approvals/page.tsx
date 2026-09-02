'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../lib/api';

type Profile = Readonly<{
  organization: { id: string; name: string };
  user: { displayName: string };
  security: { stepUpVerifiedAt: string | null; passkeyCount: number };
}>;
type Contribution = Readonly<{
  rule: string;
  score: number;
  explanation: string;
  evidence: string;
}>;
type Approval = Readonly<{
  id: string;
  version: number;
  status: string;
  requiredDecisions: number;
  invalidatedReason: string | null;
  invoice: {
    id: string;
    invoiceNumber: string | null;
    totalAmount: string | null;
    currency: string | null;
    status: string;
  };
  riskAssessment: {
    ruleVersion: number;
    totalScore: number;
    level: string;
    evidenceHash: string;
    contributions: Contribution[];
  };
  initiatedByMembership: { user: { displayName: string } };
  decisions: ReadonlyArray<{
    id: string;
    outcome: string;
    reason: string;
    stepUpVerifiedAt: string;
    decidedByMembership: { user: { displayName: string } };
  }>;
  eligibleApprovers: ReadonlyArray<{
    id: string;
    role: string;
    user: { displayName: string };
  }>;
}>;

export default function ApprovalsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>();
  const [requests, setRequests] = useState<Approval[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      const current = await apiRequest<Profile>('/auth/me');
      const data = await apiRequest<Approval[]>(
        `/organizations/${current.organization.id}/approval-requests`,
      );
      setProfile(current);
      setRequests(data);
      setSelectedId((value) => value ?? data[0]?.id);
    } catch {
      router.push('/login');
    }
  }, [router]);

  useEffect(() => void load(), [load]);
  const selected = requests.find((request) => request.id === selectedId) ?? requests[0];

  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const outcome = form.get('outcome');
    const reason = form.get('reason');
    setPending(true);
    setError(undefined);
    try {
      await apiRequest(
        `/organizations/${profile!.organization.id}/approval-requests/${selected.id}/decisions`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({
            approvalVersion: selected.version,
            outcome,
            reason,
          }),
        },
      );
      setMessage('Passkey-backed decision recorded as immutable evidence.');
      event.currentTarget.reset();
      await load();
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'Decision failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="approval-shell">
      <nav>
        <Link className="brand" href="/">
          BLOCTRUST
        </Link>
        <span>{profile?.organization.name ?? 'Dual approval'} · 0.5.0</span>
        <Link href="/invoices">Invoices</Link>
        <Link href="/security">Passkey step-up</Link>
      </nav>
      <header className="approval-header">
        <p className="eyebrow">SEPARATION OF DUTIES</p>
        <h1>Risk evidence before financial approval.</h1>
        <p>
          High-risk invoices require two distinct eligible members with recent passkey verification.
        </p>
      </header>
      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error}</p>}
      <section className="approval-workspace">
        <aside className="approval-list">
          <h2>Requests</h2>
          {requests.map((request) => (
            <button
              className={request.id === selected?.id ? 'selected' : ''}
              key={request.id}
              onClick={() => setSelectedId(request.id)}
            >
              <strong>{request.invoice.invoiceNumber ?? 'Draft invoice'}</strong>
              <span>
                {request.riskAssessment.level} · {request.status}
              </span>
            </button>
          ))}
        </aside>
        {selected ? (
          <article className="approval-evidence">
            <div className={`risk-score ${selected.riskAssessment.level.toLowerCase()}`}>
              <span>{selected.riskAssessment.level}</span>
              <strong>{selected.riskAssessment.totalScore}</strong>
              <small>rule set v{selected.riskAssessment.ruleVersion}</small>
            </div>
            <div>
              <h2>{selected.invoice.invoiceNumber ?? 'Invoice awaiting review'}</h2>
              <p>
                {selected.invoice.totalAmount ?? '—'} {selected.invoice.currency ?? ''}
              </p>
              <p>Initiated by {selected.initiatedByMembership.user.displayName}</p>
              <p>
                {selected.decisions.length}/{selected.requiredDecisions} decisions recorded
              </p>
            </div>
            <section className="evidence-list">
              <h3>Triggered facts</h3>
              {selected.riskAssessment.contributions.length === 0 && (
                <p>No risk rules triggered.</p>
              )}
              {selected.riskAssessment.contributions.map((item) => (
                <div key={item.rule}>
                  <strong>
                    +{item.score} · {item.rule}
                  </strong>
                  <p>{item.explanation}</p>
                  <code>{item.evidence}</code>
                </div>
              ))}
              <small>Evidence hash: {selected.riskAssessment.evidenceHash}</small>
            </section>
            <section className="decision-history">
              <h3>Immutable decisions</h3>
              {selected.decisions.map((decision) => (
                <p key={decision.id}>
                  <strong>{decision.outcome}</strong> by{' '}
                  {decision.decidedByMembership.user.displayName}
                  <span>{decision.reason}</span>
                </p>
              ))}
            </section>
            {selected.invalidatedReason && (
              <p className="notice error">Invalidated: {selected.invalidatedReason}</p>
            )}
            {selected.status === 'PENDING' && (
              <form className="decision-form" onSubmit={(event) => void decide(event)}>
                <label>
                  Decision
                  <select name="outcome" defaultValue="APPROVE">
                    <option value="APPROVE">Approve</option>
                    <option value="REJECT">Reject</option>
                  </select>
                </label>
                <label>
                  Evidence-based reason
                  <textarea name="reason" minLength={10} maxLength={500} required />
                </label>
                <button disabled={pending}>Record passkey-backed decision</button>
                <small>
                  Step-up status:{' '}
                  {profile?.security.stepUpVerifiedAt
                    ? 'recently verified'
                    : 'verification required'}
                </small>
              </form>
            )}
          </article>
        ) : (
          <p>No approval requests yet. Submit a reviewed invoice first.</p>
        )}
      </section>
    </main>
  );
}
