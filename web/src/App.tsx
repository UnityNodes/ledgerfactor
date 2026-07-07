import { useEffect, useRef, useState } from 'react';
import { action, fetchViews } from './api';
import { mountBackground } from './background';
import { AuctionBoard } from './AuctionBoard';
import { Contract, RoleView, ScoringResult } from './types';

const money = (x: unknown): string =>
  '$' + Number(x ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const pct = (x: number): string => (x * 100).toFixed(2) + '%';
const nodeId = (role: string): string =>
  ({ supplier: 'node::spl', buyer: 'node::buy', financier: 'node::fin', auditor: 'node::adt' } as Record<string, string>)[role] ??
  'node';

const TENOR = 60;

interface Step {
  key: string;
  label: string;
  who: string;
  cta: string;
  note: string;
}
const STEPS: Step[] = [
  { key: 'issue', label: 'Issue', who: 'Supplier', cta: 'Supplier issues the invoice',
    note: 'The supplier creates the receivable on the ledger. It shows up on the Supplier and Buyer nodes. The Financier cannot see it yet.' },
  { key: 'confirm', label: 'Confirm', who: 'Buyer', cta: 'Buyer confirms the payable',
    note: 'Only the buyer can approve. This is the buyer accepting that it owes this amount.' },
  { key: 'list', label: 'List', who: 'Supplier', cta: 'Supplier lists it to the financier',
    note: 'The supplier discloses the invoice to a chosen financier. Now, and only now, the financier node can read it, which is what lets the AI underwrite it.' },
  { key: 'underwrite', label: 'AI underwrite', who: 'Financier', cta: 'AI agent underwrites the risk',
    note: 'The scoring agent reads the invoice the financier is entitled to see and recommends a discount rate and a decision.' },
  { key: 'offer', label: 'Offer', who: 'Now', cta: 'Financier makes the offer',
    note: 'Watch the four nodes. The margin card appears only on Supplier and Financier. Buyer and Auditor get a withheld bar. The ledger never sends the rate to their nodes.' },
  { key: 'finance', label: 'Settle', who: 'Pending', cta: 'Financier funds, atomic DvP',
    note: 'Cash to the supplier and the receivable to the financier, in one transaction. The original invoice is consumed, so it can never be financed twice. The auditor sees face value only.' },
];

const STATUS_LABEL = ['Draft', 'Issued', 'Confirmed', 'Listed', 'Underwritten', 'Offer made', 'Settled'];

const Row = ({ label, value, accent }: { label: string; value: React.ReactNode; accent?: 'lilac' | 'ink' }) => (
  <div className="noderow">
    <span className="noderow-k">{label}</span>
    <span className={`noderow-v ${accent ?? ''}`}>{value}</span>
  </div>
);

const MarginReveal = ({ rate }: { rate: number }) => (
  <div className="marginbox reveal">
    <div className="marginbox-label">Financier margin</div>
    <div className="marginbox-figure">
      {(rate * 100).toFixed(2)}<span className="marginbox-pct">%</span>
    </div>
    <div className="marginbox-note">Visible to this node</div>
  </div>
);

const MarginWithheld = () => (
  <div className="marginbox withheld">
    <div className="marginbox-label">Financier margin</div>
    <div className="marginbox-figure dots">···</div>
    <div className="marginbox-note">Withheld by the ledger</div>
  </div>
);

const first = (arr?: Contract[]): Contract | undefined => (arr && arr.length ? arr[0] : undefined);

const NodeCard = ({ view, margin, financierName }: { view: RoleView; margin: number | null; financierName: string }) => {
  const g = view.groups;
  const invoice = first(g.Invoice);
  const offer = first(g.FinancingOffer);
  const receivable = first(g.FinancedReceivable);
  const cash = first(g.Cash);
  const rec = view.recommendations?.[0];
  const total = Object.values(g).reduce((n, arr) => n + arr.length, 0);
  const seesMargin = offer != null;
  const rate = offer ? Number(offer.discountRate) : margin;

  const invoiceStatus =
    receivable ? 'Settled' : invoice ? String(invoice.status ?? 'Open') : '·';
  const faceAmount = Number(invoice?.amount ?? receivable?.faceAmount ?? 0);

  let rows: React.ReactNode;
  if (view.role === 'supplier') {
    rows = (
      <>
        <Row label="Invoice" value={invoiceStatus} />
        <Row label="Face value" value={faceAmount ? money(faceAmount).slice(1) : '·'} />
        <Row label="Offer from" value={offer ? financierName : receivable ? 'Financed' : '·'} accent="ink" />
      </>
    );
  } else if (view.role === 'buyer') {
    rows = (
      <>
        <Row label="Invoice" value={invoiceStatus} />
        <Row label="Obligation" value={faceAmount ? money(faceAmount).slice(1) : '·'} />
        <Row label="Pay to" value={receivable || (invoice && invoice.financier) ? 'New holder, on due date' : 'Supplier'} accent="ink" />
      </>
    );
  } else if (view.role === 'financier') {
    const advance = rate != null && faceAmount ? faceAmount * (1 - rate) : null;
    rows = (
      <>
        <Row label="Invoice" value={invoice || receivable ? invoiceStatus : 'Not listed'} />
        <Row label="Advance" value={advance != null ? money(advance).slice(1) : '·'} />
        <Row
          label="Underwriting"
          value={rec ? `AI approved, grade ${rec.result.riskBand}` : '·'}
          accent="lilac"
        />
      </>
    );
  } else {
    rows = (
      <>
        <Row label="Invoice exists" value={invoice || receivable ? 'Proven' : '·'} accent="lilac" />
        <Row label="Financed once" value={receivable ? 'Proven' : offer ? 'In progress' : '·'} accent={receivable ? 'lilac' : undefined} />
        <Row label="Parties" value="Verified" accent="ink" />
      </>
    );
  }

  return (
    <section className="nodecard">
      <div className="nodecard-head">
        <span className="nodecard-role">{view.role}</span>
        <span className="nodecard-id">{nodeId(view.role)}</span>
      </div>
      <div className="nodecard-name">{view.displayName}</div>
      <div className="nodecard-rows">{rows}</div>
      {cash && <div className="nodecard-cash">Cash held · {money(cash.amount)}</div>}
      {seesMargin && rate != null ? (
        <MarginReveal rate={rate} />
      ) : margin != null ? (
        <MarginWithheld />
      ) : (
        <div className="marginbox neutral">
          <div className="marginbox-label">Financier margin</div>
          <div className="marginbox-figure quiet">·</div>
          <div className="marginbox-note">{total ? 'No offer yet' : 'No contracts yet'}</div>
        </div>
      )}
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
  const [underwrite, setUnderwrite] = useState<{ result: ScoringResult; memo: string } | null>(null);
  const invoiceCid = useRef<string | null>(null);
  const offerCid = useRef<string | null>(null);
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

  const pause = (ms = 1400) => new Promise((r) => setTimeout(r, ms));

  const runStep = async (key: string) => {
    if (key === 'issue') { const r = await action('invoice', { amount, description }); invoiceCid.current = r.invoiceCid; }
    else if (key === 'confirm') { const r = await action('confirm', { invoiceCid: invoiceCid.current }); invoiceCid.current = r.invoiceCid; }
    else if (key === 'list') { const r = await action('list', { invoiceCid: invoiceCid.current }); invoiceCid.current = r.invoiceCid; }
    else if (key === 'underwrite') { setUnderwrite(await action('underwrite', { amount, tenorDays: TENOR })); }
    else if (key === 'offer') {
      const rate = underwrite?.result.recommendedDiscountRate ?? 0.02;
      const r = await action('offer', { invoiceCid: invoiceCid.current, faceAmount: amount, discountRate: rate });
      offerCid.current = r.offerCid;
    } else if (key === 'finance') { await action('finance', { offerCid: offerCid.current, faceAmount: amount }); }
  };

  const handleErr = async (e: unknown) => {
    const msg = String(e);
    if (/CONTRACT_NOT_FOUND|404|not ready|not found/i.test(msg)) {
      invoiceCid.current = null;
      offerCid.current = null;
      setUnderwrite(null);
      setStepIdx(0);
      setError('The demo ledger changed (it restarted, or your session reset). Press the first step or Auto-play to run a fresh deal.');
    } else {
      setError('Action failed. ' + msg.replace(/^Error:\s*/, '').slice(0, 180));
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
      invoiceCid.current = null; offerCid.current = null;
      setUnderwrite(null); setStepIdx(0); setError(null);
      await refresh();
    } finally { setBusy(false); }
  };

  const autoplay = async () => {
    setBusy(true);
    setError(null);
    try {
      await action('reset');
      invoiceCid.current = null; offerCid.current = null; setUnderwrite(null); setStepIdx(0);
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
  const done = stepIdx >= STEPS.length;
  const current = STEPS[Math.min(stepIdx, STEPS.length - 1)];
  const showSpotlight = stepIdx >= 5 && margin != null;
  const statusLabel = STATUS_LABEL[Math.min(stepIdx, STATUS_LABEL.length - 1)];

  return (
    <>
      <canvas className="bgfx" ref={bgRef} aria-hidden />
      <div className="wrap">
        {/* ============ MASTHEAD ============ */}
        <header className="masthead">
          <div className="masthead-l">
            <div className="brand">
              <span className="brand-diamond" />
              <span className="brand-word">Ledger<span className="lime">Factor</span></span>
            </div>
            <span className="chip"><span className="live-dot" /> Canton sandbox · live</span>
          </div>
          <div className="masthead-r">Confidential by construction</div>
        </header>

        {/* ============ HERO ============ */}
        <section className="hero">
          <div className="hero-grid">
            <div>
              <div className="kicker"><span className="kicker-tick" />Confidential invoice financing</div>
              <h1 className="hero-title">
                The price is private. <span className="lilac">The proof is in the ledger.</span>
              </h1>
              <p className="hero-lede">
                A supplier sells a buyer-approved invoice to a financier. The financier discount rate is hidden from
                the buyer by the Canton protocol, and the ledger structurally prevents the same invoice from being
                financed twice.
              </p>
            </div>
            <div className="hero-mode">
              <div className="overline">Choose a mode</div>
              <div className="modeswitch" role="tablist" aria-label="Demo mode">
                <button role="tab" aria-selected={mode === 'direct'} className={mode === 'direct' ? 'on' : ''} onClick={() => setMode('direct')}>Direct financing</button>
                <button role="tab" aria-selected={mode === 'auction'} className={mode === 'auction' ? 'on' : ''} onClick={() => setMode('auction')}>Veild sealed bid</button>
              </div>
              <div className="hero-mode-cap">
                {mode === 'direct'
                  ? 'A guided flow: issue, confirm, list, AI underwrite, offer, settle. One financier, one private price.'
                  : 'A sealed bid auction: three financiers bid blind. The lowest bid wins on close.'}
              </div>
            </div>
          </div>

          <div className="guarantees">
            <div className="guarantee"><span className="g-no">01</span><span>Margin withheld from the buyer, by protocol, not policy</span></div>
            <div className="guarantee"><span className="g-no">02</span><span>One invoice, one financing. Double factoring is structurally impossible</span></div>
            <div className="guarantee"><span className="g-no">03</span><span>Every party holds its own view. No party holds them all</span></div>
          </div>
        </section>

        {mode === 'auction' ? <AuctionBoard /> : (
          <section className="section">
            <div className="section-head">
              <div className="section-title"><span className="section-no">01</span><h2>Direct financing</h2></div>
              <div className="section-note">Same invoice, four nodes, two different views. The moment below is the offer.</div>
            </div>

            {/* Control deck */}
            <div className="deck">
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
                  <button className="btn btn-primary" onClick={next} disabled={busy}>
                    {busy ? '…' : `${stepIdx + 1}. ${current.cta}`} <span className="arrow">▶</span>
                  </button>
                )}
                {stepIdx === 0 && !busy && (
                  <button className="btn btn-ghost" onClick={autoplay} disabled={busy}>▶▶ Auto-play</button>
                )}
                {(started || done) && (
                  <button className="btn btn-ghost" onClick={reset} disabled={busy}>↺ Reset</button>
                )}
              </div>
            </div>

            {/* Step flow */}
            <div className="stepflow">
              {STEPS.map((s, i) => {
                const state = i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'pending';
                return (
                  <div key={s.key} className={`stepcell ${state} ${s.key === 'offer' && i === stepIdx ? 'lime' : ''}`}>
                    <div className="stepcell-top">
                      <span className="stepcell-dot" />
                      <span className="stepcell-no">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <div className="stepcell-label">{s.label}</div>
                    <div className="stepcell-who">{i < stepIdx ? 'Done' : i === stepIdx ? (s.key === 'offer' ? 'Now' : s.who) : s.who}</div>
                  </div>
                );
              })}
            </div>

            {/* Invoice bar */}
            <div className="invoicebar">
              <span className="mono">{description || 'Untitled receivable'}</span>
              <span className="bar-sep" />
              <span className="dim">Supplier <span className="dimmer">to</span> Buyer</span>
              <span className="bar-sep" />
              <span className="mono">{money(amount)}</span>
              <span className="bar-sep" />
              <span className="dim">Due in {TENOR} days</span>
              <span className={`invoicebar-status ${stepIdx >= 5 ? 'lime' : ''}`}>{statusLabel}</span>
            </div>

            <p className="narration">
              {stepIdx === 0 && !busy
                ? 'Set an amount, then step through the deal, or hit Auto-play to watch the whole story narrate itself.'
                : done ? 'Deal settled. The invoice is consumed (it can never be financed twice), the supplier is paid, and the auditor sees face value only. Hit Reset to run it again.'
                : (STEPS[Math.max(0, stepIdx - 1)] ?? current).note}
            </p>

            {underwrite && (
              <div className="uw-strip">
                <span className="uw-badge">AI</span>
                <b>{underwrite.result.creditScore}/100 · band {underwrite.result.riskBand} · {underwrite.result.decision}</b>
                <span className="uw-rate">recommends {pct(underwrite.result.recommendedDiscountRate)}</span>
                <span className="uw-memo">{underwrite.memo.split('\n')[0]}</span>
              </div>
            )}

            {showSpotlight && (
              <div className="spotlight">
                <span className="spot-tag">The money-shot</span>
                <span className="spot-text">
                  The <b className="lime">{pct(margin)}</b> margin is now on the ledger, but it only appears on the
                  <b> Supplier</b> and <b> Financier</b> nodes. <b className="lilac">Buyer</b> and <b className="lilac">Auditor</b> get a
                  withheld bar. Their nodes never received the rate.
                </span>
              </div>
            )}

            {error && <div className="error">{error}</div>}

            {views && (
              <div className="nodes">
                {views.map((v) => (
                  <NodeCard
                    key={v.role}
                    view={v}
                    margin={margin}
                    financierName={views.find((x) => x.role === 'financier')?.displayName ?? 'the financier'}
                  />
                ))}
              </div>
            )}

            <div className="section-foot">Same invoice. Four nodes. Two different views</div>
          </section>
        )}

        {/* ============ FOOTER ============ */}
        <footer className="colophon">
          <span>LedgerFactor. Confidential invoice financing on Canton. Each node is a live query as that party.</span>
          <button className="refresh" onClick={refresh} disabled={busy}>↻ re-query</button>
        </footer>
      </div>
    </>
  );
};
