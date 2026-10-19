# Zip Kit Sales Tools (WordPress plugin)

The Zip Kit quote tool for sales reps, as a WordPress shortcode. It is the same tool that runs at `quote.html` on GitHub Pages, with the same code, price list and math. WordPress only hosts it.

| Shortcode | Who sees it | Status |
|---|---|---|
| `[zipkit_quote]` | Signed-in reps (role **Zip Kit Sales Rep**, or administrators) | Ready |
| `[zipkit_quote_public]` | Customers ("Quote your own project") | Built and tested locally. **Not live anywhere.** Pilots on the MVP site first, once Sven sends MVP numbers. See section 8. |

Tested on WordPress 7.1.2 and PHP 8.3, with the Kadence theme. It needs WordPress 6.0+ and PHP 7.4+.

---

## 1. Install

1. Build the zip on a machine with this repo (Windows PowerShell 5.1 or PowerShell 7 on Mac/Linux):
   ```
   powershell -ExecutionPolicy Bypass -File wp-plugin/build.ps1
   ```
   The output is `wp-plugin/dist/zipkit-sales-tools-<version>.zip`.
2. Upload it in **WP Admin → Plugins → Add New → Upload Plugin**, then activate it.
   - The zip is about 16 MB, mostly model photos (web-size copies, not the originals).
   - If the host's upload limit is lower, upload the unzipped `wp-plugin/dist/zipkit-sales-tools/` folder to `wp-content/plugins/` by SFTP instead.
3. Activating it does three things:
   - Adds the role **Zip Kit Sales Rep**: can read, plus the `zipkit_quote` capability.
   - Gives administrators `zipkit_quote`.
   - Adds the menu **Zip Kit Tools**.

   Deactivating leaves the role in place. To remove it later: `wp role delete zipkit_rep`.

## 2. Set up

1. **Give each rep a WordPress account** with the **Zip Kit Sales Rep** role.
2. **Make a page** with only `[zipkit_quote]` in it.
   - Use a full-width, no-sidebar template. The tool has its own header and step bar.
   - The plugin automatically:
     - adds `noindex, nofollow` (core robots meta, Yoast and Rank Math) and an `X-Robots-Tag` header;
     - leaves the page out of the WordPress sitemap;
     - marks it `DONOTCACHEPAGE` and sends no-cache headers.
3. **Server or CDN caches** (WP Engine, Kinsta, Cloudflare APO and similar) don't read `DONOTCACHEPAGE`. Exclude that page's URL there too.
4. **Optional: WP Admin → Zip Kit Tools.**
   - **Supabase URL and publishable key.** Leave blank to use the built-in project. Only the publishable (anon) key belongs here. The settings page refuses secret or service-role keys, because anything here reaches the browser.
   - **Links** to the sales portal, contract generator and old MVP tool. Blank uses the GitHub Pages copies.

### How reps sign in
Reps sign in twice:
1. **WordPress**, to see the page at all.
2. **The Zip Kit sales account (Supabase)**, inside the tool.

Saved projects, invoices and payments live in Supabase and are protected there per rep, so the second sign-in stays until they move.

"Make the contract" and "Portal" open the GitHub Pages pages, which are a different website, so a rep signs in to Supabase once more there.

## 3. Update prices

Prices live in **one file in the repo, `data/catalog.json`**. `data/README.md` explains each field in plain English. Never edit the copy inside the plugin.

1. Edit `data/catalog.json` in the repo.
2. Open `tests/pricing-check.html` and `tests/flow-check.html` from a local web server. Both must say PASS.
3. Bump `Version` and `ZKST_VERSION` in `zipkit-sales-tools.php`.
4. Run `build.ps1`, then upload the new zip in **Plugins → Add New → Upload Plugin → Replace current with uploaded**.

The settings page shows the product count and the catalog's `updated` date, so you can confirm the new list is live.

## 4. Where things live

| What | Where | Who can read it |
|---|---|---|
| Tool code (JS/CSS) | `app/js`, `app/lib`, `app/css` (copied from the repo by the build) | Public files, like any theme script |
| Logos and model photos | `app/images`, `app/photos/web/` (proposal size, 1400px) and `app/photos/cards/` (card size). Both are resized copies; the originals stay in the repo. | Public |
| **Full price list** | `private/catalog.json.php` | **Reps only**, through `GET /wp-json/zipkit/v1/catalog` (needs `zipkit_quote` + REST nonce) |
| Saved projects, invoices, payments, rep names/phones, wire details | Supabase (`quotes`, `profiles`, `payment_accounts`) | Each rep their own rows (Supabase RLS) |
| Plugin settings | `wp_options` → `zkst_settings` | Admins |

