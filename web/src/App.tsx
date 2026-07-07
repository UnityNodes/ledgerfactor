import { useEffect, useState } from 'react';
import { fetchViews } from './api';
import { Contract, Recommendation, RoleView } from './types';

const money = (x: unknown): string =>
  '$' + Number(x ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const pct = (x: number): string => (x * 100).toFixed(2) + '%';
const shortId = (p: string): string => (p.length > 20 ? p.slice(0, 12) + '…' + p.slice(-4) : p);

const ROLE_META: Record<string, { tag: string; accent: string; blurb: string }> = {
  supplier: { tag: 'SUPPLIER', accent: 'var(--teal)', blurb: 'issues & discounts the receivable' },
  buyer: { tag: 'BUYER', accent: 'var(--slate)', blurb: 'confirms the payable' },
  financier: { tag: 'FINANCIER', accent: 'var(--brass)', blurb: 'underwrites & funds' },
  auditor: { tag: 'AUDITOR', accent: 'var(--muted)', blurb: 'observes the audit trail' },
};

const StatusPill = ({ status }: { status: string }) => (
  <span className={`pill pill-${status.toLowerCase()}`}>{status}</span>
);

const InvoiceCard = ({ c }: { c: Contract }) => (
  <article className="card">
    <div className="card-kicker">RECEIVABLE · INVOICE</div>
    <div className="card-title">{String(c.description)}</div>
    <div className="figure">{money(c.amount)}</div>
    <div className="card-foot">
      <StatusPill status={String(c.status)} />
      {c.financier ? <span className="tag">listed to financier</span> : <span className="tag tag-dim">not yet listed</span>}
    </div>
  </article>
);

const OfferCard = ({ c }: { c: Contract }) => {
  const face = Number(c.faceAmount);
  const rate = Number(c.discountRate);
  return (
    <article className="card card-sensitive">
      <div className="card-kicker">FINANCING OFFER · CONFIDENTIAL</div>
      <div className="margin-row">
        <span className="margin-label">MARGIN / DISCOUNT</span>
        <span className="margin-value">{pct(rate)}</span>
      </div>
      <div className="split">
        <div>
          <div className="mini-label">ADVANCE TO SUPPLIER</div>
          <div className="mini-value">{money(face * (1 - rate))}</div>
        </div>
        <div>
          <div className="mini-label">FINANCIER SPREAD</div>
          <div className="mini-value brass">{money(face * rate)}</div>
        </div>
      </div>
      <div className="card-foot">
        <span className="tag tag-eye">disclosed: financier + supplier</span>
      </div>
    </article>
  );
};

const RedactionCard = ({ margin }: { margin: number | null }) => (
  <article className="card card-redacted">
    <div className="card-kicker redacted-kicker">FINANCING TERMS</div>
    <div className="redaction-bar">
      <span className="lock">⛔</span>
      <span className="redaction-strip" aria-hidden />
    </div>
    <div className="redacted-note">
      Withheld by the Canton ledger from this participant.
      {margin != null && <span className="redacted-sub"> A margin of {pct(margin)} exists on a contract this party is not a stakeholder of.</span>}
    </div>
  </article>
);

const ReceivableCard = ({ c }: { c: Contract }) => (
  <article className="card">
    <div className="card-kicker">FINANCED RECEIVABLE · SETTLED</div>
    <div className="card-title">{String(c.description)}</div>
    <div className="figure">{money(c.faceAmount)}</div>
    <div className="card-foot">
      <span className="pill pill-settled">assigned to financier</span>
      <span className="tag tag-dim">face value only</span>
    </div>
  </article>
);

const CashCard = ({ c }: { c: Contract }) => (
  <article className="card card-cash">
    <div className="card-kicker">CASH · MOCK SETTLEMENT</div>
    <div className="figure brass">{money(c.amount)}</div>
    <div className="card-foot">
      <span className="tag tag-dim">held on ledger</span>
    </div>
  </article>
);

const bandClass = (b: string) => `band band-${b.toLowerCase()}`;

const ScoreCard = ({ rec }: { rec: Recommendation }) => {
  const r = rec.result;
  return (
    <article className="card card-score">
      <div className="card-kicker">AI UNDERWRITING · {rec.description.toUpperCase()}</div>
      <div className="score-head">
        <div className="score-num">{r.creditScore}<span className="score-den">/100</span></div>
        <div className={bandClass(r.riskBand)}>{r.riskBand}</div>
        <div className={`decision decision-${r.decision}`}>{r.decision}</div>
      </div>
      <div className="rate-line">
        <span>recommended discount</span>
        <span className="rate-val">{pct(r.recommendedDiscountRate)}</span>
      </div>
      <div className="submeters">
        {(['reliability', 'concentration', 'dilution', 'size'] as const).map((k) => (
          <div className="submeter" key={k}>
            <div className="submeter-label">{k}</div>
            <div className="submeter-track"><div className="submeter-fill" style={{ width: `${r.subScores[k] * 100}%` }} /></div>
          </div>
        ))}
      </div>
      <p className="memo">{rec.memo}</p>
    </article>
  );
};

const Panel = ({ view, margin }: { view: RoleView; margin: number | null }) => {
  const meta = ROLE_META[view.role];
  const g = view.groups;
  const offers = g.FinancingOffer ?? [];
  const offerExistsGlobally = margin != null;
  const seesOffer = offers.length > 0;
  const total = Object.values(g).reduce((n, arr) => n + arr.length, 0);

  return (
    <section className="panel" style={{ ['--accent' as string]: meta.accent }}>
      <header className="panel-head">
        <div className="panel-role">{meta.tag}</div>
        <div className="panel-name">{view.displayName}</div>
        <div className="panel-blurb">{meta.blurb}</div>
        <div className="panel-party">{shortId(view.party)}</div>
      </header>

      <div className="panel-body">
        {(g.Invoice ?? []).map((c) => <InvoiceCard key={c.contractId} c={c} />)}
        {view.recommendations?.map((rec) => <ScoreCard key={rec.invoiceCid} rec={rec} />)}
        {seesOffer
          ? offers.map((c) => <OfferCard key={c.contractId} c={c} />)
          : offerExistsGlobally && <RedactionCard margin={margin} />}
        {(g.FinancedReceivable ?? []).map((c) => <ReceivableCard key={c.contractId} c={c} />)}
        {(g.Cash ?? []).map((c) => <CashCard key={c.contractId} c={c} />)}
        {total === 0 && !offerExistsGlobally && <div className="empty">no visible contracts</div>}
      </div>

      <footer className="panel-foot">{total} contract{total === 1 ? '' : 's'} on this participant’s node</footer>
    </section>
  );
};

const Spotlight = ({ views, margin }: { views: RoleView[]; margin: number | null }) => {
  if (margin == null) return null;
  const canSee = views.filter((v) => (v.groups.FinancingOffer ?? []).length > 0).map((v) => v.displayName);
  const cannot = views.filter((v) => (v.groups.FinancingOffer ?? []).length === 0).map((v) => v.displayName);
  return (
    <div className="spotlight">
      <span className="spot-tag">MONEY-SHOT</span>
      <span className="spot-text">
        The <b className="brass">{pct(margin)}</b> financier margin is disclosed to <b>{canSee.join(' & ')}</b>,
        and <b className="rose">withheld by Canton</b> from <b>{cannot.join(' & ')}</b>. Same invoice - four nodes, two views.
      </span>
    </div>
  );
};

export const App = () => {
  const [views, setViews] = useState<RoleView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetchViews().then(setViews).catch((e) => setError(String(e)));
  };
  useEffect(load, []);

  const margin = (() => {
    const withOffer = views?.find((v) => (v.groups.FinancingOffer ?? []).length > 0);
    const o = withOffer?.groups.FinancingOffer?.[0];
    return o ? Number(o.discountRate) : null;
  })();

  return (
    <div className="app">
      <header className="masthead">
        <div className="brand">
          <div className="brand-mark">
            <span className="live-dot" /> CANTON SANDBOX · LIVE
          </div>
          <h1>Ledger<span className="brass">Factor</span></h1>
          <p className="lede">
            Confidential invoice financing. Each column below is a live query to the ledger
            <b> as that party</b> - disclosure is enforced by Canton, not by this UI.
          </p>
        </div>
      </header>

      {views && <Spotlight views={views} margin={margin} />}

      {error && <div className="error">Cannot reach the ledger gateway: {error}</div>}
      {!views && !error && <div className="loading">querying the ledger as four parties…</div>}

      {views && (
        <main className="grid">
          {views.map((v) => <Panel key={v.role} view={v} margin={margin} />)}
        </main>
      )}

      <footer className="colophon">
        <span>Daml · Canton · JSON Ledger API</span>
        <button className="refresh" onClick={load}>↻ re-query ledger</button>
      </footer>
    </div>
  );
};
