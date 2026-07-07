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
let parties: Parties | null = null;
let seeded = false;
let bootError: string | null = null;

const shortName = (tid: string): string => tid.split(':').pop() ?? tid;
const num = (x: unknown): number => Number(x ?? 0);

const scoreFor = (amount: number, tenorDays: number, buyerName: string, priorBook: number) =>
  scoreInvoice(
    { amount, tenorDays, buyer: buyerName },
    profileFor(buyerName),
    { totalReceivables: EXISTING_BOOK + priorBook, buyerReceivables: priorBook },
  );

const seedScene = async (p: Parties): Promise<void> => {
  const buyerName = DISPLAY.buyer;

  const a = await ledger.create(p.supplier, 'Invoice', {
    supplier: p.supplier, buyer: p.buyer, financier: null,
    amount: '100000', description: 'Q3 pallet delivery', status: 'Issued',
  });
  const aConfirmed = await ledger.exercise(p.buyer, 'Invoice', a.contractId, 'Confirm', {});
  const aListed = await ledger.exercise(p.supplier, 'Invoice', aConfirmed, 'ListForFinancing', { newFinancier: p.financier });
  const scoreA = scoreFor(100000, DEFAULT_TENOR, buyerName, 0);
  const propA = await ledger.create(p.financier, 'FinancingProposal', {
    financier: p.financier, supplier: p.supplier, buyer: p.buyer, auditor: p.auditor,
    invoiceCid: aListed, faceAmount: '100000', discountRate: String(scoreA.recommendedDiscountRate),
  });
  await ledger.exercise(p.supplier, 'FinancingProposal', propA.contractId, 'AcceptProposal', {});

  const b = await ledger.create(p.supplier, 'Invoice', {
    supplier: p.supplier, buyer: p.buyer, financier: null,
    amount: '60000', description: 'Packaging materials', status: 'Issued',
  });
  const bConfirmed = await ledger.exercise(p.buyer, 'Invoice', b.contractId, 'Confirm', {});
  const bListed = await ledger.exercise(p.supplier, 'Invoice', bConfirmed, 'ListForFinancing', { newFinancier: p.financier });
  const scoreB = scoreFor(60000, 45, buyerName, 100000);
  const propB = await ledger.create(p.financier, 'FinancingProposal', {
    financier: p.financier, supplier: p.supplier, buyer: p.buyer, auditor: p.auditor,
    invoiceCid: bListed, faceAmount: '60000', discountRate: String(scoreB.recommendedDiscountRate),
  });
  const offerB = await ledger.exercise(p.supplier, 'FinancingProposal', propB.contractId, 'AcceptProposal', {});
  const cash = await ledger.create(p.financier, 'Cash', { owner: p.financier, amount: '60000' });
  await ledger.exercise(p.financier, 'FinancingOffer', offerB, 'AcceptFinancing', { financierCashCid: cash.contractId });
};

const getOrAllocate = async (hint: string): Promise<string> => {
  try {
    const existing = (await ledger.listParties()).find((p) => p.identifier.startsWith(hint + '::'));
    if (existing) return existing.identifier;
  } catch {
    /* fall through to allocation */
  }
  return ledger.allocateParty(hint);
};

const bootstrap = async (): Promise<void> => {
  for (let i = 0; i < 60; i++) {
    if (await ledger.healthy()) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!(await ledger.healthy())) { bootError = 'JSON API never became ready'; return; }
  try {
    parties = {
      supplier: await getOrAllocate('Supplier'),
      buyer: await getOrAllocate('Buyer'),
      financier: await getOrAllocate('Financier'),
      auditor: await getOrAllocate('Auditor'),
    };
    const existing = await ledger.query(parties.supplier, ['Invoice', 'FinancingOffer', 'FinancedReceivable']);
    if (existing.length > 0) {
      seeded = true;
      console.log(`[bootstrap] ledger already seeded (${existing.length} contracts) - reusing`);
      return;
    }
    await seedScene(parties);
    seeded = true;
    console.log('[bootstrap] seeded scene for parties', parties);
  } catch (e) {
    bootError = String(e);
    console.error('[bootstrap] failed:', e);
  }
};

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ seeded, bootError, parties: parties ? Object.keys(parties) : [] });
});

app.get('/api/parties', (_req, res) => {
  if (!parties) return res.status(503).json({ error: bootError ?? 'not ready' });
  res.json(ROLES.map((role) => ({ role, displayName: DISPLAY[role], party: parties![role] })));
});

app.get('/api/view/:role', async (req, res) => {
  const role = req.params.role as Role;
  if (!parties) return res.status(503).json({ error: bootError ?? 'not ready' });
  if (!ROLES.includes(role)) return res.status(404).json({ error: 'unknown role' });
  try {
    const contracts = await ledger.query(parties[role], ENTITIES);
    const groups: Record<string, any[]> = {};
    for (const c of contracts) {
      const name = shortName(c.templateId);
      (groups[name] ??= []).push({ contractId: c.contractId, ...c.payload });
    }
    const body: any = { role, displayName: DISPLAY[role], party: parties[role], groups };

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
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/score', async (req, res) => {
  const { amount, tenorDays, buyer, priorBook } = req.body ?? {};
  if (typeof amount !== 'number' || typeof tenorDays !== 'number') {
    return res.status(400).json({ error: 'amount and tenorDays (numbers) required' });
  }
  const result = scoreFor(amount, tenorDays, buyer ?? DISPLAY.buyer, num(priorBook));
  const memo = await explainScore(result);
  res.json({ result, memo });
});

app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
  bootstrap();
});
