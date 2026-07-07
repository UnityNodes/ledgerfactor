import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openAuction, bidAuction, closeAuction, resetAuction, viewAuction } from './api';
import { AuctionView, AuctionBidderMeta } from './types';

/* ============================================================
   VEILD - SEALED-BID INVOICE AUCTION · "Sealed Envelopes"
   ------------------------------------------------------------
   Each blind bid lands as a wax-sealed envelope. The VIEW-AS
   control re-queries the ledger AS a party (viewAuction): your
   own envelope's flap lifts to reveal the teal rate; rivals stay
   wax-sealed (rose) with a live hex-scramble bleeding through
   the paper and a travelling rose seal-scanline. Buyer/Auditor
   get a rose PRICING-WITHHELD blackout because visibleBids is
   genuinely []. On CLOSE the winning envelope bursts open in GOLD
   (goldShift rate, light-rake, WON THE LOT ribbon); losers dim
   to 0.42 and settle down.

   TWO grafted, single-sourced credentials sit on every party
   surface (hero, VIEW-AS tabs, identity banner, envelope badges,
   blackout) - both driven by the SAME `clearance` union
   (all | own | none) already governing the envelopes, so they
   can never drift from what the party-scoped ledger returned:

     · IRIS  (from Perspective Split) - what you SEE. A living
       sight-driven eye: teal-master / brass-single / struck-rose.
     · KEY   (from Blind Vault) - WHY you're entitled. A master-
       key ring whose teeth morph: many teeth (Supplier, opens
       everything), one tooth (Financier, opens one), struck rose
       slash (Buyer/Auditor, no key).

   The scramble is PURE CSS (no setInterval) to hold 60fps.
   Gold == disclosed / winning secret ONLY.  Rose == sealed.
   ============================================================ */

const money = (x: unknown): string =>
  '$' + Number(x ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const pct = (x: number): string => (x * 100).toFixed(2) + '%';

type Phase = 'idle' | 'opening' | 'open' | 'collecting' | 'collected' | 'closing' | 'closed';

/* One union single-sources the iris, the key, the hero copy and every envelope. */
type Clearance = 'all' | 'own' | 'none';

interface ViewerMeta {
  key: string;
  label: string;
  role: string;
  accent: string;
  clearance: Clearance;
}

const APPETITE: Record<string, string> = {
  aggressive: 'aggressive appetite · thin margins',
  balanced: 'balanced appetite · fair rate',
  conservative: 'conservative appetite · wide cushion',
};

/* Deterministic hex text for a sealed envelope's scramble bleed. */
const HEXPOOL = 'AF3E9C1D0B7A4E2F8C6D5B1A9E3F7C2D0B8A6E4F1C9D3B7A5E2F8C6D4B0A9E3';
const hexLine = (seed: number, len = 30): string => {
  let out = '';
  let x = (seed * 2654435761) >>> 0;
  for (let i = 0; i < len; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    out += HEXPOOL[x % HEXPOOL.length];
  }
  return out;
};

/* Match a visibleBids bidder-name back to its stable bidder key. */
const keyFromName = (name: string, meta: AuctionBidderMeta[]): string =>
  meta.find((m) => m.name === name)?.key ?? name.toLowerCase().split(' ')[0];

/* ------------------------------------------------------------------ */
/*  IRIS - the identity motif ("what you see").                       */
/*  all  -> wide teal master eye                                      */
/*  own  -> a single brass-ringed eye                                 */
/*  none -> a struck, closed rose eye - blind to pricing              */
/* ------------------------------------------------------------------ */
const Iris = ({ clearance, size = 30 }: { clearance: Clearance; size?: number }) => (
  <span className={`vld-iris sight-${clearance}`} aria-hidden style={{ width: size, height: size }}>
    <svg viewBox="0 0 120 120" width={size} height={size}>
      <defs>
        <radialGradient id={`vld-iris-${clearance}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" className="vld-iris-c0" />
          <stop offset="55%" className="vld-iris-c1" />
          <stop offset="100%" className="vld-iris-c2" />
        </radialGradient>
      </defs>
      <path
        className="vld-iris-almond"
        d="M6 60 Q60 8 114 60 Q60 112 6 60 Z"
        fill="none"
        strokeWidth="2"
      />
      <circle className="vld-iris-disc" cx="60" cy="60" r="30" fill={`url(#vld-iris-${clearance})`} />
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return (
          <line
            key={i}
            className="vld-iris-stria"
            x1={60 + Math.cos(a) * 13}
            y1={60 + Math.sin(a) * 13}
            x2={60 + Math.cos(a) * 29}
            y2={60 + Math.sin(a) * 29}
            strokeWidth="1"
          />
        );
      })}
      <circle className="vld-iris-pupil" cx="60" cy="60" r="12" />
      <circle className="vld-iris-glint" cx="53" cy="53" r="3.4" />
      {clearance === 'none' && (
        <line className="vld-iris-slash" x1="14" y1="98" x2="106" y2="22" strokeWidth="3" />
      )}
    </svg>
  </span>
);

