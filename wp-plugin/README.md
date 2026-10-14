# Zip Kit Sales Tools (WordPress plugin)

The Zip Kit quote tool for sales reps, as a WordPress shortcode. It is the same tool that runs at `quote.html` on GitHub Pages, with the same code, price list and math. WordPress only hosts it.

| Shortcode | Who sees it | Status |
|---|---|---|
| `[zipkit_quote]` | Signed-in reps (role **Zip Kit Sales Rep**, or administrators) | Ready |
| `[zipkit_quote_public]` | Customers ("Quote your own project") | Not in this build. Waiting for Kelsey's approval. |

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
