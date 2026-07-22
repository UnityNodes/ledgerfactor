# LedgerFactor — demo video script (HackCanton S2 final)

Verified against the **live** product at https://ledgerfactor.unitynodes.com on
2026-07-22 (build `index-Dqo0DMiI.js`, commit after `6f38ad9`). Every on-screen
number and every spoken claim below matches what the site actually does. Target
runtime **~2:45**. Voiceover (VO) is what you say; *режисерські нотатки* are in italics.

> Труїзм подачі: наратив = продукт. Не кажи нічого, чого немає на екрані.

---

## Pre-roll setup (before you hit record)

- Open the site, **Direct financing** tab selected. Click **↺ Reset** so the board is empty.
- Leave **Amount = 100,000**, **Description = "Q3 pallet delivery"** (this is the stable 89 / band A / 1.97% story).
- Confirm the masthead badge shows a **green dot + "LIVE"** (not "CONNECTING"). If it says CONNECTING, wait/refresh.
- *Вимкни авто-play — ручні кліки чистіше лягають на камеру.*
- Desktop capture, four columns fully visible.

---

## Scene 1 — The problem (0:00–0:20)

*ON SCREEN:* masthead + the two mode tabs, four empty party columns (Supplier / Buyer / Financier / Auditor).

**VO:** "Invoice financing is a multi-trillion-dollar market running on a broken
assumption — to fund an invoice, everyone in the deal sees everything. The
financier's margin leaks to the buyer, and nothing structurally stops the same
invoice being pledged to two lenders at once. LedgerFactor fixes both on Canton —
one invoice, four party views, and the margin only reaches the two parties entitled
to it, enforced by the ledger, not by this page."

---

## Scene 2 — Direct financing to the money-shot (0:20–1:40)

*ON SCREEN:* step through with the primary button, one click per beat.

1. **Issue** — click *"Supplier issues the invoice"*.
   **VO:** "The supplier creates the receivable. It appears in the Supplier and
   Buyer party views — the financier can't see it yet."

2. **Confirm** — click *"Buyer confirms the payable"*. Status pill flips to **Confirmed**.
   **VO:** "Only the buyer can approve. That co-signs an on-ledger attestation that
   later blocks double-pledging and amount inflation."

3. **List** — click *"Supplier lists it to the financier"*.
   **VO:** "Now — and only now — the financier's party view receives the invoice,
   which is what lets the agent underwrite it."

4. **Underwrite** — click *"AI agent underwrites the risk"*.
   *Режисер: переконайся, що бейдж читається **"AI"** (не "RULES") — на живому деплої стоїть LLM-ключ.*
   **VO:** "A deterministic scoring engine prices the risk — 89 out of 100, band A,
   approve, recommended discount 1.97% — over four sub-scores: reliability,
   concentration, dilution, size. An LLM turns those exact numbers into a plain-English
   memo and invents nothing. The buyer credit profile is a stated demo assumption,
   labeled as such."

5. **Offer — THE MONEY-SHOT** — click *"Financier makes the offer"*. Gold banner appears.
   *ON SCREEN:* Supplier + Financier show **MARGIN/DISCOUNT 1.97%, ADVANCE $98,030,
   SPREAD $1,970**; Buyer + Auditor show a **redaction bar**.
   **VO:** "Here's the whole thesis. The 1.97% margin is now on the ledger — but it
   appears only in the Supplier and Financier party views. The buyer and the auditor
   get a redaction bar; the ledger never sent them the rate. Same invoice, four party
   views, two different pictures — and this is the protocol, not a CSS hide."

6. **Settle (atomic DvP)** — click *"Financier funds — atomic DvP"*.
   *ON SCREEN:* Supplier gets **CASH $98,030**, a **FINANCED RECEIVABLE (face $100,000)**
   appears for Financier/Buyer/Auditor, original invoice consumed.
   **VO:** "Cash to the supplier and the receivable to the financier settle in one
   transaction. The invoice is consumed, so it can never be financed twice — and the
   auditor sees face value only, never the margin."

---

## Scene 3 — Veild sealed-bid auction (1:40–2:30)

*ON SCREEN:* click the **"Sealed auction · Veild"** tab. Keep amount 100,000, click **"Open sealed auction"**.

