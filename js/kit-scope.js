// Kit scope lines that only some models have (Kelsey 2026-10-21): the covered
// rear deck, deck panels and stairs print on a kit contract or proposal only
// when the model has them.
//
// FEATURES lists, for each panelized kit model, the lines that model has.
//   deck_panels   "Framed Deck Panels (framed only)"
//   covered_deck  "Covered Rear Deck with Posts and Beam"
//   stairs        "Standard Stairs"
// A model that isn't marked doesn't print the line. WAITING ON KELSEY: every
// model is empty until she confirms which ones have each item.
(function(root){
  'use strict';
  var FEATURES = {
    'big-sky': [], 'bridger': [], 'tahoe': [], 'sequoia': [], 'frontier': [], 'clyde': [], 'birch': [],
    'willow': [], 'bozeman': [], 'sunstone': [], 'bluebell': [], 'oakley': [], 'ozark': [], 'jasper': [],
    'mesa': [], 'koda': [], 'hayden': [], 'cedar': [], 'timberline': [], 'apache': [], 'juniper': [],
    'zion': [], 'columbia': [], 'alpine': [], 'moab': [], 'meadow': [], 'kolob': [], 'olympic': []
  };
  var ALIASES = { 'solitude': 'kolob' };
  // "Big Sky" or "big-sky" -> "big-sky"
  function id(model){
    var k = String(model || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return ALIASES[k] || k;
  }
  function has(model, feature){
    var f = FEATURES[id(model)];
    return !!(f && f.indexOf(feature) !== -1);
  }
  (root.ZK = root.ZK || {}).KitScope = { FEATURES: FEATURES, id: id, has: has };
})(typeof window !== 'undefined' ? window : this);
