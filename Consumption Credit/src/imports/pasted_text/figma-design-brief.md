# Figma Design Brief — ConsumptionCredit

Give this whole document to whoever's designing (or paste into Figma's AI
First Draft / Figma Make). It's written to produce a **distinctive, working
clickable prototype** — not another generic fintech-template look.

---

## 0. The Brief in One Line

A UPI-native consumption credit app where borrowing feels as ordinary and
transparent as paying — designed around the **passbook**, not the
"neobank card stack" every fintech app already looks like.

---

## 1. Why NOT the Default Fintech Look (read this first)

Every AI-generated fintech UI converges on the same three moves: a big
gradient credit-card mockup at the top, purple-to-blue gradients on CTAs,
and rounded pill-shaped stat cards ("Total Balance ₹42,350" in a huge
font with a tiny sparkline). That is the "vibe-coded" look — avoid it
entirely. Also avoid: Inter/Poppins as the only typeface, glassmorphism
cards, neon green "+12%" badges, and a dark navy background with electric
blue accents (the other default cluster).

Instead, root the design in something **specific to this product's actual
world**: Indian bank passbooks, UPI receipt slips, and ledger books — the
physical artifacts this app is digitizing. This isn't nostalgia for its own
sake — it's the one visual idea most fintech apps in this exact category
(super.money, PhonePe, Kotak811) have NOT used, because they all reach for
"modern neobank" instead. That gap is the opportunity.

---

## 2. Design Token System

### Color (named, not generic)
- `--ledger-paper: #F7F3EA` — warm off-white background, like passbook paper
  (NOT the AI-cliché cream #F4F1EA — shift warmer/yellower to feel like
  actual paper, not a design trend)
- `--ink: #1C1A17` — near-black, warm-toned, like fountain pen ink — primary text
- `--stamp-indigo: #2B3A67` — deep indigo, used for primary actions and the
  "your money" mode — evokes bank-stamp ink, not a generic brand blue
- `--credit-rust: #A8532E` — burnt rust/terracotta-adjacent but distinctly
  earthier and darker than the AI-cliché #D97757 — used ONLY for
  credit-mode elements (the "borrowed money" signal color) so it always
  means the same thing everywhere in the app
- `--ledger-line: #C9C0AC` — muted tan, for rule lines and dividers (like
  ruled passbook lines)
- `--signal-green: #3F6B4A` — muted, desaturated green for success/on-time
  states — NOT neon green

### Typography
- **Display/numerals face:** a monospaced or tabular-lining serif or slab
  serif (e.g., something in the family of Spectral, Fraunces, or a slab
  like Roboto Slab used ONLY for amounts) — money should always be set in
  the same tabular face so columns of rupee amounts align like a real
  ledger. This is the signature typographic choice.
- **Body/UI face:** a plain, humanist sans (e.g., IBM Plex Sans or Public
  Sans) — quiet, legible, does not compete with the ledger numerals
- **Never use the same font for both roles** — the contrast between
  "ledger serif for money, plain sans for everything else" IS the design
  language.

### Layout
- Base unit: 8px grid, but lean into **ruled horizontal lines** (like
  passbook rows) as the primary structural device instead of cards-in-a-grid.
  Transaction lists, statements, and even the dashboard should read like
  rows in a ledger, not floating rounded cards.
- Corner radius: small and consistent (4px) — NOT the default 16–24px
  "soft AI app" rounding. This is a deliberate, slightly stern choice that
  reinforces the passbook/ledger feel.
