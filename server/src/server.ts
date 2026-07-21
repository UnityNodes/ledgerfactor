import express from 'express';
import cors from 'cors';
import { createHash } from 'node:crypto';
import * as ledger from './ledger';
import { scoreInvoice, defaultConfig } from './scoring/rules';
import { explainScore, fallbackExplanation } from './scoring/explain';
import { BuyerCreditProfile, ScoringConfig } from './scoring/types';

const PORT = Number(process.env.PORT ?? 8080);
const EXISTING_BOOK = 800000;
const DEFAULT_TENOR = 60;

const ENTITIES = ['Invoice', 'FinancingProposal', 'FinancingOffer', 'FinancedReceivable', 'Cash'];

const ROLES = ['supplier', 'buyer', 'financier', 'auditor'] as const;
type Role = (typeof ROLES)[number];

const DISPLAY: Record<Role, string> = {
  supplier: 'Northwind Supply',
  buyer: 'Globex Corp',
  financier: 'Meridian Capital',
  auditor: 'Regulator',
};

const buyerProfiles: Record<string, Omit<BuyerCreditProfile, 'buyer'>> = {
  'Globex Corp': { invoicesConfirmed: 12, onTimePaymentRate: 0.96, avgDaysLate: 2, disputeRate: 0.01 },
};
const profileFor = (buyer: string): BuyerCreditProfile => ({
  buyer,
  ...(buyerProfiles[buyer] ?? { invoicesConfirmed: 2, onTimePaymentRate: 0.75, avgDaysLate: 10, disputeRate: 0.05 }),
});

interface Parties { supplier: string; buyer: string; financier: string; auditor: string; }
let ready = false;
let bootError: string | null = null;

const MAX_SESSIONS = 500;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const sessions = new Map<string, Parties>();
const auctions = new Map<string, Bidder[]>();
const lastSeen = new Map<string, number>();
const inflightParties = new Map<string, Promise<Parties>>();
const inflightBidders = new Map<string, Promise<Bidder[]>>();

const ALLOC_CAP = 250;
const ALLOC_REFILL_MS = 1000;
let allocTokens = ALLOC_CAP;
let allocRefillAt = Date.now();
const takeAllocToken = (): boolean => {
  const now = Date.now();
  const gained = Math.floor((now - allocRefillAt) / ALLOC_REFILL_MS);
  if (gained > 0) { allocTokens = Math.min(ALLOC_CAP, allocTokens + gained); allocRefillAt = now; }
  if (allocTokens <= 0) return false;
  allocTokens -= 1;
  return true;
};

const touch = (key: string): void => { lastSeen.set(key, Date.now()); };

const forget = (key: string): void => { sessions.delete(key); auctions.delete(key); lastSeen.delete(key); };

const reapSessions = (): void => {
  const now = Date.now();
  for (const [k, seen] of lastSeen) {
    if (now - seen > SESSION_TTL_MS) forget(k);
  }
  while (sessions.size > MAX_SESSIONS) {
    let oldest: string | null = null;
    let oldestSeen = Infinity;
    for (const [k, seen] of lastSeen) {
      if (sessions.has(k) && seen < oldestSeen) { oldestSeen = seen; oldest = k; }
    }
    if (oldest === null) break;
    forget(oldest);
  }
};

const shortName = (tid: string): string => tid.split(':').pop() ?? tid;
const num = (x: unknown): number => Number(x ?? 0);

const scoreFor = (amount: number, tenorDays: number, buyerName: string, priorBook: number) =>
  scoreInvoice(
    { amount, tenorDays, buyer: buyerName },
    profileFor(buyerName),
    { totalReceivables: EXISTING_BOOK + priorBook, buyerReceivables: priorBook },
  );

const bidderScore = (amount: number, tenorDays: number, buyerName: string, risk: BidderRisk) =>
  scoreInvoice(
    { amount, tenorDays, buyer: buyerName },
    profileFor(buyerName),
    { totalReceivables: risk.book, buyerReceivables: risk.buyerExposure },
    risk.config,
  );

const getOrAllocate = async (hint: string, known?: { identifier: string }[]): Promise<string> => {
  try {
    const list = known ?? (await ledger.listParties());
    const existing = list.find((p) => p.identifier.startsWith(hint + '::'));
    if (existing) return existing.identifier;
  } catch {
    /* fall through */
  }
  return ledger.allocateParty(hint);
};

