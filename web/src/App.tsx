import { useEffect, useRef, useState } from 'react';
import { action, fetchViews } from './api';
import { mountBackground } from './background';
import { AuctionBoard } from './AuctionBoard';
import { Contract, Recommendation, RoleView, Underwrite } from './types';

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

const TENOR = 60;

interface Step {
  key: string;
  label: string;
  cta: string;
  note: string;
}
const STEPS: Step[] = [
  { key: 'issue', label: 'Issue', cta: 'Supplier issues the invoice',
    note: 'The supplier creates the receivable on the ledger. It shows up in the Supplier and Buyer party views - the Financier cannot see it yet.' },
  { key: 'confirm', label: 'Confirm', cta: 'Buyer confirms the payable',
    note: 'Only the buyer can approve. This is the buyer accepting that it owes this amount.' },
  { key: 'list', label: 'List', cta: 'Supplier lists it to the financier',
    note: 'The supplier discloses the invoice to a chosen financier. Now - and only now - the financier’s party view can read it, which is what lets the AI underwrite it.' },
  { key: 'underwrite', label: 'Underwrite', cta: 'AI agent underwrites the risk',
    note: 'The scoring agent reads the invoice the financier is entitled to see and recommends a discount rate and a decision.' },
  { key: 'offer', label: 'Offer', cta: 'Financier makes the offer',
    note: '★ Watch the four columns. The MARGIN card appears only on Supplier and Financier. Buyer and Auditor get a redaction bar - the ledger never sends the rate to their party views.' },
  { key: 'finance', label: 'Settle', cta: 'Financier funds - atomic DvP',
    note: 'Cash to the supplier and the receivable to the financier, in one transaction. The original invoice is consumed, so it can never be financed twice. The auditor sees face value only.' },
];

const StatusPill = ({ status }: { status: string }) => (
  <span className={`pill pill-${status.toLowerCase()}`}>{status}</span>
);

const InvoiceCard = ({ c }: { c: Contract }) => (
  <article className="card enter">
    <div className="card-kicker">RECEIVABLE · INVOICE</div>
    <div className="card-title">{String(c.description)}</div>
    <div className="figure">{money(c.amount)}</div>
    <div className="card-foot">
      <StatusPill status={String(c.status)} />
      {Array.isArray(c.financiers) && c.financiers.length > 0 ? <span className="tag tag-eye">listed to financier</span> : <span className="tag tag-dim">not yet listed</span>}
    </div>
  </article>
);

const OfferCard = ({ c }: { c: Contract }) => {
  const face = Number(c.faceAmount);
  const rate = Number(c.discountRate);
  return (
    <article className="card card-sensitive pop">
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
      <div className="card-foot"><span className="tag tag-eye">disclosed: financier + supplier</span></div>
    </article>
  );
};

const RedactionCard = ({ margin }: { margin: number | null }) => (
  <article className="card card-redacted pop">
    <div className="card-kicker redacted-kicker">FINANCING TERMS</div>
    <div className="redaction-bar">
      <span className="lock">⊘</span>
      <span className="redaction-strip" aria-hidden />
    </div>
    <div className="redacted-note">
      Withheld by the Canton ledger from this participant.
      {margin != null && <span className="redacted-sub"> A margin exists on a contract this party is not a stakeholder of.</span>}
    </div>
  </article>
);

const ReceivableCard = ({ c }: { c: Contract }) => (
  <article className="card enter">
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
  <article className="card card-cash enter">
    <div className="card-kicker">CASH · MOCK SETTLEMENT</div>
    <div className="figure brass">{money(c.amount)}</div>
    <div className="card-foot"><span className="tag tag-dim">held on ledger</span></div>
  </article>
);

const bandClass = (b: string) => `band band-${b.toLowerCase()}`;

