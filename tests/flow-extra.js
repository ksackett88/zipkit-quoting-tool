/* Extra screen tests: documents, saving, the contract hand-off, reopening.
   Each returns { name, pass, detail }. Nothing here touches the real database:
   saving goes to an in-memory stand-in. */
window.ZK_FLOW_EXTRA = async function(cat, W, h){
  'use strict';
  var results = [];
  function rec(name, pass, detail){ results.push({ name: name, pass: !!pass, detail: pass ? undefined : detail }); }
  var C = W.ZKFlow.catalog();

  // In-memory stand-in for the Supabase quotes table.
  var rows = [];
  W.zkQuotes = {
    save: async function(d){ var r = Object.assign({ id: 'id-' + (rows.length + 1), quote_number: 'Q-TEST-' + (rows.length + 1), invoices: [] }, JSON.parse(JSON.stringify(d))); rows.push(r); return r; },
    update: async function(id, d){ var r = rows.filter(function(x){ return x.id === id; })[0]; Object.assign(r, JSON.parse(JSON.stringify(d))); return r; },
    get: async function(id){ return JSON.parse(JSON.stringify(rows.filter(function(x){ return x.id === id; })[0])); }
  };
  W.ZKFlow.state.user = { id: 'u-test', email: 'rep@example.com' };
  W.ZKFlow.state.rep = { name: 'Rep Test', phone: '435-555-0100', email: 'rep@example.com' };

  // Capture "new windows" instead of opening them.
  var cap = W.document.createElement('iframe'); cap.style.cssText = 'position:fixed;left:-5000px;width:900px;height:900px'; W.document.body.appendChild(cap);
  var realOpen = W.open; W.open = function(){ return cap.contentWindow; };
  async function settle(){ for(var i = 0; i < 20; i++) await Promise.resolve(); await new Promise(function(r){ W.setTimeout(r, 50); }); }

  async function quoteFor(cfg){ var out = await h.fill(W, cfg); await h.sleep(0); W.ZKFlow.go('review'); return out; }

  // 1. Saved rows carry the old form fields the contract generator reads.
  var samples = [
    { type:'shell', productId:'kolob', units:2, snow:'tier1', windows:'amsco_studios', miles:300, assembly:'add', customLines:[{ desc:'Deck', amount:4200 }] },
    { type:'modular', productId:'yellowstone', units:2, windows:'andersen_100_series', addons:['rooftop_deck_w_spiral_staircase'], miles:250 },
    { type:'garage', productId:'garage-3-car', garageUse:'bundled', miles:120 },
    { type:'hangar', productId:'hangar-80-x-60', miles:200, adjustments:{ base:{ amount:170000, reason:'t' } } },
    { type:'steel', projectName:'Shop', buildCost:150000, engineering:6000, miles:100 },
    { type:'custom', projectName:'The Della', buildCost:320000, engineering:15000, designTier:'standard', customSchedule:[{ name:'Deposit', pct:20, desc:'' }, { name:'Rest', pct:80, desc:'' }] }
  ];
  for(var i = 0; i < samples.length; i++){
    var s = samples[i];
    await quoteFor(s);
    var r = W.ZKFlow.result();
    var row = W.ZKStore.buildRow(C, W.ZKFlow.state, r, r.schedule);
    var f = row.config.fields, p = s.productId ? C.product(s.productId) : null;
    var px = { shell:'s', modular:'m', garage:'g', hangar:'h', steel:'st', custom:'c' }[s.type];
    var ok = row.product_kind === s.type && Math.round(row.total) === Math.round(r.total) && Math.round(row.contract_amount) === Math.round(r.contract)
      && (!p || f[px + '-model'] === String(p.legacy_index[s.type]))
      && row.config.payment_schedule.length === r.schedule.length
      && row.quote_data.kind === r.quote.kind;
    rec('Saved ' + s.type + ' row has the right model, totals and old form fields', ok, { fields: f, kind: row.product_kind });
  }

  // 2. The contract generator opens a saved quote (the "Make the contract" button).
  var cg = W.document.createElement('iframe'); cg.style.cssText = 'position:fixed;left:-5000px;width:1200px;height:900px'; W.document.body.appendChild(cg);
  await new Promise(function(res){ cg.onload = function(){ res(); }; cg.src = 'ZipKit_Contract_Generator.html'; });
  for(var k = 0; k < 20 && !cg.contentWindow.zkAutoLoadFromQuote; k++) await new Promise(function(r){ W.setTimeout(r, 100); });
  var G = cg.contentWindow;
  G.alert = function(){};
  async function handOff(cfg){
    await quoteFor(cfg);
    var r = W.ZKFlow.result();
    var saved = await W.zkQuotes.save(W.ZKStore.buildRow(C, W.ZKFlow.state, r, r.schedule));
    G.zkQuotes = { get: W.zkQuotes.get };
    await G.zkAutoLoadFromQuote(saved.id);
    return { G: G, r: r, row: saved };
  }
  var a = await handOff({ type:'shell', productId:'alpine', miles:300, snow:'tier1' });
  var activeTab = a.G.document.querySelector('.tab.active');
  rec('Contract hand-off: panelized kit opens Shell mode with the right model and buyer',
    activeTab && activeTab.dataset.mode === 'shell' && a.G.document.getElementById('c-model').value === String(C.product('alpine').legacy_index.shell)
      && a.G.document.getElementById('c-buyer').value === 'Screen Check' && a.G.document.getElementById('c-snow').value === '1',
    { mode: activeTab && activeTab.dataset.mode, model: a.G.document.getElementById('c-model').value });
  var m = await handOff({ type:'modular', productId:'gallatin', miles:250, units:2 });
  rec('Contract hand-off: modular opens Modular mode, right model, contract total = quote contract',
    a.G.document.querySelector('.tab.active').dataset.mode === 'modular' && m.G.document.getElementById('cm-model').value === String(C.product('gallatin').legacy_index.modular)
      && Math.round(m.G.CURRENT_MODULAR.total) === Math.round(m.r.contract),
    { model: m.G.document.getElementById('cm-model').value, contractTotal: m.G.CURRENT_MODULAR && m.G.CURRENT_MODULAR.total, quoteContract: m.r.contract });
  var cu = await handOff({ type:'custom', projectName:'The Della', buildCost:320000, engineering:15000, miles:300 });
  rec('Contract hand-off: custom home opens Custom mode with the build price and engineering',
    cu.G.document.querySelector('.tab.active').dataset.mode === 'custom' && cu.G.document.getElementById('cu-build').value === '320000' && cu.G.document.getElementById('cu-eng').value === '15000',
    { build: cu.G.document.getElementById('cu-build').value });

  // 3. Documents.
  await quoteFor({ type:'modular', productId:'teton', miles:100 });
  W.document.querySelector('[data-doc]').click();
  W.document.querySelector('[data-doc-kind="proposal"]').click();
  await settle();
  var prop = cap.contentDocument.documentElement.outerHTML;
  var rm = W.ZKFlow.result();
  rec('Modular proposal: 5/30/30/30/5 with the contract wording, right total, no "engineering invoice"',
    prop.indexOf('Payment 1 — Design &amp; Engineering (5%)') !== -1 && prop.indexOf('Payment 5 — Set &amp; Completion (5%)') !== -1
      && prop.indexOf(W.ZKPricing.fmt(rm.total)) !== -1 && prop.indexOf('engineering invoice') === -1 && prop.indexOf('Rep Test') !== -1,
    'proposal text check failed');
  await quoteFor({ type:'shell', productId:'zion', miles:200, promo:true });
  W.document.querySelector('[data-doc]').click();
  W.document.querySelector('[data-doc-kind="ballpark-open"]').click();
  h.setVal(W.document.getElementById('range-low'), '150000');
  h.setVal(W.document.getElementById('range-high'), '175000');
  W.document.querySelector('[data-doc-kind="ballpark"]').click();
  await settle();
  var bp = cap.contentDocument.documentElement.outerHTML;
  rec('Ballpark estimate shows the chosen range and the rep', bp.indexOf('$150,000') !== -1 && bp.indexOf('$175,000') !== -1 && bp.indexOf('PRELIMINARY ESTIMATE') !== -1 && bp.indexOf('Rep Test') !== -1, 'ballpark text check failed');
  W.document.querySelector('[data-doc]').click();
  W.document.querySelector('[data-doc-kind="ballpark-open"]').click();
  h.setVal(W.document.getElementById('range-low'), '200000');
  h.setVal(W.document.getElementById('range-high'), '100000');
  W.document.querySelector('[data-doc-kind="ballpark"]').click();
  var blocked = !!W.document.querySelector('[data-field="rangeHigh"].invalid');
  W.document.querySelector('[data-doc-cancel]').click();
  rec('Ballpark estimate refuses a high number below the low one', blocked, 'no error shown');

  // 4. Proposal promo credit (shell, promo on): total shown is total − credit.
  await quoteFor({ type:'shell', productId:'zion', promo:true });
  W.document.querySelector('[data-doc]').click(); W.document.querySelector('[data-doc-kind="proposal"]').click(); await settle();
  var rp = W.ZKFlow.result(), pp = cap.contentDocument.documentElement.outerHTML;
  rec('Proposal applies the design-retainer promo credit', rp.promoCredit > 0 && pp.indexOf(W.ZKPricing.fmt(rp.displayedTotal)) !== -1 && pp.indexOf('Promo: design retainer credited toward engineering') !== -1, { credit: rp.promoCredit });

  W.open = realOpen;
  cg.remove(); cap.remove();
  return results;
};
