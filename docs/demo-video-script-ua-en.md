# LedgerFactor — сценарій демо-відео

**Показувати** — українською · **Говорити (VO)** — англійською.
Звірено з живим сайтом https://ledgerfactor.unitynodes.com 2026-07-22 — усі числа справжні.

> Підготовка (перед записом): відкрий сайт у **новому вікні інкогніто** (щоб дошка була чиста — 0 контрактів). Або в консолі: `localStorage.setItem('lf_sid','demo'+Date.now()); location.reload()`. Перевір: бейдж у шапці = **зелена крапка «LIVE»**; вкладка **Direct financing**; amount **100000**; опис **Q3 pallet delivery**.

---

## Сцена 1 — Проблема (0:00–0:20)

**🎥 Показати:** шапку сайту й чотири порожні колонки — SUPPLIER / BUYER / FINANCIER / AUDITOR.

**🎙 Говорити:**
> "Invoice financing is a multi-trillion-dollar market running on a broken assumption — to fund an invoice, everyone in the deal sees everything. The financier's margin leaks to the buyer, and nothing structurally stops the same invoice being pledged to two lenders at once. LedgerFactor fixes both on Canton — one invoice, four party views, and the margin only reaches the two parties entitled to it, enforced by the ledger, not by this page."

---

## Сцена 2 — Direct financing (0:20–1:40)

### Крок 1
**🎥 Показати:** клік **«1. Supplier issues the invoice ▶»**. З'являється картка INVOICE $100,000 (Issued) — **лише** в колонках SUPPLIER і BUYER; FINANCIER і AUDITOR порожні.
**🎙 Говорити:**
> "The supplier creates the receivable. It appears in the Supplier and Buyer party views — the financier can't see it yet."

### Крок 2
**🎥 Показати:** клік **«2. Buyer confirms the payable ▶»**. Статус міняється на **Confirmed**.
**🎙 Говорити:**
> "Only the buyer can approve. That co-signs an on-ledger attestation that later blocks double-pledging and amount inflation."

### Крок 3
**🎥 Показати:** клік **«3. Supplier lists it to the financier ▶»**. Картка → «listed to financier»; тепер її бачить і FINANCIER.
**🎙 Говорити:**
> "Now — and only now — the financier's party view receives the invoice, which is what lets the agent underwrite it."

### Крок 4
**🎥 Показати:** клік **«4. AI agent underwrites the risk ▶»**. У колонці FINANCIER з'являється картка **AI UNDERWRITING: 89/100 · A · approve · recommended discount 1.97%** + чотири саб-скори (reliability, concentration, dilution, size).
**🎙 Говорити:**
> "A deterministic scoring engine prices the risk — 89 out of 100, band A, approve, recommended discount 1.97% — over four sub-scores. An LLM turns those exact numbers into a plain-English memo and invents nothing. The buyer credit profile is a stated demo assumption."

### Крок 5 — MONEY-SHOT
**🎥 Показати:** клік **«5. Financier makes the offer ▶»**. У SUPPLIER і FINANCIER — картка **FINANCING OFFER · CONFIDENTIAL: MARGIN / DISCOUNT 1.97%, ADVANCE $98,030, SPREAD $1,970**. У BUYER і AUDITOR — **⊘ FINANCING TERMS: «Withheld by the Canton ledger from this participant»**.
**🎙 Говорити:**
> "Here's the whole thesis. The 1.97% margin is now on the ledger — but it appears only in the Supplier and Financier party views. The buyer and the auditor get a redaction bar; the ledger never sent them the rate. Same invoice, four party views, two different pictures — and this is the protocol, not a CSS hide."

### Крок 6 — Settle
**🎥 Показати:** клік **«6. Financier funds - atomic DvP ▶»**. SUPPLIER отримує **CASH $98,030** + FINANCED RECEIVABLE (face $100,000); FINANCIER отримує **CASH $1,970**; BUYER і AUDITOR бачать receivable «face value only». Оригінальний інвойс зникає.
**🎙 Говорити:**
> "Cash to the supplier and the receivable to the financier settle in one transaction. The invoice is consumed, so it can never be financed twice — and the auditor sees face value only, never the margin."

---

## Сцена 3 — Veild sealed-bid auction (1:40–2:30)

### Відкриття
**🎥 Показати:** клік вкладки **«Sealed auction · Veild»**, amount лишається 100000, клік **«Open sealed auction ▶»**. З'являються три учасники: Meridian Capital, Apex Credit, Cobalt Partners.
**🎙 Говорити:**
> "Second mode — a sealed-bid auction. One supplier auctions the invoice to three financiers: Meridian, Apex, Cobalt."

### Запечатати ставки
**🎥 Показати:** клік **«Seal all 3 bids ▶»**. У вигляді «AS Supplier» (майстер-ключ) відкриваються всі три: **Meridian 2.30%, Apex 1.97% (◆ lowest sealed bid), Cobalt 2.14%**.
**🎙 Говорити:**
> "Each desk's bid is a separate contract, disclosed only to that financier and the supplier."

### Асиметрія (VIEW LEDGER AS)
**🎥 Показати:** перемикай вкладки **VIEW LEDGER AS**:
- **AUCTIONEER Supplier** — усі три конверти відкриті, найнижчий позначено (Apex 1.97%).
- **FINANCIER Meridian Capital** — відкритий лише свій конверт (2.30%); Apex і Cobalt = **◆ SEALED BID** (нечитабельні хеші).
- **OBSERVER Buyer / Auditor** — повний блекаут «PRICING WITHHELD BY THE LEDGER».
**🎙 Говорити:**
> "No financier can see a rival's bid — only the supplier sees them all — and this is verified by re-querying the ledger as each party, not by hiding pixels."

### Закриття й розкриття
**🎥 Показати:** повернись на **AUCTIONEER Supplier**, клік **«Close · accept lowest ▶»**. Apex спалахує золотом **«WON THE LOT · 1.97%»**; програшні Meridian і Cobalt = **⊘ WITHHELD**. Банер: **«🔓 REVEALED — Apex Credit wins the lot at 1.97%, the lowest sealed bid. Funds advanced, receivable assigned, losing envelopes archived.»**
**🎙 Говорити:**
> "The supplier accepts the lowest bid and it settles atomically. What the ledger enforces is the sealed-bid privacy and the atomic settlement; picking the lowest is the auctioneer's rule, applied by the server. Losing bids are never revealed."

> ⚠️ НЕ кажи «леджер гарантує, що виграє найнижча ставка» — це серверна конвенція, не правило леджера.

---

## Сцена 4 — Why only Canton + proof (2:30–2:45)

**🎥 Показати:** тримай кадр на чотирьох колонках (або блимни блоком `daml test` з README).
**🎙 Говорити:**
> "This is impossible on a public chain, where sealed bids leak through logs before the reveal. The privacy and the no-double-financing guarantees are proven by Daml Script tests that query the ledger as each party — and the whole thing is live at ledgerfactor.unitynodes.com. Honest scope: cash is a mock holding; the DvP atomicity is real."

---

## Числа, що мають бути на екрані (контроль при монтажі)

| Де | Значення |
|---|---|
| Underwrite | 89/100 · band A · approve · discount 1.97% |
| Money-shot / Offer | margin 1.97% · advance $98,030 · spread $1,970 |
| Settle | supplier CASH $98,030 · financier CASH $1,970 · receivable $100,000 |
| Auction | Meridian 2.30% · Apex 1.97% · Cobalt 2.14% → winner Apex 1.97% |
