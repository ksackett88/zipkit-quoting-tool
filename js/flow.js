/* Quote tool: steps, state, validation and the live summary.
   Pricing comes from js/pricing.js; option forms from js/options.js. */
(function(root){
  'use strict';
  var P = root.ZKPricing, O = root.ZKOptions, esc = O.esc;
  var fmt = function(n){ return P.fmt(n); };

  // Product types switched on in the new tool (added one at a time).
  var ENABLED_TYPES = ['shell', 'steel', 'modular', 'garage', 'hangar', 'custom'];

  var STEPS = [
    { id:'customer', label:'Customer' },
    { id:'product',  label:'Product' },
    { id:'options',  label:'Options' },
    { id:'review',   label:'Review' }
  ];
  var STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

  var cat = null;
  var state = {
    step: 'customer',
    reached: 0,                 // furthest step index reached (for the step bar)
    customer: { name:'', project:'', city:'', state:'', email:'', phone:'' },
    type: 'shell',
    search: '',
    cfg: null,
    ui: { moreOpen:false, adjustOpen:false },
    shownErrors: {}             // field keys whose errors are visible (after Next or blur)
  };

  var $ = function(sel, el){ return (el || document).querySelector(sel); };
  var $$ = function(sel, el){ return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

  // ---------- config defaults ----------
  function defaultCfg(type, productId){
    var cfg = { type:type, productId:productId || null, units:1, miles:'', snow:'standard', assembly:'none', windows:'',
      discountPct:'', dryin:false, designPaid:false, engineeringPaid:false, mirroredEngineering:false, promo:false,
      addons:[], customLines:[], adjustments:{} };
    if(type === 'garage') cfg.garageUse = 'standalone';
    if(type === 'steel'){ cfg.shipRate = cat.type('steel').default_ship_per_mile; cfg.projectName = ''; cfg.buildCost = ''; cfg.engineering = ''; cfg.sqft = ''; cfg.scope = ''; }
    if(type === 'custom'){ cfg.shipRate = cat.type('custom').default_ship_per_mile; cfg.designTier = cat.type('custom').default_design_tier; cfg.projectName = ''; cfg.buildCost = ''; cfg.engineering = ''; cfg.sqft = ''; cfg.scope = ''; cfg.customSchedule = []; }
    return cfg;
  }

  function product(){ return state.cfg && state.cfg.productId ? cat.product(state.cfg.productId) : null; }
  function pricingOf(p){ return p ? cat.pricing(p) : null; }

  // ---------- pricing ----------
  function currentResult(){
    if(!state.cfg) return null;
    if(!state.cfg.productId && !O.hasProjectStep(state.cfg.type)) return null;
    try {
      var r = P.price(cat.data, state.cfg);
      // Per-unit assembly figure for the assembly choice tiles.
      var withAdd = P.price(cat.data, Object.assign({}, state.cfg, { assembly:'add' }));
      r.assemblyEach = withAdd.quote.assembly ? withAdd.quote.assembly.per_unit : 0;
      r.schedule = P.schedule(cat.data, r);
      return r;
    } catch(e){ console.error(e); return null; }
  }

  // ---------- validation ----------
  // Returns { key: message } for everything that's wrong on a step.
  function errorsFor(step){
    var e = {}, c = state.customer, cfg = state.cfg;
    if(step === 'customer'){
      if(!c.name.trim()) e.name = 'Add the buyer\'s name.';
      if(c.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) e.email = 'That email looks incomplete. Check it, or leave it blank.';
      if(c.phone.trim() && c.phone.replace(/\D/g, '').length < 10) e.phone = 'Add the full phone number with area code, or leave it blank.';
    }
    if(step === 'product'){
      if(!cfg || (!cfg.productId && !O.hasProjectStep(state.type))) e.product = 'Pick a model to continue.';
      if(cfg && O.hasProjectStep(cfg.type)){
        if(!(parseFloat(cfg.buildCost) > 0)) e.buildCost = 'Enter the price from the estimator.';
        if(cfg.engineering !== '' && cfg.engineering != null && parseFloat(cfg.engineering) < 0) e.engineering = 'Engineering can\'t be negative.';
      }
    }
    if(step === 'options' && cfg){
      var u = Number(cfg.units);
      if(cfg.units !== undefined && (!(u >= 1 && u <= 50) || Math.floor(u) !== u)) e.units = 'Enter a whole number from 1 to 50.';
      if(cfg.miles !== '' && cfg.miles != null && !(Number(cfg.miles) >= 0)) e.miles = 'Distance can\'t be negative.';
      if(cfg.discountPct !== '' && cfg.discountPct != null){ var d = Number(cfg.discountPct); if(!(d >= 0 && d <= 15) || Math.floor(d) !== d) e.discountPct = 'Use a whole number from 0 to 15.'; }
      if(cfg.shipRate !== undefined && cfg.shipRate !== '' && !(Number(cfg.shipRate) >= 0)) e.shipRate = 'Rate can\'t be negative.';
      Object.keys(cfg.adjustments || {}).forEach(function(k){
        var a = cfg.adjustments[k];
        if(a && String(a.amount).trim() !== '' && !String(a.reason || '').trim()) e['reason-' + k] = 'Say why the price changed. Managers see this.';
      });
      var badLine = (cfg.customLines || []).some(function(l){
        var hasAmt = String(l.amount).trim() !== '', hasDesc = String(l.desc).trim() !== '';
        return (hasAmt && !hasDesc) || (hasDesc && !hasAmt);
      });
      if(badLine) e.customLines = 'Each add-on needs a description and an amount (or remove the empty one).';
      if(cfg.type === 'custom' && cfg.customSchedule && cfg.customSchedule.length){
        var info = P.customScheduleInfo(cfg.customSchedule);
        if(!info.isValid) e.customSchedule = 'Payments must add up to 100%, or click "Back to standard".';
      }
    }
    return e;
  }

  function showErrors(step){
    var e = errorsFor(step);
    $$('[data-field]').forEach(function(f){
      var key = f.getAttribute('data-field');
      var msg = e[key] && (state.shownErrors[key] || state.shownErrors.__all) ? e[key] : '';
      f.classList.toggle('invalid', !!msg);
      var err = $('[data-err="' + key + '"]', f) || $('.err', f);
      if(err) err.textContent = msg;
    });
    // Errors that live in their own slot (adjust reasons, add-on lines, schedule).
    $$('[data-err]').forEach(function(el){
      var key = el.getAttribute('data-err');
      if(el.closest('[data-field="' + key + '"]')) return;
      var msg = e[key] && (state.shownErrors[key] || state.shownErrors.__all) ? e[key] : '';
      el.textContent = msg; el.style.display = msg ? 'block' : '';
    });
    var pe = $('#product-error'); if(pe){ pe.textContent = (e.product && state.shownErrors.__all) ? e.product : ''; pe.hidden = !pe.textContent; }
    return e;
  }

  // ---------- step bar ----------
  function renderSteps(){
    var idx = stepIndex(state.step);
    $('#steps').innerHTML = STEPS.map(function(s, i){
      var cls = i === idx ? 'current' : (i <= state.reached ? 'done' : '');
      return '<li class="' + cls + '"><button type="button" data-goto="' + s.id + '"' + (cls === 'done' ? '' : ' tabindex="-1"') + (i === idx ? ' aria-current="step"' : '') + '>'
        + '<span class="num">' + (cls === 'done' ? '✓' : (i + 1)) + '</span><span class="label">' + s.label + '</span></button></li>';
    }).join('');
  }
  function stepIndex(id){ for(var i = 0; i < STEPS.length; i++) if(STEPS[i].id === id) return i; return 0; }

  function renderBrand(){
    var b = cat.brandFor(state.cfg ? state.cfg.type : state.type);
    $('#brand-logo').src = b.logo;
    $('#brand-logo').alt = b.name;
    $('#brand-name').textContent = 'Quoting as ' + b.name;
  }

  // ---------- steps ----------
  function renderCustomer(){
    var c = state.customer;
    function f(key, labelText, type, extra){
      return '<div class="field' + (extra && extra.full ? ' full' : '') + '" data-field="' + key + '"><label for="c-' + key + '">' + labelText + (extra && extra.optional ? ' <span class="opt">(optional)</span>' : '') + '</label>'
        + '<input type="' + type + '" id="c-' + key + '" data-cust="' + key + '" value="' + esc(c[key]) + '"' + (extra && extra.ac ? ' autocomplete="' + extra.ac + '"' : '') + (extra && extra.ph ? ' placeholder="' + esc(extra.ph) + '"' : '') + '>'
        + '<div class="err"></div></div>';
    }
    return '<h1 class="step-title">Who is this quote for?</h1>'
      + '<p class="step-lead">Entered once. Every document uses it.</p>'
      + '<div class="card"><div class="fields">'
      + f('name', 'Buyer name', 'text', { full:true, ac:'off' })
      + f('email', 'Email', 'email', { optional:true, ac:'off' })
      + f('phone', 'Phone', 'tel', { optional:true, ac:'off' })
      + f('city', 'City', 'text', { optional:true, ac:'off' })
      + '<div class="field" data-field="state"><label for="c-state">State <span class="opt">(optional)</span></label><select id="c-state" data-cust="state"><option value="">Choose…</option>'
      + STATES.map(function(s){ return '<option' + (c.state === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select><div class="err"></div></div>'
      + f('project', 'Project name', 'text', { optional:true, full:true, ph:'Defaults to the model name, e.g. "Alpine project"' })
      + '</div></div>'
      + '<div class="actions"><span></span><div class="right"><button type="button" class="btn primary" data-next="product">Next: choose a product</button></div></div>';
  }

  function renderProduct(){
    var types = cat.activeTypes(ENABLED_TYPES);
    var lead = O.hasProjectStep(state.type) ? 'Enter the numbers from the estimator.' : 'Pick a model. You can change it later.';
    var h = '<h1 class="step-title">What are they buying?</h1><p class="step-lead">' + lead + '</p>';
    if(types.length > 1){
      h += '<div class="toolbar"><div class="type-tabs" role="tablist">' + types.map(function(t){
        return '<button type="button" class="type-tab' + (t === state.type ? ' on' : '') + '" role="tab" aria-selected="' + (t === state.type) + '" data-type="' + t + '">' + cat.typeLabel(t) + '</button>';
      }).join('') + '</div></div>';
    }
    h += '<div class="notice bad" id="product-error" hidden></div>';
    if(O.hasProjectStep(state.type)){
      var ctx = optionCtx();
      h += '<div class="card freeform">' + O.renderProject(ctx) + '</div>'
        + '<div class="actions"><button type="button" class="btn quiet" data-goto="customer">Back</button><div class="right"><button type="button" class="btn primary" data-next="options">Next: options</button></div></div>';
      return h;
    }
    h += '<div class="toolbar"><input type="search" class="search" id="search" placeholder="Search models" value="' + esc(state.search) + '" aria-label="Search models"></div>';
    h += '<div class="grid" id="grid">' + productCards() + '</div>';
    h += '<div class="actions"><button type="button" class="btn quiet" data-goto="customer">Back</button></div>';
    return h;
  }
  function productCards(){
    var q = state.search.trim().toLowerCase();
    var list = cat.products(state.type).filter(function(p){
      if(!q) return true;
      return (p.name + ' ' + (p.aliases || []).join(' ') + ' ' + (p.sqft_label || '') + ' ' + (p.dimensions || '')).toLowerCase().indexOf(q) !== -1;
    });
    if(state.type === 'shell') list = list.slice().sort(function(a, b){ return a.sqft - b.sqft; });
    if(!list.length) return '<div class="empty">No models match "' + esc(state.search) + '".</div>';
    var sel = state.cfg && state.cfg.productId;
    return list.map(function(p){
      var meta = p.sqft_label ? p.sqft_label + ' sq ft' : (p.dimensions || '');
      var start = cat.startingPrice(p);
      var lead = state.type === 'modular' ? 'Complete from ' : (state.type === 'hangar' ? 'Starting at ' : 'Kit from ');
      return '<button type="button" class="pcard' + (p.id === sel ? ' on' : '') + '" data-product="' + p.id + '">'
        + '<div class="ph">' + (p.photo ? '<img src="' + esc(p.photo) + '" alt="" loading="lazy">' : '') + '</div>'
        + '<div class="pc-body"><div class="pc-name">' + esc(p.name) + (p.barndominium ? '<span class="tag">Barndominium</span>' : '') + '</div>'
        + '<div class="pc-meta">' + esc(meta) + '</div>'
        + (start != null ? '<div class="pc-price">' + lead + fmt(start) + '</div>' : '')
        + '</div></button>';
    }).join('');
  }

  function optionCtx(){
    var p = product();
    return { catalog: cat, type: state.cfg ? state.cfg.type : state.type, product: p, pricing: pricingOf(p), cfg: state.cfg || defaultCfg(state.type), result: currentResult(), ui: state.ui };
  }

  function serviceAreaWarning(){
    if(!state.cfg) return '';
    var t = cat.type(state.cfg.type);
    var st = state.customer.state;
    if(!t.service_states || !st || t.service_states.indexOf(st) !== -1) return '';
    return '<div class="notice warn"><b>Modular homes ship to ' + t.service_states.join(', ').replace(/, (\w+)$/, ' and $1') + ' only.</b> This buyer is in ' + esc(st) + '. Offer a panelized kit instead.</div>';
  }

  function renderOptions(){
    var p = product(), ctx = optionCtx();
    var title = ctx.result ? ctx.result.quote.model : (p ? p.name : cat.typeLabel(state.cfg.type));
    return '<h1 class="step-title">' + esc(title) + '</h1>'
      + '<p class="step-lead">The defaults make a complete quote. Change only what the buyer asked for.</p>'
      + serviceAreaWarning()
      + '<div class="two-col"><div class="card" id="options-form">' + O.renderOptions(ctx) + '</div>'
      + '<aside class="card summary sticky" id="summary" aria-live="polite">' + summaryHTML(ctx.result) + '</aside></div>'
      + '<div class="actions"><button type="button" class="btn quiet" data-goto="product">Back</button><div class="right"><button type="button" class="btn primary" data-next="review">Next: review</button></div></div>';
  }

  function linesHTML(r){
    return '<table class="lines"><tbody>' + r.lines.map(function(l){
      var amt = l.kind === 'note' ? '<td class="amt note">' + esc(l.text) + '</td>'
        : '<td class="amt' + (l.kind === 'credit' ? ' credit' : '') + '">' + (l.kind === 'credit' ? '−' : '') + fmt(l.amount) + '</td>';
      return '<tr><td>' + esc(l.label) + (l.adjusted ? '<span class="flag">Adjusted</span>' : '') + (l.sub ? '<span class="sub">' + esc(l.sub) + '</span>' : '') + '</td>' + amt + '</tr>';
    }).join('') + '</tbody></table>';
  }
  function summaryHTML(r){
    if(!r) return '<h3>Quote</h3><div class="help">Pick a model to see the price.</div>';
    var q = r.quote;
    var h = '<h3>Quote</h3><div class="s-model">' + esc(q.model) + (q.units > 1 ? ' × ' + q.units : '') + '</div>' + linesHTML(r);
    h += '<div class="total-row"><span class="t-label">Total</span><span class="t-value">' + fmt(r.total) + '</span></div>';
    if(r.perUnitText) h += '<div class="per-unit">' + esc(r.perUnitText) + '</div>';
    if(q.assembly && q.assembly.mode === 'added') h += '<div class="help">Includes ' + fmt(q.assembly.amount) + ' site assembly, billed on a separate Zip Kit Assembly LLC contract.</div>';
    if(r.promoCredit > 0) h += '<div class="help">Promo: ' + fmt(r.promoCredit) + ' design-retainer credit comes off engineering. Proposal total ' + fmt(r.displayedTotal) + '.</div>';
    return h;
  }

  function scheduleHTML(r){
    var st = r.schedule, sum = st.reduce(function(a, s){ return a + s.amount; }, 0);
    return '<table class="schedule"><tbody>' + st.map(function(s){
      return '<tr><td>' + esc(s.name) + '<span class="sub">' + esc(s.desc) + '</span></td><td class="amt">' + fmt(s.amount) + '</td></tr>';
    }).join('') + '<tr class="sum"><td>Total of all payments</td><td class="amt">' + fmt(sum) + '</td></tr></tbody></table>';
  }

  function adjustmentsList(){
    var a = state.cfg.adjustments || {}, items = O.adjustItems(optionCtx());
    var used = items.filter(function(i){ return a[i.key] && String(a[i.key].amount).trim() !== ''; });
    if(!used.length) return '';
    return '<div class="notice warn"><b>Price adjustments on this quote</b><ul style="margin:6px 0 0;padding-left:18px">' + used.map(function(i){
      return '<li>' + esc(i.title) + ': ' + fmt(parseFloat(a[i.key].amount) || 0) + ' — ' + esc(a[i.key].reason) + '</li>';
    }).join('') + '</ul></div>';
  }

  function renderReview(){
    var r = currentResult(), c = state.customer;
    var where = [c.city, c.state].filter(Boolean).join(', ');
    var h = '<h1 class="step-title">Review and send</h1><p class="step-lead">Check it over, then create the document for the buyer.</p>'
      + serviceAreaWarning() + adjustmentsList()
      + '<div class="two-col"><div>'
      + '<div class="card"><div class="subtle-head" style="margin-top:0">Buyer</div>'
      + '<div style="font-size:17px;font-weight:700;color:var(--ink)">' + esc(c.name) + '</div>'
      + '<div class="help">' + [esc(c.email), esc(c.phone), esc(where)].filter(Boolean).join(' · ') + '</div>'
      + '<button type="button" class="adjust-link" data-goto="customer">Edit buyer</button></div>'
      + '<div class="card" style="margin-top:16px"><div class="subtle-head" style="margin-top:0">Payment schedule</div>' + scheduleHTML(r)
      + (r.quote.assembly && r.quote.assembly.mode === 'added' ? '<div class="help">Site assembly (' + fmt(r.quote.assembly.amount) + ') is billed separately and isn\'t in this schedule.</div>' : '')
      + '</div></div>'
      + '<aside class="card summary">' + summaryHTML(r) + '<button type="button" class="adjust-link" data-goto="options">Change options</button></aside></div>'
      + '<div class="actions"><button type="button" class="btn quiet" data-goto="options">Back</button><div class="right" id="review-actions">'
      + '<button type="button" class="btn primary" disabled title="Coming in the next update">Create document</button>'
      + '</div></div>';
    return h;
  }

  // ---------- render ----------
  function render(){
    renderSteps();
    renderBrand();
    var html = { customer: renderCustomer, product: renderProduct, options: renderOptions, review: renderReview }[state.step]();
    $('#main').innerHTML = html;
    showErrors(state.step);
  }
  function refreshLive(){
    // Re-price and update the form in place. Never rebuilds the form, so a
    // click or keystroke in progress is never lost.
    var r = currentResult();
    var s = $('#summary'); if(s) s.innerHTML = summaryHTML(r);
    var f = $('#options-form'); if(f && state.cfg) O.patchOptions(optionCtx(), f);
    showErrors(state.step);
  }
  function refreshForm(){
    var f = $('#options-form'); if(!f) return refreshLive();
    var active = document.activeElement, sel = active && active.getAttribute && (active.getAttribute('data-key') || null);
    f.innerHTML = O.renderOptions(optionCtx());
    refreshLive();
    if(sel){ var again = $('[data-key="' + sel + '"]', f); if(again && again.type !== 'radio') again.focus(); }
  }

  function go(step){
    var target = stepIndex(step), cur = stepIndex(state.step);
    if(target > cur){
      // Moving forward: every step in between must be valid.
      for(var i = cur; i < target; i++){
        var e = errorsFor(STEPS[i].id);
        if(Object.keys(e).length){
          if(i !== cur){ state.step = STEPS[i].id; render(); }
          state.shownErrors.__all = true; showErrors(STEPS[i].id);
          var first = $('.invalid input, .invalid select, .invalid textarea') || $('#product-error:not([hidden])');
          if(first && first.focus) first.focus();
          if(first && first.scrollIntoView) first.scrollIntoView({ block:'center', behavior:'smooth' });
          return;
        }
      }
    }
    state.shownErrors = {};
    state.step = step;
    state.reached = Math.max(state.reached, target);
    render();
    window.scrollTo(0, 0);
    var h = $('.step-title'); if(h){ h.setAttribute('tabindex', '-1'); h.focus({ preventScroll:true }); }
  }

  function chooseProduct(id){
    var p = cat.product(id);
    if(!state.cfg || state.cfg.productId !== id){
      // Keep what the rep already chose where it still applies.
      var old = state.cfg, cfg = defaultCfg(p.type, id);
      if(old && old.type === p.type){
        ['units','miles','snow','assembly','discountPct','dryin','designPaid','engineeringPaid','mirroredEngineering','promo','customLines','garageUse'].forEach(function(k){ if(old[k] !== undefined) cfg[k] = old[k]; });
      }
      state.cfg = cfg;
      state.ui.adjustOpen = false;
    }
    if(!state.customer.project) state.customer._projectDefault = p.name + ' project';
    state.reached = Math.max(state.reached, stepIndex('product'));
    go('options');
  }

  // ---------- events ----------
  function setCfgFromInput(el){
    var key = el.getAttribute('data-key'), kind = el.getAttribute('data-kind');
    if(kind === 'bool') state.cfg[key] = el.checked;
    else if(kind === 'choice'){ if(el.checked) state.cfg[key] = el.value; }
    else state.cfg[key] = el.value;
  }

  function onInput(ev){
    var el = ev.target;
    if(el.hasAttribute('data-cust')){ state.customer[el.getAttribute('data-cust')] = el.value; showErrors('customer'); return; }
    if(el.id === 'search'){ state.search = el.value; $('#grid').innerHTML = productCards(); return; }
    if(!state.cfg) return;
    if(el.hasAttribute('data-key')){ setCfgFromInput(el); refreshLive(); return; }
    if(el.hasAttribute('data-line')){ var i = +el.getAttribute('data-line'); state.cfg.customLines[i][el.getAttribute('data-part')] = el.value; refreshLive(); return; }
    if(el.hasAttribute('data-sched')){
      var j = +el.getAttribute('data-sched'); state.cfg.customSchedule[j][el.getAttribute('data-part')] = el.value; refreshLive();
      var sum = $('[data-sched-sum]'); if(sum){ var info = P.customScheduleInfo(state.cfg.customSchedule);
        sum.innerHTML = info.isValid ? 'Adds up to 100%. Engineering is still billed first.' : 'Adds up to <b>' + (Math.round(info.sum * 100) / 100) + '%</b>. Make it 100% to continue, or click "Back to standard".'; }
      return;
    }
    if(el.hasAttribute('data-adj')){
      var k = el.getAttribute('data-adj'), part = el.getAttribute('data-part');
      state.cfg.adjustments[k] = state.cfg.adjustments[k] || { amount:'', reason:'' };
      state.cfg.adjustments[k][part] = el.value;
      var a = state.cfg.adjustments[k];
      if(String(a.amount).trim() === '' && !String(a.reason).trim()) delete state.cfg.adjustments[k];
      refreshLive(); return;
    }
  }
  function onChange(ev){
    var el = ev.target;
    if(el.hasAttribute('data-cust')){ state.customer[el.getAttribute('data-cust')] = el.value; state.shownErrors[el.getAttribute('data-cust')] = true; showErrors('customer'); return; }
    if(!state.cfg) return;
    if(el.hasAttribute('data-key')){
      setCfgFromInput(el); state.shownErrors[el.getAttribute('data-key')] = true;
      // Dropdowns and checkboxes can change which price adjustments apply, so
      // rebuild for those. Typing and choice tiles update in place: a rebuild
      // there would swallow the click the rep is making.
      var kind = el.getAttribute('data-kind');
      if(kind === 'select' || kind === 'bool') refreshForm(); else refreshLive();
      return;
    }
    if(el.hasAttribute('data-line')){ var li = +el.getAttribute('data-line'); state.cfg.customLines[li][el.getAttribute('data-part')] = el.value; }
    if(el.hasAttribute('data-sched')){ var si = +el.getAttribute('data-sched'); state.cfg.customSchedule[si][el.getAttribute('data-part')] = el.value; }
    if(el.hasAttribute('data-addon')){
      var id = el.getAttribute('data-addon'), list = state.cfg.addons.filter(function(x){ return x !== id; });
      if(el.checked) list.push(id);
      state.cfg.addons = list; refreshLive(); return;
    }
    if(el.hasAttribute('data-adj')){ onInput(ev); state.shownErrors['reason-' + el.getAttribute('data-adj')] = true; showErrors('options'); return; }
    if(el.hasAttribute('data-line')){ state.shownErrors.customLines = true; showErrors('options'); return; }
  }
  function onClick(ev){
    var t = ev.target.closest('button, [data-product]');
    if(!t) return;
    if(t.hasAttribute('data-next')) return go(t.getAttribute('data-next'));
    if(t.hasAttribute('data-goto')){ var g = t.getAttribute('data-goto'); if(stepIndex(g) <= state.reached || stepIndex(g) < stepIndex(state.step)) go(g); return; }
    if(t.hasAttribute('data-product')) return chooseProduct(t.getAttribute('data-product'));
    if(t.hasAttribute('data-type')){
      var ty = t.getAttribute('data-type');
      if(ty !== state.type){ state.type = ty; state.search = ''; state.cfg = O.hasProjectStep(ty) ? defaultCfg(ty) : (state.cfg && state.cfg.type === ty ? state.cfg : null); }
      render(); return;
    }
    if(t.hasAttribute('data-step')){
      var key = t.getAttribute('data-step'), v = (parseInt(state.cfg[key], 10) || 1) + (+t.getAttribute('data-delta'));
      state.cfg[key] = Math.max(1, Math.min(50, v));
      var inp = $('[data-key="' + key + '"]'); if(inp) inp.value = state.cfg[key];
      refreshLive(); return;
    }
    if(t.hasAttribute('data-tip')){
      var tx = document.getElementById('tip-' + t.getAttribute('data-tip')); var open = tx.hidden; tx.hidden = !open; t.setAttribute('aria-expanded', open ? 'true' : 'false'); return;
    }
    if(t.hasAttribute('data-adjust-toggle')){ state.ui.adjustOpen = !($('.adjust-box')); if(!state.ui.adjustOpen){ /* keep entries; box stays open if any are set */ } refreshForm(); return; }
    if(t.hasAttribute('data-add-line')){ state.cfg.customLines.push({ desc:'', amount:'' }); refreshForm(); var ins = $$('[data-part="desc"][data-line]'); if(ins.length) ins[ins.length - 1].focus(); return; }
    if(t.hasAttribute('data-remove-line')){ state.cfg.customLines.splice(+t.getAttribute('data-remove-line'), 1); refreshForm(); return; }
    if(t.hasAttribute('data-sched-start') || t.hasAttribute('data-sched-reset')){
      state.cfg.customSchedule = t.hasAttribute('data-sched-start') ? cat.data.payment_schedules.custom_home_default.stages.map(function(s){ return { name:s.name, pct:s.pct, desc:s.desc }; }) : [];
      refreshForm(); return;
    }
    if(t.hasAttribute('data-sched-add')){ state.cfg.customSchedule = state.cfg.customSchedule || []; state.cfg.customSchedule.push({ name:'', pct:'', desc:'' }); refreshForm(); return; }
    if(t.hasAttribute('data-remove-sched')){ state.cfg.customSchedule.splice(+t.getAttribute('data-remove-sched'), 1); refreshForm(); return; }
  }
  function onToggle(ev){ if(ev.target.matches && ev.target.matches('[data-more]')) state.ui.moreOpen = ev.target.open; }

  // ---------- sign-in gate ----------
  function signInGate(){
    return new Promise(function(resolve){
      if(!root.ZK_REQUIRE_AUTH || !root.zkAuth) return resolve(null);
      root.zkAuth.getCurrentUser().then(function(user){
        if(user) return resolve(user);
        var o = $('#signin'); o.hidden = false;
        $('#signin-form').addEventListener('submit', function(e){
          e.preventDefault();
          var err = $('#signin-err'), btn = $('#signin-btn');
          err.hidden = true; btn.disabled = true; btn.textContent = 'Signing in…';
          root.zkAuth.signIn($('#signin-email').value.trim(), $('#signin-password').value)
            .then(function(){ return root.zkAuth.getCurrentUser(); })
            .then(function(u){ o.hidden = true; resolve(u); })
            .catch(function(x){ err.textContent = (x && x.message) || 'Sign in failed.'; err.hidden = false; })
            .then(function(){ btn.disabled = false; btn.textContent = 'Sign in'; });
        });
      }).catch(function(){ resolve(null); });
    });
  }

  function init(){
    root.ZKCatalog.load('data/catalog.json').then(function(c){
      cat = c;
      state.type = cat.activeTypes(ENABLED_TYPES)[0];
      var main = $('#main');
      main.addEventListener('input', onInput);
      main.addEventListener('change', onChange);
      main.addEventListener('toggle', onToggle, true);
      document.addEventListener('click', onClick);
      render();
      return signInGate();
    }).then(function(user){
      state.user = user;
      if(user && user.email) $('#user-email').textContent = user.email;
    }).catch(function(e){
      $('#main').innerHTML = '<div class="notice bad"><b>The quote tool couldn\'t load its price list.</b> Check your connection and reload the page. If it keeps happening, tell the office.</div>';
      console.error(e);
    });
  }

  // Clear everything and start over at the Customer step.
  function newQuote(){
    state.step = 'customer'; state.reached = 0;
    state.customer = { name:'', project:'', city:'', state:'', email:'', phone:'' };
    state.type = cat.activeTypes(ENABLED_TYPES)[0]; state.search = '';
    state.cfg = null; state.ui = { moreOpen:false, adjustOpen:false }; state.shownErrors = {};
    state.saved = null;
    render(); window.scrollTo(0, 0);
  }

  root.ZKFlow = {
    state: state,
    go: go,
    newQuote: newQuote,
    result: currentResult,
    enabledTypes: ENABLED_TYPES,
    // Test helper: hide the sign-in screen on a local test server only.
    _unlockForTests: function(){ if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)){ $('#signin').hidden = true; } }
  };
  document.addEventListener('DOMContentLoaded', init);
})(window);
