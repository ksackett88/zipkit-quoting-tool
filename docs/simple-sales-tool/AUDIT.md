# Simple sales tool: audit and proposed flow

Branch `simple-sales-tool`. Written 2026-10-20 for Kelsey. Nothing is built yet.

The goal: a rep who didn't build this goes from quote to signed contract with no one explaining it. Prices stay identical (the pricing check, 168/168 today, must pass before and after). Business rules stay at least as strict as today.

Key: **Keep**, **Merge** (fold into another control), **Advanced** (behind "Advanced"), **Remove**. ⚠ = a rep would find it confusing today.

---

## 1. What exists today

Reps use three pages:
1. **Quote tool** (`quote.html`): four steps (Customer, Product, Options, Review).
2. **Contract generator** (`ZipKit_Contract_Generator.html`): four tabs (Shell Kit, Modular, Custom Home, Change Order).
3. **Sales portal** (`index.html`): the project list, invoices and payments.

The old quote tool (`ZipKit_Quoting_Tool.html`) is still live and linked from the portal's "+ New quote".

**Fulfillment tracker:** I couldn't find one. Nothing anywhere records production, shipping or delivery status. The portal's "Invoices & Payments" is the only after-sale tracking. If the tracker lives somewhere else (a sheet, another site), tell me where.

### 1a. Quote tool (`quote.html`)

| Screen | Item | Today | Mark | Why |
|---|---|---|---|---|
| Frame | Brand badge, step bar, Portal link, sign-in | Always | Keep | |
| Customer | Buyer name (required) | | Keep | |
| Customer | Email, Phone | Optional | Keep | |
| Customer | City | Optional | Keep | |
| Customer | **State** | Optional | **Keep, make required** ⚠ | Today a blank State skips the modular out-of-area block and the assembly warning. Required = stricter, not looser. |
| Customer | Project name | Optional | Advanced | Defaults to "<model> project". |
| Product | Type tabs (Panelized kits, Modular, Steel kit, Garages, Hangars, Custom home) | Switching wipes entries ⚠ | Keep | Ask before wiping. |
| Product | Search models | | Keep | |
| Product | Model cards (photo, size, "Kit from / Complete from / Starting at") | | Keep | One wording: "Starting at". |
| Product | Steel/custom: Project name, Frame/Build price, Engineering, Sq ft | A second "Project name" field ⚠ | Merge | One "What's being built" name. |
| Options | Units stepper | | Keep | |
| Options | Delivery distance (miles) | | Keep | |
| Options | Snow load (PSF tiers) | Jargon ⚠ | Keep | Plain labels: "Normal / Heavy / Very heavy snow", with PSF in small text. |
| Options | Site assembly: "Price as listed / Curb delivery only / Add our assembly crew" | Confusing ⚠ | Keep, reword | "Who puts it together?" Our crew (separate contract) / Buyer or their crew / Curb delivery (credit). |
| Options | Windows & doors package (kits) | Under "More options". Label says "core states only", which isn't enforced ⚠ | Keep (optional) | "None" stays the default. Drop "core states only". |
| Options | Window upgrade (modular) | | Keep | |
| Options | Model add-ons (XL 470, Yellowstone) | | Keep | |
| Options | Multi-unit discount % (up to 15) | Hidden at 1 unit, but still applied ⚠ | Advanced | Fix: reset to 0 when units drop to 1. |
| Options | Mirrored or changed homes (+50% engineering) | | Advanced | |
| Options | Roof dry-in | Looks like a price, adds $0 ⚠ | Advanced | Labeled "scope only". |
| Options | Promo: credit design retainer toward engineering | Jargon ⚠ | Advanced | |
| Options | Customer already paid design retainer / engineering | | Advanced | |
| Options | Add-ons and credits (free lines) | Negative amounts need no reason ⚠ | Advanced | A credit requires a reason, like price adjustments. |
| Options | Adjust a price (unit, windows, shipping, design; reason required) | Inconsistent zero handling ⚠ | Advanced | Same rule for every field: blank = standard, 0 = $0. Reason still required. |
| Options | Steel/custom shipping rate | Overrides price with no reason ⚠ | Advanced | Reason required when changed. |
| Options | Steel/custom "What's included" | | Advanced | |
| Options | Custom design tier ($2,500 / $3,500) | | Keep (custom only) | |
| Options | Custom "Change the schedule" | | **Merge** | Moves into the payment schedule editor at the Contract step. |
| Options | Live summary and phone total bar | | Keep | |
| Review | Warnings (out of area, assembly, price adjustments) | | Keep | |
| Review | Buyer card, payment schedule card, summary | | Keep | |
| Review | "You (on the documents)" rep card | Optional, invisible when signed out ⚠ | Keep, required once | Ask once, then remember. |
| Review | Save project / Create document / Make the contract | Three buttons, all save ⚠ | Merge | Saving is automatic. Two actions: "Send a proposal" and "Write the contract". |
| Review | Document dialog: Proposal / Ballpark (low/high) | | Keep. Ballpark: Advanced | |
| Review | Start a new quote | Clears with no confirmation ⚠ | Keep, add confirm | |

