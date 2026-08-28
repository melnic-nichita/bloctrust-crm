'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../lib/api';

type Profile = Readonly<{
  organization: { id: string; name: string; role: string };
  user: { displayName: string };
}>;
type Page<T> = Readonly<{ data: T[]; nextCursor: string | null }>;
type Building = Readonly<{
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  version: number;
  _count: { apartments: number; vendorLinks: number; contractLinks: number };
}>;
type BuildingDetail = Building & {
  apartments: {
    id: string;
    unitNumber: string;
    floor: string | null;
    occupancies: { id: string; membership: { user: { displayName: string } } }[];
  }[];
};
type BankVersion = Readonly<{
  id: string;
  versionNumber: number;
  maskedAccount: string;
  maskedAccountHolder: string;
  createdAt: string;
  verifications: { status: string; createdAt: string }[];
}>;
type Vendor = Readonly<{
  id: string;
  legalName: string;
  tradingName: string | null;
  status: string;
  tags: string[];
  version: number;
  contacts: { id: string; isVerified: boolean }[];
  buildingLinks: { building: { id: string; name: string } }[];
  bankAccountVersions: BankVersion[];
}>;
type VendorDetail = Vendor & { bankAccountVersions: BankVersion[] };
type Contract = Readonly<{
  id: string;
  reference: string;
  title: string;
  serviceCategory: string;
  status: string;
  endsOn: string | null;
  version: number;
  vendor: { legalName: string };
}>;
type Resident = Readonly<{
  id: string;
  user: { id: string; displayName: string; email: string };
}>;
type Dashboard = Readonly<{
  generatedAt: string;
  expiringContracts: { id: string; reference: string; title: string; endsOn: string }[];
  incompleteVendors: { id: string; legalName: string; missing: string[] }[];
}>;

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

