/* "Quote your own project": the customer quoter. Brand-agnostic: the brand,
   its models and its look come from data/catalog-public-<brand>.json.

   Steps: account (name, email, phone, zip; email link) → where (state + build
   zip) → model → choices (estimate from the server) → send → breakdown.

   The page never sees the full price list or any rate: estimates come from
   the server (ZK_CONFIG.estimateUrl), which needs the customer's verified
   account. No payments of any kind. Choice questions are dropdowns with a
   placeholder and no preselected answer (Kelsey's form rules). */
(function(root){
  'use strict';
  var ZK = root.ZK = root.ZK || {};
  var C = ZK.config || {};

  var STATES = [['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']];
  var STEPS = ['account', 'where', 'pick', 'choose'];
  var SCOPE = {
    modular: 'A complete modular home arrives finished inside. Site prep, foundation, setting it on site and utility hookups are not included.',
    kit: 'Kits are the shell only. Foundation, siding and roofing, insulation, plumbing, electrical and interior finishes are not included.'
  };
  var FINE = ['This is an estimate, not a quote. Final pricing is set after design.',
    'Pricing is based on your build site address. Sales tax is not included.',
    'Permits, zoning and what you can build on your land: your local building department can tell you.'];

  var cat = null, app = null, accounts = null;
  var state = freshState();
  function freshState(){
    return { step: 'account', user: null, mode: 'new', sentTo: '', st: '', zip: '', type: '', productId: '',
      homes: '', bunits: '', buildings: '', snow: '', assembly: '', timeline: '', est: null, estFor: '', estErr: '', busy: false, errors: {}, result: null };
  }

  function $(sel){ return app.querySelector(sel); }
  function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
  function money(n){ return '$' + Math.round(n).toLocaleString('en-US'); }
  function stateName(code){ for(var i = 0; i < STATES.length; i++) if(STATES[i][0] === code) return STATES[i][1]; return code; }
  function isLocal(){ return /^(localhost|127\.0\.0\.1)$/.test(root.location.hostname); }

  // ---------- UTM and landing page (first-party cookie, 90 days) ----------
  function cookie(name, value){
    if(value === undefined){ var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }
    document.cookie = name + '=' + encodeURIComponent(value) + '; max-age=' + (90 * 86400) + '; path=/; SameSite=Lax';
  }
  function captureUtm(){
    var q = new URLSearchParams(root.location.search), u = {};
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function(k){ if(q.get(k)) u[k] = q.get(k).slice(0, 100); });
    if(Object.keys(u).length) cookie('zk_utm', JSON.stringify(u));
    if(!cookie('zk_landing')) cookie('zk_landing', root.location.href.split('#')[0].slice(0, 300));
  }
  function utm(){ var u = {}; try { u = JSON.parse(cookie('zk_utm') || '{}'); } catch(e){} u.landing_page = cookie('zk_landing'); u.page = root.location.href.split('#')[0]; return u; }

  // ---------- accounts ----------
  // Supabase (the customer project, never the sales one): sign-in by email
  // link, so every account has a verified email. A stub exists for local tests.
  function supabaseAccounts(){
    var client = root.supabase.createClient(C.customerSupabaseUrl, C.customerSupabaseKey, {
      auth: { storageKey: 'zk-customer-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    function toUser(s){
      var u = s && s.user;
      if(!u || !u.email_confirmed_at) return null;
      var m = u.user_metadata || {};
      return { id: u.id, email: u.email, name: m.name || '', phone: m.phone || '', zip: m.zip || '', token: s.access_token };
    }
    return {
      session: function(){ return client.auth.getSession().then(function(r){ return toUser(r.data && r.data.session); }); },
      start: function(p){
        return client.auth.signInWithOtp({ email: p.email, options: { emailRedirectTo: root.location.href.split('#')[0], shouldCreateUser: p.mode === 'new',
          data: p.mode === 'new' ? { name: p.name, phone: p.phone, zip: p.zip, brand: C.brand || '' } : undefined } })
          .then(function(r){ if(r.error) throw r.error; });
      },
      onChange: function(cb){ client.auth.onAuthStateChange(function(ev, s){ cb(toUser(s)); }); },
      signOut: function(){ return client.auth.signOut(); },
      saveProfile: function(u){
        return client.from('customer_profiles').upsert({ id: u.id, name: u.name, phone: u.phone, zip: u.zip, brand: C.brand || null, utm_source: utm().utm_source || null,
          utm_medium: utm().utm_medium || null, utm_campaign: utm().utm_campaign || null, landing_page: utm().landing_page || null }).then(function(){}, function(){});
      }
    };
  }
  function stubAccounts(){
    var key = 'zk-stub-customer', pending = null, listener = null;
    function get(){ try { return JSON.parse(root.sessionStorage.getItem(key) || 'null'); } catch(e){ return null; } }
    return {
      session: function(){ return Promise.resolve(get()); },
      start: function(p){ pending = p; return Promise.resolve(); },
      onChange: function(cb){ listener = cb; },
      signOut: function(){ root.sessionStorage.removeItem(key); return Promise.resolve(); },
      saveProfile: function(){ return Promise.resolve(); },
      // Test only: act as if the customer clicked the link in their email.
      _verify: function(){
        var u = { id: 'stub-' + (pending.email || 'x'), email: pending.email, name: pending.name || 'Returning Customer', phone: pending.phone || '', zip: pending.zip || '', token: 'stub-token' };
        root.sessionStorage.setItem(key, JSON.stringify(u)); if(listener) listener(u);
      }
    };
  }
  function makeAccounts(){
    if(C.accounts === 'stub' && isLocal()) return stubAccounts();
    if(C.accounts === 'supabase' && C.customerSupabaseUrl && C.customerSupabaseKey && root.supabase && root.supabase.createClient) return supabaseAccounts();
    return null;
  }

  // ---------- what's sold where ----------
  function sold(line, st){ var a = cat.availability[line]; return a === 'all' || (Array.isArray(a) && a.indexOf(st) !== -1); }
  function typesFor(st){ return cat.types.filter(function(t){ return sold(t.line, st); }); }
  function type(){ return cat.types.filter(function(t){ return t.id === state.type; })[0] || null; }
  function product(){ return cat.products.filter(function(p){ return p.id === state.productId; })[0] || null; }
  function assemblyHere(){ var t = type(); return !!(t && t.ask_assembly && sold('assembly', state.st)); }
  function hasAssemblyTypes(){ return cat.types.some(function(t){ return t.ask_assembly; }); }
  // Multifamily models are asked by the building (Dakota 2 or 3 units, Westley 5).
  function sizes(){ var p = product(), t = type(); return t && t.ask_homes && p && p.building_units && p.building_units.length ? p.building_units : null; }
  function perBuilding(){ var s = sizes(); return !s ? 0 : (s.length === 1 ? s[0] : +state.bunits || 0); }
  function plural(n, w){ return n + ' ' + w + (n === 1 ? '' : 's'); }
  function buildingSum(){ var b = +state.buildings, u = perBuilding(); return b && u ? plural(b, 'building') + ' × ' + plural(u, 'unit') + ' = ' + plural(b * u, 'unit') + '.' : ''; }
  function unitWord(t, n){
    var w = sizes() ? 'unit' : ({ home: 'home', garage: 'garage', hangar: 'hangar' }[t.per] || 'home');
    return n === 1 ? w : w + 's';
  }

  // Which questions this model asks, and whether they're all answered.
  function questions(){
    var t = type(), q = [];
    if(!t) return q;
    var s = sizes();
    if(s){ if(s.length > 1) q.push('bunits'); q.push('buildings'); }
    else if(t.ask_homes) q.push('homes');
    if(t.ask_snow) q.push('snow');
    if(assemblyHere()) q.push('assembly');
    return q;
  }
  function answered(){ return questions().every(function(k){ return !!state[k]; }); }
  function choiceKey(){ return [state.productId, state.homes, state.bunits, state.buildings, state.snow, state.assembly, state.st, state.zip].join('|'); }

  // ---------- rendering ----------
  function header(){
    var i = STEPS.indexOf(state.step), b = cat.brand;
    return '<div class="zp-top"><img class="zp-logo" src="' + esc(ZK.url(b.logo)) + '" alt="' + esc(b.name) + '">'
      + '<span class="zp-progress">' + (i >= 0 ? 'Step ' + (i + 1) + ' of ' + STEPS.length : '')
      + (state.user ? ' <button type="button" class="zp-link small" data-signout="1">Sign out</button>' : '') + '</span></div>';
  }

  function field(key, label, typeAttr, value, extra){
    return '<div class="zp-field' + (state.errors[key] ? ' invalid' : '') + '"><label for="zp-' + key + '">' + label + '</label>'
      + '<input type="' + typeAttr + '" id="zp-' + key + '" data-zf="' + key + '" value="' + esc(value) + '"' + (extra || '') + '>'
      + '<div class="zp-err">' + esc(state.errors[key] || '') + '</div></div>';
  }
  // A required dropdown with a placeholder and nothing preselected.
  function select(key, label, placeholder, options, value){
    return '<div class="zp-field' + (state.errors[key] ? ' invalid' : '') + '"><label for="zp-' + key + '">' + label + '</label>'
      + '<select id="zp-' + key + '" data-zs="' + key + '"><option value="">' + esc(placeholder) + '</option>'
      + options.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (String(value) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('')
      + '</select><div class="zp-err">' + esc(state.errors[key] || '') + '</div></div>';
  }

  function renderClosed(){
    return '<h1 class="zp-title" tabindex="-1">Pricing online is coming soon</h1>'
      + '<p class="zp-lead">In the meantime, give us a call at ' + esc(cat.brand.phone) + ' or email ' + esc(cat.brand.email) + '. We\'re happy to help.</p>';
  }

  function renderAccount(){
    if(!accounts) return renderClosed();
    if(state.mode === 'check'){
      return '<h1 class="zp-title" tabindex="-1">Check your email</h1>'
        + '<p class="zp-lead">We sent a link to <b>' + esc(state.sentTo) + '</b>. Open it on this device to keep going. It can take a minute to arrive.</p>'
        + '<div class="zp-actions"><button type="button" class="zp-btn" data-resend="1">Send it again</button><button type="button" class="zp-link" data-mode="new">Use a different email</button></div>';
    }
    var returning = state.mode === 'returning';
    return '<h1 class="zp-title" tabindex="-1">' + (returning ? 'Welcome back' : 'First, make your free account') + '</h1>'
      + '<p class="zp-lead">' + (returning ? 'Enter your email and we\'ll send you a link to sign in.'
        : 'We\'ll email you a link to confirm it\'s you. Then you can price your project and keep your estimates.') + '</p>'
      + '<form class="zp-card zp-form" id="zp-account" novalidate>'
      + (returning ? '' : field('name', 'Your name', 'text', '', ' autocomplete="name"'))
      + field('email', 'Email', 'email', '', ' autocomplete="email"')
      + (returning ? '' : field('phone', 'Phone', 'tel', '', ' autocomplete="tel"') + field('zip', 'ZIP code', 'text', '', ' inputmode="numeric" autocomplete="postal-code" maxlength="10"'))
      + '<div class="zp-hp" aria-hidden="true"><label for="zp-website">Website</label><input type="text" id="zp-website" tabindex="-1" autocomplete="off"></div>'
      + '<div class="zp-err zp-form-err">' + esc(state.errors.form || '') + '</div>'
      + '<button type="submit" class="zp-btn primary wide" id="zp-send-link"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Sending…' : 'Email me my link') + '</button>'
      + '<p class="zp-help">We only use this to help with your project.</p></form>'
      + '<div class="zp-actions"><button type="button" class="zp-link" data-mode="' + (returning ? 'new' : 'returning') + '">'
      + (returning ? 'New here? Make an account' : 'Already have an account? Sign in') + '</button></div>';
  }

  function renderWhere(){
    return '<h1 class="zp-title" tabindex="-1">Where are you building?</h1>'
      + '<p class="zp-lead">We\'ll show you what we can build there and price it for your area.</p>'
      + '<div class="zp-card zp-form">'
      + select('st', 'State', 'Select a state', STATES, state.st)
      + field('zip', 'ZIP code of your build site', 'text', state.zip, ' inputmode="numeric" autocomplete="postal-code" maxlength="10"')
      + '<button type="button" class="zp-btn primary wide" data-go="pick">Show me what I can build</button></div>';
  }

  function renderPick(){
    var types = typesFor(state.st), name = stateName(state.st);
    if(!state.type || !types.some(function(t){ return t.id === state.type; })) state.type = types.length ? types[0].id : '';
    var t = type();
    var h = '<h1 class="zp-title" tabindex="-1">What would you like to build?</h1>'
      + '<p class="zp-lead">Here\'s what we offer in ' + esc(name) + '. <button type="button" class="zp-link" data-go="where">Change location</button></p>';
    if(!types.length){
      return h.replace('Here\'s what we offer in ' + esc(name) + '.', 'We don\'t offer homes in ' + esc(name) + ' yet.')
        + '<p class="zp-note">Give us a call at ' + esc(cat.brand.phone) + ' and we\'ll tell you what\'s coming.</p>';
    }
    if(hasAssemblyTypes()){
      h += '<p class="zp-note">' + (sold('assembly', state.st)
        ? 'In ' + esc(name) + ', our crew can put your kit together, or you can build it yourself.'
        : 'In ' + esc(name) + ', you or your own crew put it together. We send the plans and instructions.') + '</p>';
    }
    if(types.length > 1){
      h += '<div class="zp-tabs" role="tablist">' + types.map(function(x){
        return '<button type="button" role="tab" class="zp-tab' + (x.id === state.type ? ' on' : '') + '" aria-selected="' + (x.id === state.type) + '" data-type="' + x.id + '">' + esc(x.label) + '</button>';
      }).join('') + '</div>';
    }
    if(t && t.lead_only){
      h += '<div class="zp-card zp-steel"><h2>' + esc(t.label) + '</h2>'
        + '<p>Every steel kit is priced for its project. Tell us when you\'re hoping to build and we\'ll put your price together.</p>'
        + '<button type="button" class="zp-btn primary" data-lead-only="1">Tell us about your project</button></div>';
    } else if(t){
      var list = cat.products.filter(function(p){ return p.type === t.id; });
      if(t.id === 'shell') list = list.slice().sort(function(a, b){ return (a.sqft || 0) - (b.sqft || 0); });
      h += '<div class="zp-grid">' + list.map(function(p){
        return '<button type="button" class="zp-model" data-product="' + esc(p.id) + '">'
          + '<span class="zp-ph">' + (p.photo ? '<img src="' + esc(ZK.url(p.photo)) + '" alt="" loading="lazy">' : '') + (p.photo_label ? '<span class="zp-plabel">' + esc(p.photo_label) + '</span>' : '') + '</span>'
          + '<span class="zp-mb"><span class="zp-mname">' + esc(p.name) + (p.tag ? ' <span class="zp-tag">' + esc(p.tag) + '</span>' : '') + '</span>'
          + '<span class="zp-msize">' + esc(p.size || '') + '</span>'
          + '<span class="zp-mprice">' + (p.start_price != null ? 'Starting at ' + money(p.start_price) : 'Price coming soon') + '</span></span></button>';
      }).join('') + '</div>';
    }
    return h;
  }

  function renderChoose(){
    var p = product(), t = type();
    if(!t || (!p && !t.lead_only)){ state.step = 'pick'; return renderPick(); }
    var h = '<h1 class="zp-title" tabindex="-1">' + esc(p ? p.name : t.label) + '</h1>'
      + '<p class="zp-lead">' + (p && p.size ? esc(p.size) + ' · ' : '') + esc(t.label) + ' · ' + esc(stateName(state.st)) + (state.zip ? ' ' + esc(state.zip) : '')
      + ' <button type="button" class="zp-link" data-go="pick">Pick a different model</button></p>'
      + '<div class="zp-split"><div class="zp-card zp-form">'
      + (p && p.photo ? '<div class="zp-herowrap"><img class="zp-hero" src="' + esc(ZK.url(p.photo)) + '" alt="' + esc(p.name) + '">' + (p.photo_label ? '<span class="zp-plabel">' + esc(p.photo_label) + '</span>' : '') + '</div>' : '');
    var homes = [], blds = [], s = sizes();
    for(var i = 1; i <= cat.max_homes; i++){ homes.push([i, plural(i, unitWord(t, 1))]); blds.push([i, plural(i, 'building')]); }
    questions().forEach(function(k){
      if(k === 'homes') h += select('homes', 'How many homes?', 'Select number of homes', homes, state.homes);
      if(k === 'bunits') h += select('bunits', s.map(function(n){ return n + '-unit'; }).join(' or ') + ' building?', 'Select building size', s.map(function(n){ return [n, n + '-unit building']; }), state.bunits);
      if(k === 'buildings') h += select('buildings', 'How many buildings?', 'Select number of buildings', blds, state.buildings)
        + '<p class="zp-help zp-bsum" id="zp-bsum">' + esc(buildingSum()) + '</p>'
        + '<p class="zp-help">The ' + esc(p.name) + ' is multifamily only' + (s.length === 1 ? ': ' + plural(s[0], 'unit') + ' per building.' : '.') + '</p>';
      if(k === 'snow') h += select('snow', 'How much snow do you get?', 'Select a snow load', cat.snow_choices.map(function(s){ return [s.id, s.label]; }), state.snow)
        + '<ul class="zp-help zp-snowlist">' + cat.snow_choices.map(function(s){ return '<li><b>' + esc(s.label) + ':</b> ' + esc(s.help) + '</li>'; }).join('') + '</ul>'
        + '<p class="zp-help">Not sure? Your local building department can tell you the snow load where you\'re building.</p>';
      if(k === 'assembly') h += select('assembly', 'Who will put it together?', 'Select one', [['crew', 'Our crew (quoted separately)'], ['diy', 'Me or my own crew']], state.assembly);
    });
    if(!questions().length && !t.lead_only) h += '<p class="zp-help">No choices to make for this one.</p>';
    h += '</div><aside class="zp-card zp-est" id="zp-est" aria-live="polite">' + estimateHTML() + '</aside></div>';
    // Phones: the number stays on screen while choosing; the button jumps to the estimate.
    h += '<div class="zp-bar" id="zp-bar">' + barHTML() + '</div>';
    return h;
  }

  function estimateHTML(){
    var t = type(), e = state.est;
    var send = sendHTML();
    if(t.lead_only) return '<div class="zp-est-k">Your price</div><div class="zp-est-s">Priced for your project. We\'ll put it together for you.</div>' + send;
    if(!answered()) return '<div class="zp-est-k">Your estimate</div><div class="zp-est-s">Answer the questions to see your estimate.</div>';
    if(state.estErr) return '<div class="zp-est-k">Your estimate</div><div class="zp-err">' + esc(state.estErr) + '</div>';
    if(!e || state.estFor !== choiceKey()) return '<div class="zp-est-k">Your estimate</div><div class="zp-est-s">Figuring your price…</div>';
    var top = e.needs_price
      ? '<div class="zp-est-v small">We\'ll send your price</div><div class="zp-est-s">Pricing for this model is coming soon. Send this to our team and we\'ll get back to you.</div>'
      : '<div class="zp-est-v">Starting at ' + money(e.start) + '</div><div class="zp-est-s">' + (e.units > 1 ? e.units + ' ' + unitWord(t, e.units) + ' at ' + money(e.each) + ' each' : 'for one ' + unitWord(t, 1)) + (e.shipping != null ? ', with shipping' : '') + '</div>';
    return '<div class="zp-est-k">Your estimate</div>' + top
      + '<ul class="zp-est-l">' + e.lines.slice(1).map(function(l){ return '<li>' + esc(l[0]) + ': ' + esc(l[1]) + '</li>'; }).join('')
      + e.notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' + send;
  }

  function barHTML(){
    var e = state.est, t = type();
    var v = t.lead_only ? 'Priced for your project' : (!answered() ? 'Answer the questions' : (!e || state.estFor !== choiceKey() ? 'Figuring your price…' : (e.needs_price ? 'Price coming soon' : 'Starting at <b>' + money(e.start) + '</b>')));
    return '<span class="zp-bar-v">' + v + '</span><button type="button" class="zp-btn primary" data-to-est="1">' + (t.lead_only ? 'Send' : 'See estimate') + '</button>';
  }

  function sendHTML(){
    return '<form id="zp-send-form" novalidate>'
      + select('timeline', 'When are you hoping to build?', 'Select a timeline', cat.timelines.map(function(x){ return [x, x]; }), state.timeline)
      + '<div class="zp-hp" aria-hidden="true"><label for="zp-website2">Website</label><input type="text" id="zp-website2" tabindex="-1" autocomplete="off"></div>'
      + '<div class="zp-err zp-form-err">' + esc(state.errors.send || '') + '</div>'
      + '<button type="submit" class="zp-btn primary wide" id="zp-send"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Sending…' : 'Send me the full breakdown') + '</button>'
      + '<p class="zp-help">We\'ll email you a copy, and someone from our team will reach out.</p></form>';
  }

  function renderDone(){
    var t = type(), r = state.result || {}, e = r.estimate;
    var first = (state.user && state.user.name || '').split(' ')[0];
    if(!e){
      return '<h1 class="zp-title" tabindex="-1">Thanks' + (first ? ', ' + esc(first) : '') + '!</h1>'
        + '<p class="zp-lead">We got your details' + (r.emailed_you ? ' and emailed you a copy' : '') + '. Someone from our team will reach out about your ' + esc(t ? t.label.toLowerCase() : 'project') + '.</p>'
        + '<div class="zp-actions"><button type="button" class="zp-btn" data-restart="1">Price something else</button></div>';
    }
    return '<h1 class="zp-title" tabindex="-1">Here\'s your breakdown</h1>'
      + '<p class="zp-lead">Thanks' + (first ? ', ' + esc(first) : '') + '. ' + (r.emailed_you ? 'We emailed you a copy. ' : '') + 'Someone from our team will reach out to talk it through.</p>'
      + '<div class="zp-card">' + breakdownTable(e)
      + '<p class="zp-help">' + esc(scopeNote()) + '</p>'
      + '<ul class="zp-fine">' + FINE.map(function(f){ return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>'
      + '<div class="zp-actions"><button type="button" class="zp-btn primary" data-pdf="1">Save as PDF</button><button type="button" class="zp-btn" data-restart="1">Price something else</button></div>';
  }
  function breakdownTable(e){
    return '<table class="zp-table"><tbody>' + e.lines.map(function(l){ return '<tr><td>' + esc(l[0]) + '</td><td>' + esc(l[1]) + '</td></tr>'; }).join('')
      + '<tr class="zp-total"><td>Starting at</td><td>' + (e.start != null ? money(e.start) : 'Coming soon') + '</td></tr></tbody></table>'
      + '<ul class="zp-fine">' + e.notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
  }
  function scopeNote(){ return state.type === 'modular' ? SCOPE.modular : SCOPE.kit; }

  function render(focus){
    if(!cat) return;
    var body = { account: renderAccount, where: renderWhere, pick: renderPick, choose: renderChoose, done: renderDone }[state.step]();
    app.innerHTML = '<div class="zp-wrap">' + header() + '<main class="zp-main">' + body + '</main></div>';
    if(focus){
      var h = $('.zp-title'); if(h) h.focus({ preventScroll: true });
      var top = app.getBoundingClientRect().top + (root.pageYOffset || 0);
      if((root.pageYOffset || 0) > top) root.scrollTo(0, Math.max(0, top - 8));
    }
  }
  function refreshEstimate(){
    var a = $('#zp-est'); if(a) a.innerHTML = estimateHTML();
    var b = $('#zp-bar'); if(b) b.innerHTML = barHTML();
  }

  // ---------- server calls ----------
  function post(url, body){
    return fetch(url, { method: 'POST', credentials: 'omit', body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (state.user ? state.user.token : '') } })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.message || ('status ' + r.status)); return j; }); });
  }
  function choices(){
    var s = sizes();
    return { product_type: state.type, product_id: state.productId, homes: s ? +state.buildings * perBuilding() : (state.homes ? +state.homes : 1),
      buildings: s ? +state.buildings : null, building_units: s ? perBuilding() : null, snow: state.snow || null,
      assembly: state.assembly || null, state: state.st, zip: state.zip };
  }
  function fetchEstimate(){
    if(!answered() || type().lead_only) return refreshEstimate();
    var key = choiceKey();
    if(state.est && state.estFor === key) return refreshEstimate();
    state.estErr = ''; refreshEstimate();
    if(!C.estimateUrl){ state.estErr = 'Pricing isn\'t connected on this page yet. Call us at ' + cat.brand.phone + '.'; return refreshEstimate(); }
    post(C.estimateUrl, choices()).then(function(e){
      if(key !== choiceKey()) return;
      state.est = e; state.estFor = key; refreshEstimate();
    }).catch(function(err){
      if(/sign in|confirm your email/i.test(err.message)) return signedOut();
      state.estErr = 'We couldn\'t figure your price just now. Try again, or call us at ' + cat.brand.phone + '.'; refreshEstimate();
    });
  }

  // ---------- moving between steps ----------
  function go(step){
    state.errors = {};
    if(step === 'pick'){
      var z = (state.zip || '').replace(/\D/g, '');
      if(!state.st) state.errors.st = 'Select the state you\'re building in.';
      if(z.length !== 5) state.errors.zip = 'Add the 5-digit ZIP code of your build site.';
      if(Object.keys(state.errors).length){ render(); var f = app.querySelector('.invalid select, .invalid input'); if(f) f.focus(); return; }
      state.zip = z;
    }
    state.step = step;
    render(true);
    if(step === 'choose') fetchEstimate();
  }

  function startAccount(form){
    var v = function(k){ var el = form.querySelector('[data-zf="' + k + '"]'); return el ? el.value.trim() : ''; };
    if(form.querySelector('#zp-website').value) { state.mode = 'check'; state.sentTo = v('email'); return render(true); }   // spam trap: act normal
    var p = { mode: state.mode, name: v('name'), email: v('email'), phone: v('phone'), zip: v('zip').replace(/\D/g, '') }, e = {};
    if(state.mode === 'new'){
      if(!p.name) e.name = 'Add your name.';
      if(p.phone.replace(/\D/g, '').length < 10) e.phone = 'Add your phone number with area code.';
      if(p.zip.length !== 5) e.zip = 'Add your 5-digit ZIP code.';
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) e.email = 'Add an email we can reach you at.';
    if(Object.keys(e).length){ state.errors = e; render(); keepValues(form, p); var f = app.querySelector('.invalid input'); if(f) f.focus(); return; }
    state.busy = true; state.errors = {}; render(); keepValues(app.querySelector('#zp-account'), p);
    state.pending = p;
    accounts.start(p).then(function(){ state.busy = false; state.mode = 'check'; state.sentTo = p.email; render(true); })
      .catch(function(err){
        state.busy = false;
        state.errors = { form: /not found|signups not allowed/i.test(err && err.message || '') ? 'We couldn\'t find an account for that email. Make a new one below.' : 'That didn\'t go through. Please try again, or call us at ' + cat.brand.phone + '.' };
        render(); keepValues(app.querySelector('#zp-account'), p);
      });
  }
  function keepValues(form, p){ if(!form) return; Object.keys(p).forEach(function(k){ var el = form.querySelector('[data-zf="' + k + '"]'); if(el) el.value = p[k]; }); }

  function send(form){
    var t = type();
    if(form.querySelector('#zp-website2').value){ state.result = { ok: true }; state.step = 'done'; return render(true); }   // spam trap
    if(!state.timeline){ state.errors = { timeline: 'Select one. "Just looking for now" is fine.' }; return refreshEstimate(); }
    if(!t.lead_only && !answered()) return refreshEstimate();
    if(!C.leadUrl){ state.errors = { send: 'This form isn\'t connected yet. Please call us at ' + cat.brand.phone + '.' }; return refreshEstimate(); }
    state.busy = true; state.errors = {}; refreshEstimate();
    var u = utm(), body = choices();
    body.timeline = state.timeline; body.website = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'landing_page', 'page'].forEach(function(k){ body[k] = u[k] || ''; });
    post(C.leadUrl, body).then(function(r){ state.busy = false; state.result = r; state.step = 'done'; render(true); })
      .catch(function(err){
        state.busy = false;
        if(/sign in|confirm your email/i.test(err.message)) return signedOut();
        state.errors = { send: 'That didn\'t go through. Please try again, or call us at ' + cat.brand.phone + '.' }; refreshEstimate();
      });
  }

  function signedIn(u){
    if(!u) return;
    var first = !state.user;
    state.user = u;
    if(first){ accounts.saveProfile(u); if(!state.zip) state.zip = u.zip || ''; }
    if(state.step === 'account'){ state.step = 'where'; render(true); }
  }
  function signedOut(){ var keep = { st: state.st, zip: state.zip }; state = freshState(); state.st = keep.st; state.zip = keep.zip; render(true); }

  // A printable page the customer can save as a PDF.
  function pdf(){
    var w = root.open('', '_blank');
    if(!w){ state.errors = { send: 'Your browser blocked the new window. Allow pop-ups for this site, then try again.' }; return; }
    var p = product(), e = state.result.estimate, b = cat.brand, abs = function(u){ return new URL(ZK.url(u), root.location.href).href; };
    var rows = e.lines.map(function(l){ return '<tr><td>' + esc(l[0]) + '</td><td style="text-align:right">' + esc(l[1]) + '</td></tr>'; }).join('');
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(p.name) + ' estimate · ' + esc(b.name) + '</title>'
      + '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#2d2a22;max-width:720px;margin:32px auto;padding:0 20px;line-height:1.5}'
      + 'h1{font-size:26px;margin:18px 0 4px}table{width:100%;border-collapse:collapse;margin:18px 0}td{padding:10px 0;border-bottom:1px solid #e6e2d6;vertical-align:top}'
      + '.t td{font-weight:700;font-size:20px;border-bottom:2px solid #17150f}.s{color:#6a6459;font-size:13px}img.h{width:100%;border-radius:10px;margin-top:12px}'
      + '.p{text-align:center;margin:24px 0}.p button{padding:10px 28px;font-size:15px;background:' + esc(b.colors.main) + ';color:#fff;border:0;border-radius:8px;cursor:pointer}@media print{.p{display:none}}</style></head><body>'
      + '<img src="' + esc(abs(b.logo)) + '" alt="' + esc(b.name) + '" style="height:40px">'
      + '<h1>Your ' + esc(p.name) + ' estimate</h1><div class="s">For ' + esc(state.user.name || state.user.email) + ' · Building in ' + esc(stateName(state.st)) + (state.zip ? ' ' + esc(state.zip) : '') + ' · ' + esc(new Date().toLocaleDateString('en-US')) + '</div>'
      + (p.photo ? '<img class="h" src="' + esc(abs(p.photo)) + '" alt="">' + (p.photo_label ? '<div class="s">' + esc(p.photo_label) + '</div>' : '') : '')
      + '<table>' + rows + '<tr class="t"><td>Starting at</td><td style="text-align:right">' + (e.start != null ? money(e.start) : 'Coming soon') + '</td></tr></table>'
      + '<ul class="s">' + e.notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>'
      + '<p class="s">' + esc(scopeNote()) + '</p><ul class="s">' + FINE.map(function(f){ return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>'
      + '<p class="s">Questions? ' + esc(b.phone) + ' · ' + esc(b.email) + '</p>'
      + '<div class="p"><button onclick="window.print()">Save as PDF</button></div></body></html>';
    w.document.open(); w.document.write(html); w.document.close();
  }

  // ---------- events ----------
  function onClick(ev){
    var t = ev.target.closest('button');
    if(!t || !app.contains(t)) return;
    if(t.hasAttribute('data-go')) return go(t.getAttribute('data-go'));
    if(t.hasAttribute('data-mode')){ state.mode = t.getAttribute('data-mode'); state.errors = {}; return render(true); }
    if(t.hasAttribute('data-resend')){ if(state.pending) accounts.start(state.pending); t.textContent = 'Sent again'; t.disabled = true; return; }
    if(t.hasAttribute('data-signout')){ accounts.signOut().then(signedOut); return; }
    if(t.hasAttribute('data-type')){ state.type = t.getAttribute('data-type'); state.productId = ''; render(); return; }
    if(t.hasAttribute('data-product') || t.hasAttribute('data-lead-only')){
      state.productId = t.getAttribute('data-product') || '';
      state.homes = ''; state.bunits = ''; state.buildings = ''; state.snow = ''; state.assembly = ''; state.est = null; state.estErr = '';
      return go('choose');
    }
    if(t.hasAttribute('data-pdf')) return pdf();
    if(t.hasAttribute('data-to-est')){ var est = $('#zp-est'); if(est) est.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if(t.hasAttribute('data-restart')){ state.step = 'pick'; state.productId = ''; state.est = null; state.result = null; return render(true); }
  }
  function onInput(ev){
    var el = ev.target, f = el.getAttribute('data-zf'), s = el.getAttribute('data-zs');
    if(f === 'zip' && state.step === 'where'){ state.zip = el.value; return; }
    if(!s) return;
    if(s === 'st'){ state.st = el.value; return; }
    if(s === 'timeline'){ state.timeline = el.value; return; }
    if(ev.type === 'change' && /^(homes|bunits|buildings|snow|assembly)$/.test(s)){
      state[s] = el.value; state.errors = {};
      var sum = $('#zp-bsum'); if(sum) sum.textContent = buildingSum();
      fetchEstimate();
    }
  }
  function onSubmit(ev){
    ev.preventDefault();
    if(ev.target.id === 'zp-account') startAccount(ev.target);
    if(ev.target.id === 'zp-send-form') send(ev.target);
  }

  function init(){
    app = document.querySelector(C.publicMount || '[data-zk-app="public"]');
    if(!app) return;
    app.classList.add('zk-tool', 'zk-public');
    app.addEventListener('click', onClick);
    app.addEventListener('input', onInput);
    app.addEventListener('change', onInput);
    app.addEventListener('submit', onSubmit);
    captureUtm();
    accounts = makeAccounts();
    fetch(C.publicCatalogUrl || ZK.url('data/catalog-public-' + (C.brand || 'zipkit') + '.json'), { cache: 'no-cache', credentials: 'omit' })
      .then(function(r){ if(!r.ok) throw new Error('catalog ' + r.status); return r.json(); })
      .then(function(d){
        cat = d;
        // The brand's own colors.
        if(d.brand.colors){ app.style.setProperty('--accent', d.brand.colors.main); app.style.setProperty('--accent-2', d.brand.colors.dark); }
        render();
        if(!accounts) return;
        accounts.onChange(function(u){ if(u) signedIn(u); });
        return accounts.session().then(signedIn);
      })
      .catch(function(e){
        console.error(e);
        app.innerHTML = '<div class="zp-wrap"><main class="zp-main"><h1 class="zp-title">Sorry, this isn\'t loading right now.</h1><p class="zp-lead">Please try again in a minute, or give us a call.</p></main></div>';
      });
  }

  ZK.Public = { state: function(){ return state; }, catalog: function(){ return cat; }, accounts: function(){ return accounts; }, go: go, render: render };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
