/* Drives the frozen old tool (tests/legacy/old-tool.html) from a new-style quote config.
   Shared by tests/pricing-check.html and tests/flow-extra.js. */
(function(root){
  'use strict';
  var WIN_IDS = ['cascade_clay_white','cascade_black_white','amsco_studios','andersen_100'];
  var PREFIX = { shell:'s', modular:'m', garage:'g', hangar:'h', steel:'st', custom:'c' };
  var CALC   = { shell:'calcShell', modular:'calcModular', garage:'calcGarage', hangar:'calcHangar', steel:'calcSteel', custom:'calcCustom' };
  var RESET  = { shell:'resetShell', modular:'resetModular', garage:'resetGarage', hangar:'resetHangar', steel:'resetSteel', custom:'resetCustom' };

  function product(cat, id){ return cat.products.filter(function(p){ return p.id === id; })[0]; }
  function adjText(cfg, k){ var a = cfg.adjustments && cfg.adjustments[k]; return a && a.amount != null ? String(a.amount) : ''; }

  // Fill the old tool's form from a new-style config, then run its calc.
  function driveOld(w, cat, cfg){
    var d = w.document, t = cfg.type, px = PREFIX[t];
    function set(id, v){ var e = d.getElementById(id); if(!e) throw new Error('old tool has no #' + id); e.value = v; }
    function chk(id, v){ var e = d.getElementById(id); if(e) e.checked = !!v; }
    w.setMode(t);
    w[RESET[t]]();
    var promo = d.getElementById('prop-promo-design-credit'); if(promo) promo.checked = !!cfg.promo;
    var p = cfg.productId ? product(cat, cfg.productId) : null;
    if(t === 'shell'){
      set('s-model', p.legacy_index.shell); set('s-units', cfg.units || 1);
      set('s-snow', { standard:0, tier1:1, tier2:2 }[cfg.snow || 'standard']);
      set('s-win', cfg.windows ? WIN_IDS.indexOf(cfg.windows) : -1);
      set('s-win-override', adjText(cfg, 'windows')); set('s-miles', cfg.miles || 0);
      set('s-ship-override', adjText(cfg, 'shipping')); set('s-disc', cfg.discountPct || 0);
      set('s-design-override', adjText(cfg, 'design'));
      chk('s-design-paid', cfg.designPaid); chk('s-eng-paid', cfg.engineeringPaid); chk('s-eng-modified', cfg.mirroredEngineering); chk('s-dryin', cfg.dryin);
    } else if(t === 'modular'){
      set('m-model', p.legacy_index.modular); w.buildModularControls();
      set('m-units', cfg.units || 1); set('m-base-override', adjText(cfg, 'base'));
      set('m-snow', { standard:0, tier1:1, tier2:2 }[cfg.snow || 'standard']);
      var z = p.pricing[p.brands[0]];
      var wi = -1; z.window_upgrades.forEach(function(u, i){ if(u.id === cfg.windows) wi = i; });
      set('m-win', wi); set('m-win-override', adjText(cfg, 'windows'));
      set('m-miles', cfg.miles || 0); set('m-ship-override', adjText(cfg, 'shipping')); set('m-disc', cfg.discountPct || 0);
      z.addons.forEach(function(a, i){ chk('m-addon-' + i, (cfg.addons || []).indexOf(a.id) !== -1); });
    } else if(t === 'garage'){
      set('g-model', p.legacy_index.garage); set('g-units', cfg.units || 1);
      set('g-design', cfg.garageUse === 'bundled' ? '562' : '1125'); set('g-design-override', adjText(cfg, 'design'));
      set('g-miles', cfg.miles || 0); set('g-ship-override', adjText(cfg, 'shipping'));
      chk('g-design-paid', cfg.designPaid); chk('g-dryin', cfg.dryin);
    } else if(t === 'hangar'){
      set('h-model', p.legacy_index.hangar); set('h-units', cfg.units || 1); set('h-base-override', adjText(cfg, 'base'));
      set('h-miles', cfg.miles || 0); set('h-ship-override', adjText(cfg, 'shipping')); set('h-disc', cfg.discountPct || 0);
      set('h-design-override', adjText(cfg, 'design')); chk('h-design-paid', cfg.designPaid); chk('h-dryin', cfg.dryin);
    } else if(t === 'steel'){
      set('st-name', cfg.projectName || ''); set('st-sqft', cfg.sqft || ''); set('st-build', cfg.buildCost || ''); set('st-eng', cfg.engineering || '');
      set('st-miles', cfg.miles || 0); set('st-rate', cfg.shipRate == null ? 14 : cfg.shipRate); set('st-scope', cfg.scope || '');
      set('st-design-override', adjText(cfg, 'design')); chk('st-design-paid', cfg.designPaid); chk('st-eng-paid', cfg.engineeringPaid);
    } else if(t === 'custom'){
      set('c-name', cfg.projectName || ''); set('c-sqft', cfg.sqft || ''); set('c-build', cfg.buildCost || '');
      set('c-design-tier', cfg.designTier === 'standard' ? '2500' : '3500'); set('c-design-override', adjText(cfg, 'design'));
      set('c-eng', cfg.engineering || ''); set('c-miles', cfg.miles || 0); set('c-rate', cfg.shipRate == null ? 18 : cfg.shipRate); set('c-scope', cfg.scope || '');
      chk('c-design-paid', cfg.designPaid); chk('c-eng-paid', cfg.engineeringPaid);
      d.getElementById('c-schedule').innerHTML = '';
      (cfg.customSchedule || []).forEach(function(s){ w.addCustomScheduleStage(s.name, s.pct, s.desc); });
    }
    var asm = cfg.assembly === 'remove' ? '-no-assembly' : (cfg.assembly === 'add' ? '-add-assembly' : '-assembly-none');
    chk(px + asm, true);
    var box = d.getElementById(px + '-custom'); if(box) box.innerHTML = '';
    (cfg.customLines || []).forEach(function(c){
      w.addCustomItem(px);
      var row = box.querySelector('.lineitem:last-child');
      row.querySelector('[data-cust="desc"]').value = c.desc;
      row.querySelector('[data-cust="amt"]').value = c.amount;
    });
    w[CALC[t]]();
    return w.QUOTE;
  }

  // A saved row exactly as the OLD tool's "Save Project" wrote it (zkSaveCurrentQuote).
  function oldRow(w, cat, cfg, customer){
    var q = driveOld(w, cat, cfg);
    var d = w.document;
    var c = customer || {};
    function set(id, v){ var e = d.getElementById(id); if(e) e.value = v || ''; }
    set('prop-buyer', c.name); set('prop-project', c.project); set('prop-location', c.location); set('prop-email', c.email); set('prop-phone', c.phone);
    // The old tool saved Steel add-ons from the Panelized Kit's add-on box (a bug).
    // Empty that box so leftovers from an earlier test case don't ride along.
    if(cfg.type === 'steel'){ var sb = d.getElementById('s-custom'); if(sb) sb.innerHTML = ''; }
    var config = w.zkCaptureConfig(cfg.type);
    return JSON.parse(JSON.stringify({
      id: 'old-' + Math.random().toString(36).slice(2, 8), quote_number: 'Q-OLD', product_kind: cfg.type, model: q.model, brand: q.company,
      units: q.units, buyer_name: c.name || null, project_name: c.project || null, project_location: c.location || null,
      total: q.total, contract_amount: q.contract, config: config, quote_data: q, invoices: [], created_by: 'u-test'
    }));
  }

  root.ZK_OLD = { driveOld: driveOld, oldRow: oldRow };
})(window);