### 1b. Contract generator (`ZipKit_Contract_Generator.html`)

| Area | Item | Today | Mark | Why |
|---|---|---|---|---|
| Top | "Before you start" banner | Describes the shell schedule only ⚠ | Remove | The schedule editor replaces it. |
| Top | Tabs: Shell Kit / Modular / Custom Home / Change Order | Rep picks the contract type ⚠ | **Remove** | The quote decides the contract type. Change Order becomes an action on a signed contract. |
| Buyer card | Legal name, project, phone, email, mailing address, site address, "Ship to city, state", contract date, salesman | Re-typed. Salesman and site address not filled from the quote ⚠ | Merge | Comes from the quote. The Contract step asks only for what's missing: legal name, mailing and site address. |
| Shell | Model, snow, windows, miles | Duplicates the quote ⚠ | Remove | From the quote, read-only, with a "Change the quote" link. |
| Shell | Custom line items | | Merge | From the quote's add-ons. |
| Shell | Design retainer override, PROMO credit, Already paid (design, engineering) | **Promo stays on for the next customer** (saved in the browser) ⚠ | Merge | From the quote, never remembered across customers. |
| Shell | "Also generate the Set Services contract" | Shell tab only, but also fires on Custom ⚠ | Keep | Automatic when the quote has "Add our assembly crew"; shown as a second document. |
| Shell | Scope of work (27 rows) | **Never prints on the shell contract** ⚠ | Advanced | Make it print, or remove it. Your call. |
| Modular | Model, units, miles | | Remove | From the quote. |
| Modular | "Negotiated total price (override)" | Filled automatically from the quote, so later changes don't move it ⚠ | Remove | The quote total is the price. Changes go back through the quote's "Adjust a price" (reason required). |
| Modular | Payment schedule override | Invalid totals silently fall back to the default ⚠ | **Merge** | Into the new schedule editor, every contract type. Must total 100%. |
| Modular | Scope of work (Seller vs Buyer), Specifications | Specs hard-code Cascade black windows ⚠ | Advanced | Specs default from the model. |
| Custom | Name, sq ft, build cost, engineering, miles, rate, windows label and price, cover photo | | Merge | From the quote. Cover photo: Advanced. |
| Custom | Scope of work | Prints | Advanced | |
| Change Order | Brand, dates, original total, additions, deductions, days, reason | Deductions aren't made negative, despite the note ⚠ | Keep (separate) | "Change order" button on a saved contract. Deductions negative automatically. |
| Right column | Contract summary, total, payment schedule preview | | Keep | Becomes the Review panel. |
| Toolbar | Portal, My Projects, Generate (duplicate), Plan Set Transmittal, Save Project, Sign out | **Save always makes a new copy** ⚠. Toolbar vanishes if not signed in ⚠ | Merge | One "Save" that updates. Generate once. Plan Set Transmittal: Advanced. |
| Modals | My projects (contracts only), Payments | | Merge | Into the portal. |