const knownParties = async (): Promise<{ identifier: string }[]> => {
  try {
    return await ledger.listParties();
  } catch {
    return [];
  }
};

const sanitize = (s: string): string => createHash('sha256').update(String(s)).digest('hex').slice(0, 24);

const sessionParties = async (sid: string, allocate: boolean): Promise<Parties | null> => {
  const key = sanitize(sid);
  const found = sessions.get(key);
  if (found) { touch(key); return found; }
  if (!allocate) return null;
  const pending = inflightParties.get(key);
  if (pending) return pending;
  if (!takeAllocToken()) throw new Error('RATE_LIMITED: too many new demo sessions, retry shortly');
  const promise = (async (): Promise<Parties> => {
    const known = await knownParties();
    const [supplier, buyer, financier, auditor] = await Promise.all([
      getOrAllocate('Sup' + key, known),
      getOrAllocate('Buy' + key, known),
      getOrAllocate('Fin' + key, known),
      getOrAllocate('Aud' + key, known),
    ]);
    const p: Parties = { supplier, buyer, financier, auditor };
    sessions.set(key, p);
    touch(key);
    reapSessions();
    console.log(`[session] allocated parties for ${key} (total sessions: ${sessions.size})`);
    return p;
  })();
  inflightParties.set(key, promise);
  try {
    return await promise;
  } finally {
    inflightParties.delete(key);
  }
};

interface BidderRisk { config: ScoringConfig; book: number; buyerExposure: number; }
interface Bidder { key: string; name: string; party: string; appetite: string; risk: BidderRisk; }
const BIDDERS: Omit<Bidder, 'party'>[] = [
  { key: 'meridian', name: 'Meridian Capital', appetite: 'aggressive',
    risk: { config: { ...defaultConfig, weights: { reliability: 0.35, concentration: 0.15, dilution: 0.2, size: 0.3 }, baseRateByBand: { A: 0.08, B: 0.14, C: 0.26, D: 0.4 }, sizeReference: 120000 }, book: 700000, buyerExposure: 100000 } },
  { key: 'apex', name: 'Apex Credit', appetite: 'balanced',
    risk: { config: { ...defaultConfig, weights: { reliability: 0.45, concentration: 0.2, dilution: 0.25, size: 0.1 }, baseRateByBand: { A: 0.12, B: 0.18, C: 0.28, D: 0.4 }, sizeReference: 320000 }, book: 1000000, buyerExposure: 180000 } },
  { key: 'cobalt', name: 'Cobalt Partners', appetite: 'conservative',
    risk: { config: { ...defaultConfig, weights: { reliability: 0.5, concentration: 0.15, dilution: 0.25, size: 0.1 }, baseRateByBand: { A: 0.13, B: 0.19, C: 0.3, D: 0.42 }, sizeReference: 900000, concentrationCap: 0.5 }, book: 3000000, buyerExposure: 200000 } },
];
const sessionBidders = async (sid: string, allocate: boolean): Promise<Bidder[] | null> => {
  const key = sanitize(sid);
  const found = auctions.get(key);
  if (found) { touch(key); return found; }
  if (!allocate) return null;
  const pending = inflightBidders.get(key);
  if (pending) return pending;
  if (!takeAllocToken()) throw new Error('RATE_LIMITED: too many new demo sessions, retry shortly');
  const promise = (async (): Promise<Bidder[]> => {
    const known = await knownParties();
    const list = await Promise.all(
      BIDDERS.map(async (b) => ({ ...b, party: await getOrAllocate('Bid' + b.key.slice(0, 3) + key, known) })),
    );
    auctions.set(key, list);
    touch(key);
    return list;
  })();
  inflightBidders.set(key, promise);
  try {
    return await promise;
  } finally {
    inflightBidders.delete(key);
  }
};

const bidderNameOf = (bidders: Bidder[] | null, partyId: string): string =>
  bidders?.find((b) => b.party === partyId)?.name ?? 'Financier';

const sidOf = (req: express.Request): string => {
  const h = req.header('x-lf-session');
  const q = typeof req.query.s === 'string' ? req.query.s : undefined;
  const b = req.body && typeof req.body.session === 'string' ? req.body.session : undefined;
  return h || q || b || 'default';
};

