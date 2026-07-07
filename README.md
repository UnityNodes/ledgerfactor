# LedgerFactor

Confidential invoice financing on Canton. A supplier discounts a buyer-approved
invoice to a financier, the financier's margin is hidden from the buyer **by the
protocol**, and the ledger **structurally** guarantees one invoice can never be
financed twice.

Built for HackCanton S2 - Track 2 (Financial Applications) + Track 1 (RWA &
Business Workflows).

## Why this runs only on Canton

Three guarantees are enforced by the ledger, not by the UI:

1. **Selective disclosure (margin privacy).** The financier's discount rate lives
   on `FinancingOffer` / `FinancingProposal`, whose stakeholders are only the
   financier and the supplier. The buyer is never a stakeholder, so the margin
   never reaches the buyer's participant node. Ported to a public chain the
   payable and its pricing leak.
2. **Single-exercise uniqueness (anti-double-pledge).** The `Invoice` is one
   authoritative contract. `AcceptFinancing` is a *consuming* choice that archives
   it, so a second financing attempt on the same invoice is rejected at the
   ledger - not policed by an off-chain registry.
3. **Atomic DvP.** Assigning the receivable to the financier and paying the
   supplier the discounted cash settle in a single transaction. Either both legs
   happen or neither does.

## The model (`daml/LedgerFactor.daml`)

| Template | Signatory | Observer | Carries the margin? |
|---|---|---|---|
| `Invoice` | supplier | buyer, (listed financier) | no |
| `FinancingProposal` | financier | supplier | **yes** |
| `FinancingOffer` | financier, supplier | - | **yes** |
| `FinancedReceivable` | financier | buyer, auditor | no |
| `Cash` (mock) | owner | - | no |

End-to-end flow:

1. **Supplier** issues an `Invoice` (buyer is an observer).
2. **Buyer** exercises `Confirm` to approve the payable.
3. **Supplier** exercises `ListForFinancing` to disclose the invoice to a chosen
   financier. This is what lets the financier's credit-scoring agent read the
   invoice at all - disclosure is the gate, enforced by Canton.
4. **Financier** creates a `FinancingProposal` with the AI-recommended discount
   rate. Only the supplier can see it; the buyer cannot.
5. **Supplier** exercises `AcceptProposal`, producing a co-signed `FinancingOffer`
   whose margin is scoped to financier + supplier only.
6. **Financier** exercises `AcceptFinancing`. In one atomic transaction this
   consumes the invoice, pays the supplier the discounted advance in mock `Cash`,
   returns the financier's change, and mints a `FinancedReceivable` that the buyer
   and auditor observe at **face value only** - never the margin.

## The two money-shots (proven, not asserted)

Both are Daml Script tests in `daml/Tests.daml`, checked at the ledger by querying
as each party:

- `testSelectiveDisclosure` - the buyer queries the ledger for `FinancingOffer`
  and `FinancingProposal` and gets **nothing**, while financier and supplier both
  see the offer with its margin. The buyer still sees the invoice itself. Privacy
  is enforced by Canton, not by a React filter.
- `testNoDoubleFinancing` - two competing offers are raised on the same invoice.
  The first `AcceptFinancing` succeeds; the second is **rejected by the ledger**
  because the invoice contract is already consumed.

`testHappyPathSettlement` additionally proves the atomic DvP: the supplier is paid
97,000 on a 100,000 invoice at a 3% discount, the original receivable is gone, and
the auditor sees the financed receivable at face value with no margin.

```
daml/Tests.daml:testSelectiveDisclosure: ok, 2 active contracts, 4 transactions.
daml/Tests.daml:testNoDoubleFinancing:   ok, 5 active contracts, 11 transactions.
daml/Tests.daml:testHappyPathSettlement: ok, 3 active contracts, 7 transactions.
```

## Run it

Prerequisites: Daml SDK 2.10.4 and a JDK (17 works).

```bash
daml build   # compiles the DAR
daml test    # runs the money-shot scripts against the in-memory ledger
```

## Notes and honest scope

- **Mock cash.** `Cash` is a bearer token signed by its owner - a stand-in for a
  token-standard holding so the DvP is demonstrable this weekend. The atomicity of
  the swap is real; the cash model is not production-grade. Real token-standard DvP
  is a stretch goal.
- **Notified factoring.** `ListForFinancing` reveals the financier's identity to
  the buyer (the buyer observes the invoice). The commercially sensitive figure -
  the pricing/margin - stays hidden. Undisclosed factoring, which hides the
  financier from the buyer too, would use Canton explicit disclosure and is a
  stretch.

## Status

- [x] Daml model + both money-shots proven by Daml Script
- [ ] Ledger JSON API + 3-role frontend (supplier / buyer / financier / auditor)
- [ ] AI credit-scoring agent (rules engine + LLM explanation)
- [ ] Business brief + pilot plan