**Why `catalog.json.php`.** The full price list has internal rates, so it must not be a downloadable file. The build writes it with a first line of `<?php defined( 'ABSPATH' ) || exit; ?>`. A direct web request runs that line and returns an empty page, on Apache and nginx alike, so there's no `.htaccess` to depend on. Only the REST endpoint reads the file.

Nothing else is stored in the WordPress database. The plugin keeps no customer data.

## 5. How it fits into a theme

- **One wrapper.** Everything the tool draws is inside `<div class="zk-tool" data-zk-app="quote">`, and every CSS rule is scoped to it. Selectors use `.zk-tool.zk-tool …` on purpose, to outrank typical theme selectors.
- **Theme shield.** Inside the wrapper, every element is reset to browser defaults (`all: revert`) before the tool's own styles apply. Theme fonts, button styles, input borders, heading transforms, list bullets and image borders don't leak in.
  - The repo's `tests/theme-check.html` proves this. It loads the tool inside a deliberately hostile fake theme and compares every element's computed style with the clean page, at desktop and phone widths.
  - The one thing it can't beat is a theme rule using an **ID selector** (for example `#content button`). If you see one, add a matching override in the theme.
- **Admin bar.** The tool's sticky header sits below the WordPress admin bar.
- **One global name.** The only JavaScript global is `window.ZK`. The page passes settings in `window.ZK_CONFIG`, which the tool reads once and then removes. The Supabase client library adds its own `window.supabase`.
- **Loading.** Scripts and styles load only on pages that use the shortcode, and the scripts only for users who can use the tool. Logged-out visitors get just the stylesheet for the sign-in box.

### ZK_CONFIG keys (set by the plugin; listed for reference)

| Key | Plugin value |
|---|---|
| `base` | `…/plugins/zipkit-sales-tools/app/` |
| `catalogUrl`, `catalogHeaders` | REST endpoint and `X-WP-Nonce` |
| `portalUrl`, `contractUrl`, `legacyMvpUrl` | From settings, else GitHub Pages |
| `supabaseUrl`, `supabaseKey` | From settings, else the defaults in `app/lib/supabase.js` |
| `requireAuth` | `true` (Supabase sign-in inside the tool) |
| `legacyGlobals` | `false` (no old `window.zk*` names) |
| `mount` | `[data-zk-app="quote"]` |

## 6. Plugin files

```
zipkit-sales-tools/
  zipkit-sales-tools.php     header, constants, activation (role + capability)
  includes/settings.php      WP Admin → Zip Kit Tools
  includes/assets.php        script/style registration, ZK_CONFIG
  includes/rest.php          GET /wp-json/zipkit/v1/catalog (reps only)
  includes/shortcode-quote.php  [zipkit_quote], noindex, no-cache, sitemap exclusion
  app/ … private/ …          added by build.ps1 (not in the repo's plugin folder)
```

## 7. Things to know

- **Supabase client from a CDN.** `supabase-js@2` loads from `cdn.jsdelivr.net`, the same as the GitHub Pages tool. A strict Content-Security-Policy needs to allow it, plus `*.supabase.co` for connections.
- **Security plugins** that switch off the REST API for logged-in users will stop the price list from loading. The tool then says it couldn't load its price list. Allow the `zipkit/v1` namespace.
- **Pop-ups.** Proposals and ballparks open in a new tab. Reps may need to allow pop-ups for the site once.
- **Tested locally** on an isolated WordPress 7.1.2 / PHP 8.3 / MySQL 8.4 site with Kadence. Checks:
  - logged-out, subscriber, rep and admin views;
  - noindex meta and header, no-cache headers, and no assets on other pages;
  - catalog file direct access (empty), endpoint logged out (401);
  - the price list served by WordPress is byte-identical to the repo's;
  - quotes for four product types total the same in WordPress as on GitHub Pages;
  - the settings page refuses a secret key and drops a `javascript:` link.

## 8. Customer quoter: `[zipkit_quote_public]` (not live; MVP site pilot first)

"Quote your own project". **Brand-agnostic.** WP Admin > Zip Kit Tools > **Runs as brand** picks Mountain Valley Prefab (the pilot) or Zip Kit Homes. The brand's models, logo, colors, phone and email all come from data.