export default function CrmPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [buildingDetail, setBuildingDetail] = useState<BuildingDetail>();
  const [vendorDetail, setVendorDetail] = useState<VendorDetail>();
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const load = useCallback(
    async (search = '') => {
      try {
        const current = await apiRequest<Profile>('/auth/me');
        const organizationId = current.organization.id;
        const suffix = search ? `?q=${encodeURIComponent(search)}` : '';
        const [buildingPage, vendorPage, contractPage, dashboardData, residentData] =
          await Promise.all([
            apiRequest<Page<Building>>(`/organizations/${organizationId}/crm/buildings${suffix}`),
            apiRequest<Page<Vendor>>(`/organizations/${organizationId}/crm/vendors${suffix}`),
            apiRequest<Page<Contract>>(`/organizations/${organizationId}/crm/contracts${suffix}`),
            apiRequest<Dashboard>(`/organizations/${organizationId}/crm/dashboard`),
            apiRequest<Resident[]>(`/organizations/${organizationId}/crm/residents`).catch(
              () => [],
            ),
          ]);
        setProfile(current);
        setBuildings(buildingPage.data);
        setVendors(vendorPage.data);
        setContracts(contractPage.data);
        setDashboard(dashboardData);
        setResidents(residentData);
        setSelectedBuildingId((selected) => selected || buildingPage.data[0]?.id || '');
        setSelectedVendorId((selected) => selected || vendorPage.data[0]?.id || '');
      } catch {
        router.push('/login');
      }
    },
    [router],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profile || !selectedBuildingId) {
      setBuildingDetail(undefined);
      return;
    }
    void apiRequest<BuildingDetail>(
      `/organizations/${profile.organization.id}/crm/buildings/${selectedBuildingId}`,
    )
      .then(setBuildingDetail)
      .catch(() => setBuildingDetail(undefined));
  }, [profile, selectedBuildingId]);

  useEffect(() => {
    if (!profile || !selectedVendorId) {
      setVendorDetail(undefined);
      return;
    }
    void apiRequest<VendorDetail>(
      `/organizations/${profile.organization.id}/crm/vendors/${selectedVendorId}`,
    )
      .then(setVendorDetail)
      .catch(() => setVendorDetail(undefined));
  }, [profile, selectedVendorId]);

  async function perform(action: () => Promise<string>): Promise<void> {
    setPending(true);
    setMessage(undefined);
    setError(undefined);
    try {
      setMessage(await action());
      await load(query);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The CRM action failed.');
    } finally {
      setPending(false);
    }
  }

  function path(suffix: string): string {
    if (!profile) throw new Error('Organization context is still loading.');
    return `/organizations/${profile.organization.id}/crm${suffix}`;
  }

  async function createBuilding(event: FormEvent<HTMLFormElement>): Promise<string> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await apiRequest<Building>(path('/buildings'), {
      method: 'POST',
      body: JSON.stringify({
        name: data.get('name'),
        addressLine1: data.get('addressLine1'),
        city: data.get('city'),
        postalCode: data.get('postalCode'),
        countryCode: data.get('countryCode'),
      }),
    });
    form.reset();
    setSelectedBuildingId(created.id);
    return `Building “${created.name}” created.`;
  }

  async function createApartment(event: FormEvent<HTMLFormElement>): Promise<string> {
    event.preventDefault();
    if (!selectedBuildingId) throw new Error('Select a building first.');
    const form = event.currentTarget;
    const data = new FormData(form);
    const apartment = await apiRequest<{ id: string; unitNumber: string }>(
      path(`/buildings/${selectedBuildingId}/apartments`),
      {
        method: 'POST',
        body: JSON.stringify({
          unitNumber: data.get('unitNumber'),
          floor: data.get('floor') || undefined,
        }),
      },
    );
    form.reset();
    return `Apartment ${apartment.unitNumber} created. Select it below to link a resident.`;
  }

  async function createOccupancy(event: FormEvent<HTMLFormElement>): Promise<string> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const apartmentId = formText(data, 'apartmentId');
    await apiRequest(path(`/apartments/${apartmentId}/occupancies`), {
      method: 'POST',
      body: JSON.stringify({
        membershipId: data.get('membershipId'),
        startsOn: data.get('startsOn'),
        endsOn: data.get('endsOn') || undefined,
      }),
    });
    form.reset();
    return 'Resident occupancy linked to the authorized building.';
  }

  async function createVendor(event: FormEvent<HTMLFormElement>): Promise<string> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const buildingId = formText(data, 'buildingId');
    const created = await apiRequest<Vendor>(path('/vendors'), {
      method: 'POST',
      body: JSON.stringify({
        legalName: data.get('legalName'),
        registrationNumber: data.get('registrationNumber') || undefined,
        email: data.get('email') || undefined,
        phone: data.get('phone') || undefined,
        status: 'ACTIVE',
        tags: formText(data, 'tags')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        buildingIds: buildingId ? [buildingId] : [],
      }),
    });
    form.reset();
    setSelectedVendorId(created.id);
    return `Vendor Trust Passport created for ${created.legalName}.`;
  }

  async function addBankVersion(event: FormEvent<HTMLFormElement>): Promise<string> {
    event.preventDefault();
    if (!selectedVendorId) throw new Error('Select a vendor first.');
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await apiRequest<BankVersion>(
      path(`/vendors/${selectedVendorId}/bank-accounts`),
      {
        method: 'POST',
        body: JSON.stringify({
          accountHolder: data.get('accountHolder'),
          bankName: data.get('bankName') || undefined,
          countryCode: data.get('bankCountryCode'),
          accountNumber: data.get('accountNumber'),
        }),
      },
    );
    form.reset();
    return `Encrypted bank version ${created.versionNumber} added as ${created.maskedAccount}.`;
  }

  async function createContract(event: FormEvent<HTMLFormElement>): Promise<string> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const valueLimit = formText(data, 'valueLimit');
    const created = await apiRequest<Contract>(path('/contracts'), {
      method: 'POST',
      body: JSON.stringify({
        vendorId: data.get('vendorId'),
        reference: data.get('reference'),
        title: data.get('title'),
        serviceCategory: data.get('serviceCategory'),
        valueLimit: valueLimit || undefined,
        currency: valueLimit ? data.get('currency') : undefined,
        startsOn: data.get('startsOn'),
        endsOn: data.get('endsOn') || undefined,
        status: 'ACTIVE',
        documentReference: data.get('documentReference') || undefined,
        buildingIds: [data.get('buildingId')],
      }),
    });
    form.reset();
    return `Contract ${created.reference} created.`;
  }

  return (
    <main className="crm-shell">
      <nav aria-label="CRM navigation">
        <Link className="brand" href="/">
          BLOCTRUST
        </Link>
        <div className="nav-links">
          <span>
            {profile
              ? `${profile.organization.name} · ${profile.organization.role}`
              : 'Loading tenant…'}
          </span>
          <Link href="/security">Security</Link>
        </div>
      </nav>

      <header className="crm-header">
        <div>
          <p className="eyebrow">CRM CORE · 0.3.0</p>
          <h1>Operational trust, building by building.</h1>
        </div>
        <form
          className="search-form"
          onSubmit={(event) => {
            event.preventDefault();
            void load(query);
          }}
        >
          <label>
            Tenant-scoped search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Vendor, contract, building…"
            />
          </label>
          <button type="submit">Search</button>
        </form>
      </header>

      {message ? <p className="notice success">{message}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      <section className="metric-grid" aria-label="CRM dashboard">
        <article className="metric-card signal">
          <span>Buildings</span>
          <strong>{buildings.length}</strong>
          <small>visible in this tenant context</small>
        </article>
        <article className="metric-card">
          <span>Vendor passports</span>
          <strong>{vendors.length}</strong>
          <small>{dashboard?.incompleteVendors.length ?? 0} need evidence</small>
        </article>
        <article className="metric-card">
          <span>Contracts</span>
          <strong>{contracts.length}</strong>
          <small>{dashboard?.expiringContracts.length ?? 0} expire within 60 days</small>
        </article>
      </section>

      <section className="crm-section" aria-labelledby="buildings-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">01 · BUILDINGS & RESIDENTS</p>
            <h2 id="buildings-title">Authorized relationships</h2>
          </div>
          <select
            value={selectedBuildingId}
            onChange={(event) => setSelectedBuildingId(event.target.value)}
          >
            <option value="">Select building</option>
            {buildings.map((building) => (
              <option key={building.id} value={building.id}>
                {building.name}
              </option>
            ))}
          </select>
        </div>
        <div className="work-grid">
          <div className="record-list">
            {buildings.map((building) => (
              <button
                className="record-row"
                key={building.id}
                onClick={() => setSelectedBuildingId(building.id)}
              >
                <span>
                  <strong>{building.name}</strong>
                  <small>
                    {building.addressLine1} · {building.city}
                  </small>
                </span>
                <span>{building._count.apartments} units</span>
              </button>
            ))}
            {buildingDetail?.apartments.map((apartment) => (
              <div className="subrecord" key={apartment.id}>
                <strong>Unit {apartment.unitNumber}</strong>
                <span>{apartment.occupancies[0]?.membership.user.displayName ?? 'Unoccupied'}</span>
              </div>
            ))}
          </div>
          <div className="form-stack">
            <form
              className="compact-form"
              onSubmit={(event) => void perform(() => createBuilding(event))}
            >
              <h3>Create building</h3>
              <input name="name" placeholder="Building name" required />
              <input name="addressLine1" placeholder="Street address" required />
              <div className="field-pair">
                <input name="city" placeholder="City" required />
                <input name="postalCode" placeholder="Postal code" required />
              </div>
              <input name="countryCode" defaultValue="MD" minLength={2} maxLength={2} required />
              <button disabled={pending}>Create building</button>
            </form>
            <form
              className="compact-form"
              onSubmit={(event) => void perform(() => createApartment(event))}
            >
              <h3>Add apartment</h3>
              <div className="field-pair">
                <input name="unitNumber" placeholder="Unit" required />
                <input name="floor" placeholder="Floor" />
              </div>
              <button disabled={pending || !selectedBuildingId}>Add to selected building</button>
            </form>
            <form
              className="compact-form"
              onSubmit={(event) => void perform(() => createOccupancy(event))}
            >
              <h3>Link resident occupancy</h3>
              <select name="apartmentId" required>
                <option value="">Apartment</option>
                {buildingDetail?.apartments.map((item) => (
                  <option key={item.id} value={item.id}>
                    Unit {item.unitNumber}
                  </option>
                ))}
              </select>
              <select name="membershipId" required>
                <option value="">Resident</option>
                {residents.map((resident) => (
                  <option key={resident.id} value={resident.id}>
                    {resident.user.displayName}
                  </option>
                ))}
              </select>
              <div className="field-pair">
                <input name="startsOn" type="date" required />
                <input name="endsOn" type="date" />
              </div>
              <button disabled={pending}>Link resident</button>
            </form>
          </div>
        </div>
      </section>

      <section className="crm-section dark" aria-labelledby="vendors-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">02 · VENDOR TRUST PASSPORT</p>
            <h2 id="vendors-title">Evidence before action</h2>
          </div>
          <select
            value={selectedVendorId}
            onChange={(event) => setSelectedVendorId(event.target.value)}
          >
            <option value="">Select vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.legalName}
              </option>
            ))}
          </select>
        </div>
        <div className="work-grid">
          <div className="record-list">
            {vendors.map((vendor) => (
              <button
                className="record-row"
                key={vendor.id}
                onClick={() => setSelectedVendorId(vendor.id)}
              >
                <span>
                  <strong>{vendor.legalName}</strong>
                  <small>{vendor.tags.join(' · ') || 'No tags'}</small>
                </span>
                <span className={`status ${vendor.status.toLowerCase()}`}>{vendor.status}</span>
              </button>
            ))}
            <div className="history-card">
              <h3>Masked bank-account history</h3>
              {vendorDetail?.bankAccountVersions.map((version) => (
                <div className="history-row" key={version.id}>
                  <span>
                    v{version.versionNumber} · {version.maskedAccountHolder}
                  </span>
                  <strong>{version.maskedAccount}</strong>
                  <small>{version.verifications[0]?.status ?? 'PENDING'}</small>
                </div>
              )) ?? <p>Select a vendor.</p>}
            </div>
          </div>
          <div className="form-stack">
            <form
              className="compact-form"
              onSubmit={(event) => void perform(() => createVendor(event))}
            >
              <h3>Create passport</h3>
              <input name="legalName" placeholder="Legal name" required />
              <input name="registrationNumber" placeholder="Registration number" />
              <div className="field-pair">
                <input name="email" type="email" placeholder="Email" />
                <input name="phone" placeholder="Phone" />
              </div>
              <input name="tags" placeholder="Tags, comma separated" />
              <select name="buildingId" required>
                <option value="">Authorized building</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
              <button disabled={pending}>Create vendor passport</button>
            </form>
            <form
              className="compact-form"
              onSubmit={(event) => void perform(() => addBankVersion(event))}
            >
              <h3>Add encrypted bank version</h3>
              <input name="accountHolder" placeholder="Account holder" required />
              <input name="bankName" placeholder="Bank name" />
              <input name="accountNumber" placeholder="IBAN / account number" required />
              <input
                name="bankCountryCode"
                defaultValue="MD"
                minLength={2}
                maxLength={2}
                required
              />
              <button disabled={pending || !selectedVendorId}>Add after passkey step-up</button>
              <small>Full data is authenticated-encrypted. Lists show masks only.</small>
            </form>
          </div>
        </div>
      </section>

      <section className="crm-section" aria-labelledby="contracts-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">03 · CONTRACTS</p>
            <h2 id="contracts-title">Scope, value and expiry</h2>
          </div>
        </div>
        <div className="work-grid">
          <div className="record-list">
            {contracts.map((contract) => (
              <div className="record-row static" key={contract.id}>
                <span>
                  <strong>
                    {contract.reference} · {contract.title}
                  </strong>
                  <small>
                    {contract.vendor.legalName} · {contract.serviceCategory}
                  </small>
                </span>
                <span>
                  {contract.endsOn ? new Date(contract.endsOn).toLocaleDateString() : 'Open ended'}
                </span>
              </div>
            ))}
          </div>
          <form
            className="compact-form"
            onSubmit={(event) => void perform(() => createContract(event))}
          >
            <h3>Create contract</h3>
            <div className="field-pair">
              <input name="reference" placeholder="Reference" required />
              <input name="title" placeholder="Title" required />
            </div>
            <input name="serviceCategory" placeholder="Service category" required />
            <select name="vendorId" required>
              <option value="">Vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.legalName}
                </option>
              ))}
            </select>
            <select name="buildingId" required>
              <option value="">Building</option>
              {buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
            <div className="field-pair">
              <input name="valueLimit" inputMode="decimal" placeholder="Value limit" />
              <input name="currency" defaultValue="MDL" maxLength={3} />
            </div>
            <div className="field-pair">
              <input name="startsOn" type="date" required />
              <input name="endsOn" type="date" />
            </div>
            <input
              name="documentReference"
              placeholder="Document reference (upload arrives in 0.4)"
            />
            <button disabled={pending}>Create contract</button>
          </form>
        </div>
      </section>
    </main>
  );
}