**Contract types today:** shell (panelized kit), modular, custom, change order, and the Set Services Agreement.
- Garage, hangar and steel have no contract. They are dropped into the Custom Home contract with a warning ⚠.
- The modular contract prints the payment schedule **three different ways** (section 3) ⚠.
- None of the business rules exist in the contract generator. Opening it directly skips them all ⚠.

### 1c. Sales portal (`index.html`)

| Item | Today | Mark | Why |
|---|---|---|---|
| "+ New quote" | Opens the **old** tool ⚠ | Keep | Goes to the new tool. |
| "+ New contract" | Contract without a quote ⚠ | Remove | Contracts start from a quote, so the rules apply. |
| Special invoice (top bar) | Logs nothing, PDF only ⚠ | Advanced | Keep the per-project one. |
| Search, brand and status filters | | Keep | |
| Stat tiles: Total Contracted / Paid / Outstanding | Count unsigned quotes as money ⚠ | Keep, fix | Contracts only. |
| "Outstanding" | Two different meanings ⚠ | Keep, fix | "Owed on contracts" vs "Invoiced, not paid". |
| Card status: Quote / Contract / Paid | | Keep | Add "Signed", "Sent". |
| "$ Payments" on quotes | Invoices on unsigned quotes ⚠ | Remove on quotes | |
| "×" delete on every card | Reps can delete anything they see ⚠ | Advanced (admin) | Reps archive; admins delete. |
| Invoice form: billing stage, invoice #, description, amount, date, rep name/email/phone | Rep fields on every invoice; free-text numbers ⚠ | Merge | Stage drives the rest. Rep fields from the profile. |
| "Log invoice" / "Log + Generate PDF" / "Special invoice…" | Three buttons ⚠ | Merge | "Create invoice" (logs and makes the PDF). |
| Payments: amount, note, date | | Keep | Link a payment to its invoice. |
| Invoice PDF marks earlier stages "PAID" when only invoiced | ⚠ | Fix | |
| Setup error text (SQL instructions) shown to reps | ⚠ | Remove | |
| Supabase library from CDN "latest 2.x" | ⚠ (one failed load today) | Fix | Pin an exact version. |

---

## 2. Business rules: today, and what the rebuild keeps

| Rule | Today | Rebuild |
|---|---|---|
| Complete modular only in UT, ID, MT, WY | Proposal and contract blocked in the new quote tool. Skipped if State is blank. Not in the contract generator at all | Same block. State required. Enforced at the Contract step too |
| Assembly crew only in UT, ID, WY, MT, CO, AZ, NV | **Warn only** (your 2026-10-14 decision) | Same warning. **Confirm:** keep warn-only, or block? |
| Steel DIY east of the wood line | **Not in the rep tool.** Only the customer quoter has it: wood kits and garages in UT, ID, MT, WY, CO, AZ, NV, NM, CA, OR, WA; steel everywhere, DIY only outside those | **Confirm:** add it to the rep tool (no assembly crew for steel or hangars outside those 11 states)? |
| State limits for panelized kits | None in the rep tool (the customer quoter limits them to the 11 states) | **Confirm:** keep the rep tool unlimited (today), or match the customer quoter? |
| Windows and doors optional | Kits: "Not included" by default. Modular: standard windows included, upgrades optional | Same |
| Units 1 to 50; discount up to 15% | Yes | Same |
| Price changes need a reason | Adjustments yes; credits and steel/custom shipping rate no | Every change needs a reason |
| MVP | Parked: hidden in the new tool, MVP quotes open the old copy | Same. This rebuild is Zip Kit only |

---

## 3. Payment schedules today (verbatim), and the conflicts

### Panelized kit (the current kit contract)

The amounts work like this:
- Payment 1 is the model's **engineering**, a fixed dollar amount.
- Payments 2 to 4 are **45% / 45% / 10% of the remainder**: the contract total less engineering.
- The $2,500 design retainer is separate and paid up front.

**Section 5, "Purchase Price and Payment Terms"** (the legal section):

