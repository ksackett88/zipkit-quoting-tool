/* "Quote your own project": the customer quoter.
   Loads ONLY data/catalog-public.json (model names, sizes, photos, starting
   prices, where things are sold). It never sees the full price list, never
   takes payments, and shows a starting price, never a contract number.
   Steps: state → model → a few choices (estimate) → contact details (lead) → breakdown. */
(function(root){
  'use strict';
  var ZK = root.ZK = root.ZK || {};
  var C = ZK.config || {};

  var STATES = [['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']];
  var TIMELINES = ['As soon as I can', 'In the next 6 months', '6 to 12 months from now', 'More than a year out', 'Just looking for now'];
  var STEPS = ['where', 'pick', 'choose', 'contact', 'done'];

  var cat = null, app = null;
  var state = { step: 'where', st: '', type: '', productId: '', homes: 1, snow: 'standard', assembly: 'diy',
    contact: { name: '', email: '', phone: '', timeline: '' }, sent: false, shownAt: 0, errors: {} };

  function $(sel){ return app.querySelector(sel); }
  function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
  function money(n){ return '$' + Math.round(n).toLocaleString('en-US'); }
  function stateName(code){ for(var i = 0; i < STATES.length; i++) if(STATES[i][0] === code) return STATES[i][1]; return code; }
  function store(k, v){ try { if(v === undefined) return root.localStorage.getItem(k); root.localStorage.setItem(k, v); } catch(e){ return null; } }

  // ---------- what's sold where ----------
  function sold(line, st){
    var a = cat.availability[line];
    return a === 'all' || (Array.isArray(a) && a.indexOf(st) !== -1);
  }
  function typesFor(st){ return cat.types.filter(function(t){ return sold(t.line, st); }); }
  function type(){ return cat.types.filter(function(t){ return t.id === state.type; })[0] || null; }
  function product(){ return cat.products.filter(function(p){ return p.id === state.productId; })[0] || null; }
  function assemblyHere(){ var t = type(); return !!(t && t.ask_assembly && sold('assembly', state.st)); }

  function estimate(){
    var p = product(), t = type();
    if(!p || !t) return null;
    var count = t.ask_homes ? state.homes : 1;
    return { each: p.start_price, count: count, start: p.start_price * count };
  }
  function unitWord(t, n){
    var w = { home: 'home', garage: 'garage', hangar: 'hangar' }[t.per] || 'home';
    return n === 1 ? w : w + 's';
  }

  // ---------- rendering ----------
  function header(){
    var i = STEPS.indexOf(state.step), n = 4;
    var shown = Math.min(i + 1, n);
    return '<div class="zp-top"><img class="zp-logo" src="' + esc(ZK.url('images/zk-logo.png')) + '" alt="Zip Kit Homes">'
      + (state.step !== 'done' ? '<span class="zp-progress" aria-label="Step ' + shown + ' of ' + n + '">Step ' + shown + ' of ' + n + '</span>' : '') + '</div>';
  }

  function renderWhere(){
    var opts = STATES.map(function(s){ return '<option value="' + s[0] + '"' + (state.st === s[0] ? ' selected' : '') + '>' + esc(s[1]) + '</option>'; }).join('');
    return '<h1 class="zp-title" tabindex="-1">Where are you building?</h1>'
      + '<p class="zp-lead">Pick your state and we\'ll show you what we can build there.</p>'
      + '<div class="zp-field' + (state.errors.st ? ' invalid' : '') + '"><label for="zp-state">State</label>'
      + '<select id="zp-state" data-zp="st"><option value="">Choose your state</option>' + opts + '</select>'
      + '<div class="zp-err">' + esc(state.errors.st || '') + '</div></div>'
      + '<div class="zp-actions"><button type="button" class="zp-btn primary" data-go="pick">Show me what I can build</button></div>';
  }

  function renderPick(){
    var types = typesFor(state.st);
    if(!state.type || !types.some(function(t){ return t.id === state.type; })) state.type = types.length ? types[0].id : '';
    var t = type(), name = stateName(state.st);
    var h = '<h1 class="zp-title" tabindex="-1">What would you like to build?</h1>'
      + '<p class="zp-lead">Here\'s what we offer in ' + esc(name) + '. <button type="button" class="zp-link" data-go="where">Change state</button></p>';
    h += '<p class="zp-note">' + (sold('assembly', state.st)
      ? 'In ' + esc(name) + ', our crew can put your home kit together, or you can build it yourself.'
      : 'In ' + esc(name) + ', you or your own crew put it together. We send the plans and instructions.') + '</p>';
    if(types.length > 1){
      h += '<div class="zp-tabs" role="tablist">' + types.map(function(x){
        return '<button type="button" role="tab" class="zp-tab' + (x.id === state.type ? ' on' : '') + '" aria-selected="' + (x.id === state.type) + '" data-type="' + x.id + '">' + esc(x.label) + '</button>';
      }).join('') + '</div>';
    }
    if(t && t.lead_only){
      h += '<div class="zp-card zp-steel"><h2>' + esc(t.label) + '</h2>'
        + '<p>Every steel kit is priced for its project. Tell us what you have in mind and we\'ll put your price together.</p>'
        + '<button type="button" class="zp-btn primary" data-go="contact">Tell us about your project</button></div>';
    } else if(t){
      var list = cat.products.filter(function(p){ return p.type === t.id; });
      if(t.id === 'shell') list = list.slice().sort(function(a, b){ return (a.sqft || 0) - (b.sqft || 0); });
      h += '<div class="zp-grid">' + list.map(function(p){
        return '<button type="button" class="zp-model' + (p.id === state.productId ? ' on' : '') + '" data-product="' + esc(p.id) + '">'
          + '<span class="zp-ph">' + (p.photo ? '<img src="' + esc(ZK.url(p.photo)) + '" alt="" loading="lazy">' : '') + '</span>'
          + '<span class="zp-mb"><span class="zp-mname">' + esc(p.name) + (p.tag ? ' <span class="zp-tag">' + esc(p.tag) + '</span>' : '') + '</span>'
          + '<span class="zp-msize">' + esc(p.size || '') + '</span>'
          + '<span class="zp-mprice">Starting at ' + money(p.start_price) + '</span></span></button>';
      }).join('') + '</div>';
    }
    return h;
  }

  function tiles(name, items, current){
    return '<div class="zp-tiles" role="radiogroup">' + items.map(function(it){
      return '<label class="zp-tile' + (it.id === current ? ' on' : '') + '"><input type="radio" name="zp-' + name + '" value="' + esc(it.id) + '" data-zp="' + name + '"' + (it.id === current ? ' checked' : '') + '>'
        + '<span class="zp-tt">' + esc(it.label) + '</span>' + (it.help ? '<span class="zp-th">' + esc(it.help) + '</span>' : '') + '</label>';
    }).join('') + '</div>';
  }

  function estimateLines(t, e){
    var lines = [];
    if(t.design_from) lines.push('Design starts at ' + money(t.design_from) + '.');
    if(t.ask_snow && state.snow !== 'standard') lines.push('Your snow load adds to the price. We\'ll include it in your quote.');
    if(assemblyHere() && state.assembly === 'crew') lines.push('Assembly by our crew is quoted separately.');
    lines.push('Shipping is quoted to your build site.');
    lines.push('Final pricing is set after design.');
    return lines;
  }

  function renderChoose(){
    var p = product(), t = type();
    if(!p || !t){ state.step = 'pick'; return renderPick(); }
    var e = estimate();
    var h = '<h1 class="zp-title" tabindex="-1">' + esc(p.name) + '</h1>'
      + '<p class="zp-lead">' + esc(p.size || '') + ' · ' + esc(t.label) + ' · ' + esc(stateName(state.st)) + ' <button type="button" class="zp-link" data-go="pick">Pick a different model</button></p>'
      + '<div class="zp-split"><div class="zp-card">'
      + (p.photo ? '<img class="zp-hero" src="' + esc(ZK.url(p.photo)) + '" alt="' + esc(p.name) + '">' : '');
    var asked = 0;
    if(t.ask_homes){
      asked++;
      h += '<div class="zp-q"><div class="zp-ql" id="zp-homes-l">How many homes?</div>'
        + '<div class="zp-stepper" role="group" aria-labelledby="zp-homes-l"><button type="button" data-homes="-1" aria-label="One fewer">−</button>'
        + '<input type="number" id="zp-homes" data-zp="homes" min="1" max="' + cat.max_homes + '" value="' + state.homes + '" aria-labelledby="zp-homes-l">'
        + '<button type="button" data-homes="1" aria-label="One more">+</button></div></div>';
    }
    if(t.ask_snow){
      asked++;
      h += '<div class="zp-q"><div class="zp-ql">How much snow do you get?</div>' + tiles('snow', cat.snow_choices, state.snow)
        + '<p class="zp-help">Not sure? Your local building department can tell you the snow load where you\'re building.</p></div>';
    }
    if(assemblyHere()){
      asked++;
      h += '<div class="zp-q"><div class="zp-ql">Who will put it together?</div>'
        + tiles('assembly', [{ id: 'crew', label: 'Our crew', help: 'Quoted separately.' }, { id: 'diy', label: 'Me or my own crew', help: 'We send the plans and instructions.' }], state.assembly) + '</div>';
    }
    if(!asked) h += '<p class="zp-help">No choices to make for this one. Your estimate is on the right.</p>';
    h += '</div><aside class="zp-card zp-est" id="zp-est" aria-live="polite">' + estimateHTML(t, e) + '</aside></div>';
    // Phones: the number and the next step stay on screen while choosing.
    h += '<div class="zp-bar">' + barHTML(e) + '</div>';
    return h;
  }

  function estimateHTML(t, e){
    return '<div class="zp-est-k">Your estimate</div>'
      + '<div class="zp-est-v">Starting at ' + money(e.start) + '</div>'
      + '<div class="zp-est-s">' + (e.count > 1 ? e.count + ' ' + unitWord(t, e.count) + ' at ' + money(e.each) + ' each' : 'for one ' + unitWord(t, 1)) + '</div>'
      + '<ul class="zp-est-l">' + estimateLines(t, e).map(function(l){ return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>'
      + '<button type="button" class="zp-btn primary wide" data-go="contact">See the full breakdown</button>'
      + '<p class="zp-help">We\'ll ask how to reach you, then show the breakdown and a PDF you can keep.</p>';
  }

  function barHTML(e){
    return '<span class="zp-bar-v">Starting at <b>' + money(e.start) + '</b></span><button type="button" class="zp-btn primary" data-go="contact">Next</button>';
  }

  function field(key, label, typeAttr, ac){
    return '<div class="zp-field' + (state.errors[key] ? ' invalid' : '') + '"><label for="zp-' + key + '">' + label + '</label>'
      + '<input type="' + typeAttr + '" id="zp-' + key + '" data-zc="' + key + '" value="' + esc(state.contact[key]) + '" autocomplete="' + ac + '">'
      + '<div class="zp-err">' + esc(state.errors[key] || '') + '</div></div>';
  }

  function renderContact(){
    var t = type(), steelOnly = t && t.lead_only;
    state.shownAt = state.shownAt || Date.now();
    var h = '<h1 class="zp-title" tabindex="-1">' + (steelOnly ? 'Tell us how to reach you' : 'Where should we send it?') + '</h1>'
      + '<p class="zp-lead">' + (steelOnly
        ? 'A real person from our team will get back to you with pricing for your steel kit.'
        : 'Tell us how to reach you and we\'ll show your full breakdown right away. A real person from our team will follow up.') + '</p>'
      + '<form class="zp-card zp-form" id="zp-form" novalidate>'
      + field('name', 'Your name', 'text', 'name')
      + field('email', 'Email', 'email', 'email')
      + field('phone', 'Phone', 'tel', 'tel')
      + '<div class="zp-field' + (state.errors.timeline ? ' invalid' : '') + '"><label for="zp-timeline">When are you hoping to build?</label><select id="zp-timeline" data-zc="timeline"><option value="">Choose one</option>'
      + TIMELINES.map(function(x){ return '<option' + (state.contact.timeline === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select><div class="zp-err">' + esc(state.errors.timeline || '') + '</div></div>'
      // Spam trap: people never see this field; bots fill it in.
      + '<div class="zp-hp" aria-hidden="true"><label for="zp-website">Website</label><input type="text" id="zp-website" name="website" tabindex="-1" autocomplete="off"></div>'
      + '<div class="zp-err zp-form-err" id="zp-form-err">' + esc(state.errors.form || '') + '</div>'
      + '<button type="submit" class="zp-btn primary wide" id="zp-send">' + (steelOnly ? 'Send' : 'Show my breakdown') + '</button>'
      + '<p class="zp-help">We only use this to help with your project.</p>'
      + '</form>'
      + '<div class="zp-actions"><button type="button" class="zp-link" data-go="' + (steelOnly ? 'pick' : 'choose') + '">Back</button></div>';
    return h;
  }

  function breakdownRows(){
    var p = product(), t = type(), e = estimate(), rows = [];
    rows.push([p.name + ' (' + (p.size || t.label) + ')', e.count > 1 ? e.count + ' ' + unitWord(t, e.count) + ' × ' + money(e.each) : money(e.each)]);
    if(t.ask_snow){
      var s = cat.snow_choices.filter(function(x){ return x.id === state.snow; })[0];
      rows.push(['Snow load: ' + s.label.toLowerCase(), state.snow === 'standard' ? 'Included' : 'Priced in your quote']);
    }
    if(assemblyHere()) rows.push([state.assembly === 'crew' ? 'Assembly by our crew' : 'You or your own crew build it', state.assembly === 'crew' ? 'Quoted separately' : 'Plans and instructions included']);
    if(t.design_from) rows.push(['Design', 'Starts at ' + money(t.design_from)]);
    rows.push(['Shipping to your build site', 'Quoted separately']);
    return rows;
  }
  function scopeNote(){
    return state.type === 'modular'
      ? 'A complete modular home arrives finished inside. Site prep, foundation, setting it on site and utility hookups are not included.'
      : 'Kits are the shell only. Foundation, siding and roofing, insulation, plumbing, electrical and interior finishes are not included.';
  }
  var FINE = ['This is an estimate, not a quote. Final pricing is set after design.',
    'Pricing is based on your build site address. Sales tax is not included.',
    'Permits, zoning and what you can build on your land: your local building department can tell you.'];

  function renderDone(){
    var t = type();
    if(t && t.lead_only){
      return '<h1 class="zp-title" tabindex="-1">Thanks, ' + esc(state.contact.name.split(' ')[0]) + '!</h1>'
        + '<p class="zp-lead">We got your details. Someone from our team will reach out about your steel kit.</p>'
        + '<div class="zp-actions"><button type="button" class="zp-btn" data-restart="1">Start over</button></div>';
    }
    var e = estimate();
    return '<h1 class="zp-title" tabindex="-1">Here\'s your breakdown</h1>'
      + '<p class="zp-lead">Thanks, ' + esc(state.contact.name.split(' ')[0]) + '. Someone from our team will reach out to talk it through.</p>'
      + '<div class="zp-card"><table class="zp-table"><tbody>' + breakdownRows().map(function(r){ return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('')
      + '<tr class="zp-total"><td>Starting at</td><td>' + money(e.start) + '</td></tr></tbody></table>'
      + '<p class="zp-help">' + esc(scopeNote()) + '</p>'
      + '<ul class="zp-fine">' + FINE.map(function(f){ return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>'
      + '<div class="zp-actions"><button type="button" class="zp-btn primary" data-pdf="1">Save as PDF</button><button type="button" class="zp-btn" data-restart="1">Start over</button></div>';
  }

  function render(focus){
    var body = { where: renderWhere, pick: renderPick, choose: renderChoose, contact: renderContact, done: renderDone }[state.step]();
    app.innerHTML = '<div class="zp-wrap">' + header() + '<main class="zp-main">' + body + '</main></div>';
    if(focus){
      var h = $('.zp-title'); if(h) h.focus({ preventScroll: true });
      var top = app.getBoundingClientRect().top + (root.pageYOffset || 0);
      if((root.pageYOffset || 0) > top) root.scrollTo(0, Math.max(0, top - 8));
    }
  }
  function refreshEstimate(){
    var a = $('.zp-est'); if(a) a.innerHTML = estimateHTML(type(), estimate());
    var b = $('.zp-bar'); if(b) b.innerHTML = barHTML(estimate());
    Array.prototype.forEach.call(app.querySelectorAll('.zp-tile'), function(l){ l.classList.toggle('on', l.querySelector('input').checked); });
  }

  // ---------- moving between steps ----------
  function go(step){
    state.errors = {};
    if(step === 'pick' && !state.st){ state.errors.st = 'Pick the state you\'re building in.'; render(); var s = $('#zp-state'); if(s) s.focus(); return; }
    if(step === 'pick') store('zkPublicState', state.st);
    if(step === 'contact' && !state.shownAt) state.shownAt = Date.now();
    state.step = step;
    render(true);
  }

  function validate(){
    var c = state.contact, e = {};
    if(!c.name.trim()) e.name = 'Add your name.';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) e.email = 'Add an email we can reach you at.';
    if(c.phone.replace(/\D/g, '').length < 10) e.phone = 'Add your phone number with area code.';
    if(!c.timeline) e.timeline = 'Pick one. "Just looking for now" is fine.';
    return e;
  }

  // At most 3 sends per hour from one browser (the server has its own limit).
  function tooMany(){
    var now = Date.now(), list = [];
    try { list = JSON.parse(store('zkPublicSends') || '[]').filter(function(t){ return now - t < 3600e3; }); } catch(x){}
    return list.length >= 3 ? true : (store('zkPublicSends', JSON.stringify(list.concat(now))), false);
  }

  function leadPayload(){
    var p = product(), t = type(), e = estimate();
    return {
      name: state.contact.name.trim(), email: state.contact.email.trim(), phone: state.contact.phone.trim(), timeline: state.contact.timeline,
      state: state.st, product_type: t ? t.id : '', product_id: p ? p.id : '', product_name: p ? p.name : (t ? t.label : ''),
      homes: e ? e.count : null, snow: t && t.ask_snow ? state.snow : null, assembly: assemblyHere() ? state.assembly : null,
      estimate_start: e ? e.start : null, page: root.location.href.split('#')[0],
      website: ($('#zp-website') || {}).value || '', elapsed_ms: Date.now() - (state.shownAt || Date.now())
    };
  }

  function send(){
    var errs = validate();
    if(Object.keys(errs).length){ state.errors = errs; render(); var f = app.querySelector('.invalid input, .invalid select'); if(f) f.focus(); return; }
    var data = leadPayload(), btn = $('#zp-send');
    // Spam trap or a form filled in under 3 seconds: act as if it worked, send nothing.
    if(data.website || data.elapsed_ms < 3000){ state.step = 'done'; render(true); return; }
    if(tooMany()){ state.errors = { form: 'You\'ve sent a few already. Give us a call at ' + cat.brand.phone + ' instead.' }; render(); return; }
    if(!C.leadUrl){ state.errors = { form: 'This form isn\'t connected yet. Please call us at ' + cat.brand.phone + '.' }; render(); return; }
    btn.disabled = true; btn.textContent = 'Sending…';
    fetch(C.leadUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), credentials: 'omit' })
      .then(function(r){ if(!r.ok) throw new Error('status ' + r.status); return r.json().catch(function(){ return {}; }); })
      .then(function(){ state.sent = true; state.step = 'done'; render(true); })
      .catch(function(){
        state.errors = { form: 'That didn\'t go through. Please try again, or call us at ' + cat.brand.phone + '.' };
        render();
      });
  }

  // A printable page the customer can save as a PDF.
  function pdf(){
    var w = root.open('', '_blank');
    if(!w){ alertBox('Your browser blocked the new window. Allow pop-ups for this site, then try again.'); return; }
    var p = product(), e = estimate();
    var rows = breakdownRows().map(function(r){ return '<tr><td>' + esc(r[0]) + '</td><td style="text-align:right">' + esc(r[1]) + '</td></tr>'; }).join('');
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(p.name) + ' estimate · Zip Kit Homes</title>'
      + '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#2d2a22;max-width:720px;margin:32px auto;padding:0 20px;line-height:1.5}'
      + 'h1{font-size:26px;margin:18px 0 4px}table{width:100%;border-collapse:collapse;margin:18px 0}td{padding:10px 0;border-bottom:1px solid #e6e2d6;vertical-align:top}'
      + '.t td{font-weight:700;font-size:20px;border-bottom:2px solid #17150f}.s{color:#6a6459;font-size:13px}img.h{width:100%;border-radius:10px;margin-top:12px}'
      + '.p{text-align:center;margin:24px 0}.p button{padding:10px 28px;font-size:15px;background:#d85a30;color:#fff;border:0;border-radius:8px;cursor:pointer}@media print{.p{display:none}}</style></head><body>'
      + '<img src="' + esc(new URL(ZK.url('images/zk-logo.png'), root.location.href).href) + '" alt="Zip Kit Homes" style="height:40px">'
      + '<h1>Your ' + esc(p.name) + ' estimate</h1><div class="s">For ' + esc(state.contact.name) + ' · Building in ' + esc(stateName(state.st)) + ' · ' + esc(new Date().toLocaleDateString('en-US')) + '</div>'
      + (p.photo ? '<img class="h" src="' + esc(new URL(ZK.url(p.photo), root.location.href).href) + '" alt="">' : '')
      + '<table>' + rows + '<tr class="t"><td>Starting at</td><td style="text-align:right">' + money(e.start) + '</td></tr></table>'
      + '<p class="s">' + esc(scopeNote()) + '</p><ul class="s">' + FINE.map(function(f){ return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>'
      + '<p class="s">Questions? ' + esc(cat.brand.phone) + ' · ' + esc(cat.brand.email) + '</p>'
      + '<div class="p"><button onclick="window.print()">Save as PDF</button></div></body></html>';
    w.document.open(); w.document.write(html); w.document.close();
  }
  function alertBox(msg){ state.errors = { form: msg }; var el = $('#zp-form-err'); if(el) el.textContent = msg; }

  // ---------- events ----------
  function onClick(ev){
    var t = ev.target.closest('button');
    if(!t || !app.contains(t)) return;
    if(t.hasAttribute('data-go')) return go(t.getAttribute('data-go'));
    if(t.hasAttribute('data-type')){ state.type = t.getAttribute('data-type'); state.productId = ''; render(); return; }
    if(t.hasAttribute('data-product')){
      state.productId = t.getAttribute('data-product');
      state.homes = 1; state.snow = 'standard'; state.assembly = assemblyHere() ? 'crew' : 'diy';
      return go('choose');
    }
    if(t.hasAttribute('data-homes')){
      state.homes = Math.max(1, Math.min(cat.max_homes, state.homes + (+t.getAttribute('data-homes'))));
      var i = $('#zp-homes'); if(i) i.value = state.homes;
      return refreshEstimate();
    }
    if(t.hasAttribute('data-pdf')) return pdf();
    if(t.hasAttribute('data-restart')){
      var st = state.st;
      state = { step: 'pick', st: st, type: '', productId: '', homes: 1, snow: 'standard', assembly: 'diy', contact: state.contact, sent: false, shownAt: 0, errors: {} };
      return render(true);
    }
  }
  function onInput(ev){
    var el = ev.target, k = el.getAttribute('data-zp'), c = el.getAttribute('data-zc');
    if(c){ state.contact[c] = el.value; return; }
    if(k === 'st'){ state.st = el.value; return; }
    if(k === 'homes'){ var n = parseInt(el.value, 10); if(n >= 1){ state.homes = Math.min(cat.max_homes, n); refreshEstimate(); } return; }
    if((k === 'snow' || k === 'assembly') && el.checked){ state[k] = el.value; refreshEstimate(); }
  }
  function onSubmit(ev){ if(ev.target.id === 'zp-form'){ ev.preventDefault(); send(); } }

  function init(){
    app = document.querySelector(C.publicMount || '[data-zk-app="public"]');
    if(!app) return;
    app.classList.add('zk-tool', 'zk-public');
    app.addEventListener('click', onClick);
    app.addEventListener('input', onInput);
    app.addEventListener('change', onInput);
    app.addEventListener('submit', onSubmit);
    fetch(C.publicCatalogUrl || ZK.url('data/catalog-public.json'), { cache: 'no-cache', credentials: 'omit' })
      .then(function(r){ if(!r.ok) throw new Error('catalog ' + r.status); return r.json(); })
      .then(function(d){
        cat = d;
        var saved = store('zkPublicState');
        if(saved && STATES.some(function(s){ return s[0] === saved; })) state.st = saved;
        render();
      })
      .catch(function(e){
        console.error(e);
        app.innerHTML = '<div class="zp-wrap"><main class="zp-main"><h1 class="zp-title">Sorry, this isn\'t loading right now.</h1><p class="zp-lead">Please try again in a minute, or give us a call.</p></main></div>';
      });
  }

  ZK.Public = { state: function(){ return state; }, catalog: function(){ return cat; }, go: go, render: render };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
