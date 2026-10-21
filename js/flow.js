/* Quote tool: steps, state, validation and the live summary.
   Pricing comes from js/pricing.js; option forms from js/options.js. */
(function(root){
  'use strict';
  var ZK = root.ZK, P = ZK.Pricing, O = ZK.Options, esc = O.esc;
  var fmt = function(n){ return P.fmt(n); };

  // Product types switched on in the new tool (added one at a time).
  var ENABLED_TYPES = ['shell', 'steel', 'modular', 'garage', 'hangar', 'custom'];

  // Quote to signed contract (Kelsey 2026-10-20). "Send" is the contract
  // generator's Send page, opened by "Create the contract".
  var STEPS = [
    { id:'customer', label:'Customer' },
    { id:'product',  label:'Model' },
    { id:'options',  label:'Options' },
    { id:'review',   label:'Review' },
    { id:'contract', label:'Contract' },
    { id:'send',     label:'Send', away:true }
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
    contract: null,             // the Contract step: legal name, addresses, payment schedule
    ui: { moreOpen:false, adjustOpen:false },
    shownErrors: {}             // field keys whose errors are visible (after Next or blur)
  };

  // Everything the tool draws lives inside one element (the .zk-tool wrapper),
  // so lookups never reach into a host page such as a WordPress theme.
  var app = null;
  var $ = function(sel, el){ return (el || app || document).querySelector(sel); };
  var $$ = function(sel, el){ return Array.prototype.slice.call((el || app || document).querySelectorAll(sel)); };

  // ---------- config defaults ----------
  function defaultCfg(type, productId){
    var cfg = { type:type, productId:productId || null, units:1, miles:'', snow:'standard', assembly:'none', windows:'',
      discountPct:'', dryin:false, designPaid:false, engineeringPaid:false, mirroredEngineering:false, promo:false,
      assemblyOverride:false, assemblyOverrideReason:'',
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
      if(!c.state) e.state = 'Pick the state the home will be built in. It decides what we can sell and build there.';
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
      if(cfg.assembly === 'add'){
        var actx = optionCtx(), rule = O.assemblyRule(actx);
        if(!O.assemblyAllowed(actx)){
          if(rule.overridable && cfg.assemblyOverride) e.assemblyOverrideReason = 'Say why the crew is going outside its states. Managers see this.';
          else e.assembly = rule.text + (rule.overridable ? ' Pick another option, or turn on the override under Advanced and say why.' : ' Pick "Price as listed" or "Curb delivery only".');
        }
      }
      if(cfg.type === 'custom' && cfg.customSchedule && cfg.customSchedule.length){
        var info = P.customScheduleInfo(cfg.customSchedule);
        if(!info.isValid) e.customSchedule = 'Payments must add up to 100%, or click "Back to standard".';
      }
    }
    if(step === 'contract' && cfg){
      var ct = ensureContract();
      [['legalName', 'Add the buyer\'s full legal name, as it goes on the contract.'],
       ['mailing', 'Add the buyer\'s mailing address.'],
       ['site', 'Add the address of the building site.'],
       ['shipTo', 'Add the city and state it ships to.'],
       ['date', 'Add the contract date.']].forEach(function(f){ if(!String(ct[f[0]] || '').trim()) e['ct-' + f[0]] = f[1]; });
      if(!ZK.Schedule.check(ct.schedule.rows).ok) e.schedule = 'Fix the payment schedule first (see the total under it).';
      if(state.user && !(state.rep && state.rep.name)) e.rep = 'Add your name and phone below. They print on the contract.';
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
    var pe = $('#zk-product-error'); if(pe){ pe.textContent = (e.product && state.shownErrors.__all) ? e.product : ''; pe.hidden = !pe.textContent; }
    return e;
  }

  // ---------- step bar ----------
  function renderSteps(){
    var idx = stepIndex(state.step);
    $('#zk-steps').innerHTML = STEPS.map(function(s, i){
      var cls = i === idx ? 'current' : (i <= state.reached ? 'done' : '');
      if(s.away) return '<li class="away"><span class="step-away"><span class="num">' + (i + 1) + '</span><span class="label">' + s.label + '</span></span></li>';
      return '<li class="' + cls + '"><button type="button" data-goto="' + s.id + '"' + (cls === 'done' ? '' : ' tabindex="-1"') + (i === idx ? ' aria-current="step"' : '') + '>'
        + '<span class="num">' + (cls === 'done' ? '✓' : (i + 1)) + '</span><span class="label">' + s.label + '</span></button></li>';
    }).join('');
  }
  function stepIndex(id){ for(var i = 0; i < STEPS.length; i++) if(STEPS[i].id === id) return i; return 0; }

  function renderBrand(){
    var b = cat.brandFor(state.cfg ? state.cfg.type : state.type);
    $('#zk-brand-logo').src = ZK.url(b.logo);
    $('#zk-brand-logo').alt = b.name;
    $('#zk-brand-name').textContent = 'Quoting as ' + b.name;
  }

  // ---------- steps ----------
  function renderCustomer(){
    var c = state.customer;
    function f(key, labelText, type, extra){
      return '<div class="field' + (extra && extra.full ? ' full' : '') + '" data-field="' + key + '"><label for="zk-c-' + key + '">' + labelText + (extra && extra.optional ? ' <span class="opt">(optional)</span>' : '') + '</label>'
        + '<input type="' + type + '" id="zk-c-' + key + '" data-cust="' + key + '" value="' + esc(c[key]) + '"' + (extra && extra.ac ? ' autocomplete="' + extra.ac + '"' : '') + (extra && extra.ph ? ' placeholder="' + esc(extra.ph) + '"' : '') + '>'
        + '<div class="err"></div></div>';
    }
    return '<h1 class="step-title">Who is this quote for?</h1>'
      + '<p class="step-lead">Entered once. Every document uses it.</p>'
      + '<div class="card"><div class="fields">'
      + f('name', 'Buyer name', 'text', { full:true, ac:'off' })
      + f('email', 'Email', 'email', { optional:true, ac:'off' })
      + f('phone', 'Phone', 'tel', { optional:true, ac:'off' })
      + f('city', 'City', 'text', { optional:true, ac:'off' })
      + '<div class="field" data-field="state"><label for="zk-c-state">State it will be built in</label><select id="zk-c-state" data-cust="state"><option value="">Choose…</option>'
      + STATES.map(function(s){ return '<option' + (c.state === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select><div class="help">Decides what we can sell and build there.</div><div class="err"></div></div>'
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
    h += '<div class="notice bad" id="zk-product-error" hidden></div>';
    if(O.hasProjectStep(state.type)){
      var ctx = optionCtx();
      h += '<div class="card freeform">' + O.renderProject(ctx) + '</div>'
        + '<div class="actions"><button type="button" class="btn quiet" data-goto="customer">Back</button><div class="right"><button type="button" class="btn primary" data-next="options">Next: options</button></div></div>';
      return h;
    }
    h += '<div class="toolbar"><input type="search" class="search" id="zk-search" placeholder="Search models" value="' + esc(state.search) + '" aria-label="Search models"></div>';
    h += '<div class="grid" id="zk-grid">' + productCards() + '</div>';
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
        + '<div class="ph">' + (p.photo ? '<img src="' + esc(ZK.photo(p.photo, 'card')) + '" data-full="' + esc(ZK.photo(p.photo, 'doc')) + '" alt="" loading="lazy" onerror="if(this.dataset.full){this.src=this.dataset.full;this.removeAttribute(\x27data-full\x27);}">' : '') + '</div>'
        + '<div class="pc-body"><div class="pc-name">' + esc(p.name) + (p.barndominium ? '<span class="tag">Barndominium</span>' : '') + '</div>'
        + '<div class="pc-meta">' + esc(meta) + '</div>'
        + (start != null ? '<div class="pc-price">' + lead + fmt(start) + '</div>' : '')
        + '</div></button>';
    }).join('');
  }


  function optionCtx(){
    var p = product();
    return { catalog: cat, type: state.cfg ? state.cfg.type : state.type, product: p, pricing: pricingOf(p), cfg: state.cfg || defaultCfg(state.type), result: currentResult(), ui: state.ui, customerState: state.customer.state };
  }

  // Complete modular ships to its service states only (Kelsey, 2026-10-13), and
  // wood kits (panelized kits, garages, custom homes) to the wood-kit states
  // (Kelsey, 2026-10-20). Outside them the rep can still make a Ballpark, but
  // not a Proposal or a contract.
  function outOfArea(){
    if(!state.cfg) return false;
    var t = cat.type(state.cfg.type), st = state.customer.state;
    return !!(t.service_states && st && t.service_states.indexOf(st) === -1);
  }
  function serviceAreaText(){
    var t = cat.type(state.cfg.type), list = t.service_states.join(', ').replace(/, (\w+)$/, ' and $1');
    if(state.cfg.type === 'modular') return 'Complete modular only ships to ' + list + '. Quote this as a panelized kit instead.';
    return 'Wood kits only ship to ' + list + '. Quote a steel kit instead.';
  }
  function serviceAreaWarning(){
    if(!outOfArea()) return '';
    return '<div class="notice warn" id="zk-area-warning"><b>' + esc(serviceAreaText()) + '</b></div>';
  }

  // Our assembly crew works in the brand's assembly states only. Outside them
  // "Add our crew" is blocked unless the office overrides it under Advanced
  // with a reason (Kelsey, 2026-10-20; it was a warning before).
  function assemblyWarningHTML(){
    if(!state.cfg) return '';
    var actx = optionCtx(), rule = O.assemblyRule(actx);
    if(rule.ok) return '';
    if(state.cfg.assembly === 'add' && O.assemblyAllowed(actx)) return '<div class="notice info"><b>Assembly override:</b> ' + esc(rule.text) + ' Reason: ' + esc(state.cfg.assemblyOverrideReason) + '</div>';
    return '<div class="notice warn"><b>' + esc(rule.text) + '</b> ' + (rule.overridable ? '"Add our assembly crew" needs the office\'s OK (the override is under Advanced).' : 'Quote it as DIY: "Price as listed" or "Curb delivery only".') + '</div>';
  }
  function assemblyWarning(){ return '<div id="zk-assembly-warning">' + assemblyWarningHTML() + '</div>'; }

  function renderOptions(){
    var p = product(), ctx = optionCtx();
    var title = ctx.result ? ctx.result.quote.model : (p ? p.name : cat.typeLabel(state.cfg.type));
    return '<h1 class="step-title">' + esc(title) + '</h1>'
      + '<p class="step-lead">The defaults make a complete quote. Change only what the buyer asked for.</p>'
      + loadNotice() + serviceAreaWarning() + assemblyWarning()
      + '<div class="two-col"><div class="card" id="zk-options-form">' + O.renderOptions(ctx) + '</div>'
      + '<aside class="card summary sticky" id="zk-summary" aria-live="polite">' + summaryHTML(ctx.result) + '</aside></div>'
      + '<div class="actions options-bar"><button type="button" class="btn quiet" data-goto="product">Back</button><div class="right"><span class="bar-total" id="zk-bar-total" aria-hidden="true">' + (ctx.result ? 'Total <b>' + fmt(ctx.result.total) + '</b>' : '') + '</span><button type="button" class="btn primary" data-next="review">Next: review</button></div></div>';
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
    var st = buyerSchedule(r), sum = st.reduce(function(a, s){ return a + s.amount; }, 0);
    return '<table class="schedule"><tbody>' + st.map(function(s){
      return '<tr><td>' + esc(s.name) + '<span class="sub">' + esc(s.desc) + '</span></td><td class="amt">' + (s.paid ? 'PAID' : fmt(s.amount)) + '</td></tr>';
    }).join('') + '<tr class="sum"><td>Total of all payments</td><td class="amt">' + fmt(sum) + '</td></tr></tbody></table>';
  }

  function adjustmentsList(){
    var a = state.cfg.adjustments || {}, items = O.adjustItems(optionCtx());
    var used = items.filter(function(i){ return a[i.key] && String(a[i.key].amount).trim() !== ''; });
    if(!used.length) return '';
    return '<div class="notice warn"><b>Price adjustments on this quote</b><ul class="notice-list">' + used.map(function(i){
      return '<li>' + esc(i.title) + ': ' + fmt(parseFloat(a[i.key].amount) || 0) + ' — ' + esc(a[i.key].reason) + '</li>';
    }).join('') + '</ul></div>';
  }

  function repCard(){
    var rep = state.rep || {};
    if(!state.user) return '';
    if(rep.name && rep.phone && !state.ui.editRep){
      return '<div class="card"><div class="subtle-head first">You (on the documents)</div><div class="rep-line">' + esc(rep.name) + ' · ' + esc(rep.phone) + (rep.email ? ' · ' + esc(rep.email) : '') + '</div>'
        + '<button type="button" class="adjust-link" data-rep-edit="1">Change</button></div>';
    }
    return '<div class="card" id="zk-rep-card"><div class="subtle-head first">You (on the documents)</div>'
      + '<p class="help">Your name and phone go on every document. You only enter them once.</p>'
      + '<div class="fields">'
      + '<div class="field" data-field="repName"><label for="zk-rep-name">Your name</label><input type="text" id="zk-rep-name" value="' + esc(rep.name || '') + '" autocomplete="name"><div class="err"></div></div>'
      + '<div class="field" data-field="repPhone"><label for="zk-rep-phone">Your phone</label><input type="tel" id="zk-rep-phone" value="' + esc(rep.phone || '') + '" autocomplete="tel"><div class="err"></div></div>'
      + '</div><div class="btn-row"><button type="button" class="btn" data-rep-save="1">Save my details</button></div></div>';
  }

  function savedLine(){
    var s = state.saved;
    if(!s || !s.number) return '<span class="help">Not saved yet. ' + (state.step === 'contract' ? 'Creating the contract saves it.' : 'Creating a document saves it.') + '</span>';
    return '<span class="help">Saved as <b>' + esc(s.number) + '</b>' + (s.note ? ' · ' + esc(s.note) : '') + '</span>';
  }

  function renderReview(){
    var r = currentResult(), c = state.customer;
    var where = [c.city, c.state].filter(Boolean).join(', ');
    var h = '<h1 class="step-title">Review the quote</h1><p class="step-lead">Check it over. Send the buyer a proposal, or write the contract.</p>'
      + loadNotice() + serviceAreaWarning() + assemblyWarning() + adjustmentsList()
      + '<div class="two-col"><div class="stack">'
      + '<div class="card"><div class="subtle-head first">Buyer</div>'
      + '<div class="buyer-name">' + esc(c.name) + '</div>'
      + '<div class="help">' + [esc(c.email), esc(c.phone), esc(where)].filter(Boolean).join(' · ') + '</div>'
      + '<button type="button" class="adjust-link" data-goto="customer">Edit buyer</button></div>'
      + '<div class="card"><div class="subtle-head first">Payment schedule</div>' + scheduleHTML(r)
      + (r.quote.assembly && r.quote.assembly.mode === 'added' ? '<div class="help">Site assembly (' + fmt(r.quote.assembly.amount) + ') is billed separately and isn\'t in this schedule.</div>' : '')
      + '</div>' + repCard() + '</div>'
      + '<aside class="card summary">' + summaryHTML(r) + '<button type="button" class="adjust-link" data-goto="options">Change options</button></aside></div>'
      + '<div class="actions options-bar review-bar"><button type="button" class="btn quiet" data-goto="options">Back</button>'
      + '<div class="right" id="zk-review-actions"><span id="zk-saved-line">' + savedLine() + '</span>'
      + '<button type="button" class="btn" data-save="1">Save</button>'
      + '<button type="button" class="btn" data-doc="1">Send a proposal</button>'
      + (outOfArea()
        ? '<button type="button" class="btn primary" data-contract="1" disabled title="' + esc(serviceAreaText()) + '">Write the contract</button>'
        : '<button type="button" class="btn primary" data-contract="1">Write the contract</button>')
      + '</div></div>'
      + '<div class="actions no-print"><button type="button" class="btn quiet" data-new-quote="1">Start a new quote</button></div>';
    return h;
  }

  // ---------- 5 Contract ----------
  // Only what the quote doesn't have, then the payment schedule editor. The
  // contract prints exactly these rows (Kelsey 2026-10-20/21). Presets and
  // wording live in js/schedule.js.
  function today(){ return new Date().toLocaleDateString('en-US'); }
  function ensureContract(){
    var Sc = ZK.Schedule, cfg = state.cfg, c = state.customer;
    var ct = state.contract;
    if(!ct) ct = state.contract = { legalName: c.name, mailing:'', site:'', shipTo: [c.city, c.state].filter(Boolean).join(', '), date: today() };
    var units = parseInt(cfg.units, 10) || 1, def = Sc.defaultPreset(cfg.type, units), s = ct.schedule;
    var fresh = !s || s.type !== cfg.type || !Array.isArray(s.rows);
    // An untouched schedule follows the quote: one unit or several, for example.
    if(!fresh && !s.picked && s.preset !== def && Sc.isPreset(s.rows, s.preset)) fresh = true;
    if(!fresh && s.preset !== 'blank' && Sc.presetsFor(cfg.type, units).indexOf(s.preset) === -1 && Sc.isPreset(s.rows, s.preset)) fresh = true;
    if(fresh) ct.schedule = { type: cfg.type, preset: def, rows: Sc.preset(def) };
    return ct;
  }
  function scheduleUnits(){ return parseInt(state.cfg.units, 10) || 1; }
  function scheduleCtx(r){
    var q = r.quote;
    if(state.cfg.type === 'modular') return { base: r.contract };
    return { base: r.contract, engineering: q.engineering || 0, promoCredit: r.promoCredit || 0, engineeringPaid: !!q.engineeringPaid };
  }
  function builtSchedule(){
    var ct = ensureContract();
    return ZK.Schedule.build({ rows: ct.schedule.rows, units: scheduleUnits() }, scheduleCtx(currentResult()));
  }
  // What the buyer sees on the proposal and the Review step: the contract's own
  // rows and wording (the rep's edited schedule once there is one), so a buyer
  // never sees two schedules (Kelsey 2026-10-21). The design retainer is paid
  // up front outside the contract, so it stays its own line.
  function buyerSchedule(r){
    var Sc = ZK.Schedule, cfg = state.cfg, units = scheduleUnits(), rows;
    if(state.contract && state.contract.schedule && Sc.check(ensureContract().schedule.rows).ok) rows = state.contract.schedule.rows;
    else rows = Sc.preset(Sc.defaultPreset(cfg.type, units));
    var out = (r.schedule || []).filter(function(s){ return s.key === 'design'; });
    Sc.printed(Sc.build({ rows: rows, units: units }, scheduleCtx(r))).forEach(function(b){
      out.push({ key: Sc.stageKey(b), name: b.name, desc: b.when, amount: b.paid ? 0 : b.amount, paid: b.paid });
    });
    return out;
  }
  // What the contract's total will be: kits bill engineering on top of the remainder.
  function contractTotal(r){
    if(state.cfg.type === 'modular') return r.contract;
    return r.contract + (r.quote.engineering || 0) - (r.promoCredit || 0);
  }
  function scheduleTotalHTML(){
    var ct = ensureContract(), chk = ZK.Schedule.check(ct.schedule.rows), r = currentResult();
    if(chk.ok) return '<b>✓ Adds up to 100%.</b> Contract total ' + fmt(contractTotal(r)) + '.';
    var msg = chk.problems.length ? chk.problems[0] : '';
    if(!msg) msg = 'Adds up to <b>' + chk.sum + '%</b>. ' + (chk.off > 0 ? 'Add ' + chk.off + '%' : 'Take ' + (-chk.off) + '% off') + ' before you create the contract.';
    else msg = esc(msg);
    return msg;
  }
  function scheduleRowHTML(b, i, count){
    var r = b.row, kit = state.cfg.type !== 'modular';
    var h = '<div class="srow" data-srow-box="' + i + '">'
      + '<div class="srow-head"><span class="srow-name" data-srow-name="' + i + '">' + esc(b.name) + '</span><span class="srow-amt" data-srow-amt="' + i + '">' + (b.paid ? 'PAID' : fmt(b.amount)) + '</span></div>'
      + '<div class="srow-fields">';
    if(r.fixed) h += '<div class="field srow-pct"><span class="group-label">Amount</span><div class="fixed-note">Engineering (fixed)</div></div>';
    else h += '<div class="field srow-pct"><label for="zk-srow-pct-' + i + '">' + (kit ? '% of the rest' : '% of the total') + '</label>'
      + '<div class="inline"><input type="number" inputmode="decimal" min="0" max="100" step="any" id="zk-srow-pct-' + i + '" data-srow="' + i + '" data-part="pct" value="' + esc(r.pct) + '"><span class="suffix">%</span></div></div>';
    h += '<div class="field srow-title"><label for="zk-srow-title-' + i + '">Name</label><input type="text" id="zk-srow-title-' + i + '" data-srow="' + i + '" data-part="title" value="' + esc(b.title) + '"></div>'
      + '<div class="field full srow-when"><label for="zk-srow-when-' + i + '">When it\'s due (prints on the contract as written)</label><textarea rows="2" id="zk-srow-when-' + i + '" data-srow="' + i + '" data-part="when">' + esc(b.when) + '</textarea></div>'
      + '</div>';
    if(r.fixed) h += '<div class="help">' + (b.skip ? 'There\'s no engineering on this quote, so this row won\'t print on the contract.' : 'Kit contracts bill engineering first, so this row stays.') + '</div>';
    else if(state.ui.confirmRemove === i){
      var clause = ZK.Schedule.CLAUSE_ROLES[r.role];
      h += '<div class="notice warn srow-confirm">Removing this payment also takes ' + esc(clause) + ' off the contract. '
        + '<button type="button" class="btn sm" data-srow-remove-yes="' + i + '">Remove it</button> <button type="button" class="btn quiet sm" data-srow-remove-no="1">Keep it</button></div>';
    } else if(count > 1) h += '<button type="button" class="adjust-link srow-remove" data-srow-remove="' + i + '">Remove this payment</button>';
    return h + '</div>';
  }
  function scheduleEditorHTML(){
    var ct = ensureContract(), Sc = ZK.Schedule, built = builtSchedule(), kit = state.cfg.type !== 'modular';
    var keys = Sc.presetsFor(state.cfg.type, scheduleUnits());
    var h = '<div class="subtle-head first">Payment schedule</div>'
      + '<p class="help">' + (kit
        ? 'Engineering is billed first. The other payments are percents of the rest (the contract total less engineering) and must add up to 100%.'
        : 'Each payment is a percent of the contract total. They must add up to 100%.')
      + ' Change the wording only if the buyer agreed to it.</p>'
      + '<div class="sched-head"><div class="field"><label for="zk-preset">Start from</label><select id="zk-preset" data-preset="1">'
      + keys.map(function(k){ return '<option value="' + k + '"' + (ct.schedule.preset === k ? ' selected' : '') + '>' + esc(Sc.presetLabel(k)) + '</option>'; }).join('')
      + '<option value="blank"' + (ct.schedule.preset === 'blank' ? ' selected' : '') + '>Start blank</option></select></div></div>';
    if(state.ui.presetPending) h += '<div class="notice warn">This replaces the payments below, including your changes. '
      + '<button type="button" class="btn sm" data-preset-yes="1">Replace them</button> <button type="button" class="btn quiet sm" data-preset-no="1">Keep mine</button></div>';
    h += '<div class="sched-rows">' + built.map(function(b, i){ return scheduleRowHTML(b, i, built.length); }).join('') + '</div>'
      + '<div class="btn-row"><button type="button" class="btn" data-srow-add="1">+ Add a payment</button></div>'
      + '<div class="sched-total' + (Sc.check(ct.schedule.rows).ok ? ' ok' : ' bad') + '" id="zk-sched-total" role="status">' + scheduleTotalHTML() + '</div>'
      + '<div class="err" data-err="schedule"></div>';
    return h;
  }
  // Typing in the editor updates names, amounts and the total in place (the
  // field being typed in is never redrawn).
  function patchSchedule(){
    var built = builtSchedule(), chk = ZK.Schedule.check(state.contract.schedule.rows);
    built.forEach(function(b, i){
      var nm = $('[data-srow-name="' + i + '"]'); if(nm) nm.textContent = b.name;
      var am = $('[data-srow-amt="' + i + '"]'); if(am) am.textContent = b.paid ? 'PAID' : fmt(b.amount);
    });
    var t = $('#zk-sched-total'); if(t){ t.innerHTML = scheduleTotalHTML(); t.classList.toggle('bad', !chk.ok); t.classList.toggle('ok', chk.ok); }
    var go = $('[data-create-contract]'); if(go) go.disabled = !chk.ok;
    showErrors('contract');
  }
  function contractField(key, labelText, extra){
    var ct = state.contract, v = ct[key] == null ? '' : ct[key];
    return '<div class="field' + (extra && extra.full ? ' full' : '') + '" data-field="ct-' + key + '"><label for="zk-ct-' + key + '">' + labelText + '</label>'
      + '<input type="text" id="zk-ct-' + key + '" data-ct="' + key + '" value="' + esc(v) + '" autocomplete="off"' + (extra && extra.ph ? ' placeholder="' + esc(extra.ph) + '"' : '') + '>'
      + (extra && extra.help ? '<div class="help">' + extra.help + '</div>' : '') + '<div class="err"></div></div>';
  }
  function renderContract(){
    var r = currentResult(), c = state.customer, ct = ensureContract();
    var h = '<h1 class="step-title">Contract for ' + esc(c.name) + '</h1>'
      + '<p class="step-lead">' + esc(r.quote.model) + (r.quote.units > 1 ? ' × ' + r.quote.units : '') + '. Add what the quote doesn\'t have, then check the payment schedule. The contract prints exactly what\'s here.</p>'
      + loadNotice();
    if(outOfArea()){
      return h + '<div class="notice bad"><b>' + esc(serviceAreaText()) + '</b> A contract can\'t be made for this quote.</div>'
        + '<div class="actions"><button type="button" class="btn quiet" data-goto="review">Back</button></div>';
    }
    if(ct.contract_number) h += '<div class="notice info">This quote\'s contract is <b>' + esc(ct.contract_number) + '</b>. Creating it again updates that contract (until it\'s signed).</div>';
    h += assemblyWarning()
      + '<div class="card"><div class="subtle-head first">Buyer on the contract</div><div class="fields">'
      + contractField('legalName', 'Buyer\'s full legal name', { full:true, help:'Everyone who signs, exactly as on their ID. Example: Pat and Sam Buyer.' })
      + contractField('mailing', 'Mailing address', { full:true, ph:'Street, city, state, ZIP' })
      + contractField('site', 'Building site address', { full:true, ph:'Street, city, state, ZIP, or the parcel number' })
      + contractField('shipTo', 'Ships to (city, state)', {})
      + contractField('date', 'Contract date', {})
      + '</div></div>'
      + '<div class="card" id="zk-schedule-card">' + scheduleEditorHTML() + '</div>'
      + repCard() + '<div class="err" data-err="rep"></div>'
      + '<div class="actions options-bar review-bar"><button type="button" class="btn quiet" data-goto="review">Back</button>'
      + '<div class="right" id="zk-contract-actions"><span id="zk-saved-line">' + savedLine() + '</span>'
      + '<button type="button" class="btn primary" data-create-contract="1"' + (ZK.Schedule.check(ct.schedule.rows).ok ? '' : ' disabled') + ' aria-describedby="zk-sched-total">Create the contract</button>'
      + '</div></div>';
    return h;
  }

  // The figures the Custom Home contract needs (custom, garage, hangar, steel),
  // so it matches the quote to the dollar.
  function contractInputs(r){
    var q = r.quote, cfg = state.cfg, p = product();
    var ship = r.lines.filter(function(l){ return l.key === 'shipping' && l.kind === 'charge'; }).reduce(function(a, l){ return a + (l.amount || 0); }, 0);
    var customs = r.lines.filter(function(l){ return /^custom-/.test(l.key) && l.kind !== 'note'; })
      .map(function(l){ return { desc: l.label, amt: (l.kind === 'credit' ? -1 : 1) * (l.amount || 0) }; });
    var customTotal = customs.reduce(function(a, x){ return a + x.amt; }, 0);
    var miles = Number(cfg.miles) || 0, rate = miles > 0 ? Math.round(ship / miles * 100) / 100 : 0;
    if(ship > 0 && !(miles > 0)){ miles = 1; rate = ship; }
    return { name: q.model, sqft: q.sqft || (p && p.sqft) || '', build: Math.round((r.contract - miles * rate - customTotal) * 100) / 100,
      engineering: q.engineering || 0, miles: miles, rate: rate, design: q.design || 0,
      designPaid: !!q.designPaid, engineeringPaid: !!q.engineeringPaid, customs: customs };
  }

  // Save the quote with its contract details, then open the Send page.
  function createContract(){
    var e = errorsFor('contract');
    if(Object.keys(e).length){
      state.shownErrors.__all = true; showErrors('contract');
      var first = $('.invalid input, .invalid textarea') || $('[data-err="schedule"]:not(:empty)') || $('#zk-rep-card');
      if(first && first.focus) first.focus();
      if(first && first.scrollIntoView) first.scrollIntoView({ block:'center', behavior:'smooth' });
      return;
    }
    if(outOfArea()){ toast(serviceAreaText(), true); return; }
    var r = currentResult(), ct = state.contract;
    ct.amounts = ZK.Schedule.printed(builtSchedule()).map(function(b){ return b.paid ? 'PAID' : Math.round(b.amount); });
    ct.repName = (state.rep && state.rep.name) || '';
    ct.inputs = contractInputs(r);
    $$('#zk-contract-actions .btn').forEach(function(b){ b.disabled = true; });
    var btn = $('[data-create-contract]'); if(btn) btn.textContent = 'Saving…';
    saveNow().then(function(row){
      if(!row){ render(); return; }
      location.href = ZK.config.contractUrl + '?fromQuote=' + encodeURIComponent(row.id) + '&make=1';
    });
  }

  // ---------- document / save / contract ----------
  function toast(msg, bad){
    var t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.setAttribute('role', 'status'); t.textContent = msg;
    app.appendChild(t); setTimeout(function(){ t.remove(); }, bad ? 6000 : 3500);
  }
  function busy(on){ $$('#zk-review-actions .btn').forEach(function(b){ b.disabled = !!on || (b.hasAttribute('data-contract') && outOfArea()); }); }

  // Save (or update) the quote. Resolves to the saved row, or null if it failed.
  function saveNow(){
    var r = currentResult();
    // Promise.resolve().then(): an unexpected error becomes a message, not a stuck screen.
    return Promise.resolve().then(function(){ return root.ZK.Store.save(cat, state, r, buyerSchedule(r).filter(function(s){ return !s.paid; })); }).then(function(row){
      state.saved = { id: row.id, number: row.quote_number, hasInvoices: Array.isArray(row.invoices) && row.invoices.length > 0 };
      var sl = $('#zk-saved-line'); if(sl) sl.innerHTML = savedLine();
      return row;
    }).catch(function(e){
      console.error(e);
      toast('Couldn\'t save: ' + ((e && e.message) || e) + '. Check your connection, then try Save project again.', true);
      return null;
    });
  }

  function docData(){
    var r = currentResult(), t = cat.type(state.cfg.type), p = product();
    return {
      result: r, schedule: buyerSchedule(r), customer: state.customer, rep: state.rep || {},
      brand: cat.brandFor(state.cfg.type), number: state.saved && state.saved.number,
      date: new Date().toLocaleDateString('en-US'), projectName: root.ZK.Store.projectName({ customer: state.customer, result: r }),
      photo: p && p.photo, shipsFrom: t.ships_from
    };
  }

  function openDoc(kind, range){
    if(kind === 'proposal' && outOfArea()){ toast(serviceAreaText(), true); return; }
    // Open the window during the click (pop-up blockers), then fill it.
    var w = window.open('', '_blank');
    if(!w){ toast('Your browser blocked the new window. Allow pop-ups for this site, then try again.', true); return; }
    w.document.write('<!DOCTYPE html><title>Preparing…</title><body style="font-family:sans-serif;color:#6a6459;padding:40px;text-align:center">Preparing your document…</body>'); w.document.close();
    closeDialog(); busy(true);
    saveNow().then(function(){
      var d = docData();
      if(kind === 'ballpark') d.range = range;
      var html = kind === 'ballpark' ? root.ZK.Documents.ballpark(d) : root.ZK.Documents.proposal(d);
      w.document.open(); w.document.write(html); w.document.close();
    }).then(function(){ busy(false); }, function(){ busy(false); });
  }

  function openContract(){
    if(outOfArea()){ toast(serviceAreaText(), true); return; }
    go('contract');
  }

  function docDialog(){
    var r = currentResult(), rg = root.ZK.Documents.suggestedRange(r.quote.total);
    var o = document.createElement('div');
    o.className = 'overlay'; o.id = 'zk-doc-dialog';
    o.innerHTML = '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="zk-doc-title">'
      + '<h2 id="zk-doc-title">Create a document</h2><p>Which one does the buyer need?</p>'
      + (outOfArea()
        ? '<button type="button" class="doc-choice" disabled aria-describedby="zk-doc-area"><b>Proposal</b><span id="zk-doc-area">' + esc(serviceAreaText()) + '</span></button>'
        : '<button type="button" class="doc-choice" data-doc-kind="proposal"><b>Proposal</b><span>The real quote: price, scope and payment schedule.</span></button>')
      + '<button type="button" class="doc-choice" data-doc-kind="ballpark-open"><b>Ballpark estimate</b><span>One page with a price range, for early conversations.</span></button>'
      + '<div id="zk-range-box" hidden><div class="fields">'
      + '<div class="field" data-field="rangeLow"><label for="zk-range-low">Low</label><input type="number" id="zk-range-low" min="0" step="1000" value="' + rg.low + '"><div class="err"></div></div>'
      + '<div class="field" data-field="rangeHigh"><label for="zk-range-high">High</label><input type="number" id="zk-range-high" min="0" step="1000" value="' + rg.high + '"><div class="err"></div></div>'
      + '</div><p class="help">Suggested: the quote total ±10%, rounded.</p><div class="btn-row"><button type="button" class="btn primary" data-doc-kind="ballpark">Create ballpark estimate</button></div></div>'
      + '<div class="btn-row"><button type="button" class="btn quiet" data-doc-cancel="1">Cancel</button></div></div>';
    app.appendChild(o);
    o.querySelector('.doc-choice[data-doc-kind]').focus();
  }
  function closeDialog(){ var d = $('#zk-doc-dialog'); if(d) d.remove(); }

  // ---------- render ----------
  function render(){
    renderSteps();
    renderBrand();
    var html = { customer: renderCustomer, product: renderProduct, options: renderOptions, review: renderReview, contract: renderContract }[state.step]();
    $('#zk-main').innerHTML = html;
    showErrors(state.step);
  }
  function refreshLive(){
    // Re-price and update the form in place. Never rebuilds the form, so a
    // click or keystroke in progress is never lost.
    var r = currentResult();
    var s = $('#zk-summary'); if(s) s.innerHTML = summaryHTML(r);
    var bt = $('#zk-bar-total'); if(bt) bt.innerHTML = r ? 'Total <b>' + fmt(r.total) + '</b>' : '';
    var aw = $('#zk-assembly-warning'); if(aw) aw.innerHTML = assemblyWarningHTML();
    var f = $('#zk-options-form'); if(f && state.cfg) O.patchOptions(optionCtx(), f);
    showErrors(state.step);
  }
  function refreshForm(){
    var f = $('#zk-options-form'); if(!f) return refreshLive();
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
          var first = $('.invalid input, .invalid select, .invalid textarea') || $('#zk-product-error:not([hidden])');
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
    scrollToTop();
    var h = $('.step-title'); if(h){ h.setAttribute('tabindex', '-1'); h.focus({ preventScroll:true }); }
  }

  function chooseProduct(id){
    var p = cat.product(id);
    if(!state.cfg || state.cfg.productId !== id){
      // Keep what the rep already chose where it still applies.
      var old = state.cfg, cfg = defaultCfg(p.type, id);
      if(old && old.type === p.type){
        ['units','miles','snow','assembly','assemblyOverride','assemblyOverrideReason','discountPct','dryin','designPaid','engineeringPaid','mirroredEngineering','promo','customLines','garageUse'].forEach(function(k){ if(old[k] !== undefined) cfg[k] = old[k]; });
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
    if(el.hasAttribute('data-ct')){ state.contract[el.getAttribute('data-ct')] = el.value; showErrors('contract'); return; }
    if(el.hasAttribute('data-srow')){
      var row = state.contract.schedule.rows[+el.getAttribute('data-srow')], part = el.getAttribute('data-part');
      if(part === 'pct') row.pct = el.value === '' ? '' : parseFloat(el.value);
      else if(part === 'title'){ row.title = el.value; row.short = ''; }
      else row.when = el.value;
      patchSchedule(); return;
    }
    if(el.id === 'zk-search'){ state.search = el.value; $('#zk-grid').innerHTML = productCards(); return; }
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
    if(el.hasAttribute('data-ct')){ state.contract[el.getAttribute('data-ct')] = el.value; state.shownErrors['ct-' + el.getAttribute('data-ct')] = true; showErrors('contract'); return; }
    if(el.hasAttribute('data-srow')){ state.shownErrors.schedule = true; patchSchedule(); return; }
    if(el.hasAttribute('data-preset')){
      var Sc = ZK.Schedule, s = state.contract.schedule;
      if(Sc.isPreset(s.rows, s.preset)) applyPreset(el.value);
      else { state.ui.presetPending = el.value; refreshSchedule(); }
      return;
    }
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
    // Review actions
    if(t.hasAttribute('data-doc')) return docDialog();
    if(t.hasAttribute('data-doc-cancel')) return closeDialog();
    if(t.hasAttribute('data-doc-kind')){
      var kind = t.getAttribute('data-doc-kind');
      if(kind === 'proposal') return openDoc('proposal');
      if(kind === 'ballpark-open'){ $('#zk-range-box').hidden = false; $('#zk-range-low').focus(); return; }
      var lo = parseFloat($('#zk-range-low').value), hi = parseFloat($('#zk-range-high').value), bad = false;
      [['rangeLow', lo], ['rangeHigh', hi]].forEach(function(x){
        var f = $('[data-field="' + x[0] + '"]'), ok = x[1] >= 0;
        f.classList.toggle('invalid', !ok); $('.err', f).textContent = ok ? '' : 'Enter a dollar amount.'; if(!ok) bad = true;
      });
      if(!bad && lo > hi){ var fh = $('[data-field="rangeHigh"]'); fh.classList.add('invalid'); $('.err', fh).textContent = 'High must be at least the low number.'; bad = true; }
      if(!bad) openDoc('ballpark', { low: lo, high: hi });
      return;
    }
    if(t.hasAttribute('data-save')){
      busy(true);
      return saveNow().then(function(row){ busy(false); if(row) toast('Saved as ' + row.quote_number + '.'); });
    }
    if(t.hasAttribute('data-contract')) return openContract();
    if(t.hasAttribute('data-create-contract')) return createContract();
    if(t.hasAttribute('data-preset-yes')){ var k = state.ui.presetPending; state.ui.presetPending = null; applyPreset(k); return; }
    if(t.hasAttribute('data-preset-no')){ state.ui.presetPending = null; refreshSchedule(); return; }
    if(t.hasAttribute('data-srow-add')){
      // A new payment goes before the final payment, so the final stays last.
      var rows = state.contract.schedule.rows, at = rows.length;
      for(var fi = 0; fi < rows.length; fi++) if(rows[fi].role === 'final') at = fi;
      rows.splice(at, 0, ZK.Schedule.blankRow()); state.ui.confirmRemove = null; refreshSchedule();
      var ti = $('#zk-srow-pct-' + at); if(ti) ti.focus();
      return;
    }
    if(t.hasAttribute('data-srow-remove')){
      var ri = +t.getAttribute('data-srow-remove'), rrow = state.contract.schedule.rows[ri];
      if(ZK.Schedule.CLAUSE_ROLES[rrow.role]){ state.ui.confirmRemove = ri; refreshSchedule(); return; }
      state.contract.schedule.rows.splice(ri, 1); refreshSchedule(); return;
    }
    if(t.hasAttribute('data-srow-remove-yes')){ state.contract.schedule.rows.splice(+t.getAttribute('data-srow-remove-yes'), 1); state.ui.confirmRemove = null; refreshSchedule(); return; }
    if(t.hasAttribute('data-srow-remove-no')){ state.ui.confirmRemove = null; refreshSchedule(); return; }
    if(t.hasAttribute('data-new-quote')) return newQuote();
    if(t.hasAttribute('data-rep-edit')){ state.ui.editRep = true; render(); return; }
    if(t.hasAttribute('data-rep-save')){
      var nm = $('#zk-rep-name').value.trim(), ph = $('#zk-rep-phone').value.trim(), errs = false;
      var fn = $('[data-field="repName"]'), fp = $('[data-field="repPhone"]');
      fn.classList.toggle('invalid', !nm); $('.err', fn).textContent = nm ? '' : 'Add your name.';
      var phOk = ph.replace(/\D/g, '').length >= 10;
      fp.classList.toggle('invalid', !phOk); $('.err', fp).textContent = phOk ? '' : 'Add your phone with area code.';
      if(!nm || !phOk) return;
      state.rep = { name: nm, phone: ph, email: (state.user && state.user.email) || '' };
      state.ui.editRep = false;
      root.ZK.Store.saveProfile(state.user, nm, ph).then(function(){ toast('Saved. Your details will be on every document.'); },
        function(){ toast('Your details are on this quote, but couldn\'t be saved to your profile. Tell Kelsey.', true); });
      render(); return;
    }
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
      var tx = document.getElementById('zk-tip-' + t.getAttribute('data-tip')); var open = tx.hidden; tx.hidden = !open; t.setAttribute('aria-expanded', open ? 'true' : 'false'); return;
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
  function applyPreset(key){
    var s = state.contract.schedule;
    s.preset = key; s.picked = true;
    s.rows = key === 'blank'
      ? (state.cfg.type === 'modular' ? [] : ZK.Schedule.preset(ZK.Schedule.defaultPreset(state.cfg.type, scheduleUnits())).slice(0, 1)).concat([ZK.Schedule.blankRow()])
      : ZK.Schedule.preset(key);
    state.ui.confirmRemove = null;
    refreshSchedule();
  }
  function refreshSchedule(){
    var card = $('#zk-schedule-card'); if(!card) return;
    card.innerHTML = scheduleEditorHTML();
    patchSchedule();
  }
  function onToggle(ev){ if(ev.target.matches && ev.target.matches('[data-more]')) state.ui.moreOpen = ev.target.open; }
  function onKey(ev){ if(ev.key === 'Escape' && $('#zk-doc-dialog')) closeDialog(); }

  // Back to the top of the tool (the top of the page when it's the whole page).
  function scrollToTop(){
    var top = app.getBoundingClientRect().top + (window.pageYOffset || 0);
    if((window.pageYOffset || 0) > top) window.scrollTo(0, Math.max(0, top - 8));
  }

  // ---------- sign-in gate ----------
  function signInGate(){
    return new Promise(function(resolve){
      if(!root.ZK.config.requireAuth || !root.ZK.auth) return resolve(null);
      root.ZK.auth.getCurrentUser().then(function(user){
        if(user) return resolve(user);
        var o = $('#zk-signin'); o.hidden = false;
        $('#zk-signin-form').addEventListener('submit', function(e){
          e.preventDefault();
          var err = $('#zk-signin-err'), btn = $('#zk-signin-btn');
          err.hidden = true; btn.disabled = true; btn.textContent = 'Signing in…';
          root.ZK.auth.signIn($('#zk-signin-email').value.trim(), $('#zk-signin-password').value)
            .then(function(){ return root.ZK.auth.getCurrentUser(); })
            .then(function(u){ o.hidden = true; resolve(u); })
            .catch(function(x){ err.textContent = (x && x.message) || 'Sign in failed.'; err.hidden = false; })
            .then(function(){ btn.disabled = false; btn.textContent = 'Sign in'; });
        });
      }).catch(function(){ resolve(null); });
    });
  }

  // The tool's frame: header, step bar, page and the sign-in box. Drawn into
  // the mount element so a host page only needs <div data-zk-app="quote">.
  function shellHTML(){
    var portal = ZK.config.portalUrl;
    return '<header class="topbar"><div class="topbar-inner">'
      + '<a class="brand-badge"' + (portal ? ' href="' + esc(portal) + '" title="Back to the Sales Portal"' : '') + '>'
      + '<img id="zk-brand-logo" src="' + esc(ZK.url('images/zk-logo.png')) + '" alt="Zip Kit Homes">'
      + '<span class="brand-name" id="zk-brand-name">Quoting as Zip Kit Homes</span></a>'
      + '<ol class="steps" id="zk-steps" aria-label="Quote steps"></ol>'
      + '<div class="topbar-right"><span id="zk-user-email"></span>' + (portal ? '<a class="link-btn" href="' + esc(portal) + '">Portal</a>' : '') + '</div>'
      + '</div></header>'
      + '<main class="page" id="zk-main"><div class="empty">Loading the price list…</div></main>'
      + '<div class="overlay" id="zk-signin" hidden><form class="dialog signin" id="zk-signin-form">'
      + '<h2>Sign in</h2><p>Use your Zip Kit sales account.</p>'
      + '<div class="field"><label for="zk-signin-email">Email</label><input type="email" id="zk-signin-email" autocomplete="email" required></div>'
      + '<div class="field"><label for="zk-signin-password">Password</label><input type="password" id="zk-signin-password" autocomplete="current-password" required></div>'
      + '<div class="notice bad" id="zk-signin-err" hidden></div>'
      + '<button type="submit" class="btn primary" id="zk-signin-btn">Sign in</button>'
      + '<p class="help">Need an account? Ask Kelsey or Sven.</p></form></div>';
  }

  function init(){
    app = document.querySelector(ZK.config.mount);
    if(!app) return;
    app.classList.add('zk-tool');
    app.innerHTML = shellHTML();
    root.ZK.Catalog.load(ZK.config.catalogUrl, ZK.config.catalogHeaders).then(function(c){
      cat = c;
      state.type = cat.activeTypes(ENABLED_TYPES)[0];
      var main = $('#zk-main');
      main.addEventListener('input', onInput);
      main.addEventListener('change', onChange);
      main.addEventListener('toggle', onToggle, true);
      app.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey);
      render();
      return signInGate();
    }).then(function(user){
      state.user = user;
      if(user && user.email) $('#zk-user-email').textContent = user.email;
      return root.ZK.Store.loadProfile(user).then(function(rep){
        state.rep = rep;
        var openId = new URLSearchParams(location.search).get('open');
        if(openId) return openSaved(openId);
        if(state.step === 'review') render();
      });
    }).catch(function(e){
      $('#zk-main').innerHTML = '<div class="notice bad"><b>The quote tool couldn\'t load its price list.</b> Check your connection and reload the page. If it keeps happening, tell the office.</div>';
      console.error(e);
    });
  }

  // ---------- opening a saved quote (?open=<id>) ----------
  function loadNotice(){
    var n = state.ui.loadNote;
    if(!n) return '';
    return '<div class="notice ' + (n.bad ? 'warn' : 'info') + '">' + n.html + '</div>';
  }

  function openSaved(id){
    if(!root.ZK.quotes) return Promise.resolve();
    return root.ZK.quotes.get(id).then(function(row){
      if(!row) throw new Error('not found');
      var kind = row.product_kind || '';
      if(kind.indexOf('contract-') === 0){ location.replace(ZK.config.contractUrl + '?open=' + encodeURIComponent(id)); return; }
      // MVP is parked: its quotes open in the old tool, kept at legacy/mvp-quote.html.
      if(row.brand === 'mvp'){ location.replace(ZK.config.legacyMvpUrl + '?open=' + encodeURIComponent(id)); return; }
      var cfg = row.config || {}, loaded, notes = [];
      if(cfg.schema_version >= 2 && cfg.quote){
        loaded = { customer: cfg.quote.customer, cfg: cfg.quote.cfg };
      } else {
        loaded = root.ZK.Legacy.fromLegacy(cat, row);
        if(loaded.error === 'parked'){ location.replace(ZK.config.legacyMvpUrl + '?open=' + encodeURIComponent(id)); return; }
        if(loaded.error) throw new Error(loaded.error);
        notes = loaded.notes || [];
        notes.unshift('Saved by the old quote tool.');
      }
      state.customer = Object.assign({ name:'', project:'', city:'', state:'', email:'', phone:'' }, loaded.customer);
      state.cfg = loaded.cfg;
      state.contract = cfg.contract ? JSON.parse(JSON.stringify(cfg.contract)) : null;
      if(state.contract && state.contract.schedule) state.contract.schedule.picked = true;
      state.type = state.cfg.type;
      state.saved = { id: row.id, number: row.quote_number, hasInvoices: Array.isArray(row.invoices) && row.invoices.length > 0,
        readOnly: !!(state.user && row.created_by && row.created_by !== state.user.id) };
      if(state.saved.hasInvoices) notes.push('This quote already has invoices, so saving makes a new copy. The original keeps its payment schedule.');
      if(state.saved.readOnly) notes.push('This is another rep\'s quote. Saving makes your own copy.');
      // Your copy gets its own contract; it never updates the other rep's.
      if(state.saved.readOnly && state.contract){ delete state.contract.contract_id; delete state.contract.contract_number; }
      // Same price as when it was saved? Never change a price without saying so.
      var r = currentResult(), saved = Number(row.total);
      var bad = false;
      if(r && isFinite(saved) && Math.round(r.total) !== Math.round(saved)){
        bad = true;
        notes.unshift('<b>Price check:</b> it was saved at ' + fmt(saved) + '; with today\'s price list it comes to ' + fmt(r.total)
          + ' (' + (r.total > saved ? '+' : '−') + fmt(Math.abs(r.total - saved)) + '). Check the options before you send it.');
      }
      state.ui.loadNote = { bad: bad, html: '<b>Opened ' + esc(row.quote_number || 'saved quote') + '.</b> ' + notes.join(' ') };
      var wantContract = new URLSearchParams(location.search).get('step') === 'contract';
      if(!state.customer.state){ notes.push('Add the state it will be built in before you send anything.'); wantContract = false; }
      state.reached = stepIndex(wantContract ? 'contract' : 'review');
      state.step = wantContract ? 'contract' : 'review';
      render();
    }).catch(function(e){
      console.error(e);
      state.ui.loadNote = { bad: true, html: '<b>That saved quote couldn\'t be opened.</b> ' + esc((e && e.message) || '') + ' Start a new one, or ask the office.' };
      render();
    });
  }

  // Clear everything and start over at the Customer step.
  function newQuote(){
    state.step = 'customer'; state.reached = 0;
    state.customer = { name:'', project:'', city:'', state:'', email:'', phone:'' };
    state.type = cat.activeTypes(ENABLED_TYPES)[0]; state.search = '';
    state.cfg = null; state.contract = null; state.ui = { moreOpen:false, adjustOpen:false }; state.shownErrors = {};
    state.saved = null; state.ui.loadNote = null;
    render(); scrollToTop();
  }

  (root.ZK = root.ZK || {}).Flow = {
    state: state,
    go: go,
    newQuote: newQuote,
    catalog: function(){ return cat; },
    openSaved: openSaved,
    result: currentResult,
    // What the proposal is built from (tests compare it with the contract).
    docData: docData,
    enabledTypes: ENABLED_TYPES,
    // Test helper: hide the sign-in screen on a local test server only.
    _unlockForTests: function(){ if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)){ $('#zk-signin').hidden = true; } }
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
