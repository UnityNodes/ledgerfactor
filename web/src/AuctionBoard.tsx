import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openAuction, bidAuction, closeAuction, resetAuction, viewAuction } from './api';
import { AuctionView, AuctionBidderMeta } from './types';

/* ============================================================
   VEILD · SEALED-BID INVOICE AUCTION
   Each blind bid is a wax-sealed envelope. The View-as control
   re-queries the ledger AS a party: your own envelope opens,
   rivals stay sealed; the supplier (auctioneer) opens them all;
   buyer/auditor see no pricing at all. On close the lowest bid
   wins and losing envelopes stay sealed forever.
   ============================================================ */

const money = (x: unknown): string =>
  '$' + Number(x ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const pct = (x: number): string => (x * 100).toFixed(2) + '%';

type Phase = 'idle' | 'opening' | 'open' | 'collecting' | 'collected' | 'closing' | 'closed';

const APPETITE: Record<string, string> = {
  aggressive: 'aggressive appetite · thin margins',
  balanced: 'balanced appetite · fair rate',
  conservative: 'conservative appetite · wide cushion',
};

const ORDINAL = ['one', 'two', 'three', 'four', 'five'];

/* Deterministic short commit-style hash for a sealed envelope. */
const commitHash = (key: string): string => {
  let x = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    x ^= key.charCodeAt(i);
    x = Math.imul(x, 16777619) >>> 0;
  }
  const hex = x.toString(16).padStart(8, '0');
  return `commit ${hex.slice(0, 4)}…${hex.slice(4, 8)}`;
};

const keyFromName = (name: string, meta: AuctionBidderMeta[]): string =>
  meta.find((m) => m.name === name)?.key ?? name.toLowerCase().split(' ')[0];

/* ------------------------------------------------------------------ */
/*  ONE ENVELOPE                                                       */
/* ------------------------------------------------------------------ */
type EnvState = 'empty' | 'sealed' | 'open' | 'masked';

interface EnvProps {
  name: string;
  initial: string;
  ordinal: string;
  index: number;
  state: EnvState;
  rate?: number;
  faceAmount: number;
  winner: boolean;
  isMine: boolean;
  best: boolean;
  closed: boolean;
}

const Envelope = ({
  name,
  initial,
  ordinal,
  index,
  state,
  rate,
  faceAmount,
  winner,
  isMine,
  best,
  closed,
}: EnvProps) => {
  if (state === 'masked') {
    return (
      <article className="env env-masked" style={{ animationDelay: `${0.06 + index * 0.09}s` }}>
        <div className="env-masked-body">
          <div className="env-masked-role">Bidder {ordinal}</div>
          <div className="env-masked-title">No pricing visible</div>
          <div className="env-masked-note">This party sees that an auction exists and settles, nothing more.</div>
        </div>
      </article>
    );
  }

  if (state === 'open' && rate != null) {
    const advance = faceAmount * (1 - rate);
    const spread = faceAmount * rate;
    const rateStr = (rate * 100).toFixed(2);
    return (
      <article className={`env env-open ${winner ? 'is-winner' : ''}`} style={{ animationDelay: `${0.06 + index * 0.09}s` }}>
        <div className="env-open-lid">
          <span className="env-open-broke">Seal broken</span>
          <span className="env-open-wax"><span>{initial}</span></span>
        </div>
        <div className="env-open-body">
          <div className="env-slip">
            <div className="env-slip-label">Discount rate</div>
            <div className="env-slip-rate">{rateStr}<span className="env-slip-pct">%</span></div>
            <div className="env-slip-sub">advance {money(advance)} · spread {money(spread)}</div>
          </div>
          <div className="env-open-name">{name}</div>
          {winner ? (
            <div className="env-open-foot"><span className="env-chip lime">{closed ? 'Lowest bid. Won' : 'Lowest bid. Wins on close'}</span></div>
          ) : isMine ? (
            <div className="env-open-foot"><span className="env-chip ghost">Your bid</span></div>
          ) : best ? (
            <div className="env-open-foot"><span className="env-chip ghost">Lowest so far</span></div>
          ) : null}
        </div>
      </article>
    );
  }

  // sealed / empty
  const empty = state === 'empty';
  return (
    <article className="env env-sealed" style={{ animationDelay: `${0.06 + index * 0.09}s` }}>
      <div className="env-flap" aria-hidden>
        <span className="env-wax"><span className="env-wax-inner">{empty ? '·' : initial}</span></span>
      </div>
      <div className="env-sealed-body">
        <div className="env-sealed-from">{name}</div>
        <div className="env-sealed-title">{empty ? 'Awaiting bid' : 'Sealed bid'}</div>
        <div className="env-sealed-hash">{empty ? 'no envelope yet' : commitHash(name + index)}</div>
        <div className="env-sealed-note">
          {empty
            ? 'This financier has not sealed a bid yet.'
            : closed
              ? 'Lost. This bid is never revealed.'
              : 'Bid submitted. Contents withheld by the ledger.'}
        </div>
      </div>
    </article>
  );
};

