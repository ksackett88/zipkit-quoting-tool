/* One config object for the quote tools. Load this first.
   A host page (GitHub Pages, WordPress) may set window.ZK_CONFIG before this
   file runs; anything it leaves out gets the defaults below. Afterwards the
   settings live at ZK.config and window.ZK_CONFIG is removed, so window.ZK is
   the tool's only global name. */
(function(root){
  'use strict';
  var ZK = root.ZK = root.ZK || {};
  var given = root.ZK_CONFIG || {};
  var base = given.base != null ? String(given.base) : '';   // URL prefix for the tool's files; '' = next to the page

  var C = {
    base: base,
    catalogUrl: base + 'data/catalog.json',                    // full price list (rep tool only)
    publicCatalogUrl: base + 'data/catalog-public.json',       // public fields only (customer quoter)
    catalogHeaders: {},                                        // extra request headers for the catalog (WordPress: REST nonce)
    portalUrl: base + 'index.html',
    contractUrl: base + 'ZipKit_Contract_Generator.html',
    legacyMvpUrl: base + 'legacy/mvp-quote.html',
    supabaseUrl: '',                                           // '' = default in lib/supabase.js
    supabaseKey: '',
    requireAuth: true,                                         // Supabase sign-in inside the rep tool
    legacyGlobals: false,                                      // old window.zk* names (portal and contract generator need them)
    leadUrl: '',                                               // where the public quoter posts leads ('' = not connected)
    mount: '[data-zk-app]'
  };
  Object.keys(given).forEach(function(k){ C[k] = given[k]; });
  ZK.config = C;

  // Resolve a path from the catalog ("photos/alpine.jpg") against the tool's base.
  ZK.url = function(p){
    if(!p) return p;
    if(/^([a-z][a-z0-9+.-]*:|\/)/i.test(p)) return p;
    return C.base + p;
  };

  try { delete root.ZK_CONFIG; } catch(e){ root.ZK_CONFIG = undefined; }
})(window);
