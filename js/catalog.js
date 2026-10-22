/* Loads data/catalog.json and answers simple questions about it. No DOM. */
(function(root){
  'use strict';

  // Product types the new tool offers, in the order reps see them.
  // A type appears only once it's listed here (types are switched on one at a time).
  var TYPE_ORDER = ['shell', 'modular', 'steel', 'garage', 'hangar', 'custom'];
  var TYPE_LABELS = { shell: 'Panelized kits', modular: 'Modular', steel: 'Steel kit', garage: 'Garages', hangar: 'Hangars', custom: 'Custom home' };

  function Catalog(data){ this.data = data; }

  Catalog.prototype.activeTypes = function(enabled){
    return TYPE_ORDER.filter(function(t){ return enabled.indexOf(t) !== -1; });
  };
  Catalog.prototype.typeLabel = function(t){ return TYPE_LABELS[t] || t; };
  Catalog.prototype.type = function(t){ return this.data.product_types[t]; };

  // Brand that sells a product type (Zip Kit, or Zip Kit Steel for steel + hangar).
  Catalog.prototype.brandFor = function(t){
    var key = (this.data.product_types[t] || {}).brand || 'zipkit';
    var b = this.data.brands[key];
    return Object.assign({ key: key }, b);
  };

  // The company that issues the separate assembly contract: one setting,
  // brands.zipkit.assembly.by in catalog.json (Kelsey 2026-10-21).
  Catalog.prototype.assemblyCompany = function(){
    var a = (this.data.brands.zipkit || {}).assembly || {};
    return a.by || '';
  };

  // Models a rep can pick: active, sold by an active brand. Products marked
  // "temporary" (MVP Ridgeline and Dakota, Kelsey 2026-10-22) show too while
  // rules.show_temporary_models is on.
  Catalog.prototype.products = function(t){
    var brands = this.data.brands, temp = !!(this.data.rules && this.data.rules.show_temporary_models);
    return this.data.products.filter(function(p){
      if(p.type !== t) return false;
      if(p.temporary) return temp;
      return p.status === 'active' && p.brands.some(function(b){ return brands[b] && brands[b].active; });
    });
  };

  // The brand on a model's documents: the model's own brand (Ridgeline and
  // Dakota are Mountain Valley Prefab), else the product type's brand.
  Catalog.prototype.brandForProduct = function(p, t){
    var key = p && p.brands && p.brands[0];
    if(key && this.data.brands[key] && key !== ((this.data.product_types[t] || {}).brand || 'zipkit') && p.temporary) return Object.assign({ key: key }, this.data.brands[key]);
    return this.brandFor(t);
  };

  Catalog.prototype.product = function(id){
    return this.data.products.filter(function(p){ return p.id === id; })[0] || null;
  };

  // Find a model by its current name or an old name (case-insensitive).
  Catalog.prototype.findByName = function(t, name){
    var n = String(name || '').trim().toLowerCase();
    if(!n) return null;
    return this.data.products.filter(function(p){
      return p.type === t && (p.name.toLowerCase() === n || (p.aliases || []).some(function(a){ return a.toLowerCase() === n; }));
    })[0] || null;
  };

  // Find a model by its position in the old tool's arrays (old saved quotes store that).
  Catalog.prototype.findByLegacyIndex = function(t, i){
    var idx = parseInt(i, 10);
    if(isNaN(idx)) return null;
    return this.data.products.filter(function(p){ return p.type === t && p.legacy_index && p.legacy_index[t] === idx; })[0] || null;
  };

  Catalog.prototype.pricing = function(p){ return p.pricing[p.brands[0]]; };

  // The "starting at" figure shown on a product card.
  Catalog.prototype.startingPrice = function(p){
    var z = this.pricing(p);
    if(p.type === 'shell' || p.type === 'garage') return z.shell_kit;
    if(p.type === 'modular') return z.base;
    if(p.type === 'hangar') return z.kit;
    return null;
  };

  Catalog.load = function(url, headers){
    return fetch(url || 'data/catalog.json', { cache: 'no-cache', headers: headers || {}, credentials: 'same-origin' })
      .then(function(r){ if(!r.ok) throw new Error('catalog ' + r.status); return r.json(); })
      .then(function(d){ return new Catalog(d); });
  };

  (root.ZK = root.ZK || {}).Catalog = Catalog;
  if(typeof module !== 'undefined' && module.exports) module.exports = Catalog;
})(typeof window !== 'undefined' ? window : this);
