/* Extra screen tests: documents, saving, the contract hand-off, reopening.
   Each returns { name, pass, detail }. Nothing here touches the real database:
   saving goes to an in-memory stand-in. */
window.ZK_FLOW_EXTRA = async function(cat, W, h){
  'use strict';
  var results = [];
  function rec(name, pass, detail){ results.push({ name: name, pass: !!pass, detail: pass ? undefined : detail }); }
  var C = W.ZK.Flow.catalog();

  // In-memory stand-in for the Supabase quotes table.
  var rows = [];
  W.ZK.quotes = {
    save: async function(d){ var r = Object.assign({ id: 'id-' + (rows.length + 1), quote_number: 'Q-TEST-' + (rows.length + 1), invoices: [] }, JSON.parse(JSON.stringify(d))); rows.push(r); return r; },
    update: async function(id, d){ var r = rows.filter(function(x){ return x.id === id; })[0]; Object.assign(r, JSON.parse(JSON.stringify(d))); return r; },
    get: async function(id){ return JSON.parse(JSON.stringify(rows.filter(function(x){ return x.id === id; })[0])); }
  };
  W.ZK.Flow.state.user = { id: 'u-test', email: 'rep@example.com' };
  W.ZK.Flow.state.rep = { name: 'Rep Test', phone: '435-555-0100', email: 'rep@example.com' };

  // Capture "new windows" instead of opening them.
  var cap = W.document.createElement('iframe'); cap.style.cssText = 'position:fixed;left:-5000px;width:900px;height:900px'; W.document.body.appendChild(cap);
  var realOpen = W.open; W.open = function(){ return cap.contentWindow; };
  async function settle(){ for(var i = 0; i < 20; i++) await Promise.resolve(); await new Promise(function(r){ W.setTimeout(r, 50); }); }

  async function quoteFor(cfg){ var out = await h.fill(W, cfg); await h.sleep(0); W.ZK.Flow.go('review'); return out; }

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
    var r = W.ZK.Flow.result();
    var row = W.ZK.Store.buildRow(C, W.ZK.Flow.state, r, r.schedule);
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
    var r = W.ZK.Flow.result();
    var saved = await W.ZK.quotes.save(W.ZK.Store.buildRow(C, W.ZK.Flow.state, r, r.schedule));
    G.zkQuotes = { get: W.ZK.quotes.get };
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
  var rm = W.ZK.Flow.result();
  rec('Modular proposal: 5/30/30/30/5 with the contract wording, right total, no "engineering invoice"',
    prop.indexOf('Payment 1 — Design &amp; Engineering (5%)') !== -1 && prop.indexOf('Payment 5 — Set &amp; Completion (5%)') !== -1
      && prop.indexOf(W.ZK.Pricing.fmt(rm.total)) !== -1 && prop.indexOf('engineering invoice') === -1 && prop.indexOf('Rep Test') !== -1,
    'proposal text check failed');
  await quoteFor({ type:'shell', productId:'zion', miles:200, promo:true });
  W.document.querySelector('[data-doc]').click();
  W.document.querySelector('[data-doc-kind="ballpark-open"]').click();
  h.setVal(W.document.getElementById('zk-range-low'), '150000');
  h.setVal(W.document.getElementById('zk-range-high'), '175000');
  W.document.querySelector('[data-doc-kind="ballpark"]').click();
  await settle();
  var bp = cap.contentDocument.documentElement.outerHTML;
  rec('Ballpark estimate shows the chosen range and the rep', bp.indexOf('$150,000') !== -1 && bp.indexOf('$175,000') !== -1 && bp.indexOf('PRELIMINARY ESTIMATE') !== -1 && bp.indexOf('Rep Test') !== -1, 'ballpark text check failed');
  W.document.querySelector('[data-doc]').click();
  W.document.querySelector('[data-doc-kind="ballpark-open"]').click();
  h.setVal(W.document.getElementById('zk-range-low'), '200000');
  h.setVal(W.document.getElementById('zk-range-high'), '100000');
  W.document.querySelector('[data-doc-kind="ballpark"]').click();
  var blocked = !!W.document.querySelector('[data-field="rangeHigh"].invalid');
  W.document.querySelector('[data-doc-cancel]').click();
  rec('Ballpark estimate refuses a high number below the low one', blocked, 'no error shown');

  // 4. Proposal promo credit (shell, promo on): total shown is total − credit.
  await quoteFor({ type:'shell', productId:'zion', promo:true });
  W.document.querySelector('[data-doc]').click(); W.document.querySelector('[data-doc-kind="proposal"]').click(); await settle();
  var rp = W.ZK.Flow.result(), pp = cap.contentDocument.documentElement.outerHTML;
  rec('Proposal applies the design-retainer promo credit', rp.promoCredit > 0 && pp.indexOf(W.ZK.Pricing.fmt(rp.displayedTotal)) !== -1 && pp.indexOf('Promo: design retainer credited toward engineering') !== -1, { credit: rp.promoCredit });

  // 5. Quotes saved by the OLD tool reopen in the new tool at the same price.
  //    Rows are made by the frozen old tool's own save code (tests/old-driver.js).
  var oldFrame = document.createElement('iframe'); oldFrame.style.cssText = 'position:fixed;left:-5000px;width:1200px;height:900px';
  document.body.appendChild(oldFrame);
  await new Promise(function(res){ oldFrame.onload = function(){ setTimeout(res, 800); }; oldFrame.src = 'legacy/old-tool.html'; });
  var OW = oldFrame.contentWindow; OW.alert = function(){};
  var enabled = W.ZK.Flow.enabledTypes;
  var cases = window.ZK_PRICING_CASES(cat).filter(function(c){
    var p = c.cfg.productId ? cat.products.filter(function(x){ return x.id === c.cfg.productId; })[0] : null;
    return enabled.indexOf(c.cfg.type) !== -1 && (!p || p.status === 'active');
  });
  var reopenFails = [], reopened = 0, flaggedSteel = 0, steelLost = 0;
  for(var ci = 0; ci < cases.length; ci++){
    var cfg = cases[ci].cfg;
    var row = window.ZK_OLD.oldRow(OW, cat, cfg, { name:'Old Buyer', project:'Old project', location:'Cedar City, UT', email:'old@example.com', phone:'435-555-0199' });
    rows.push(row);
    await W.ZK.Flow.openSaved(row.id);
    var st = W.ZK.Flow.state, res = W.ZK.Flow.result();
    var note = (st.ui.loadNote && st.ui.loadNote.html) || '';
    var lostSteelLines = cfg.type === 'steel' && (cfg.customLines || []).some(function(l){ return String(l.desc).trim() || String(l.amount).trim(); });
    var sameAsm = JSON.stringify(res && res.quote.assembly || null) === JSON.stringify(row.quote_data.assembly || null);
    if(lostSteelLines){
      steelLost++;
      // Old tool bug: steel add-ons were never saved. The new tool must say the price differs.
      if(note.indexOf('Price check') !== -1) flaggedSteel++;
      else reopenFails.push({ name: cases[ci].name, why: 'steel add-ons lost but no price-check banner' });
      continue;
    }
    var okCase = st.step === 'review' && res && Math.round(res.total) === Math.round(row.total) && Math.round(res.contract) === Math.round(row.contract_amount)
      && st.customer.name === 'Old Buyer' && st.customer.city === 'Cedar City' && st.customer.state === 'UT' && sameAsm
      && note.indexOf('Saved by the old quote tool') !== -1 && note.indexOf('Price check') === -1;
    if(okCase) reopened++;
    else reopenFails.push({ name: cases[ci].name, step: st.step, newTotal: res && Math.round(res.total), oldTotal: Math.round(row.total), asm: [res && res.quote.assembly, row.quote_data.assembly], customer: st.customer, note: note.slice(0, 300) });
  }
  rec('Old-tool quotes reopen in the new tool at the same price, buyer and assembly (' + reopened + ' of ' + (cases.length - steelLost) + ')', reopenFails.length === 0, reopenFails.slice(0, 5));
  rec('Old-tool steel quotes whose add-ons the old tool lost show a price-check warning (' + flaggedSteel + ' of ' + steelLost + ')', flaggedSteel === steelLost, 'see above');

  // 6. A quote saved by the NEW tool reopens exactly (every type).
  var newFails = [];
  for(var ni = 0; ni < samples.length; ni++){
    await quoteFor(samples[ni]);
    var before = W.ZK.Flow.result(), cfgBefore = JSON.stringify(W.ZK.Flow.state.cfg);
    var savedRow = await W.ZK.quotes.save(W.ZK.Store.buildRow(C, W.ZK.Flow.state, before, before.schedule));
    W.ZK.Flow.newQuote();
    await W.ZK.Flow.openSaved(savedRow.id);
    var after = W.ZK.Flow.result();
    if(!(after && Math.round(after.total) === Math.round(before.total) && JSON.stringify(W.ZK.Flow.state.cfg) === cfgBefore && W.ZK.Flow.state.saved.id === savedRow.id))
      newFails.push({ type: samples[ni].type, before: Math.round(before.total), after: after && Math.round(after.total) });
  }
  rec('New-tool quotes reopen exactly (all six types)', newFails.length === 0, newFails);

  // 7. A quote that already has invoices is saved as a new copy, never overwritten (Q8).
  await quoteFor({ type:'shell', productId:'alpine' });
  var r7 = W.ZK.Flow.result();
  var withInv = await W.ZK.quotes.save(W.ZK.Store.buildRow(C, W.ZK.Flow.state, r7, r7.schedule));
  withInv.invoices = [{ id:'inv-1', amount: 2500, stage_key:'design' }];
  rows.filter(function(x){ return x.id === withInv.id; })[0].invoices = withInv.invoices;
  await W.ZK.Flow.openSaved(withInv.id);
  var countBefore = rows.length;
  W.document.querySelector('[data-save]').click();
  await settle();
  rec('Saving a quote that has invoices makes a new copy (the invoiced one is untouched)', rows.length === countBefore + 1 && W.ZK.Flow.state.saved.id !== withInv.id, { rows: rows.length, before: countBefore });

  // 8. The four bugs from the plan, one test each.
  // Bug 1: Steel add-ons weren't saved (old tool saved them from the Panelized Kit box).
  await quoteFor({ type:'steel', projectName:'Shop', buildCost:150000, engineering:6000, miles:100, customLines:[{ desc:'Insulation', amount:8800 }, { desc:'Credit', amount:-2000 }] });
  var b1 = W.ZK.Flow.result();
  var b1row = await W.ZK.quotes.save(W.ZK.Store.buildRow(C, W.ZK.Flow.state, b1, b1.schedule));
  W.ZK.Flow.newQuote(); await W.ZK.Flow.openSaved(b1row.id);
  var b1lines = W.ZK.Flow.state.cfg.customLines;
  rec('Bug 1 fixed: Steel kit add-ons are saved and come back when reopened',
    b1lines.length === 2 && b1lines[0].desc === 'Insulation' && String(b1lines[1].amount) === '-2000' && Math.round(W.ZK.Flow.result().total) === Math.round(b1.total)
      && b1row.config.customs.length === 2, { lines: b1lines });

  // Bug 2: the Custom Home schedule wasn't reopened (old tool kept it only in quote_data).
  var b2cfg = { type:'custom', projectName:'Della', buildCost:410000, engineering:16000, customSchedule:[{ name:'Deposit', pct:20, desc:'At signing' }, { name:'Materials', pct:35, desc:'' }, { name:'Pre-ship', pct:35, desc:'' }, { name:'Final', pct:10, desc:'On set' }] };
  var b2row = window.ZK_OLD.oldRow(OW, cat, b2cfg, { name:'Old Buyer' });
  rows.push(b2row);
  W.ZK.Flow.newQuote(); await W.ZK.Flow.openSaved(b2row.id);
  var b2 = W.ZK.Flow.result();
  var oldStages = OW.invoiceStages(b2row.quote_data).map(function(s){ return s.key + ':' + Math.round(s.amount); }).join(' ');
  var newStages = b2.schedule.map(function(s){ return s.key + ':' + Math.round(s.amount); }).join(' ');
  rec('Bug 2 fixed: a Custom Home payment schedule comes back when reopened (old and new quotes)',
    W.ZK.Flow.state.cfg.customSchedule.length === 4 && W.ZK.Flow.state.cfg.customSchedule[0].name === 'Deposit' && oldStages === newStages, { old: oldStages, now: newStages });

  // Bug 3: modular window upgrade and add-ons weren't reloaded.
  var b3cfg = { type:'modular', productId:'yellowstone', units:2, windows:'andersen_100_series', addons:['rooftop_deck_w_spiral_staircase'], miles:250 };
  var b3row = window.ZK_OLD.oldRow(OW, cat, b3cfg, { name:'Old Buyer' });
  rows.push(b3row);
  W.ZK.Flow.newQuote(); await W.ZK.Flow.openSaved(b3row.id);
  var b3c = W.ZK.Flow.state.cfg;
  rec('Bug 3 fixed: a modular window upgrade and add-ons come back when reopened',
    b3c.windows === 'andersen_100_series' && b3c.addons.length === 1 && b3c.addons[0] === 'rooftop_deck_w_spiral_staircase' && Math.round(W.ZK.Flow.result().total) === Math.round(b3row.total),
    { windows: b3c.windows, addons: b3c.addons, total: Math.round(W.ZK.Flow.result().total), saved: Math.round(b3row.total) });

  // Bug 4: the contract hand-off dropped kit details (homes, discount, shipping, add-ons).
  var b4 = await handOff({ type:'shell', productId:'cedar', units:3, discountPct:10, miles:400, assembly:'remove', adjustments:{ shipping:{ amount:7000, reason:'t' } }, customLines:[{ desc:'Deck', amount:4200 }] });
  var GC = b4.G.CURRENT, gItems = b4.G.getCustomItems();
  var kitOnContract = GC.shell + GC.snow + GC.win + GC.ship + gItems.reduce(function(a, c){ return a + c.amt; }, 0);
  var labels = gItems.map(function(c){ return c.desc; });
  rec('Bug 4 fixed: hand-off keeps homes, discount, adjusted shipping, add-ons and curb credit (kit amount matches the quote)',
    Math.round(kitOnContract) === Math.round(b4.r.contract) && labels.indexOf('Deck') !== -1 && labels.some(function(l){ return /Quote adjustments from Q-TEST-\d+: 3 homes, 10% multi-unit discount, adjusted shipping, curb-delivery credit/.test(l); }),
    { kitOnContract: Math.round(kitOnContract), quoteContract: Math.round(b4.r.contract), labels: labels });
  var b4b = await handOff({ type:'shell', productId:'alpine', miles:300 });
  var b4bItems = b4b.G.getCustomItems();
  rec('Bug 4: a simple one-home quote hands off with no extra adjustment line', b4bItems.length === 0, b4bItems);

  // Out-of-area modular: Proposal blocked with Kelsey's message, Ballpark still offered.
  var areaMsg = 'Complete modular only ships to UT, ID, MT and WY. Quote this as a panelized kit instead.';
  async function docChoices(cfg, st){
    await h.fill(W, cfg); W.ZK.Flow.state.customer.state = st; W.ZK.Flow.go('review'); await h.sleep(0);
    var warn = W.document.getElementById('zk-area-warning');
    W.document.querySelector('[data-doc="1"]').click(); await h.sleep(0);
    var dlg = W.document.getElementById('zk-doc-dialog');
    var out = { warn: warn ? warn.textContent : '', proposal: !!dlg.querySelector('[data-doc-kind="proposal"]'), ballpark: !!dlg.querySelector('[data-doc-kind="ballpark-open"]'), text: dlg.textContent };
    dlg.querySelector('[data-doc-cancel]').click();
    return out;
  }
  var oa = await docChoices({ type:'modular', productId:'yellowstone', miles:250 }, 'CO');
  rec('Out-of-area modular (CO): Proposal blocked with the ship-to message, Ballpark allowed',
    oa.warn === areaMsg && !oa.proposal && oa.ballpark && oa.text.indexOf(areaMsg) !== -1, oa);
  var ia = await docChoices({ type:'modular', productId:'yellowstone', miles:250 }, 'ID');
  var kc = await docChoices({ type:'shell', productId:'alpine', miles:300 }, 'CO');
  rec('In-area modular (ID) and a kit in CO still offer the Proposal, with no warning',
    ia.proposal && !ia.warn && kc.proposal && !kc.warn, { ia: ia, kc: kc });

  oldFrame.remove();
  W.open = realOpen;
  cg.remove(); cap.remove();
  return results;
};