- Use a **left-aligned running margin line** (like a passbook's left rule)
  on list screens — a single vertical hairline that transaction rows sit
  against, with the date/amount always right-aligned in the tabular numeral
  face.

### Signature Element
A **"stamp" component** — every state-changing action (consent granted,
transaction settled, repayment received, limit increased) produces a small
circular or hexagonal "stamp" mark next to the ledger row, like a bank
teller's ink stamp — with a subtle rotation (2–4°) so it looks physically
stamped, not perfectly placed. This is the one memorable, slightly bold
element; everything else stays quiet and disciplined around it.

### Motion
- Minimal. The "stamp" appears with a quick scale+rotate-in (150ms) on
  state change — this is the one deliberate animation moment.
- Screen transitions: simple slide/fade, no bouncy spring physics anywhere.
- Respect reduced-motion — stamps and transitions should have a static
  fallback.

---

## 3. Screens to Design (map 1:1 to the 8 backend features)

Design these as full-fidelity frames, then wire them together with Figma
prototyping (see Section 5) so it's a genuinely clickable, "working" demo.

1. **Onboarding / Link Credit Line** — consent screen (Feature 02). Show the
   consent scope in plain language ("This lets you spend up to a limit
   we'll assign, repayable monthly), NOT buried legal text. A big, single
   "Grant Consent" stamp-style CTA.

2. **Home / Passbook Dashboard** — the main screen. Ledger-style list of
   recent activity (rows, not cards), current limit + utilized shown as a
   simple ruled progress line (not a circular gauge — avoid the cliché),
   and clear "Own Money" vs "Credit Line" balance split at the top.

3. **Payment / Spend Screen** (Features 02 + 03 + 05) — UPI-style
   scan-or-enter flow, with an explicit, unavoidable **mode toggle**:
   "Pay with Own Money" / "Pay with Credit Line" — never defaulted
   silently. When credit mode is on, show remaining limit right there
   before confirming.

4. **Pending Confirmation Screen** (Feature 04) — for large transactions:
   a clear "Held for 1 hour — cancel anytime" state with a visible
   countdown, not a spinner. This is a moment to build trust, not hide
   the delay.

5. **Unified Statement / Billing Screen** (Feature 06) — this is where the
   ledger metaphor pays off most: one long ruled list of every line item
   across all lenders/products, grouped by billing period, with total due
   and minimum due set in the tabular numeral face.

6. **Repayment Screen** (Feature 06) — simple amount entry, allocation
   shown transparently if split across lenders ("₹2,000 → Axis Bank line,
   ₹1,500 → DMI Finance line") — don't hide the allocation logic from the
   user.

7. **Limit Growth Notification** (Feature 07) — a distinct "stamped"
   passbook entry: "Limit increased to ₹35,000 — 4 consecutive on-time
   repayments." Always show the reason inline, never a bare number change.

8. **BNPL Checkout Split Screen** (Feature 08) — at the payment screen,
   an expandable "Split into installments" option showing 2/3/4-installment
   previews with exact per-installment amounts before confirming — no
   hidden fees revealed later.

Also design: an **empty state** (new user, no credit line yet — this
should feel like an inviting blank ledger page, not a sad-face illustration),
a **declined transaction state** (clear reason shown, in the interface's own
voice — "Limit reached for this cycle," not a vague error), and a **loading
state** (a single understated stamp-forming animation, not a spinner).

---

## 4. Component Library to Build in Figma

- `LedgerRow` — the core list-item component (date, description, amount in
  tabular numerals, optional stamp)
- `StampBadge` — status indicator (settled / pending / declined / grown),
  variants for each state color
- `ModeToggle` — Own Money / Credit Line switch, used on every payment screen
- `RuledProgressBar` — a horizontal line-based limit/utilization indicator
  (not a circular gauge)
- `PrimaryStampButton` — the main CTA style across the app
- `AmountDisplay` — enforces the tabular numeral face + right-alignment
  rule everywhere money appears, so no screen ever breaks the ledger
  alignment convention

Build each with proper Figma variants (default/hover/pressed/disabled) and
auto-layout so the prototype behaves responsively.

---

## 5. Making It "Working" — Prototype Requirements

This must be a real clickable prototype, not static frames:

- Wire the full flow: Onboarding → Home → Payment → (Pending Confirmation
  if large amount) → Home (updated ledger) → Statement → Repayment →
  (occasionally) Limit Growth notification.
- Use Figma's **Interactive Components** for the `ModeToggle` and
  `StampBadge` so state changes are visible while clicking through, not
  just described.
- Add real conditional logic where Figma supports it (Smart Animate
  between "before payment" and "after payment" states on the Home screen,
  so the ledger visibly gains a new row with its stamp animating in).
- Every button must go somewhere — no dead-end frames. If a screen isn't
  fully designed yet, link it to a clearly marked "Coming soon" placeholder
  rather than leaving the prototype link broken.
- Test the full click-through yourself before the demo — a working
  prototype with 8 screens beats a beautiful one that dead-ends on screen 3.

---

## 6. Copy Guidelines (don't skip this)

- Name things by what the user controls: "Pay with Credit Line," not
  "Initiate credit disbursal."
- Buttons keep their name through the whole flow: if it says "Grant
  Consent," the confirmation says "Consent granted," not "Success!"
- Errors state what happened and what to do, in the app's own voice:
  "Limit reached for this cycle. Repay early to free up room." — never
  "Oops! Something went wrong."
- No exclamation-point enthusiasm anywhere. This app is a passbook, not a
  celebration confetti screen.

---

## 7. Deliverable Checklist

- [ ] Token system applied consistently (colors, both typefaces, 4px radius)
- [ ] All 8 screens + empty/declined/loading states designed
- [ ] Component library with variants, not one-off elements per screen
- [ ] Full clickable prototype, every button wired, tested end-to-end
- [ ] Copy follows the voice guidelines above, not generic SaaS copy
- [ ] Self-critique pass: does any screen look like it could be any other
      fintech app with the logo swapped? If yes, revise it.