/* ------------------------------------------------------------------ */
/*  KEY - the master-key ring glyph ("why you're entitled").          */
/*  all  -> master key, extra teeth (opens everything)                */
/*  own  -> a single-tooth key (opens one)                            */
/*  none -> no key, struck-through rose slash (no entitlement)        */
/* ------------------------------------------------------------------ */
const KeyGlyph = ({ clearance, size = 30 }: { clearance: Clearance; size?: number }) => {
  const w = size;
  const h = Math.round(size * 0.625);
  return (
    <span className={`vld-key key-${clearance}`} aria-hidden style={{ width: w, height: h }}>
      <svg viewBox="0 0 32 20" width={w} height={h}>
        {clearance === 'none' ? (
          <>
            <circle className="vld-key-bow" cx="9" cy="10" r="4.4" fill="none" strokeWidth="1.5" />
            <line className="vld-key-slash" x1="3" y1="17" x2="29" y2="3" strokeWidth="1.7" />
          </>
        ) : (
          <>
            <circle className="vld-key-bow" cx="8" cy="10" r="4.6" fill="none" strokeWidth="1.6" />
            <circle className="vld-key-pin" cx="8" cy="10" r="1.5" />
            <line className="vld-key-shaft" x1="12.4" y1="10" x2="28" y2="10" strokeWidth="1.8" />
            <line className="vld-key-tooth" x1="24" y1="10" x2="24" y2="14.5" strokeWidth="1.8" />
            {clearance === 'all' && (
              <>
                <line className="vld-key-tooth" x1="26.5" y1="10" x2="26.5" y2="13" strokeWidth="1.8" />
                <line className="vld-key-tooth" x1="28" y1="10" x2="28" y2="15" strokeWidth="1.8" />
              </>
            )}
          </>
        )}
      </svg>
    </span>
  );
};

/* ------------------------------------------------------------------ */
/*  ONE SEALED / OPEN ENVELOPE                                         */
/* ------------------------------------------------------------------ */
interface EnvProps {
  name: string;
  appetite: string;
  index: number;
  submitted: boolean;
  open: boolean;
  rate?: number;
  faceAmount: number;
  winner: boolean;
  loser: boolean;
  best: boolean;
  clearance: Clearance;
}

