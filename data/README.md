# How to change prices and models

All prices, models and company details for the quote tool live in one file: **`data/catalog.json`**. You never need to touch the code.

## Before you start

- Edit `catalog.json` on GitHub. Open the file, click the pencil icon, make your change, then click **Commit changes**. The live tool updates within about two minutes.
- Type numbers **without** `$` or commas: `179550`, not `$179,550`.
- Keep the punctuation exactly as it is: quotes, commas, `{ }` and `[ ]`. A missing comma breaks the whole file.
  - To check, paste the file into [jsonlint.com](https://jsonlint.com) before you commit. It tells you the line with the problem.
- After any price change, open `tests/pricing-check.html` on the live site. Every row should be green except the one model you changed.

## Change a price

1. Find the model: press **Ctrl+F** on GitHub and search for its name, for example `"name": "Kolob"`.
2. Under `"pricing"` → `"zipkit"`, change the number:

| What you want to change | Panelized Kit | Modular | Garage | Hangar |
|---|---|---|---|---|
| Main price | `shell_kit` | `base` | `shell_kit` | `kit` |
| Engineering | `engineering` | included | included | included |
| Snow load upgrades | `snow` → `tier1` / `tier2` | `snow` → `tier1` / `tier2` | — | — |
| Shipping per mile | `ship_per_mile` | `ship_per_mile` → `high` (the tool uses `high`) | see "Fees" below | see "Fees" below |
| Window packages | `windows` → each package | `window_upgrades` → `price` | — | — |

**Fees** that apply to a whole product type live under `"product_types"` near the top of the file:

| What you want to change | Where |
|---|---|
| Design retainer | `design_fee` (Custom Home: `design_tiers`) |
| Garage and hangar shipping rates | `ship_per_mile` |

## Add a model

1. Copy an existing model of the same type, from its opening `{` to its closing `},`.
2. Paste it right after the original.
3. Change these fields:
   - **`id`**: lowercase with dashes, and must be unique. Example: `"new-model"`.
   - **`name`**: the name reps and customers see.
   - **`sqft`** (a plain number) and **`sqft_label`** (how it's shown, for example `"1,800"`).
   - **every price**.
   - **`photo`**: put the picture in the `photos/` folder first, then write its path, for example `"photos/newmodel.jpg"`.
4. **Delete the `legacy_index` line** from your copy. Only the original models use it, so old saved quotes can find them.

## Retire a model

Change `"status": "active"` to `"status": "retired"`.

The model disappears from the tool, but old quotes that used it still open. **Don't delete models.** Old quotes need them.

## Rename a model

1. Change `"name"`.
2. Add the old name to `"aliases"` so old quotes still find it, for example `"aliases": ["Solitude"]`.

## Things to leave alone

- **`legacy_index`**: links models to quotes saved by the old tool.
- **`payment_schedules`**: payment percentages and wording. Changing these changes what customers sign. Talk to Sven first.
- **The `mvp` brand and MVP models (`"status": "parked"`)**: MVP is on hold until Sven has numbers.
- **Bank account numbers.** They are **not** in this file and must never be added. They live in Supabase (table `payment_accounts`).