**What the customer does:**
1. **Makes an account:** name, email, phone and ZIP.
   - They get an email link. Clicking it signs them in, so every email is verified.
   - Returning customers just ask for a new link.
2. **Where are you building?** State and build-site ZIP (filled in from the account).
3. Sees only what the brand sells in that state, then picks a model.
4. Answers 1 to 3 dropdowns: homes, snow, and assembly where offered. Multifamily models ask by the building instead: Dakota "2-unit or 3-unit building?" and "How many buildings?", Westley (5 units) "How many buildings?", with "X buildings × Y units = Z units." Each has a placeholder and nothing preselected.
5. Sees an estimate from the server: **"Starting at"**, or **"We'll send your price"** while a brand has no prices (MVP today).
6. Picks a timeline and sends.
   - The brand's sales inbox and the customer each get an email.
   - The quote is saved to the customer's account.
   - The page shows the breakdown and a PDF.

There are no payments of any kind.

**How it's set up:**
- **A separate Supabase project for customers.** It holds customer accounts, `customer_profiles` and `customer_quotes`, and is never the sales project.
  - Run `sql/customer-project/2026-10_customer_accounts.sql` there. The file's header has the dashboard steps: confirm email, redirect URLs, the sign-in email.
  - Put that project's URL and publishable key in **Customer Supabase URL / key**. With these blank, the quoter says "Pricing online is coming soon" and shows the phone number.
- **Test sign-in (local sites only).** Before the customer project exists, turn on **Test sign-in** to try the whole flow: the "Check your email" screen gets an "Act as if I clicked the email link" button, and the plugin accepts that test sign-in. It works only when WordPress is in local or development mode on a localhost, `.local`, `.test` or `.localhost` address; anywhere else it does nothing. Test sign-ins are never saved to Supabase. Steps: `wp-plugin/dist/HANDOFF.md`.
- **Public data.** The page loads only `app/data/catalog-public-<brand>.json`: models, sizes, photos, starting prices and availability. The build makes these from `data/catalog.json` (`data/build-public-catalog.ps1`).
- **`POST /wp-json/zipkit/v1/estimate`.** It needs the customer's Supabase sign-in token. The plugin checks it with Supabase, caches it for 10 minutes, and requires a confirmed email. The math is in `includes/estimate-engine.php`:
  - **Starting price:** the public card price × homes.
  - **Price zone:** catalog.json `public.location.zones`, per brand, as `{"pct": n}` or `{"flat": n}` per home. A state can override its zone.
  - **Shipping:** straight-line miles from the brand's factory ZIP (Zip Kit 84721, MVP 83401) to the customer's ZIP, × **1.25** for road miles, × the rep tool's per-mile rate (the same formulas as the rep tool) × homes. Customers see it as **estimated**, with "Your sales rep confirms the final number." MVP has no rates yet, so its shipping says "Quoted separately".
  - **ZIP data:** `data/zips.json` (US Census 2025 ZCTA Gazetteer, public domain, 33,791 ZIP code areas). The build copies it to `private/zips.json`.
  - **Zones:** the four from the region map, every adjustment **0%** until Sven sends numbers. Zip Kit shows the national "Starting at" price meanwhile.
  - **City cost (e.g. RSMeans), later:** add a filter `zkst_city_cost` returning `['label' => '…', 'amount' => 1234]`. Nothing is built behind it.
  - Anything marked `needs_price` / `needs_data` is left out, never guessed.
- **`POST /wp-json/zipkit/v1/lead`.** Also needs the customer's token.
  - It recalculates the estimate and emails the sales inbox: **Send leads to**, or blank for the brand's email.
  - It emails the customer a copy.
  - With **Save quotes to Supabase** on, it saves the quote to `customer_quotes` as that customer.
  - It saves UTM source, medium and campaign, plus the first landing page and the page sent from. These come from a first-party cookie kept 90 days.
  - Limits: 5 sends an hour per customer, 60 an hour site-wide, plus a hidden spam-trap field.
- **Tests.**
  - `tests/estimate-test.php` (`php tests/estimate-test.php`) runs the server math. It includes 70 shipping cases computed by the rep tool itself (`tests/make-shipping-cases.html`).
  - `tests/public-check.html` walks the page for both brands, using a local sign-in stand-in.
- **Email delivery.** It uses `wp_mail`. Use the site's SMTP plugin so lead and customer emails don't land in spam.
- **Later.** Leads may go straight into Pipedrive. Hook in after the emails in `zkst_lead_endpoint()`.
