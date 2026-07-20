import express from 'express';
import cors from 'cors';
import * as ledger from './ledger';
import { scoreInvoice } from './scoring/rules';
import { explainScore, fallbackExplanation } from './scoring/explain';
import { BuyerCreditProfile } from './scoring/types';

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
const sessions = new Map<string, Parties>();

const shortName = (tid: string): string => tid.split(':').pop() ?? tid;
const num = (x: unknown): number => Number(x ?? 0);

const scoreFor = (amount: number, tenorDays: number, buyerName: string, priorBook: number) =>
  scoreInvoice(
    { amount, tenorDays, buyer: buyerName },
    profileFor(buyerName),
    { totalReceivables: EXISTING_BOOK + priorBook, buyerReceivables: priorBook },
  );

const getOrAllocate = async (hint: string): Promise<string> => {
  try {
    const existing = (await ledger.listParties()).find((p) => p.identifier.startsWith(hint + '::'));
    if (existing) return existing.identifier;
  } catch {
    /* fall through */
  }
  return ledger.allocateParty(hint);
};

const sanitize = (s: string): string => (s.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'x');

const sessionParties = async (sid: string, allocate: boolean): Promise<Parties | null> => {
  const key = sanitize(sid);
  const found = sessions.get(key);
  if (found) return found;
  if (!allocate) return null;
  const p: Parties = {
    supplier: await getOrAllocate('Sup' + key),
    buyer: await getOrAllocate('Buy' + key),
    financier: await getOrAllocate('Fin' + key),
    auditor: await getOrAllocate('Aud' + key),
  };
  sessions.set(key, p);
  console.log(`[session] allocated parties for ${key} (total sessions: ${sessions.size})`);
  return p;
};

interface Bidder { key: string; name: string; party: string; spread: number; appetite: string; }
const BIDDERS: Omit<Bidder, 'party'>[] = [
  { key: 'meridian', name: 'Meridian Capital', spread: 0.0, appetite: 'aggressive' },
  { key: 'apex', name: 'Apex Credit', spread: 0.006, appetite: 'balanced' },
  { key: 'cobalt', name: 'Cobalt Partners', spread: 0.013, appetite: 'conservative' },
];
const auctions = new Map<string, Bidder[]>();

const sessionBidders = async (sid: string, allocate: boolean): Promise<Bidder[] | null> => {
  const key = sanitize(sid);
  const found = auctions.get(key);
  if (found) return found;
  if (!allocate) return null;
  const list: Bidder[] = [];
  for (const b of BIDDERS) {
    const party = await getOrAllocate('Bid' + b.key.slice(0, 3) + key);
    list.push({ ...b, party });
  }
  auctions.set(key, list);
  return list;
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
    amount: '100000', description: 'Q3 pallet delivery', status: 'Issued',
  });
  const aConfirmed = await ledger.exercise(p.buyer, 'Invoice', a.contractId, 'Confirm', {});
  const aListed = await ledger.exercise(p.supplier, 'Invoice', aConfirmed, 'ListForFinancing', { newFinanciers: [p.financier] });
  const scoreA = scoreFor(100000, DEFAULT_TENOR, buyerName, 0);
  const propA = await ledger.create(p.financier, 'FinancingProposal', {
    financier: p.financier, supplier: p.supplier, buyer: p.buyer, auditor: p.auditor,
    invoiceCid: aListed, faceAmount: '100000', discountRate: String(scoreA.recommendedDiscountRate),
  });
  await ledger.exercise(p.supplier, 'FinancingProposal', propA.contractId, 'AcceptProposal', {});
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
app.use(cors());
app.use(express.json());

const fail = (res: express.Response, e: unknown) => {
  const raw = String(e);
  console.error('[ledger]', raw);
  const stale = /CONTRACT_NOT_FOUND|NOT_FOUND|not found/i.test(raw);
  res.status(stale ? 409 : 500).json({ error: stale ? 'CONTRACT_NOT_FOUND: the demo ledger moved on, reset to run a fresh deal' : 'ledger operation failed' });
};

const positiveAmount = (v: unknown): boolean => v === undefined || Number(v) > 0;

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
        .map((inv) => {
          const amount = num(inv.amount);
          const result = scoreFor(amount, DEFAULT_TENOR, DISPLAY.buyer, priorBook);
          priorBook += amount;
          return { invoiceCid: inv.contractId, description: inv.description, amount, result, memo: fallbackExplanation(result) };
        });
    }
    res.json(body);
  } catch (e) { fail(res, e); }
});

