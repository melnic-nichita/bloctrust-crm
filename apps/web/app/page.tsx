import Link from 'next/link';

const foundations = [
  'Argon2id with private breach screening',
  'Rotated cookie sessions with replay detection',
  'Passkey registration and recent step-up',
  'Server-side roles plus PostgreSQL RLS',
  'Encrypted Vendor Trust Passports with immutable bank history',
];

export default function HomePage() {
  return (
    <main>
      <nav aria-label="Primary navigation">
        <span className="brand">BLOCTRUST</span>
        <span className="milestone">CRM core 0.3.0</span>
      </nav>

      <section className="hero" aria-labelledby="hero-heading">
        <p className="eyebrow">SECURITY-FIRST OPERATIONS CRM</p>
        <h1 id="hero-heading">Trust financial actions only when the evidence agrees.</h1>
        <p className="lede">
          BlocTrust connects residents, vendors, contracts, invoices, and decisions while making
          risky administrative actions visible and independently verifiable.
        </p>
        <div className="hero-actions">
          <Link className="button-link" href="/onboarding">
            Create organization
          </Link>
          <Link className="text-link" href="/login">
            Sign in
          </Link>
          <Link className="text-link" href="/crm">
            Open CRM
          </Link>
        </div>
      </section>

      <section className="foundation" aria-labelledby="foundation-heading">
        <div>
          <p className="eyebrow">MILESTONE 0.3 CRM CORE</p>
          <h2 id="foundation-heading">A relationship graph with evidence attached.</h2>
        </div>
        <ol>
          {foundations.map((item, index) => (
            <li key={item}>
              <span aria-hidden="true">0{index + 1}</span>
              {item}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
