/* Saving and loading quotes, and the rep's profile.
   Rows go in the same Supabase `quotes` table, in the same shape the old tool
   used, so the portal and the contract generator keep working. */
(function(root){
  'use strict';

  var WIN_IDS = ['cascade_clay_white', 'cascade_black_white', 'amsco_studios', 'andersen_100'];
  var SNOW_IDX = { standard:'0', tier1:'1', tier2:'2' };
  var PREFIX = { shell:'s', modular:'m', garage:'g', hangar:'h', steel:'st', custom:'c' };

  function adjText(cfg, k){ var a = cfg.adjustments && cfg.adjustments[k]; return a && String(a.amount).trim() !== '' ? String(a.amount) : ''; }
  function str(v){ return v == null ? '' : String(v); }

  // The old tool's form-field values (config.fields). The contract generator
  // reads these (s-model, m-model, c-name …), and the old tool can reopen them.
  function legacyFields(cat, cfg){
    var f = {}, t = cfg.type, px = PREFIX[t];
    var p = cfg.productId ? cat.product(cfg.productId) : null;
    var idx = p && p.legacy_index ? p.legacy_index[t] : undefined;
    if(t === 'shell'){
      if(idx !== undefined) f['s-model'] = String(idx);
      f['s-units'] = str(cfg.units || 1); f['s-snow'] = SNOW_IDX[cfg.snow || 'standard'];
      f['s-win'] = String(cfg.windows ? WIN_IDS.indexOf(cfg.windows) : -1); f['s-win-override'] = adjText(cfg, 'windows');
      f['s-miles'] = str(cfg.miles || 0); f['s-ship-override'] = adjText(cfg, 'shipping'); f['s-disc'] = str(cfg.discountPct || 0);
      f['s-design-override'] = adjText(cfg, 'design'); f['s-design-paid'] = !!cfg.designPaid; f['s-eng-paid'] = !!cfg.engineeringPaid;
      f['s-eng-modified'] = !!cfg.mirroredEngineering; f['s-dryin'] = !!cfg.dryin;
    } else if(t === 'modular'){
      if(idx !== undefined) f['m-model'] = String(idx);
      var z = cat.pricing(p), wi = -1;
      z.window_upgrades.forEach(function(w, i){ if(w.id === cfg.windows) wi = i; });
      f['m-units'] = str(cfg.units || 1); f['m-base-override'] = adjText(cfg, 'base'); f['m-snow'] = SNOW_IDX[cfg.snow || 'standard'];
      f['m-win'] = String(wi); f['m-win-override'] = adjText(cfg, 'windows'); f['m-miles'] = str(cfg.miles || 0);
      f['m-ship-override'] = adjText(cfg, 'shipping'); f['m-disc'] = str(cfg.discountPct || 0);
    } else if(t === 'garage'){
      if(idx !== undefined) f['g-model'] = String(idx);
      f['g-units'] = str(cfg.units || 1); f['g-design'] = cfg.garageUse === 'bundled' ? '562' : '1125'; f['g-design-override'] = adjText(cfg, 'design');
      f['g-miles'] = str(cfg.miles || 0); f['g-ship-override'] = adjText(cfg, 'shipping'); f['g-design-paid'] = !!cfg.designPaid; f['g-dryin'] = !!cfg.dryin;
    } else if(t === 'hangar'){
      if(idx !== undefined) f['h-model'] = String(idx);
      f['h-units'] = str(cfg.units || 1); f['h-base-override'] = adjText(cfg, 'base'); f['h-miles'] = str(cfg.miles || 0);
      f['h-ship-override'] = adjText(cfg, 'shipping'); f['h-disc'] = str(cfg.discountPct || 0); f['h-design-override'] = adjText(cfg, 'design');
      f['h-design-paid'] = !!cfg.designPaid; f['h-dryin'] = !!cfg.dryin;
    } else if(t === 'steel'){
      f['st-name'] = str(cfg.projectName); f['st-sqft'] = str(cfg.sqft); f['st-build'] = str(cfg.buildCost); f['st-eng'] = str(cfg.engineering);
      f['st-miles'] = str(cfg.miles || 0); f['st-rate'] = str(cfg.shipRate); f['st-scope'] = str(cfg.scope);
      f['st-design-override'] = adjText(cfg, 'design'); f['st-design-paid'] = !!cfg.designPaid; f['st-eng-paid'] = !!cfg.engineeringPaid;
    } else if(t === 'custom'){
      f['c-name'] = str(cfg.projectName); f['c-sqft'] = str(cfg.sqft); f['c-build'] = str(cfg.buildCost);
      f['c-design-tier'] = cfg.designTier === 'standard' ? '2500' : '3500'; f['c-design-override'] = adjText(cfg, 'design');
      f['c-eng'] = str(cfg.engineering); f['c-miles'] = str(cfg.miles || 0); f['c-rate'] = str(cfg.shipRate); f['c-scope'] = str(cfg.scope);
      f['c-design-paid'] = !!cfg.designPaid; f['c-eng-paid'] = !!cfg.engineeringPaid;
    }
    var mode = cfg.assembly === 'remove' ? 'no' : (cfg.assembly === 'add' ? 'add' : 'none');
    f[px + '-assembly-none'] = mode === 'none'; f[px + '-no-assembly'] = mode === 'no'; f[px + '-add-assembly'] = mode === 'add';
    return f;
  }

  function projectName(state){
    var c = state.customer;
    return (c.project || '').trim() || (state.result ? state.result.quote.model + ' project' : '');
  }

  // Build the `quotes` row for the current quote.
  function buildRow(cat, state, result, schedule){
    var c = state.customer, cfg = state.cfg, q = result.quote;
    var config = {
      schema_version: 2,
      mode: cfg.type,
      quote: { customer: JSON.parse(JSON.stringify(c)), cfg: JSON.parse(JSON.stringify(cfg)) },
      fields: legacyFields(cat, cfg),
      buyer: { 'prop-buyer': c.name, 'prop-project': projectName({ customer:c, result:result }), 'prop-location': [c.city, c.state].filter(Boolean).join(', '), 'prop-email': c.email, 'prop-phone': c.phone },
      customs: (cfg.customLines || []).filter(function(l){ return String(l.desc).trim() || String(l.amount).trim(); }).map(function(l){ return { desc: l.desc, amt: String(l.amount) }; }),
      addons: {},
      payment_schedule: schedule.map(function(s){ return { key: s.key, name: s.name, desc: s.desc, amount: s.amount }; })
    };
    if(cfg.type === 'modular'){
      var z = cat.pricing(cat.product(cfg.productId));
      z.addons.forEach(function(a, i){ config.addons['m-addon-' + i] = (cfg.addons || []).indexOf(a.id) !== -1; });
    }
    if(state.user && state.rep) config.buyer['rep-name'] = state.rep.name || '';
    return {
      product_kind: cfg.type,
      model: q.model,
      brand: q.company,
      units: q.units || 1,
      buyer_name: c.name || null,
      buyer_email: c.email || null,
      buyer_phone: c.phone || null,
      project_name: projectName({ customer:c, result:result }) || null,
      project_location: [c.city, c.state].filter(Boolean).join(', ') || null,
      total: q.total,
      contract_amount: q.contract,
      config: config,
      quote_data: q
    };
  }

  // Save. Updates the quote it came from when that's safe; otherwise saves a new one.
  // A quote that already has invoices logged is never overwritten (its payment
  // schedule is what was billed), so edits to it are saved as a new quote.
  function save(cat, state, result, schedule){
    if(!root.zkQuotes) return Promise.reject(new Error('Saving isn\'t available. Check your connection and sign in again.'));
    var row = buildRow(cat, state, result, schedule);
    var s = state.saved;
    if(s && s.id && !s.hasInvoices && !s.readOnly){
      return root.zkQuotes.update(s.id, row).catch(function(){ return root.zkQuotes.save(row); });
    }
    return root.zkQuotes.save(row);
  }

  // ---------- rep profile ----------
  function client(){ return root.zkAuth && root.zkAuth.client; }
  function loadProfile(user){
    var c = client();
    if(!c || !user) return Promise.resolve({ name:'', phone:'', email: user ? user.email : '' });
    return c.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle().then(function(r){
      var d = (r && r.data) || {};
      return { name: d.full_name || '', phone: d.phone || '', email: user.email || '' };
    }, function(){ return { name:'', phone:'', email: user.email || '' }; });
  }
  function saveProfile(user, name, phone){
    var c = client();
    if(!c || !user) return Promise.reject(new Error('Not signed in.'));
    return c.from('profiles').update({ full_name: name, phone: phone }).eq('id', user.id).select('id').then(function(r){
      if(r.error) throw r.error;
      if(!r.data || !r.data.length) throw new Error('Your profile couldn\'t be updated.');
      return true;
    });
  }

  root.ZKStore = { save: save, buildRow: buildRow, legacyFields: legacyFields, projectName: projectName, loadProfile: loadProfile, saveProfile: saveProfile };
})(window);
