const foundations = [
  'Tenant isolation by policy and PostgreSQL RLS',
  'Quarantined document processing',
  'Explainable invoice risk holds',
  'Two-person passkey approval',
];

export default function HomePage() {
  return (
    <main>
      <nav aria-label="Primary navigation">
        <span className="brand">BLOCTRUST</span>
        <span className="milestone">Foundation 0.1.0</span>
      </nav>

      <section className="hero" aria-labelledby="hero-heading">
        <p className="eyebrow">SECURITY-FIRST OPERATIONS CRM</p>
        <h1 id="hero-heading">Trust financial actions only when the evidence agrees.</h1>
        <p className="lede">
          BlocTrust connects residents, vendors, contracts, invoices, and decisions while making
          risky administrative actions visible and independently verifiable.
        </p>
      </section>

      <section className="foundation" aria-labelledby="foundation-heading">
        <div>
          <p className="eyebrow">FIRST VERTICAL SLICE</p>
          <h2 id="foundation-heading">Changed bank account → risk hold → dual approval</h2>
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
