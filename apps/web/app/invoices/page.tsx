'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiRequest, apiUrl } from '../lib/api';

type Profile = Readonly<{
  organization: { id: string; name: string };
  user: { displayName: string };
}>;
type Processing = Readonly<{
  state: string;
  progress: number;
  scanResult: string;
  suggestions: Record<string, string> | null;
  errorCode: string | null;
}>;
type Document = Readonly<{
  id: string;
  originalFilename: string;
  storageState: string;
  duplicateOfDocumentId?: string | null;
  processing: Processing;
}>;
type Line = Readonly<{ description: string; quantity: string; unitPrice: string; amount: string }>;
type RiskContribution = Readonly<{
  rule: string;
  score: number;
  explanation: string;
  evidence: string;
}>;
type ApprovalRequest = Readonly<{
  id: string;
  version: number;
  status: string;
  requiredDecisions: number;
  decisions: ReadonlyArray<{ id: string; outcome: string; reason: string }>;
  riskAssessment: {
    level: string;
    totalScore: number;
    evidenceHash: string;
    contributions: RiskContribution[];
  };
}>;
type Invoice = Readonly<{
  id: string;
  invoiceNumber: string | null;
  issueDate: string | null;
  currency: string | null;
  totalAmount: string | null;
  status: string;
  version: number;
  lines?: Line[];
  documents: Document[];
  approvalRequests?: ApprovalRequest[];
}>;