| Payment | When due (verbatim) |
|---|---|
| Payment 1 — Engineering | "Due upon execution of this Agreement. Delivers full submit-ready, engineer-stamped plans within four (4) weeks and reserves Buyer's production slot." |
| Payment 2 — Materials Procurement (45%) | "45% of the contract remainder. Due within ten (10) calendar days of Seller's written notice of engineering delivery. Reimburses Seller for lumber, structural components, hardware, and all raw materials procured specifically for Buyer's Kit (non-refundable — see Section 5)." |
| Payment 3 — Pre-Shipment (45%) | "45% of the contract remainder. Due within ten (10) calendar days of Seller's written notice of fabrication completion. Seller will not begin loading the Kit until Payment 3 is received in full." |
| Final Payment — Load Confirmation (10%) | "10% of the contract remainder. Due upon Seller's Load Confirmation. Payment Confirmation must be received before the truck departs Seller's yard." |

⚠ **Conflict in the same document:** the page-2 timing table says the final 10% is "Due when framing and Zip Kit Homes scope of work is completed onsite." Section 5 says "Load Confirmation", before the truck leaves. The legal text also says the Seller does no on-site work. The Custom Home contract has the same conflict.

### Modular (three versions in one contract) ⚠

| Where | Schedule |
|---|---|
| Screen note | "standard 30/30/30/10 modular split" |
| Cover table (what the totals use) | 5% Design & Engineering · 30% Materials & Production · 30% Construction Begins · 30% Factory Completion · 5% Set & Completion |
| Legal Section 4 (never changes, even with the override) | 30% Materials Procurement, due at signing (non-refundable) · 30% Framing Completion · 30% Exterior Siding and Interior Paint Completion (units not released for shipment until paid) · 10% Final, on-site on the crew's last day |

Your new modular preset matches the legal Section 4 milestones, but splits 5/30/30/30/5.

---

## 4. Proposed flow

```
1 Customer  →  2 Model & location  →  3 Options  →  4 Review quote  →  5 Contract  →  6 Send
```

- One page, one project, saved automatically.
- The step bar shows where you are.
- Every screen has one main button, bottom right. Back is always visible, phones included.
- Anything rarely used sits under **Advanced**, closed by default, with a count when something inside is set.

### 1 Customer
```
┌ Who is this for? ─────────────────────────────┐
│ Buyer name*                                   │
│ State* [Choose…]      City                    │
│ Email                 Phone                   │
│ ▸ Advanced: project name                      │
│                        [Next: pick a model →] │
└───────────────────────────────────────────────┘
```
State is required because it decides what can be sold and built there.

### 2 Model & location
```
┌ What are they buying? ───────────────────────┐
│ [Panelized kit][Modular][Garage][Hangar]     │
│ [Steel][Custom]                              │
│ 🔍 Search models                              │
│ ┌photo┐ Alpine    2,372 sq ft  Starting at $…│
│ ┌photo┐ Kolob     2,955 sq ft  Starting at $…│
│ Modular outside UT/ID/MT/WY: the tab shows   │
│ "Not sold in TX — quote a panelized kit"     │
│ and can't be picked.                         │
└──────────────────────────────────────────────┘
```
Steel and custom: "What's being built", Price from the estimator, Engineering, Sq ft.

### 3 Options (defaults make a complete quote)
```
┌ Kolob ─────────────────────────┬ Price ──────┐
│ How many? [−] 1 [+]            │ Kit    $…   │
│ Miles to the site [   0 ]      │ Ship   $…   │
│ Snow: (•) Normal ( ) Heavy …   │ Total  $…   │
│ Who puts it together?          │             │
│ (•) Buyer/their crew           │             │
│ ( ) Our crew  ( ) Curb only    │             │
│ Windows & doors [None ▾]       │             │
│ ▸ Advanced (discount, mirrored,│             │
│   promo, paid, credits, adjust │             │
│   a price)                     │             │
│                  [Review →]    │             │
└────────────────────────────────┴─────────────┘
```

### 4 Review quote
Buyer, what's included, price, and any warnings. Two buttons: **[Send a proposal]** and **[Write the contract →]**.
- The proposal and ballpark open as printable PDFs. The ballpark sits under Advanced.