**VO:** "Second mode — a sealed-bid auction. One supplier auctions the invoice to
three financiers: Meridian, Apex, Cobalt."

1. **Collect bids** — under *◈ COLLECT SEALED BIDS* click each desk (or "Seal all 3").
   *ON SCREEN:* Meridian **2.30%**, Apex **1.97%**, Cobalt **2.14%** (each from its own risk config).
   **VO:** "Each desk's bid is a separate contract, disclosed only to that financier
   and the supplier."

2. **View as… — the asymmetry** — use the **VIEW LEDGER AS** tabs.
   - As **Supplier**: all three envelopes open, lowest tagged (**Apex 1.97%**).
   - As **Meridian**: only Meridian's own envelope opens; the other two stay wax-sealed.
   - As **Buyer / Auditor**: full **PRICING WITHHELD BY THE LEDGER** blackout.
   **VO:** "No financier can see a rival's bid — only the supplier sees them all — and
   this is verified by re-querying the ledger as each party, not by hiding pixels."

3. **Close & reveal** — back as **Supplier**, click **"Close · accept lowest"**.
   *ON SCREEN:* Apex bursts gold — "WON THE LOT · 1.97%".
   **VO:** "The supplier accepts the lowest bid and it settles atomically. What the
   *ledger* enforces is the sealed-bid privacy and the atomic settlement; picking the
   lowest is the auctioneer's rule, applied by the server. Losing bids are never revealed."

> ⚠️ Не кажи "леджер гарантує, що виграє найнижча ставка" — це неправда. Леджер гарантує приватність запечатаних ставок + атомарність; вибір найнижчої = серверна конвенція.

---

## Scene 4 — Why only Canton + proof (2:30–2:45)

*ON SCREEN:* optionally flash the README `daml test` block or just hold on the four columns.

**VO:** "This is impossible on a public chain, where sealed bids leak through logs
before the reveal. The privacy and the no-double-financing guarantees are proven by
Daml Script tests that query the ledger as each party — and the whole thing is live at
ledgerfactor.unitynodes.com. Honest scope: cash is a mock holding; the DvP atomicity
is real."

---

## Exact figures that must appear on screen (sanity check while editing)

| Where | Value |
|---|---|
| Underwrite | score **89/100**, band **A**, decision **approve**, discount **1.97%**, annualized **12%** |
| Offer money-shot | margin **1.97%**, advance **$98,030**, spread **$1,970** |
| Auction bids (100k) | Meridian **2.30%**, Apex **1.97%**, Cobalt **2.14%** → winner **Apex 1.97%** |
| Badge | underwriting strip reads **AI** (LLM live) |

---

## Post-production acceptance checklist (before you upload)

*Витягнуто з ~/brain/bugs/2026-07-17-demo-video-preflight.md — реальні дефекти, що вже ловились.*

```bash
# 1. є і відео, і аудіо-доріжка?
ffprobe -v error -show_streams demo.mp4 | grep codec_type
# 2. гучність (YouTube тихе НЕ підсилює): ціль -14..-16 LUFS integrated
ffmpeg -i demo.mp4 -af loudnorm=print_format=summary -f null -
# 3. немає битих кадрів
ffmpeg -v error -i demo.mp4 -f null -
# 4. CFR, без judder
ffmpeg -i demo.mp4 -vf vfrdet -an -f null - 2>&1 | grep VFR   # VFR:0 = добре
# 5. метадані чисті — НЕ має бути apple.quicktime.artwork (CapCut тягне AI-прапорці)
ffprobe -show_entries format_tags demo.mp4
```

Fix loudness + faststart + strip metadata in one pass (video copied, без втрати якості):

```bash
# pass 1 (виміряти):
ffmpeg -i demo.mp4 -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -
# pass 2 (застосувати виміряні значення measured_*):
ffmpeg -i demo.mp4 \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=..:measured_LRA=..:measured_TP=..:measured_thresh=..:offset=..:linear=true" \
  -c:v copy -c:a aac -b:a 192k -ar 44100 \
  -map_metadata -1 -movflags +faststart demo-final.mp4
```

- Завжди тримай бекап оригіналу (`demo.orig.mp4`) для миттєвого реверту.
- Перевір, що `moov` йде **перед** `mdat` (faststart) — інакше відео не грає одразу і перемотка ламається.
