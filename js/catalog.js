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

  // Models a rep can pick: active, sold by an active brand.
  Catalog.prototype.products = function(t){
    var brands = this.data.brands;
    return this.data.products.filter(function(p){
      return p.type === t && p.status === 'active' && p.brands.some(function(b){ return brands[b] && brands[b].active; });
    });
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

  Catalog.load = function(url){
    return fetch(url || 'data/catalog.json', { cache: 'no-cache' })
      .then(function(r){ if(!r.ok) throw new Error('catalog ' + r.status); return r.json(); })
      .then(function(d){ return new Catalog(d); });
  };

  root.ZKCatalog = Catalog;
  if(typeof module !== 'undefined' && module.exports) module.exports = Catalog;
})(typeof window !== 'undefined' ? window : this);