export default function InvoicesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selected, setSelected] = useState<Invoice>();
  const [selectedId, setSelectedId] = useState<string>();
  const [documentUrl, setDocumentUrl] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      const current = await apiRequest<Profile>('/auth/me');
      const data = await apiRequest<Invoice[]>(
        `/organizations/${current.organization.id}/invoices`,
      );
      setProfile(current);
      setInvoices(data);
      const targetId = selectedId ?? data[0]?.id;
      if (targetId) {
        setSelectedId(targetId);
        const detail = await apiRequest<Invoice>(
          `/organizations/${current.organization.id}/invoices/${targetId}`,
        );
        setSelected(detail);
      }
    } catch {
      router.push('/login');
    }
  }, [router, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!selected || !['PROCESSING'].includes(selected.status)) return;
    const timer = window.setInterval(() => void load(), 2_000);
    return () => window.clearInterval(timer);
  }, [load, selected]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const data = new FormData(event.currentTarget);
      await apiRequest(`/organizations/${profile!.organization.id}/invoices/uploads`, {
        method: 'POST',
        body: data,
      });
      setMessage('Upload is quarantined and queued for inspection.');
      event.currentTarget.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Upload failed');
    } finally {
      setPending(false);
    }
  }

  async function selectInvoice(id: string) {
    setSelectedId(id);
    const detail = await apiRequest<Invoice>(
      `/organizations/${profile!.organization.id}/invoices/${id}`,
    );
    setSelected(detail);
    setDocumentUrl(undefined);
  }

  async function previewDocument(documentId: string) {
    const authorization = await apiRequest<{ token: string }>(
      `/organizations/${profile!.organization.id}/invoices/documents/${documentId}/download-authorizations`,
      { method: 'POST' },
    );
    setDocumentUrl(
      apiUrl(
        `/organizations/${profile!.organization.id}/invoices/documents/${documentId}/content?token=${encodeURIComponent(authorization.token)}`,
      ),
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const field = form.get(name);
      return typeof field === 'string' ? field.trim() || undefined : undefined;
    };
    try {
      await apiRequest(
        `/organizations/${profile!.organization.id}/invoices/${selected!.id}/draft`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            version: selected!.version,
            invoiceNumber: value('invoiceNumber'),
            issueDate: value('issueDate'),
            currency: value('currency'),
            totalAmount: value('totalAmount') ? Number(value('totalAmount')) : undefined,
          }),
        },
      );
      setMessage('Draft saved. OCR suggestions remain unchanged as evidence.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Save failed');
    } finally {
      setPending(false);
    }
  }

  async function submitForApproval() {
    if (!selected) return;
    setPending(true);
    setError(undefined);
    try {
      await apiRequest(
        `/organizations/${profile!.organization.id}/invoices/${selected.id}/submit`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ version: selected.version }),
        },
      );
      setMessage('Risk evidence stored. The approval request is now frozen to this version.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Submission failed');
    } finally {
      setPending(false);
    }
  }

  const document = selected?.documents[0];
  const suggestions = document?.processing.suggestions ?? {};
  return (
    <main className="invoice-shell">
      <nav>
        <Link className="brand" href="/">
          BLOCTRUST
        </Link>
        <span>{profile?.organization.name ?? 'Secure invoice pipeline'} · 0.5.0</span>
        <Link href="/crm">CRM</Link>
        <Link href="/approvals">Approvals</Link>
      </nav>
      <header className="invoice-header">
        <div>
          <p className="eyebrow">SECURE INVOICE VERTICAL SLICE</p>
          <h1>Quarantine first. Review second.</h1>
        </div>
        <form className="upload-card" onSubmit={(event) => void upload(event)}>
          <label>
            PDF, PNG, or JPEG
            <input
              name="document"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              required
            />
          </label>
          <button disabled={pending}>Upload invoice</button>
        </form>
      </header>
      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error}</p>}
      <section className="invoice-workspace">
        <aside className="invoice-list">
          <h2>Inbox</h2>
          {invoices.map((invoice) => (
            <button
              className={selected?.id === invoice.id ? 'selected' : ''}
              key={invoice.id}
              onClick={() => void selectInvoice(invoice.id)}
            >
              <strong>{invoice.invoiceNumber ?? 'Unreviewed invoice'}</strong>
              <span>
                {invoice.status} · {invoice.documents[0]?.processing.progress ?? 0}%
              </span>
            </button>
          ))}
        </aside>
        <div className="document-panel">
          {documentUrl ? (
            <iframe title="Invoice source document" src={documentUrl} />
          ) : (
            <div className="document-placeholder">
              <strong>{document?.originalFilename ?? 'Select an invoice'}</strong>
              <span>
                {document?.storageState === 'APPROVED'
                  ? 'Malware scan passed'
                  : 'Preview locked during quarantine'}
              </span>
              {document?.storageState === 'APPROVED' && (
                <button onClick={() => void previewDocument(document.id)}>
                  Authorize 60-second preview
                </button>
              )}
            </div>
          )}
        </div>
        <form
          className="review-panel"
          key={selected?.id ?? 'empty'}
          onSubmit={(event) => void save(event)}
        >
          <h2>Reviewer draft</h2>
          <p>Suggestions never write these fields automatically.</p>
          <label>
            Invoice number <small>OCR: {suggestions.invoiceNumber ?? '—'}</small>
            <input name="invoiceNumber" defaultValue={selected?.invoiceNumber ?? ''} />
          </label>
          <label>
            Issue date <small>OCR: {suggestions.issueDate ?? '—'}</small>
            <input
              name="issueDate"
              type="date"
              defaultValue={selected?.issueDate?.slice(0, 10) ?? ''}
            />
          </label>
          <label>
            Currency <small>OCR: {suggestions.currency ?? '—'}</small>
            <input name="currency" maxLength={3} defaultValue={selected?.currency ?? ''} />
          </label>
          <label>
            Total <small>OCR: {suggestions.totalAmount ?? '—'}</small>
            <input
              name="totalAmount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={selected?.totalAmount ?? ''}
            />
          </label>
          {document?.duplicateOfDocumentId && (
            <p className="notice error">Exact duplicate detected.</p>
          )}
          {selected?.status === 'AWAITING_APPROVAL' && (
            <p className="notice error">
              Saving changes invalidates the current decisions and requires a new risk version.
            </p>
          )}
          <button
            disabled={
              pending ||
              !selected ||
              !(
                selected.status === 'NEEDS_REVIEW' ||
                selected.status === 'AWAITING_APPROVAL' ||
                (selected.status === 'MANUAL_REVIEW' &&
                  document?.storageState === 'APPROVED' &&
                  document.processing.scanResult === 'CLEAN')
              )
            }
          >
            Save reviewer draft
          </button>
          {selected?.status === 'NEEDS_REVIEW' && (
            <button type="button" disabled={pending} onClick={() => void submitForApproval()}>
              Score risk and request approval
            </button>
          )}
          {selected?.approvalRequests?.[0] && (
            <section
              className={`risk-card ${selected.approvalRequests[0].riskAssessment.level.toLowerCase()}`}
            >
              <p className="eyebrow">EXPLAINABLE RISK</p>
              <h3>
                {selected.approvalRequests[0].riskAssessment.level} ·{' '}
                {selected.approvalRequests[0].riskAssessment.totalScore} points
              </h3>
              {selected.approvalRequests[0].riskAssessment.contributions.map((item) => (
                <p key={item.rule}>
                  <strong>
                    +{item.score} {item.rule}
                  </strong>
                  <span>{item.explanation}</span>
                </p>
              ))}
              <small>
                Evidence {selected.approvalRequests[0].riskAssessment.evidenceHash.slice(0, 16)}…
              </small>
              <Link href="/approvals">Review approval evidence</Link>
            </section>
          )}
        </form>
      </section>
    </main>
  );
}