/* ------------------------------------------------------------------ */
/*  BOARD                                                              */
/* ------------------------------------------------------------------ */
export function AuctionBoard() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [amount, setAmount] = useState(100000);
  const [description, setDescription] = useState('Q3 pallet delivery');
  const [bidders, setBidders] = useState<AuctionBidderMeta[]>([]);
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState<string>('supplier');
  const [view, setView] = useState<AuctionView | null>(null);
  const [winner, setWinner] = useState<{ name: string; rate: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [requerying, setRequerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invoiceCid = useRef<string | null>(null);
  const loadSeq = useRef(0);

  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const started = phase !== 'idle' && phase !== 'opening';
  const bidsIn = Object.values(submitted).filter(Boolean).length;
  const allSealed = bidders.length > 0 && bidsIn === bidders.length;
  const revealReady = phase === 'collected' || phase === 'closed';

  const viewers = useMemo(() => {
    const financiers = bidders.map((b) => ({ key: b.key, label: b.name.split(' ')[0], role: 'Financier' }));
    return [
      { key: 'supplier', label: 'Supplier', role: 'Auctioneer' },
      ...financiers,
      { key: 'buyer', label: 'Buyer', role: 'Observer' },
      { key: 'auditor', label: 'Auditor', role: 'Observer' },
    ];
  }, [bidders]);

  const loadView = useCallback(async (v: string, soft = false) => {
    const seq = ++loadSeq.current;
    if (!soft) setRequerying(true);
    try {
      const av = await viewAuction(v);
      if (seq === loadSeq.current) {
        setView(av);
        setError(null);
      }
    } catch (e) {
      if (seq === loadSeq.current) setError(String(e).replace(/^Error:\s*/, '').slice(0, 160));
    } finally {
      if (seq === loadSeq.current) setRequerying(false);
    }
  }, []);

  useEffect(() => {
    if (revealReady) void loadView(viewer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, phase]);

  const fail = (e: unknown) => setError(String(e).replace(/^Error:\s*/, '').slice(0, 160));

  const handleOpen = async () => {
    setBusy(true);
    setError(null);
    setPhase('opening');
    try {
      const r = await openAuction(amount, description);
      invoiceCid.current = r.invoiceCid;
      setBidders(r.bidders);
      setSubmitted({});
      setWinner(null);
      setViewer('supplier');
      setPhase('open');
    } catch (e) {
      fail(e);
      setPhase('idle');
    } finally {
      setBusy(false);
    }
  };

  const collectOne = async (b: AuctionBidderMeta) => {
    if (!invoiceCid.current || submitted[b.key]) return;
    setBusy(true);
    setError(null);
    setPhase('collecting');
    try {
      await bidAuction(invoiceCid.current, b.key, amount);
      setSubmitted((s) => {
        const next = { ...s, [b.key]: true };
        if (Object.values(next).filter(Boolean).length === bidders.length) {
          setViewer('supplier');
          setPhase('collected');
        } else {
          setPhase('open');
        }
        return next;
      });
    } catch (e) {
      fail(e);
      setPhase('open');
    } finally {
      setBusy(false);
    }
  };

  const collectAll = async () => {
    if (!invoiceCid.current) return;
    setBusy(true);
    setError(null);
    setPhase('collecting');
    try {
      for (const b of bidders) {
        if (submitted[b.key]) continue;
        await bidAuction(invoiceCid.current, b.key, amount);
        setSubmitted((s) => ({ ...s, [b.key]: true }));
        await new Promise((r) => setTimeout(r, reducedMotion ? 60 : 520));
      }
      setViewer('supplier');
      setPhase('collected');
    } catch (e) {
      fail(e);
      setPhase('open');
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    setBusy(true);
    setError(null);
    setPhase('closing');
    try {
      const r = await closeAuction(amount);
      setWinner(r.winner);
      setViewer('supplier');
      setPhase('closed');
      await loadView('supplier', true);
    } catch (e) {
      fail(e);
      setPhase('collected');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    loadSeq.current++;
    try {
      await resetAuction();
    } catch {
      /* ignore */
    }
    invoiceCid.current = null;
    setBidders([]);
    setSubmitted({});
    setView(null);
    setWinner(null);
    setViewer('supplier');
    setError(null);
    setPhase('idle');
    setBusy(false);
  };

  const autoplay = async () => {
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    setBusy(true);
    setError(null);
    try {
      await resetAuction();
      invoiceCid.current = null;
      setSubmitted({});
      setWinner(null);
      setView(null);
      setViewer('supplier');
      setPhase('idle');
      await pause(400);

      setPhase('opening');
      const o = await openAuction(amount, description);
      invoiceCid.current = o.invoiceCid;
      setBidders(o.bidders);
      setSubmitted({});
      setWinner(null);
      setViewer('supplier');
      setPhase('open');
      await pause(1300);

      setPhase('collecting');
      for (const b of o.bidders) {
        await bidAuction(o.invoiceCid, b.key, amount);
        setSubmitted((s) => ({ ...s, [b.key]: true }));
        await pause(1000);
      }
      setPhase('collected');
      await loadView('supplier');
      await pause(1600);

      setViewer(o.bidders[0].key);
      await loadView(o.bidders[0].key);
      await pause(3200);
      setViewer('supplier');
      await loadView('supplier');
      await pause(1900);

      setPhase('closing');
      const r = await closeAuction(amount);
      setWinner(r.winner);
      setViewer('supplier');
      setPhase('closed');
      await loadView('supplier');
    } catch (e) {
      fail(e);
      setPhase('idle');
    } finally {
      setBusy(false);
    }
  };

  const visibleByKey = useMemo(() => {
    const m: Record<string, number> = {};
    view?.visibleBids.forEach((b) => (m[keyFromName(b.bidder, bidders)] = b.rate));
    return m;
  }, [view, bidders]);

  const bestRate = useMemo(() => {
    const rates = view?.visibleBids.map((b) => b.rate) ?? [];
    return rates.length ? Math.min(...rates) : null;
  }, [view]);

  const winnerKey = winner ? keyFromName(winner.name, bidders) : null;
  const isSupplierView = viewer === 'supplier';
  const isFinancierView = bidders.some((b) => b.key === viewer);
  const noPricingView = viewer === 'buyer' || viewer === 'auditor';
  const viewerMeta = viewers.find((v) => v.key === viewer);

  const viewNote =
    isSupplierView
      ? 'You are the supplier, the auctioneer. Every envelope opens for you.'
      : isFinancierView
        ? `You are ${viewerMeta?.label}. Your own envelope opens for you. Rival bids stay sealed.`
        : viewer === 'buyer'
          ? 'You are the buyer. You see that an auction exists, and nothing about price.'
          : 'You are the auditor. You verify uniqueness and settlement, never pricing.';

  const envelopes = bidders.map((b, i) => {
    const isWinner = phase === 'closed' && winnerKey === b.key;

    let st: EnvState;
    let shownRate: number | undefined;
    if (noPricingView) {
      st = 'masked';
    } else if (phase === 'closed') {
      if (isWinner) { st = 'open'; shownRate = winner?.rate; }
      else st = 'sealed';
    } else {
      const rate = visibleByKey[b.key];
      if (rate != null) { st = 'open'; shownRate = rate; }
      else if (submitted[b.key]) st = 'sealed';
      else st = 'empty';
    }

    const best =
      isSupplierView && phase !== 'closed' && visibleByKey[b.key] != null && visibleByKey[b.key] === bestRate;

    return (
      <Envelope
        key={b.key}
        index={i}
        name={b.name}
        initial={b.name.charAt(0)}
        ordinal={ORDINAL[i] ?? String(i + 1)}
        state={st}
        rate={shownRate}
        faceAmount={amount}
        winner={isWinner}
        isMine={st === 'open' && viewer === b.key && !isWinner}
        best={best}
        closed={phase === 'closed'}
      />
    );
  });

  const statusRight = () => {
    if (phase === 'closed') return <span className="statusbar-chip lilac">Closed. Lowest bid won</span>;
    if (revealReady) return <span className="statusbar-meta">{bidders.length} sealed bids received</span>;
    if (started) return <span className="statusbar-meta">{bidsIn}/{bidders.length} sealed</span>;
    return null;
  };

  return (
    <section className="section">
      <div className="section-head">
        <div className="section-title"><span className="section-no">02</span><h2>Veild sealed bid auction</h2></div>
        <div className="section-note">Three financiers bid blind. On close, the lowest bid wins. Losing bids are never revealed.</div>
      </div>

      {/* ---------------- CONTROL DECK ---------------- */}
      <div className="deck">
        <label className="field">
          <span>Invoice amount</span>
          <input type="number" value={amount} disabled={started || busy} min={1000} step={1000}
            onChange={(e) => setAmount(Number(e.target.value))} />
        </label>
        <label className="field field-wide">
          <span>Description</span>
          <input type="text" value={description} disabled={started || busy}
            onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="deck-actions">
          {phase === 'idle' && (
            <button className="btn btn-primary" onClick={handleOpen} disabled={busy}>
              Open sealed auction <span className="arrow">▶</span>
            </button>
          )}
          {phase === 'idle' && (
            <button className="btn btn-ghost" onClick={autoplay} disabled={busy}>▶▶ Auto-play</button>
          )}
          {(phase === 'open' || phase === 'collecting') && (
            <button className="btn btn-primary" onClick={collectAll} disabled={busy || allSealed}>
              {busy ? 'Sealing…' : 'Seal all three bids'} <span className="arrow">▶</span>
            </button>
          )}
          {phase === 'collected' && isSupplierView && (
            <button className="btn btn-primary" onClick={handleClose} disabled={busy}>
              Close · accept lowest <span className="arrow">▶</span>
            </button>
          )}
          {phase === 'closing' && <button className="btn btn-primary" disabled>Revealing…</button>}
          {started && (
            <button className="btn btn-ghost" onClick={handleReset} disabled={busy}>↺ Reset</button>
          )}
        </div>
      </div>

      {/* ---------------- RAIL ---------------- */}
      <div className="stepflow stepflow-4">
        {[
          { k: 'open', label: 'Open', who: 'Supplier', done: started, active: phase === 'opening' },
          { k: 'seal', label: 'Seal bids', who: 'Financiers', done: allSealed, active: phase === 'open' || phase === 'collecting' },
          { k: 'view', label: 'View as', who: 'Any party', done: phase === 'closed', active: phase === 'collected' },
          { k: 'close', label: 'Reveal', who: 'Supplier', done: phase === 'closed', active: phase === 'closing' },
        ].map((s, i) => (
          <div key={s.k} className={`stepcell ${s.done ? 'done' : s.active ? 'active' : 'pending'} ${s.k === 'close' && s.active ? 'lime' : ''}`}>
            <div className="stepcell-top">
              <span className="stepcell-dot" />
              <span className="stepcell-no">{String(i + 1).padStart(2, '0')}</span>
            </div>
            <div className="stepcell-label">{s.label}</div>
            <div className="stepcell-who">{s.done ? 'Done' : s.active ? 'Now' : s.who}</div>
          </div>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {/* ---------------- STATUS BAR ---------------- */}
      {started && (
        <div className="invoicebar statusbar">
          <span className="overline-sm">Lot</span>
          <span className="mono">{view?.invoice?.description ?? description}</span>
          <span className="bar-sep" />
          <span className="mono">{money(view?.invoice?.amount ?? amount)}</span>
          <span className="bar-sep" />
          {statusRight()}
        </div>
      )}

      {/* ---------------- COLLECT SEALED BIDS ---------------- */}
      {(phase === 'open' || phase === 'collecting') && (
        <div className="collect">
          <div className="collect-head">
            <span className="overline">Collect sealed bids</span>
            <span className="collect-count">{bidsIn}/{bidders.length} sealed</span>
          </div>
          <div className="collect-row">
            {bidders.map((b) => (
              <button
                key={b.key}
                className={`bidder ${submitted[b.key] ? 'sealed' : ''}`}
                disabled={busy || submitted[b.key]}
                onClick={() => collectOne(b)}
              >
                <span className="bidder-wax">{submitted[b.key] ? b.name.charAt(0) : '+'}</span>
                <span className="bidder-meta">
                  <b>{b.name}</b>
                  <em>{APPETITE[b.appetite] ?? b.appetite}</em>
                </span>
                <span className="bidder-state">{submitted[b.key] ? 'Sealed' : 'Submit blind bid'}</span>
              </button>
            ))}
          </div>
          <p className="collect-note">
            Each bid is written to that financier own ledger node. No rival can read it. Sub-transaction
            privacy, not a UI trick. Once all three are in, step through each party view.
          </p>
        </div>
      )}

      {/* ---------------- VIEW-AS + REVEAL ---------------- */}
      {revealReady && (
        <>
          <div className="viewas">
            <span className="overline">View the ledger as</span>
            <div className="viewswitch" role="tablist" aria-label="View auction as party">
              {viewers.map((v) => (
                <button
                  key={v.key}
                  role="tab"
                  aria-selected={viewer === v.key}
                  className={viewer === v.key ? 'on' : ''}
                  disabled={busy}
                  onClick={() => setViewer(v.key)}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <span className="viewas-hint">{requerying ? 're-querying node…' : 'each pick is a live, party-scoped query'}</span>
          </div>

          <div className="viewnote">{viewNote}</div>

          <div className="envgrid">{envelopes}</div>

          {phase === 'collected' && !isSupplierView && !noPricingView && (
            <p className="lockline">
              Only the <b>Supplier</b> can close this auction. Switch to <b>Supplier</b> to accept the lowest bid.
            </p>
          )}

          {phase === 'closed' && winner && !noPricingView && (
            <div className="spotlight">
              <span className="spot-tag">Revealed</span>
              <span className="spot-text">
                <b className="lime">{winner.name}</b> wins the lot at{' '}
                <b className="lime">{pct(winner.rate)}</b>, the lowest sealed bid. Funds advanced, receivable
                assigned, losing envelopes archived.
              </span>
            </div>
          )}
          {phase === 'closed' && winner && noPricingView && (
            <div className="spotlight muted">
              <span className="spot-tag muted">Settled</span>
              <span className="spot-text">
                The auction has settled. You can see the receivable changed hands, but{' '}
                <b className="lilac">not at what rate</b>.
              </span>
            </div>
          )}

          <div className="section-foot">On close the lowest bid wins. Losing envelopes stay sealed forever</div>
        </>
      )}

      {/* ---------------- IDLE HERO ---------------- */}
      {phase === 'idle' && (
        <div className="veild-hero">
          <div className="veild-hero-envs" aria-hidden>
            <span className="veild-mini"><span className="veild-mini-wax">M</span></span>
            <span className="veild-mini"><span className="veild-mini-wax">A</span></span>
            <span className="veild-mini"><span className="veild-mini-wax">C</span></span>
          </div>
          <div className="veild-hero-copy">
            <div className="veild-hero-title">Three sealed envelopes. One auctioneer.</div>
            <p>
              The supplier auctions one buyer-approved invoice. Three financiers each seal a blind discount rate
              inside a wax-stamped envelope. <b>No financier can open another.</b> The Canton ledger only returns a
              bid to the party entitled to it. Open the auction, then flip <b>View as</b> to feel the asymmetry.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