const seedScene = async (p: Parties): Promise<void> => {
  const buyerName = DISPLAY.buyer;
  const a = await ledger.create(p.supplier, 'Invoice', {
    supplier: p.supplier, buyer: p.buyer, financiers: [],
    amount: '100000', invoiceNumber: invoiceNumber(), description: 'Q3 pallet delivery', status: 'Issued',
  });
  const aConfirmed = await ledger.exercise(p.buyer, 'Invoice', a.contractId, 'Confirm', {});
  const aListed = await ledger.exercise(p.supplier, 'Invoice', aConfirmed, 'ListForFinancing', { newFinanciers: [p.financier] });
  const scoreA = scoreFor(100000, DEFAULT_TENOR, buyerName, 0);
  const propA = await ledger.create(p.financier, 'FinancingProposal', {
    financier: p.financier, supplier: p.supplier, buyer: p.buyer, auditor: p.auditor,
    invoiceCid: aListed, faceAmount: '100000', discountRate: String(scoreA.recommendedDiscountRate),
  });
  await ledger.exercise(p.supplier, 'FinancingProposal', propA.contractId, 'AcceptProposal', {});

  const b = await ledger.create(p.supplier, 'Invoice', {
    supplier: p.supplier, buyer: p.buyer, financiers: [],
    amount: '240000', invoiceNumber: invoiceNumber(), description: 'Q2 logistics tranche', status: 'Issued',
  });
  const bConfirmed = await ledger.exercise(p.buyer, 'Invoice', b.contractId, 'Confirm', {});
  const bListed = await ledger.exercise(p.supplier, 'Invoice', bConfirmed, 'ListForFinancing', { newFinanciers: [p.financier] });
  const scoreB = scoreFor(240000, DEFAULT_TENOR, buyerName, 100000);
  const propB = await ledger.create(p.financier, 'FinancingProposal', {
    financier: p.financier, supplier: p.supplier, buyer: p.buyer, auditor: p.auditor,
    invoiceCid: bListed, faceAmount: '240000', discountRate: String(scoreB.recommendedDiscountRate),
  });
  const offerB = await ledger.exercise(p.supplier, 'FinancingProposal', propB.contractId, 'AcceptProposal', {});
  const cashB = await ledger.create(p.financier, 'Cash', { owner: p.financier, amount: '240000' });
  await ledger.exercise(p.financier, 'FinancingOffer', offerB, 'AcceptFinancing', { financierCashCid: cashB.contractId });
};

const bootstrap = async (): Promise<void> => {
  for (let i = 0; i < 60; i++) {
    if (await ledger.healthy()) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!(await ledger.healthy())) { bootError = 'JSON API never became ready'; return; }
  ready = true;
  console.log('[bootstrap] ledger ready · sessions allocate parties on demand');
};

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json());

const fail = (res: express.Response, e: unknown) => {
  const raw = String(e);
  console.error('[ledger]', raw);
  if (/RATE_LIMITED/.test(raw)) {
    return res.status(429).json({ error: 'the demo is starting a lot of sessions right now, retry in a moment' });
  }
  const stale = /CONTRACT_NOT_FOUND|NOT_FOUND|not found/i.test(raw);
  if (stale) return res.status(409).json({ error: 'CONTRACT_NOT_FOUND: the demo ledger moved on, reset to run a fresh deal' });
  const badInput = /INVALID_ARGUMENT|cannot parse|invalid.{0,20}contract|malformed|unknown template|out-of-bounds|Numeric|Deserialization/i.test(raw);
  res.status(badInput ? 400 : 500).json({ error: badInput ? 'invalid request' : 'ledger operation failed' });
};

const inRange = (v: unknown): boolean => (typeof v === 'number' || typeof v === 'string') && Number.isFinite(Number(v)) && Number(v) >= 1e-10 && Number(v) < 1e15;
const positiveAmount = (v: unknown): boolean => v === undefined || inRange(v);
const finitePositive = (v: unknown): boolean => inRange(v);
const nonEmptyString = (v: unknown): boolean => typeof v === 'string' && v.length > 0;

const invoiceNumber = (): string => 'INV-' + Math.random().toString(36).slice(2, 9).toUpperCase();

app.get('/api/health', (_req, res) => {
  res.json({ ready, bootError, sessions: sessions.size });
});

app.get('/api/parties', async (req, res) => {
  const p = await sessionParties(sidOf(req), false);
  res.json(ROLES.map((role) => ({ role, displayName: DISPLAY[role], party: p ? p[role] : null })));
});

