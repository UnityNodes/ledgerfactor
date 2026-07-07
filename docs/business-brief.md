# LedgerFactor - Business Brief

**Confidential invoice financing on Canton.** Suppliers turn buyer-approved
invoices into same-day cash from competing financiers - without leaking their cost
of capital to the buyer, and with the ledger structurally preventing the same
invoice from being financed twice.

---

## The problem

Mid-market suppliers wait 30-90 days to be paid; working capital sits trapped in
receivables. Factoring exists, but three things keep it expensive and risky:

1. **Pricing leaks.** When a buyer can see the discount a supplier accepts, it
   reads supplier distress and squeezes commercial terms. Confidentiality of the
   *margin* is commercially load-bearing.
2. **Double-pledge fraud.** The same receivable financed to two lenders is a
   classic loss vector, today policed by registries and manual checks that race,
   cost money, and still fail.
3. **Slow, reconciliation-heavy settlement** across institutions that don't share
   a database and don't fully trust each other.

## Ideal customer profile

- **Suppliers:** $10M-$500M revenue, concentrated investment-grade buyers, long
  DSO sectors - manufacturing, logistics, consumer goods, staffing.
- **Financiers:** specialty-finance / factoring desks, private-credit funds, bank
  supply-chain-finance units.
- **Anchor:** one large, creditworthy **buyer** whose supplier network is the
  distribution channel (buyer-led onboarding).

## The workflow (and how it maps to the ledger)

`create → confirm → list → underwrite → offer → finance → settle → audit`

Every step is a Daml choice; each role queries the ledger as its own party, so who
sees what is decided by Canton, not by the UI.

## Economic flows & incentives

- **Supplier** receives `advance = face × (1 − discount)` today, trading a known,
  confidential discount for liquidity. The buyer cannot infer the discount.
- **Financier** earns `spread = face × discount` over the tenor. The AI agent
  prices the risk; the consuming financing choice eliminates double-pledge loss.
- **Buyer** confirms the payable - strengthening its supply chain - and pays face
  at maturity to whoever holds the receivable, never seeing the pricing.
- **Auditor / regulator** sees financed volume and parties at face value for
  oversight, but not the commercially sensitive margin.

Incentives align cleanly: **confidentiality protects the supplier, structural
uniqueness protects the financier, atomic DvP protects both.**

## Who pays

Financiers are the payer. We take **a few bps of financed volume** (a slice of the
discount) and/or a SaaS fee for the AI underwriting workstation. We sit in the flow
of funds and *lower the financier's loss ratio* (no double-pledge) and
*underwriting cost* (the agent) - we capture part of the value we create. An
optional supplier origination fee is a secondary line.

## Why Canton (not a public chain, not a database)

| Requirement | Public chain | Shared database | **Canton** |
|---|---|---|---|
| Margin invisible to the buyer | ❌ leaks | ⚠️ a permission, revocable | ✅ never reaches the buyer's node |
| Same invoice financed only once | ⚠️ visible but ok | ⚠️ policy / registry | ✅ consuming contract, ledger-rejected |
| Atomic DvP across rival institutions | ✅ | ❌ needs a trusted operator | ✅ |
| Regulator audit **without** pricing | ❌ | ⚠️ | ✅ selective disclosure |

A database gives no cross-institution guarantees; a public chain gives guarantees
but destroys confidentiality. **Canton is the only place both hold at once.**

## Demonstrated activity (this build)

- Live 4-party Canton ledger; two invoices; one financed end-to-end via atomic DvP,
  one held at the offer stage.
- Both money-shots proven by Daml Script: selective disclosure of the margin, and
  ledger-level rejection of a second financing on the same invoice.
- The AI agent priced the on-ledger offer at **1.97%** (score 89, band A, approve).

## Go-to-market

- **Wedge - buyer-led supply-chain finance.** Land one investment-grade buyer,
  onboard its supplier tail, bring 1-2 financiers to compete for the paper. The
  buyer gets a healthier supply chain at zero cost; suppliers get cheaper,
  confidential liquidity; financiers get de-risked, pre-underwritten deal flow.
- **Expand** into a multi-financier marketplace (suppliers shop the receivable),
  then cross-border (where confidentiality + atomic settlement matter most), then
  adjacent products (PO finance, dynamic discounting).
- **Beachhead sectors:** manufacturing & logistics - long DSO, concentrated buyers.

## Pilot plan (3 steps)

1. **Sandbox pilot (2-4 weeks).** One buyer, three suppliers, one financier on a
   Canton validator. Run 10-20 anonymized real invoices through
   create → finance → settle. *Success:* the buyer's node never receives the
   margin, a double-pledge attempt is rejected on-ledger, and the financier signs
   off on the AI rate recommendations.
2. **Limited production (6-8 weeks).** Connect the financier's real cash rail
   (token-standard DvP or a fiat PSP bridge). Go live with a capped book
   ($2-5M). *Targets:* advance in < 1 business day; zero double-pledge losses.
3. **Scale.** Add a second competing financier, open supplier self-onboarding, and
   attach the runtime compliance citation (CCPEDIA MCP) in the auditor view so the
   audit trail references the live token-standard CIP.