const ScoreCard = ({ rec }: { rec: Recommendation }) => {
  const r = rec.result;
  return (
    <article className="card card-score enter">
      <div className="card-kicker">AI UNDERWRITING · {rec.description.toUpperCase()}</div>
      <div className="score-head">
        <div className="score-num">{r.creditScore}<span className="score-den">/100</span></div>
        <div className={bandClass(r.riskBand)}>{r.riskBand}</div>
        <div className={`decision decision-${r.decision}`}>{r.decision}</div>
      </div>
      <div className="rate-line"><span>recommended discount</span><span className="rate-val">{pct(r.recommendedDiscountRate)}</span></div>
      <div className="submeters">
        {(['reliability', 'concentration', 'dilution', 'size'] as const).map((k) => (
          <div className="submeter" key={k}>
            <div className="submeter-label">{k}</div>
            <div className="submeter-track"><div className="submeter-fill" style={{ width: `${r.subScores[k] * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </article>
  );
};

const Panel = ({ view, margin }: { view: RoleView; margin: number | null }) => {
  const meta = ROLE_META[view.role];
  const g = view.groups;
  const offers = g.FinancingOffer ?? [];
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
          : margin != null && <RedactionCard margin={margin} />}
        {(g.FinancedReceivable ?? []).map((c) => <ReceivableCard key={c.contractId} c={c} />)}
        {(g.Cash ?? []).map((c) => <CashCard key={c.contractId} c={c} />)}
        {total === 0 && margin == null && <div className="empty">nothing in this party’s view yet</div>}
      </div>
      <footer className="panel-foot">{total} contract{total === 1 ? '' : 's'} in this party’s view</footer>
    </section>
  );
};

export const App = () => {
  const [views, setViews] = useState<RoleView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'direct' | 'auction'>('direct');
  const [amount, setAmount] = useState(100000);
  const [description, setDescription] = useState('Q3 pallet delivery');
  const [stepIdx, setStepIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [underwrite, setUnderwrite] = useState<Underwrite | null>(null);
  const invoiceCid = useRef<string | null>(null);
  const offerCid = useRef<string | null>(null);
  const underwriteRef = useRef<Underwrite | null>(null);
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!bgRef.current) return;
    return mountBackground(bgRef.current);
  }, []);

  const refresh = async () => {
    try { setViews(await fetchViews()); } catch (e) { setError(String(e)); }
  };
  useEffect(() => { refresh(); }, []);

  const margin = (() => {
    const o = views?.find((v) => (v.groups.FinancingOffer ?? []).length > 0)?.groups.FinancingOffer?.[0];
    return o ? Number(o.discountRate) : null;
  })();

  useEffect(() => {
    if (stepIdx >= 5 && margin != null) {
      const el = bgRef.current as (HTMLCanvasElement & { __routeMargin?: () => void }) | null;
      el?.__routeMargin?.();
    }
  }, [stepIdx, margin]);

  const pause = (ms = 1400) => new Promise((r) => setTimeout(r, ms));

  const runStep = async (key: string) => {
    if (key === 'issue') { const r = await action('invoice', { amount, description }); invoiceCid.current = r.invoiceCid; }
    else if (key === 'confirm') { const r = await action('confirm', { invoiceCid: invoiceCid.current }); invoiceCid.current = r.invoiceCid; }
    else if (key === 'list') { const r = await action('list', { invoiceCid: invoiceCid.current }); invoiceCid.current = r.invoiceCid; }
    else if (key === 'underwrite') {
      const r = await action('underwrite', { amount, tenorDays: TENOR });
      underwriteRef.current = r;
      setUnderwrite(r);
    }
    else if (key === 'offer') {
      const rate = underwriteRef.current?.result.recommendedDiscountRate;
      if (rate == null) throw new Error('the AI underwriting step must run before the offer');
      const r = await action('offer', { invoiceCid: invoiceCid.current, faceAmount: amount, discountRate: rate });
      offerCid.current = r.offerCid;
    } else if (key === 'finance') { await action('finance', { offerCid: offerCid.current, faceAmount: amount }); }
  };

  const handleErr = async (e: unknown) => {
    const msg = String(e);
    if (/CONTRACT_NOT_FOUND|404|not ready|not found/i.test(msg)) {
      invoiceCid.current = null;
      offerCid.current = null;
      underwriteRef.current = null;
      setUnderwrite(null);
      setStepIdx(0);
      setError('The demo ledger changed (it restarted, or your session reset). Press the first step or ▶▶ Auto-play to run a fresh deal.');
    } else {
      setError('Action failed - ' + msg.replace(/^Error:\s*/, '').slice(0, 180));
    }
    await refresh();
  };

  const next = async () => {
    setBusy(true);
    setError(null);
    try { await runStep(STEPS[stepIdx].key); setStepIdx((i) => i + 1); await refresh(); }
    catch (e) { await handleErr(e); }
    finally { setBusy(false); }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await action('reset');
      invoiceCid.current = null; offerCid.current = null; underwriteRef.current = null;
      setUnderwrite(null); setStepIdx(0); setError(null);
      await refresh();
    } catch (e) { await handleErr(e); } finally { setBusy(false); }
  };

  const autoplay = async () => {
    setBusy(true);
    setError(null);
    try {
      await action('reset');
      invoiceCid.current = null; offerCid.current = null; underwriteRef.current = null;
      setUnderwrite(null); setStepIdx(0);
      await refresh();
      await pause(900);
      for (let i = 0; i < STEPS.length; i++) {
        await runStep(STEPS[i].key);
        setStepIdx(i + 1);
        await refresh();
        await pause(STEPS[i].key === 'offer' ? 4800 : 3000);
      }
    } catch (e) { await handleErr(e); }
    finally { setBusy(false); }
  };

  const started = stepIdx > 0 || busy;
  const connected = views != null && !error;
  const done = stepIdx >= STEPS.length;
  const current = STEPS[Math.min(stepIdx, STEPS.length - 1)];
  const showDisclosureBanner = stepIdx >= 5 && margin != null;

  return (
    <>
    <canvas className="bgfx" ref={bgRef} aria-hidden />
    <div className="app">
      <header className="masthead">
        <div className={`brand-mark${connected ? '' : ' offline'}`}><span className={`live-dot${connected ? '' : ' off'}`} /> CANTON SANDBOX · {connected ? 'LIVE' : 'CONNECTING'}</div>
        <h1>Ledger<span className="brass">Factor</span></h1>
        <p className="lede">
          A supplier sells a buyer-approved invoice to a financier. Drive the deal below and watch the four
          party views side by side - the financier’s <b>margin is disclosed to only two of them</b>, enforced
          by Canton, not by this page.
        </p>
        <div className="vld-modeswitch" role="tablist" aria-label="Demo mode">
          <button role="tab" aria-selected={mode === 'direct'} className={mode === 'direct' ? 'on' : ''} onClick={() => setMode('direct')}>Direct financing</button>
          <button role="tab" aria-selected={mode === 'auction'} className={mode === 'auction' ? 'on-rose' : ''} onClick={() => setMode('auction')}>Sealed auction · Veild</button>
        </div>
      </header>

      {mode === 'auction' ? <AuctionBoard /> : <>
      <section className="deck">
        <div className="deck-controls">
          <label className="field">
            <span>Invoice amount</span>
            <input type="number" value={amount} disabled={started} min={1000} step={1000}
              onChange={(e) => setAmount(Number(e.target.value))} />
          </label>
          <label className="field field-wide">
            <span>Description</span>
            <input type="text" value={description} disabled={started}
              onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="deck-actions">
            {!done && (
              <button className="btn btn-primary" onClick={next} disabled={busy || (!started && amount < 1000)}>
                {busy ? '…' : `${stepIdx + 1}. ${current.cta}`} <span className="arrow">▶</span>
              </button>
            )}
            {stepIdx === 0 && !busy && (
              <button className="btn btn-ghost" onClick={autoplay} disabled={busy || amount < 1000}>▶▶ Auto-play</button>
            )}
            {(started || done) && (
              <button className="btn btn-ghost" onClick={reset} disabled={busy}>↺ Reset</button>
            )}
          </div>
        </div>

        <ol className="stepper">
          {STEPS.map((s, i) => (
            <li key={s.key} className={`step ${i < stepIdx ? 'done' : ''} ${i === stepIdx ? 'active' : ''}`}>
              <span className="step-dot">{i < stepIdx ? '✓' : i + 1}</span>
              <span className="step-label">{s.label}</span>
            </li>
          ))}
        </ol>

        <p className="narration">
          {stepIdx === 0 && !busy
            ? 'Set an amount, then step through the deal - or hit Auto-play to watch the whole story narrate itself.'
            : done ? 'Deal settled. The invoice is consumed (it can never be financed twice), the supplier is paid, and the auditor sees face value only. Hit Reset to run it again.'
            : (STEPS[Math.max(0, stepIdx - 1)] ?? current).note}
        </p>

        {underwrite && (
          <div className="uw-strip">
            <span className="uw-badge" title={underwrite.memoSource === 'model' ? 'memo written live by the model' : 'deterministic rule-based memo (model not called)'}>
              {underwrite.memoSource === 'model' ? 'AI' : 'RULES'}
            </span>
            <b>{underwrite.result.creditScore}/100 · band {underwrite.result.riskBand} · {underwrite.result.decision}</b>
            <span className="uw-rate">recommends {pct(underwrite.result.recommendedDiscountRate)}</span>
            <span className="uw-memo">{underwrite.memo.split('\n')[0]}</span>
          </div>
        )}
      </section>

      {showDisclosureBanner && (
        <div className="spotlight">
          <span className="spot-tag">🔒 THE MONEY-SHOT</span>
          <span className="spot-text">
            The <b className="brass">{pct(margin)}</b> margin is now on the ledger - but it only appears in the
            <b> Supplier</b> and <b> Financier</b> columns. <b className="rose">Buyer</b> and <b className="rose">Auditor</b> get a
            redaction bar; their party views never received the rate.
          </span>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {views && (
        <main className="grid">
          {views.map((v) => <Panel key={v.role} view={v} margin={margin} />)}
        </main>
      )}

      <footer className="colophon">
        <span>Daml · Canton · JSON Ledger API - each column is a live query as that party</span>
        <button className="refresh" onClick={refresh} disabled={busy}>↻ re-query</button>
      </footer>
      </>}
    </div>
    </>
  );
};