app.get('/api/view/:role', async (req, res) => {
  const role = req.params.role as Role;
  if (!ROLES.includes(role)) return res.status(404).json({ error: 'unknown role' });
  if (!ready) return res.status(503).json({ error: bootError ?? 'not ready' });
  const p = await sessionParties(sidOf(req), false);
  if (!p) {
    return res.json({ role, displayName: DISPLAY[role], party: '·', groups: {}, ...(role === 'financier' ? { recommendations: [] } : {}) });
  }
  try {
    const contracts = await ledger.query(p[role], ENTITIES);
    const groups: Record<string, any[]> = {};
    for (const c of contracts) {
      const name = shortName(c.templateId);
      (groups[name] ??= []).push({ contractId: c.contractId, ...c.payload });
    }
    const body: any = { role, displayName: DISPLAY[role], party: p[role], groups };
    if (role === 'financier') {
      let priorBook = 0;
      body.recommendations = (groups.Invoice ?? [])
        .filter((inv) => inv.status === 'Confirmed')
        .sort((a, b) => String(a.contractId).localeCompare(String(b.contractId)))
        .map((inv) => {
          const amount = num(inv.amount);
          const result = scoreFor(amount, DEFAULT_TENOR, DISPLAY.buyer, priorBook);
          priorBook += amount;
          return { invoiceCid: inv.contractId, description: inv.description, amount, result, memo: fallbackExplanation(result), memoSource: 'template' as const };
        });
    }
    res.json(body);
  } catch (e) { fail(res, e); }
});

app.post('/api/score', async (req, res) => {
  const { buyer, priorBook } = req.body ?? {};
  const amount = Number(req.body?.amount);
  const tenorDays = Number(req.body?.tenorDays);
  if (!finitePositive(amount) || !finitePositive(tenorDays) || !Number.isFinite(num(priorBook)) || num(priorBook) < 0) {
    return res.status(400).json({ error: 'amount and tenorDays must be positive numbers' });
  }
  const result = scoreFor(amount, tenorDays, typeof buyer === 'string' && buyer ? buyer : DISPLAY.buyer, num(priorBook));
  const explanation = await explainScore(result);
  res.json({ result, memo: explanation.memo, memoSource: explanation.source });
});

app.post('/api/actions/invoice', async (req, res) => {
  try {
    const p = await sessionParties(sidOf(req), true);
    if (!p) return res.status(503).json({ error: 'not ready' });
    const { amount, description } = req.body ?? {};
    if (!positiveAmount(amount)) return res.status(400).json({ error: 'amount must be a positive number' });
    const inv = await ledger.create(p.supplier, 'Invoice', {
      supplier: p.supplier, buyer: p.buyer, financiers: [],
      amount: String(Number(amount ?? 100000)), invoiceNumber: invoiceNumber(), description: description || 'New receivable', status: 'Issued',
    });
    res.json({ invoiceCid: inv.contractId });
  } catch (e) { fail(res, e); }
});

app.post('/api/actions/confirm', async (req, res) => {
  try {
    if (!nonEmptyString(req.body?.invoiceCid)) return res.status(400).json({ error: 'invoiceCid is required' });
    const p = await sessionParties(sidOf(req), true);
    if (!p) return res.status(503).json({ error: 'not ready' });
    const cid = await ledger.exercise(p.buyer, 'Invoice', req.body.invoiceCid, 'Confirm', {});
    res.json({ invoiceCid: cid });
  } catch (e) { fail(res, e); }
});

app.post('/api/actions/list', async (req, res) => {
  try {
    if (!nonEmptyString(req.body?.invoiceCid)) return res.status(400).json({ error: 'invoiceCid is required' });
    const p = await sessionParties(sidOf(req), true);
    if (!p) return res.status(503).json({ error: 'not ready' });
    const cid = await ledger.exercise(p.supplier, 'Invoice', req.body.invoiceCid, 'ListForFinancing', { newFinanciers: [p.financier] });
    res.json({ invoiceCid: cid });
  } catch (e) { fail(res, e); }
});

app.post('/api/actions/underwrite', async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    const tenorDays = Number(req.body?.tenorDays ?? DEFAULT_TENOR);
    if (!finitePositive(amount) || !finitePositive(tenorDays)) {
      return res.status(400).json({ error: 'amount and tenorDays must be positive numbers' });
    }
    const result = scoreFor(amount, tenorDays, DISPLAY.buyer, 0);
    const explanation = await explainScore(result);
    res.json({ result, memo: explanation.memo, memoSource: explanation.source });
  } catch (e) { fail(res, e); }
});