const Envelope = ({
  name,
  appetite,
  index,
  submitted,
  open,
  rate,
  faceAmount,
  winner,
  loser,
  best,
  clearance,
}: EnvProps) => {
  const cls = [
    'vld-env',
    !submitted ? 'vld-env-empty' : open ? 'vld-env-open' : 'vld-env-sealed',
    winner ? 'vld-env-winner' : '',
    loser ? 'vld-env-loser' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const advance = rate != null ? faceAmount * (1 - rate) : null;
  /* Per-envelope credential: the winning envelope shows the master eye; an open
     envelope shows this viewer's sight; a sealed rival shows the blind (struck) pair. */
  const envSight: Clearance = open ? (winner ? 'all' : clearance === 'all' ? 'all' : 'own') : 'none';
  return (
    <article className={cls} style={{ animationDelay: `${0.06 + index * 0.1}s` }}>
      <div className="vld-env-plate">
        <span className="vld-env-no">{String(index + 1).padStart(2, '0')}</span>
        <span className="vld-env-from">{name}</span>
        <span className="vld-env-cred">
          <Iris clearance={envSight} size={22} />
          <KeyGlyph clearance={envSight} size={24} />
        </span>
      </div>

      <div className="vld-env-paper">
        <div className="vld-env-flap" aria-hidden>
          <div className="vld-wax" aria-hidden>
            <span className="vld-wax-mark">V</span>
          </div>
        </div>

        {!open && (
          <div className="vld-env-face">
            {submitted ? (
              <>
                <div className="vld-scramble" aria-hidden>
                  {[0, 1, 2, 3].map((r) => (
                    <span key={r}>{hexLine(index * 17 + r + (winner || loser ? 5 : 0))}</span>
                  ))}
                </div>
                <div className="vld-env-sealedtag">
                  {winner || loser ? '⊘ WITHHELD' : '◆ SEALED BID'}
                </div>
              </>
            ) : (
              <div className="vld-env-await">awaiting blind bid</div>
            )}
          </div>
        )}

        {open && rate != null && (
          <div className={`vld-env-reveal ${winner ? 'gold' : ''}`}>
            <div className="vld-env-rk">
              {winner ? 'WINNING RATE · ACCEPTED' : 'DISCOUNT RATE · DISCLOSED TO YOU'}
            </div>
            <div className="vld-env-rate">{pct(rate)}</div>
            <div className="vld-env-split">
              <div>
                <div className="vld-env-lab">ADVANCE TO SUPPLIER</div>
                <div className="vld-env-val">{money(advance)}</div>
              </div>
              <div>
                <div className="vld-env-lab">FINANCIER SPREAD</div>
                <div className="vld-env-val gold">{money(faceAmount * rate)}</div>
              </div>
            </div>
            {best && !winner && <div className="vld-env-best">◆ lowest sealed bid</div>}
            {winner && <div className="vld-env-ribbon">WON THE LOT</div>}
          </div>
        )}
      </div>

      <div className="vld-env-appetite">{APPETITE[appetite] ?? appetite}</div>
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
  const [swap, setSwap] = useState(0); // bump to retrigger the credential swap animation
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

  const viewers = useMemo<ViewerMeta[]>(() => {
    const financiers: ViewerMeta[] = bidders.map((b) => ({
      key: b.key,
      label: b.name,
      role: 'FINANCIER',
      accent: 'var(--brass)',
      clearance: 'own',
    }));
    return [
      { key: 'supplier', label: 'Supplier', role: 'AUCTIONEER', accent: 'var(--teal)', clearance: 'all' },
      ...financiers,
      { key: 'buyer', label: 'Buyer', role: 'OBSERVER', accent: 'var(--slate)', clearance: 'none' },
      { key: 'auditor', label: 'Auditor', role: 'OBSERVER', accent: 'var(--muted)', clearance: 'none' },
    ];
  }, [bidders]);

  const loadView = useCallback(async (v: string, soft = false) => {
    const seq = ++loadSeq.current;
    if (!soft) setRequerying(true);
    try {
      const av = await viewAuction(v);
      if (seq === loadSeq.current) {
        setView(av);
        setSwap((n) => n + 1);
        setError(null);
      }
    } catch (e) {
      if (seq === loadSeq.current) setError(String(e).replace(/^Error:\s*/, '').slice(0, 160));
    } finally {
      if (seq === loadSeq.current) setRequerying(false);
    }
  }, []);

  /* Re-query the ledger AS the selected party whenever identity or phase changes. */
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

  /* THE single derived signal that single-sources the iris, the key-ring, the hero
     copy and every envelope, so the picture can never drift from the ledger:
       'all'  = supplier - master key / master eye, every envelope opens
       'own'  = financier - one key / one eye, only their envelope opens
       'none' = buyer/auditor - no key / struck eye, total pricing blackout */
  const clearance: Clearance = isSupplierView ? 'all' : noPricingView ? 'none' : 'own';

  const envelopes = bidders.map((b, i) => {
    const isWinner = phase === 'closed' && winnerKey === b.key;
    const isLoser = phase === 'closed' && winner != null && winnerKey !== b.key;

    /* Post-close the ledger consumes the winning proposal into a FinancedReceivable
       and archives the losers, so viewAuction('supplier').visibleBids is genuinely [].
       The winner's OPEN/gold reveal therefore comes from the retained closeAuction
       winner.rate - NOT from a re-query that no longer carries pricing. Losers stay
       honestly sealed/withheld because the ledger truly withheld their rate. Pre-close
       it's driven purely by what the party-scoped query returned to this viewer. */
    let open: boolean;
    let shownRate: number | undefined;
    if (phase === 'closed') {
      open = isWinner && !noPricingView;
      shownRate = isWinner ? winner?.rate : undefined;
    } else {
      const rate = visibleByKey[b.key];
      open = rate != null && !noPricingView;
      shownRate = open ? rate : undefined;
    }

    return (
      <Envelope
        key={b.key}
        index={i}
        name={b.name}
        appetite={b.appetite}
        submitted={!!submitted[b.key]}
        open={open}
        rate={shownRate}
        faceAmount={amount}
        winner={isWinner}
        loser={isLoser}
        best={
          isSupplierView &&
          phase !== 'closed' &&
          visibleByKey[b.key] != null &&
          visibleByKey[b.key] === bestRate
        }
        clearance={clearance}
      />
    );
  });

  const heroLead =
    clearance === 'all'
      ? 'YOU HOLD THE MASTER KEY, AS'
      : clearance === 'own'
        ? 'YOU HOLD ONE KEY, AS'
        : 'YOU HOLD NO KEY, AS';

  return (
    <div className="vld-wrap">
      {/* ---------------- CONTROL DECK ---------------- */}
      <div className="vld-deck">
        <div className="vld-deck-controls">
          <label className="field">
            <span>Invoice amount</span>
            <input
              type="number"
              value={amount}
              disabled={started || busy}
              min={1000}
              step={1000}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <label className="field field-wide">
            <span>Description</span>
            <input
              type="text"
              value={description}
              disabled={started || busy}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="vld-deck-actions">
            {phase === 'idle' && (
              <button className="btn btn-primary" onClick={handleOpen} disabled={busy}>
                Open sealed auction <span className="arrow">▶</span>
              </button>
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
            {phase === 'closing' && (
              <button className="btn btn-primary" disabled>
                Revealing…
              </button>
            )}
            {started && (
              <button className="btn btn-ghost" onClick={handleReset} disabled={busy}>
                ↺ Reset
              </button>
            )}
          </div>
        </div>

        <ol className="vld-rail">
          {[
            { k: 'open', label: 'Open', done: started, active: phase === 'opening' },
            {
              k: 'seal',
              label: 'Seal bids',
              done: allSealed,
              active: phase === 'open' || phase === 'collecting',
            },
            { k: 'view', label: 'View as…', done: phase === 'closed', active: phase === 'collected' },
            { k: 'close', label: 'Reveal', done: phase === 'closed', active: phase === 'closing' },
          ].map((s) => (
            <li
              key={s.k}
              className={`vld-railstep ${s.done ? 'done' : ''} ${s.active ? 'active' : ''}`}
            >
              <span className="vld-raildot" />
              {s.label}
            </li>
          ))}
        </ol>

        {error && <div className="error vld-error">{error}</div>}
      </div>

      {/* ---------------- COLLECT SEALED BIDS ---------------- */}
      {(phase === 'open' || phase === 'collecting') && (
        <div className="vld-collect">
          <div className="vld-collect-head">
            <span className="vld-collect-kicker">◈ COLLECT SEALED BIDS</span>
            <span className="vld-collect-count">
              {bidsIn}/{bidders.length} sealed
            </span>
          </div>
          <div className="vld-collect-row">
            {bidders.map((b) => (
              <button
                key={b.key}
                className={`vld-bidder ${submitted[b.key] ? 'sealed' : ''}`}
                disabled={busy || submitted[b.key]}
                onClick={() => collectOne(b)}
              >
                <span className="vld-bidder-wax">{submitted[b.key] ? '✦' : '＋'}</span>
                <span className="vld-bidder-meta">
                  <b>{b.name}</b>
                  <em>{APPETITE[b.appetite] ?? b.appetite}</em>
                </span>
                <span className="vld-bidder-state">
                  {submitted[b.key] ? 'SEALED' : 'submit blind bid'}
                </span>
              </button>
            ))}
          </div>
          <p className="vld-collect-note">
            Each bid is written to that financier’s own ledger node. No rival can read it -
            sub-transaction privacy, not a UI trick. Once all three are in, pick up each party’s key.
          </p>
        </div>
      )}

      {/* ---------------- VIEW-AS + REVEAL STAGE ---------------- */}
      {revealReady && (
        <>
          <div className="vld-viewas">
            <div className="vld-viewas-head">
              <span className="vld-viewas-kicker">◈ VIEW LEDGER AS</span>
              <span className="vld-viewas-hint">
                {requerying ? 're-querying node…' : 'each pick is a live, party-scoped query'}
              </span>
            </div>

            {/* Hero credential line: the IRIS (what you see) + KEY (why) + who you are. */}
            <div
              className="vld-hero-line"
              style={{ ['--vaccent' as string]: viewerMeta?.accent ?? 'var(--muted)' }}
            >
              <span key={`cred-${viewer}-${swap}`} className="vld-hero-cred">
                <Iris clearance={clearance} size={68} />
                <span className="vld-hero-keywrap">
                  <KeyGlyph clearance={clearance} size={44} />
                </span>
              </span>
              <span className="vld-hero-textcol">
                <span className="vld-hero-lead">{heroLead}</span>
                <span key={`name-${viewer}-${swap}`} className="vld-hero-id">
                  {view?.displayName ?? viewerMeta?.label}
                  <span className="vld-hero-role">{viewerMeta?.role}</span>
                </span>
                <span className="vld-hero-sub">
                  {clearance === 'all'
                    ? 'master key · every sealed envelope opens for you'
                    : clearance === 'own'
                      ? 'single key · only your own envelope opens; rivals stay wax-sealed'
                      : 'no key · you stand outside; no rate reaches your node'}
                </span>
              </span>
            </div>

            <div className="vld-viewas-tabs" role="tablist" aria-label="View auction as party">
              {viewers.map((v) => (
                <button
                  key={v.key}
                  role="tab"
                  aria-selected={viewer === v.key}
                  className={`vld-vtab vtab-${v.role.toLowerCase()} ${viewer === v.key ? 'sel' : ''}`}
                  style={{ ['--vaccent' as string]: v.accent }}
                  disabled={busy}
                  onClick={() => setViewer(v.key)}
                >
                  <span className="vld-vtab-cred">
                    <Iris clearance={v.clearance} size={26} />
                    <KeyGlyph clearance={v.clearance} size={26} />
                  </span>
                  <span className="vld-vtab-textcol">
                    <span className="vld-vtab-role">{v.role}</span>
                    <span className="vld-vtab-label">{v.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div
            className={`vld-identity ${isSupplierView ? 'all' : ''} ${isFinancierView ? 'mine' : ''} ${
              noPricingView ? 'none' : ''
            }`}
            style={{ ['--vaccent' as string]: viewerMeta?.accent ?? 'var(--muted)' }}
          >
            <span className="vld-identity-cred" aria-hidden>
              <Iris clearance={clearance} size={26} />
              <KeyGlyph clearance={clearance} size={26} />
            </span>
            <span className="vld-identity-badge">
              {view?.displayName ?? viewerMeta?.label} · {view?.subtitle}
            </span>
            <span className="vld-identity-claim">
              {isSupplierView && (
                <>
                  <b className="vld-teal">Every</b> sealed envelope is disclosed to you - you are the
                  auctioneer.
                </>
              )}
              {isFinancierView && (
                <>
                  You see <b className="vld-teal">only your own</b> envelope. Rivals stay{' '}
                  <b className="rose">wax-sealed</b> - the ledger never sent you their rate.
                </>
              )}
              {noPricingView && (
                <>
                  <b className="rose">No pricing</b> reaches your node. {bidders.length} sealed bids
                  exist; you learn none of them.
                </>
              )}
            </span>
            <span className="vld-identity-ledger">
              query · {view?.visibleBids.length ?? 0} visible · {view?.totalContracts ?? 0} contracts
            </span>
          </div>

          {view && (
            <div className="vld-lot">
              <div className="vld-lot-l">
                <div className="vld-lot-kicker">SEALED LOT · BUYER-APPROVED RECEIVABLE</div>
                <div className="vld-lot-title">{view.invoice?.description ?? description}</div>
              </div>
              <div className="vld-lot-face">
                <div className="vld-lot-face-label">FACE VALUE</div>
                <div className="vld-lot-face-val">{money(view.invoice?.amount ?? amount)}</div>
              </div>
              <span className="pill pill-confirmed vld-lot-pill">
                {view.invoice?.status ?? 'OPEN'}
              </span>
            </div>
          )}

          {noPricingView ? (
            <div className="vld-blackout">
              <div className="vld-blackout-glyphs" aria-hidden>
                {Array.from({ length: 7 }).map((_, i) => (
                  <span key={i}>{hexLine(i * 7 + 3, 54)}</span>
                ))}
              </div>
              <div className="vld-blackout-lock">
                <span className="vld-blackout-cred" aria-hidden>
                  <Iris clearance="none" size={56} />
                  <KeyGlyph clearance="none" size={40} />
                </span>
                <div>
                  <div className="vld-blackout-title">PRICING WITHHELD BY THE LEDGER</div>
                  <div className="vld-blackout-sub">
                    {bidders.length} sealed bids exist on this auction. As {viewerMeta?.label}, your
                    node holds no key - not one rate reaches you.
                    {phase === 'closed' && ' The receivable settled; at what rate stays sealed.'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={`vld-wall ${phase === 'closed' ? 'closed' : ''}`} aria-live="polite">
              {envelopes}
            </div>
          )}

          {phase === 'collected' && !isSupplierView && !noPricingView && (
            <p className="vld-lockline">
              Only the <b>Supplier</b>’s master key can close this auction. Switch to <b>Supplier</b>{' '}
              to accept the lowest bid.
            </p>
          )}

          {phase === 'closed' && winner && !noPricingView && (
            <div className="vld-verdict">
              <span className="vld-verdict-tag">🔓 REVEALED</span>
              <span className="vld-verdict-text">
                <b className="brass">{winner.name}</b> wins the lot at{' '}
                <b className="brass vld-verdict-rate">{pct(winner.rate)}</b> - the lowest sealed bid.
                Funds advanced, receivable assigned, losing envelopes archived.
              </span>
            </div>
          )}
          {phase === 'closed' && winner && noPricingView && (
            <div className="vld-verdict muted">
              <span className="vld-verdict-tag muted">✓ SETTLED</span>
              <span className="vld-verdict-text">
                The auction has settled - you can see the receivable changed hands, but{' '}
                <b className="rose">not at what rate</b>.
              </span>
            </div>
          )}
        </>
      )}

      {/* ---------------- IDLE HERO ---------------- */}
      {phase === 'idle' && (
        <div className="vld-hero">
          <div className="vld-hero-icon" aria-hidden>
            <div className="vld-hero-env" />
            <div className="vld-hero-env" />
            <div className="vld-hero-env" />
            <div className="vld-hero-keyring">
              <KeyGlyph clearance="all" size={46} />
            </div>
          </div>
          <div className="vld-hero-copy">
            <div className="vld-hero-title">Three sealed envelopes. One master key.</div>
            <p>
              The supplier auctions one buyer-approved invoice. Three financiers each seal a blind
              discount rate inside a wax-stamped envelope. <b>No financier can open another’s</b> -
              the Canton ledger only returns a bid to the party entitled to it. Open the auction,
              then flip <b>View as…</b> to pick up each party’s key and feel the asymmetry.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}