### 5 Contract
```
┌ Contract for Pat Buyer · Kolob ──────────────────────┐
│ Only what the quote doesn't have:                    │
│ Legal name*   Mailing address*   Site address*       │
│ Contract date [today]                                │
│ ── Payment schedule ── preset [Panelized kit ▾] ──   │
│  %    Milestone (wording prints as-is)          $    │
│ [ fixed] Engineering — due on signing      $14,275 × │
│ [ 45 ] Materials, within 10 days of …      $…      × │
│ [ 45 ] Pre-shipment, within 10 days of …   $…      × │
│ [ 10 ] Final, at Load Confirmation         $…      × │
│ [+ Add a payment]          Total 100% ✓  $…          │
│ ▸ Advanced: scope of work, specifications,           │
│   Set Services details, plan set transmittal         │
│                       [Create contract PDF →]        │
└──────────────────────────────────────────────────────┘
```

**The payment schedule editor** is on every contract type:
- Add or remove rows, and change the percent and the milestone wording.
- A running total shows. **"Create contract" stays disabled until it's exactly 100%**, with a plain message explaining why.
- The contract prints exactly the rows on screen, in the cover table **and** the legal payment section (see question 1).
- Presets: Panelized kit, Modular, Modular multi-unit, Custom (same as kit), Garage / Hangar / Steel (same as kit), and "Start blank".

**Presets:**
- **Panelized kit:** Engineering (fixed $), then 45 / 45 / 10 of the rest, with the Section 5 wording above. Design retainer separate.
- **Modular:** 5% Design & engineering · 30% At signing · 30% Framing complete · 30% Siding and interior paint complete · 5% At install.
- **Modular multi-unit** (offered when units ≥ 2):
  1. 5% Design & engineering
  2. 30% At signing
  3. 15% Framing complete, first half of units
  4. 15% Siding and interior paint complete, first half of units
  5. 15% Framing complete, last half of units
  6. 15% Siding and interior paint complete, last half of units
  7. 5% At install

  With an odd count, "first half" is the larger half (5 units = 3 and 2). Units are named: "Framing complete, units 1 to 3".

### 6 Send
No email from the tool. "Send" means:
- **Download the contract PDF** (plus the Set Services contract when there's an assembly crew).
- **Mark as sent**, which stamps the date in the portal.

The rep emails or e-signs it the way they do today. Later: **Mark as signed** (upload or note), which makes it a project in the portal with its invoice stages ready.

---

## 5. Questions for Kelsey before I build

1. **Legal payment sections.**
   - Making the contract print exactly what's on screen means Section 5 (kit/custom) and Section 4 (modular) print the edited rows instead of fixed text.
   - Those sections also hold legal conditions, for example "non-refundable", "Seller will not begin loading the Kit until Payment 3 is received", "not released for shipment until Payment 3 is received".
   - My proposal: the edited rows print as the table, and the existing legal paragraphs stay word for word under it. The modular Section 4 paragraphs would need light renumbering ("Payment 3" becomes "the payment due at siding and interior paint completion"). **That is a change to contract legal wording, so I need your OK** (or your lawyer's wording).
2. **Kit final payment:** "at Load Confirmation" (Section 5) or "when framing and Zip Kit scope is completed onsite" (page 2)? The default needs one answer.
3. **Kit engineering row:** keep it as a fixed dollar amount, with 45/45/10 of what's left (prices identical)? The alternative, showing engineering as a percent of the total, gives an odd percent for each model.
4. **Multi-unit order:** OK as sketched (each half's framing, then its paint), with odd counts giving the first half the extra unit?
5. **Rules:** assembly warn-only or block? Add steel DIY outside the 11 wood-kit states to the rep tool? Limit panelized kits by state in the rep tool?
6. **Garage, hangar and steel contracts:** today they use the Custom Home contract. Keep that, or do you have their own agreement wording?
7. **Shell "Scope of work":** it never prints today. Make it print, or remove it?
8. **Fulfillment tracker:** where is it? It isn't in either repo.
9. **Old quote tool:** retire it in the rebuild (the portal's "+ New quote" goes to the new tool), or leave it until "switch"?
10. **MVP contact in the contract generator:** it still shows your cell, (435) 592-1974, plus a different MVP phone elsewhere. MVP is the other session's now, but it's in this file. Fix it to 208-970-6904 here?