app.post('/api/actions/offer', async (req, res) => {
  try {
    const { invoiceCid, faceAmount, discountRate } = req.body ?? {};
    if (!nonEmptyString(invoiceCid) || !finitePositive(faceAmount) || !finitePositive(discountRate)) {
      return res.status(400).json({ error: 'invoiceCid, faceAmount and discountRate are required' });
    }
    const p = await sessionParties(sidOf(req), true);
    if (!p) return res.status(503).json({ error: 'not ready' });
    const prop = await ledger.create(p.financier, 'FinancingProposal', {
      financier: p.financier, supplier: p.supplier, buyer: p.buyer, auditor: p.auditor,
      invoiceCid, faceAmount: String(Number(faceAmount)), discountRate: String(Number(discountRate)),
    });
    let offerCid: string;
    try {
      offerCid = await ledger.exercise(p.supplier, 'FinancingProposal', prop.contractId, 'AcceptProposal', {});
    } catch (e) {
      await ledger.exercise(p.financier, 'FinancingProposal', prop.contractId, 'Archive', {}).catch(() => undefined);
      throw e;
    }
    res.json({ offerCid });
  } catch (e) { fail(res, e); }
});

app.post('/api/actions/finance', async (req, res) => {
  try {
    const { offerCid, faceAmount } = req.body ?? {};
    if (!nonEmptyString(offerCid) || !finitePositive(faceAmount)) {
      return res.status(400).json({ error: 'offerCid and faceAmount are required' });
    }
    const p = await sessionParties(sidOf(req), true);
    if (!p) return res.status(503).json({ error: 'not ready' });
    const cash = await ledger.create(p.financier, 'Cash', { owner: p.financier, amount: String(Number(faceAmount)) });
    let result: unknown;
    try {
      result = await ledger.exercise(p.financier, 'FinancingOffer', offerCid, 'AcceptFinancing', { financierCashCid: cash.contractId });
    } catch (e) {
      await ledger.exercise(p.financier, 'Cash', cash.contractId, 'Archive', {}).catch(() => undefined);
      throw e;
    }
    res.json({ ok: true, result });
  } catch (e) { fail(res, e); }
});

