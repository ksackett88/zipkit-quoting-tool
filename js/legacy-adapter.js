/* Turns a quote saved by the OLD tool (config.fields keyed by its form-field
   ids) into the new tool's customer + config. Pure: no DOM, no network.
   Database rows are never changed; this only runs when a quote is opened. */
(function(root){
  'use strict';
  var WIN_IDS = ['cascade_clay_white', 'cascade_black_white', 'amsco_studios', 'andersen_100'];
  var SNOW = { '0':'standard', '1':'tier1', '2':'tier2' };
  var NO_REASON = 'Set before v5 — no reason recorded';

  function s(v){ return v == null ? '' : String(v).trim(); }
  function bool(v){ return v === true || v === 'true' || v === 'on'; }
  function adj(cfg, key, raw){ if(s(raw) !== '') cfg.adjustments[key] = { amount: s(raw), reason: NO_REASON }; }

  // Assembly: read from the saved quote result. The old tool saved its three
  // assembly radio buttons by label ("none" / "remove" / "add"), not by which
  // was selected, so config.fields can't be trusted for it.
  function assemblyOf(row){
    var a = row.quote_data && row.quote_data.assembly;
    if(a && a.mode === 'removed') return 'remove';
    if(a && a.mode === 'added') return 'add';
    return 'none';
  }

  function customerOf(row){
    var b = (row.config && row.config.buyer) || {};
    var loc = s(b['prop-location']) || s(row.project_location);
    var city = loc, st = '';
    var m = loc.match(/^(.*?),?\s+([A-Za-z]{2})$/);
    if(m){ city = m[1].replace(/,\s*$/, '').trim(); st = m[2].toUpperCase(); }
    return {
      name: s(b['prop-buyer']) || s(row.buyer_name),
      project: s(b['prop-project']) || s(row.project_name),
      city: city, state: st,
      email: s(b['prop-email']) || s(row.buyer_email),
      phone: s(b['prop-phone']) || s(row.buyer_phone)
    };
  }

  function findProduct(cat, type, f, key, row){
    var p = cat.findByLegacyIndex(type, f[key]);
    if(!p && row.quote_data && row.quote_data.model){
      var name = String(row.quote_data.model).replace(/ (garage|hangar)$/, '');
      p = cat.findByName(type, name);
    }
    return p;
  }

  // Returns { customer, cfg, notes: [...] } or { error }.
  function fromLegacy(cat, row){
    var config = row.config || {};
    var f = config.fields || {};
    var type = config.mode || row.product_kind;
    var q = row.quote_data || {};
    var notes = [];
    if(['shell','modular','garage','hangar','steel','custom'].indexOf(type) === -1) return { error: 'This saved project isn\'t a quote the new tool can open (' + type + ').' };
    var cfg = { type: type, productId: null, units: 1, miles: '', snow: 'standard', assembly: assemblyOf(row), windows: '', discountPct: '',
      dryin: false, designPaid: false, engineeringPaid: false, mirroredEngineering: false, promo: !!q.designCreditPromo,
      addons: [], customLines: [], adjustments: {} };
    var p = null;

    if(type === 'shell'){
      p = findProduct(cat, 'shell', f, 's-model', row);
      cfg.units = s(f['s-units']) || 1; cfg.snow = SNOW[s(f['s-snow'])] || 'standard';
      var wi = parseInt(f['s-win'], 10); cfg.windows = wi >= 0 ? WIN_IDS[wi] : '';
      cfg.miles = s(f['s-miles']); cfg.discountPct = s(f['s-disc']);
      adj(cfg, 'windows', f['s-win-override']); adj(cfg, 'shipping', f['s-ship-override']); adj(cfg, 'design', f['s-design-override']);
      cfg.designPaid = bool(f['s-design-paid']); cfg.engineeringPaid = bool(f['s-eng-paid']);
      cfg.mirroredEngineering = bool(f['s-eng-modified']); cfg.dryin = bool(f['s-dryin']);
    } else if(type === 'modular'){
      p = findProduct(cat, 'modular', f, 'm-model', row);
      cfg.units = s(f['m-units']) || 1; cfg.snow = SNOW[s(f['m-snow'])] || 'standard';
      if(p){
        var z = cat.pricing(p), mi = parseInt(f['m-win'], 10);
        cfg.windows = (mi >= 0 && z.window_upgrades[mi]) ? z.window_upgrades[mi].id : '';
        var ad = config.addons || {};
        z.addons.forEach(function(a, i){ if(bool(ad['m-addon-' + i])) cfg.addons.push(a.id); });
      }
      cfg.miles = s(f['m-miles']); cfg.discountPct = s(f['m-disc']);
      adj(cfg, 'base', f['m-base-override']); adj(cfg, 'windows', f['m-win-override']); adj(cfg, 'shipping', f['m-ship-override']);
    } else if(type === 'garage'){
      p = findProduct(cat, 'garage', f, 'g-model', row);
      cfg.units = s(f['g-units']) || 1; cfg.garageUse = s(f['g-design']) === '562' ? 'bundled' : 'standalone';
      cfg.miles = s(f['g-miles']); adj(cfg, 'design', f['g-design-override']); adj(cfg, 'shipping', f['g-ship-override']);
      cfg.designPaid = bool(f['g-design-paid']); cfg.dryin = bool(f['g-dryin']);
    } else if(type === 'hangar'){
      p = findProduct(cat, 'hangar', f, 'h-model', row);
      cfg.units = s(f['h-units']) || 1; cfg.miles = s(f['h-miles']); cfg.discountPct = s(f['h-disc']);
      adj(cfg, 'base', f['h-base-override']); adj(cfg, 'shipping', f['h-ship-override']); adj(cfg, 'design', f['h-design-override']);
      cfg.designPaid = bool(f['h-design-paid']); cfg.dryin = bool(f['h-dryin']);
    } else if(type === 'steel'){
      cfg.projectName = s(f['st-name']); cfg.sqft = s(f['st-sqft']); cfg.buildCost = s(f['st-build']); cfg.engineering = s(f['st-eng']);
      cfg.miles = s(f['st-miles']); cfg.shipRate = f['st-rate'] == null ? cat.type('steel').default_ship_per_mile : s(f['st-rate']); cfg.scope = f['st-scope'] || '';
      adj(cfg, 'design', f['st-design-override']); cfg.designPaid = bool(f['st-design-paid']); cfg.engineeringPaid = bool(f['st-eng-paid']);
    } else if(type === 'custom'){
      cfg.projectName = s(f['c-name']); cfg.sqft = s(f['c-sqft']); cfg.buildCost = s(f['c-build']); cfg.engineering = s(f['c-eng']);
      cfg.designTier = s(f['c-design-tier']) === '2500' ? 'standard' : 'custom';
      cfg.miles = s(f['c-miles']); cfg.shipRate = f['c-rate'] == null ? cat.type('custom').default_ship_per_mile : s(f['c-rate']); cfg.scope = f['c-scope'] || '';
      adj(cfg, 'design', f['c-design-override']); cfg.designPaid = bool(f['c-design-paid']); cfg.engineeringPaid = bool(f['c-eng-paid']);
      // The old tool never saved its schedule editor in config; it is in quote_data.
      cfg.customSchedule = Array.isArray(q.customSchedule) ? q.customSchedule.map(function(x){ return { name: x.name, pct: x.pct, desc: x.desc || '' }; }) : [];
    }

    if(['shell','modular','garage','hangar'].indexOf(type) !== -1){
      if(!p) return { error: 'The model on this quote (' + (q.model || 'unknown') + ') isn\'t in the price list any more.' };
      if(p.status === 'parked') return { error: 'parked', productId: p.id };
      cfg.productId = p.id;
      if(p.aliases && q.model && p.aliases.indexOf(q.model) !== -1) notes.push(q.model + ' is now called ' + p.name + '.');
    }
    cfg.customLines = (config.customs || []).filter(function(c){ return s(c.desc) || s(c.amt); }).map(function(c){ return { desc: s(c.desc), amount: s(c.amt) }; });
    if(Object.keys(cfg.adjustments).length) notes.push('Price adjustments from the old tool have no reason on file. Add one before sending.');
    return { customer: customerOf(row), cfg: cfg, notes: notes };
  }

  (root.ZK = root.ZK || {}).Legacy = { fromLegacy: fromLegacy, NO_REASON: NO_REASON };
  if(typeof module !== 'undefined' && module.exports) module.exports = root.ZK.Legacy;
})(typeof window !== 'undefined' ? window : this);