app.post('/api/score', async (req, res) => {
  const { amount, tenorDays, buyer, priorBook } = req.body ?? {};
  if (typeof amount !== 'number' || typeof tenorDays !== 'number' || !(amount > 0) || !(tenorDays > 0)) {
    return res.status(400).json({ error: 'amount and tenorDays must be positive numbers' });
  }
  const result = scoreFor(amount, tenorDays, buyer ?? DISPLAY.buyer, num(priorBook));
  res.json({ result, memo: await explainScore(result) });
});

app.post('/api/actions/invoice', async (req, res) => {
  try {
    const p = await sessionParties(sidOf(req), true);
    if (!p) return res.status(503).json({ error: 'not ready' });
    const { amount, description } = req.body ?? {};
    if (!positiveAmount(amount)) return res.status(400).json({ error: 'amount must be a positive number' });
    const inv = await ledger.create(p.supplier, 'Invoice', {
      supplier: p.supplier, buyer: p.buyer, financiers: [],
      amount: String(amount ?? 100000), description: description || 'New receivable', status: 'Issued',
    });
    res.json({ invoiceCid: inv.contractId });
  } catch (e) { fail(res, e); }
});

app.post('/api/actions/confirm', async (req, res) => {
  try {
    const p = await sessionParties(sidOf(req), true);
    if (!p) return res.status(503).json({ error: 'not ready' });
    const cid = await ledger.exercise(p.buyer, 'Invoice', req.body.invoiceCid, 'Confirm', {});
    res.json({ invoiceCid: cid });
  } catch (e) { fail(res, e); }
});

app.post('/api/actions/list', async (req, res) => {
  try {
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
    if (!(amount > 0) || !(tenorDays > 0)) {
      return res.status(400).json({ error: 'amount and tenorDays must be positive numbers' });
    }
    const result = scoreFor(amount, tenorDays, DISPLAY.buyer, 0);
    res.json({ result, memo: await explainScore(result) });
  } catch (e) { fail(res, e); }
});

app.post('/api/actions/offer', async (req, res) => {
  try {
    const p = await sessionParties(sidOf(req), true);
    if (!p) return res.status(503).json({ error: 'not ready' });
    const { invoiceCid, faceAmount, discountRate } = req.body ?? {};
    const prop = await ledger.create(p.financier, 'FinancingProposal', {
      financier: p.financier, supplier: p.supplier, buyer: p.buyer, auditor: p.auditor,
      invoiceCid, faceAmount: String(faceAmount), discountRate: String(discountRate),
    });
    const offerCid = await ledger.exercise(p.supplier, 'FinancingProposal', prop.contractId, 'AcceptProposal', {});
    res.json({ offerCid });
  } catch (e) { fail(res, e); }
});

app.post('/api/actions/finance', async (req, res) => {
  try {
    const p = await sessionParties(sidOf(req), true);
    if (!p) return res.status(503).json({ error: 'not ready' });
    const { offerCid, faceAmount } = req.body ?? {};
    const cash = await ledger.create(p.financier, 'Cash', { owner: p.financier, amount: String(faceAmount) });
    const result = await ledger.exercise(p.financier, 'FinancingOffer', offerCid, 'AcceptFinancing', { financierCashCid: cash.contractId });
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
    await archive(p.supplier, 'Invoice');
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
      amount: String(amount ?? 100000), description: description || 'Auction receivable', status: 'Issued',
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
    const score = scoreFor(Number(amount), DEFAULT_TENOR, DISPLAY.buyer, 0);
    const rate = Math.round((score.recommendedDiscountRate + b.spread) * 10000) / 10000;
    await ledger.create(b.party, 'FinancingProposal', {
      financier: b.party, supplier: p.supplier, buyer: p.buyer, auditor: p.auditor,
      invoiceCid, faceAmount: String(amount), discountRate: String(rate),
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
    const { amount } = req.body ?? {};
    const props = await ledger.query(p.supplier, ['FinancingProposal']);
    if (!props.length) return res.status(400).json({ error: 'no bids to close' });
    const withRate = props
      .map((c) => ({ cid: c.contractId, party: String((c.payload as any).financier), rate: Number((c.payload as any).discountRate) }))
      .sort((a, b) => a.rate - b.rate);
    const winner = withRate[0];
    const offerCid = await ledger.exercise(p.supplier, 'FinancingProposal', winner.cid, 'AcceptProposal', {});
    const cash = await ledger.create(winner.party, 'Cash', { owner: winner.party, amount: String(amount ?? 100000) });
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
  res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] listening on 127.0.0.1:${PORT}`);
  bootstrap();
});