app.post('/api/actions/reset', async (req, res) => {
  try {
    const sid = sidOf(req);
    const p = await sessionParties(sid, false);
    if (!p) return res.json({ ok: true });
    const archive = async (party: string, entity: string) => {
      for (const c of await ledger.query(party, [entity])) {
        try { await ledger.exercise(party, entity, c.contractId, 'Archive', {}); } catch { /* ignore */ }
      }
    };
    const archiveAttestations = async () => {
      for (const c of await ledger.query(p.buyer, ['BuyerAttestation'])) {
        try { await ledger.exerciseMulti([p.buyer, p.supplier], 'BuyerAttestation', c.contractId, 'Archive', {}); } catch { /* ignore */ }
      }
    };
    await archive(p.supplier, 'Invoice');
    await archiveAttestations();
    const archiveReceivables = async (owner: string) => {
      for (const c of await ledger.query(owner, ['FinancedReceivable'])) {
        try { await ledger.exerciseMulti([owner, p.supplier], 'FinancedReceivable', c.contractId, 'Archive', {}); } catch { /* ignore */ }
      }
    };
    await archive(p.financier, 'FinancingProposal');
    for (const c of await ledger.query(p.financier, ['FinancingOffer'])) {
      try { await ledger.exerciseMulti([p.financier, p.supplier], 'FinancingOffer', c.contractId, 'Archive', {}); } catch { /* ignore */ }
    }
    await archiveReceivables(p.financier);
    await archive(p.supplier, 'Cash');
    await archive(p.financier, 'Cash');
    for (const b of (await sessionBidders(sid, false)) ?? []) {
      await archive(b.party, 'FinancingProposal');
      for (const c of await ledger.query(b.party, ['FinancingOffer'])) {
        try { await ledger.exerciseMulti([b.party, p.supplier], 'FinancingOffer', c.contractId, 'Archive', {}); } catch { /* ignore */ }
      }
      await archiveReceivables(b.party);
      await archive(b.party, 'Cash');
    }
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

app.post('/api/actions/sample', async (req, res) => {
  try {
    const p = await sessionParties(sidOf(req), true);
    if (!p) return res.status(503).json({ error: 'not ready' });
    await seedScene(p);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

app.post('/api/auction/open', async (req, res) => {
  try {
    const sid = sidOf(req);
    const p = await sessionParties(sid, true);
    const bidders = await sessionBidders(sid, true);
    if (!p || !bidders) return res.status(503).json({ error: 'not ready' });
    const { amount, description } = req.body ?? {};
    if (!positiveAmount(amount)) return res.status(400).json({ error: 'amount must be a positive number' });
    const inv = await ledger.create(p.supplier, 'Invoice', {
      supplier: p.supplier, buyer: p.buyer, financiers: [],
      amount: String(Number(amount ?? 100000)), invoiceNumber: invoiceNumber(), description: description || 'Auction receivable', status: 'Issued',
    });
    const confirmed = await ledger.exercise(p.buyer, 'Invoice', inv.contractId, 'Confirm', {});
    const listed = await ledger.exercise(p.supplier, 'Invoice', confirmed, 'ListForFinancing', { newFinanciers: bidders.map((b) => b.party) });
    res.json({ invoiceCid: listed, amount: num(amount ?? 100000), bidders: bidders.map((b) => ({ key: b.key, name: b.name, appetite: b.appetite })) });
  } catch (e) { fail(res, e); }
});

app.post('/api/auction/bid', async (req, res) => {
  try {
    const sid = sidOf(req);
    const p = await sessionParties(sid, true);
    const bidders = await sessionBidders(sid, true);
    if (!p || !bidders) return res.status(503).json({ error: 'not ready' });
    const { invoiceCid, bidderKey, amount } = req.body ?? {};
    const b = bidders.find((x) => x.key === bidderKey);
    if (!b) return res.status(404).json({ error: 'unknown bidder' });
    if (!finitePositive(amount)) return res.status(400).json({ error: 'amount must be a positive number' });
    const score = bidderScore(Number(amount), DEFAULT_TENOR, DISPLAY.buyer, b.risk);
    const rate = score.recommendedDiscountRate;
    await ledger.create(b.party, 'FinancingProposal', {
      financier: b.party, supplier: p.supplier, buyer: p.buyer, auditor: p.auditor,
      invoiceCid, faceAmount: String(Number(amount)), discountRate: String(rate),
    });
    res.json({ bidderKey, name: b.name, rate, score: score.creditScore, band: score.riskBand });
  } catch (e) { fail(res, e); }
});

app.post('/api/auction/close', async (req, res) => {
  try {
    const sid = sidOf(req);
    const p = await sessionParties(sid, true);
    const bidders = await sessionBidders(sid, true);
    if (!p || !bidders) return res.status(503).json({ error: 'not ready' });
    const props = await ledger.query(p.supplier, ['FinancingProposal']);
    if (!props.length) return res.status(400).json({ error: 'no bids to close' });
    const withRate = props
      .map((c) => ({ cid: c.contractId, party: String((c.payload as any).financier), rate: Number((c.payload as any).discountRate), faceAmount: String((c.payload as any).faceAmount) }))
      .sort((a, b) => a.rate - b.rate);
    const winner = withRate[0];
    const offerCid = await ledger.exercise(p.supplier, 'FinancingProposal', winner.cid, 'AcceptProposal', {});
    const cash = await ledger.create(winner.party, 'Cash', { owner: winner.party, amount: winner.faceAmount });
    await ledger.exercise(winner.party, 'FinancingOffer', offerCid, 'AcceptFinancing', { financierCashCid: cash.contractId });
    for (const w of withRate.slice(1)) {
      try { await ledger.exercise(w.party, 'FinancingProposal', w.cid, 'Archive', {}); } catch { /* ignore */ }
    }
    res.json({
      winner: { name: bidderNameOf(bidders, winner.party), rate: winner.rate },
      bids: withRate.map((w) => ({ name: bidderNameOf(bidders, w.party), rate: w.rate })),
    });
  } catch (e) { fail(res, e); }
});

app.get('/api/auction/view/:viewer', async (req, res) => {
  const sid = sidOf(req);
  const viewer = req.params.viewer;
  const p = await sessionParties(sid, false);
  const bidders = await sessionBidders(sid, false);
  if (!p) return res.json({ viewer, displayName: viewer, subtitle: '', party: '·', invoice: null, visibleBids: [], offer: null, receivable: null, totalContracts: 0 });
  let party: string | null = null;
  let displayName = viewer;
  let subtitle = '';
  if (viewer === 'supplier') { party = p.supplier; displayName = DISPLAY.supplier; subtitle = 'auctioneer · sees every bid'; }
  else if (viewer === 'buyer') { party = p.buyer; displayName = DISPLAY.buyer; subtitle = 'confirms the payable'; }
  else if (viewer === 'auditor') { party = p.auditor; displayName = DISPLAY.auditor; subtitle = 'audit trail only'; }
  else { const b = bidders?.find((x) => x.key === viewer); if (b) { party = b.party; displayName = b.name; subtitle = b.appetite + ' bidder'; } }
  if (!party) return res.status(404).json({ error: 'unknown viewer' });
  try {
    const contracts = await ledger.query(party, ['Invoice', 'FinancingProposal', 'FinancingOffer', 'FinancedReceivable', 'Cash']);
    const groups: Record<string, any[]> = {};
    for (const c of contracts) { const n = shortName(c.templateId); (groups[n] ??= []).push({ contractId: c.contractId, ...c.payload }); }
    const invoice = (groups.Invoice ?? [])[0] ?? null;
    const visibleBids = (groups.FinancingProposal ?? [])
      .map((pr) => ({ bidder: bidderNameOf(bidders, String(pr.financier)), rate: Number(pr.discountRate), faceAmount: Number(pr.faceAmount) }))
      .sort((a, b) => a.rate - b.rate);
    const offC = (groups.FinancingOffer ?? [])[0];
    const recC = (groups.FinancedReceivable ?? [])[0];
    res.json({
      viewer, displayName, subtitle, party,
      invoice: invoice ? { amount: Number(invoice.amount), description: invoice.description, status: invoice.status } : null,
      visibleBids,
      offer: offC ? { rate: Number(offC.discountRate), bidder: bidderNameOf(bidders, String(offC.financier)) } : null,
      receivable: recC ? { faceAmount: Number(recC.faceAmount), description: recC.description } : null,
      totalContracts: contracts.length,
    });
  } catch (e) { fail(res, e); }
});

app.post('/api/auction/reset', async (req, res) => {
  try {
    const sid = sidOf(req);
    const p = await sessionParties(sid, false);
    const bidders = await sessionBidders(sid, false);
    if (!p) return res.json({ ok: true });
    const archiveAs = async (party: string, entity: string) => {
      for (const c of await ledger.query(party, [entity])) {
        try { await ledger.exercise(party, entity, c.contractId, 'Archive', {}); } catch { /* ignore */ }
      }
    };
    const archiveReceivables = async (owner: string) => {
      for (const c of await ledger.query(owner, ['FinancedReceivable'])) {
        try { await ledger.exerciseMulti([owner, p.supplier], 'FinancedReceivable', c.contractId, 'Archive', {}); } catch { /* ignore */ }
      }
    };
    for (const c of await ledger.query(p.buyer, ['BuyerAttestation'])) {
      try { await ledger.exerciseMulti([p.buyer, p.supplier], 'BuyerAttestation', c.contractId, 'Archive', {}); } catch { /* ignore */ }
    }
    await archiveAs(p.supplier, 'Invoice');
    for (const b of bidders ?? []) {
      await archiveAs(b.party, 'FinancingProposal');
      for (const c of await ledger.query(b.party, ['FinancingOffer'])) {
        try { await ledger.exerciseMulti([b.party, p.supplier], 'FinancingOffer', c.contractId, 'Archive', {}); } catch { /* ignore */ }
      }
      await archiveReceivables(b.party);
      await archiveAs(b.party, 'Cash');
    }
    await archiveAs(p.financier, 'FinancingProposal');
    for (const c of await ledger.query(p.financier, ['FinancingOffer'])) {
      try { await ledger.exerciseMulti([p.financier, p.supplier], 'FinancingOffer', c.contractId, 'Archive', {}); } catch { /* ignore */ }
    }
    await archiveReceivables(p.financier);
    await archiveAs(p.financier, 'Cash');
    await archiveAs(p.supplier, 'Cash');
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[http]', err && err.message ? err.message : err);
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON body' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'request body too large' });
  if (err && (err instanceof RangeError || err instanceof SyntaxError || err.status === 400 || err.statusCode === 400)) {
    return res.status(400).json({ error: 'invalid request body' });
  }
  res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] listening on 127.0.0.1:${PORT}`);
  bootstrap();
});
