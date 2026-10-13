/* Option forms for each product type. Each control maps to one key of the
   pricing config (see js/pricing.js). Visible controls are kept to the few a
   rep needs on most quotes; the rest sit under "More options". */
(function(root){
  'use strict';
  var fmt = function(n){ return root.ZKPricing.fmt(n); };
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ---------- small HTML helpers ----------
  function tip(id, text){
    if(!text) return '';
    return '<button type="button" class="tip" aria-expanded="false" aria-controls="tip-' + id + '" data-tip="' + id + '" title="More info">?</button>'
      + '<span class="tip-text" id="tip-' + id + '" hidden>' + text + '</span>';
  }
  function label(c){ return '<span class="group-label">' + esc(c.label) + (c.optional ? ' <span class="opt">(optional)</span>' : '') + tip(c.key, c.tip) + '</span>'; }
  function helpLine(c, ctx){ var h = typeof c.help === 'function' ? c.help(ctx) : c.help; return h ? '<div class="help">' + h + '</div>' : ''; }
  function errLine(c){ return '<div class="err" data-err="' + c.key + '"></div>'; }

  function get(ctx, key){ return ctx.cfg[key]; }

  var RENDER = {
    stepper: function(c, ctx){
      var v = get(ctx, c.key) || 1;
      return '<div class="field" data-field="' + c.key + '">' + label(c)
        + '<div class="stepper"><button type="button" data-step="' + c.key + '" data-delta="-1" aria-label="One fewer">−</button>'
        + '<input type="number" inputmode="numeric" min="1" max="50" step="1" data-key="' + c.key + '" data-kind="int" value="' + esc(v) + '" aria-label="' + esc(c.label) + '">'
        + '<button type="button" data-step="' + c.key + '" data-delta="1" aria-label="One more">+</button></div>'
        + helpLine(c, ctx) + errLine(c) + '</div>';
    },
    number: function(c, ctx){
      var v = get(ctx, c.key);
      return '<div class="field" data-field="' + c.key + '"><label for="f-' + c.key + '">' + esc(c.label) + (c.optional ? ' <span class="opt">(optional)</span>' : '') + tip(c.key, c.tip) + '</label>'
        + '<div class="inline">' + (c.prefix ? '<span class="suffix">' + c.prefix + '</span>' : '')
        + '<input type="number" inputmode="decimal" id="f-' + c.key + '" data-key="' + c.key + '" data-kind="num" min="' + (c.min != null ? c.min : 0) + '"' + (c.max != null ? ' max="' + c.max + '"' : '') + ' step="' + (c.step || 'any') + '" value="' + (v == null ? '' : esc(v)) + '"' + (c.placeholder ? ' placeholder="' + esc(c.placeholder) + '"' : '') + '>'
        + (c.suffix ? '<span class="suffix">' + (typeof c.suffix === 'function' ? c.suffix(ctx) : c.suffix) + '</span>' : '') + '</div>'
        + helpLine(c, ctx) + errLine(c) + '</div>';
    },
    text: function(c, ctx){
      var v = get(ctx, c.key);
      return '<div class="field' + (c.full ? ' full' : '') + '" data-field="' + c.key + '"><label for="f-' + c.key + '">' + esc(c.label) + (c.optional ? ' <span class="opt">(optional)</span>' : '') + tip(c.key, c.tip) + '</label>'
        + '<input type="text" id="f-' + c.key + '" data-key="' + c.key + '" data-kind="text" value="' + esc(v || '') + '"' + (c.placeholder ? ' placeholder="' + esc(c.placeholder) + '"' : '') + '>'
        + helpLine(c, ctx) + errLine(c) + '</div>';
    },
    textarea: function(c, ctx){
      return '<div class="field full" data-field="' + c.key + '"><label for="f-' + c.key + '">' + esc(c.label) + (c.optional ? ' <span class="opt">(optional)</span>' : '') + tip(c.key, c.tip) + '</label>'
        + '<textarea id="f-' + c.key + '" data-key="' + c.key + '" data-kind="text"' + (c.placeholder ? ' placeholder="' + esc(c.placeholder) + '"' : '') + '>' + esc(get(ctx, c.key) || '') + '</textarea>'
        + helpLine(c, ctx) + errLine(c) + '</div>';
    },
    choices: function(c, ctx){
      var cur = get(ctx, c.key);
      var opts = typeof c.options === 'function' ? c.options(ctx) : c.options;
      if(cur == null) cur = opts[0].value;
      return '<div class="field" data-field="' + c.key + '" role="radiogroup" aria-label="' + esc(c.label) + '">' + label(c)
        + '<div class="choices">' + opts.map(function(o){
          var on = String(cur) === String(o.value);
          return '<label class="choice' + (on ? ' on' : '') + '"><input type="radio" name="r-' + c.key + '" data-key="' + c.key + '" data-kind="choice" value="' + esc(o.value) + '"' + (on ? ' checked' : '') + '>'
            + '<span class="c-title">' + esc(o.title) + '</span>' + (o.sub ? '<span class="c-sub">' + esc(o.sub) + '</span>' : '') + '</label>';
        }).join('') + '</div>' + helpLine(c, ctx) + errLine(c) + '</div>';
    },
    select: function(c, ctx){
      var cur = get(ctx, c.key);
      var opts = typeof c.options === 'function' ? c.options(ctx) : c.options;
      return '<div class="field" data-field="' + c.key + '"><label for="f-' + c.key + '">' + esc(c.label) + tip(c.key, c.tip) + '</label>'
        + '<select id="f-' + c.key + '" data-key="' + c.key + '" data-kind="select">' + opts.map(function(o){
          return '<option value="' + esc(o.value) + '"' + (String(cur == null ? '' : cur) === String(o.value) ? ' selected' : '') + '>' + esc(o.title) + '</option>';
        }).join('') + '</select>' + helpLine(c, ctx) + errLine(c) + '</div>';
    },
    check: function(c, ctx){
      return '<label class="check" data-field="' + c.key + '"><input type="checkbox" data-key="' + c.key + '" data-kind="bool"' + (get(ctx, c.key) ? ' checked' : '') + '>'
        + '<span>' + esc(c.label) + (c.sub ? '<span class="c-sub">' + (typeof c.sub === 'function' ? c.sub(ctx) : c.sub) + '</span>' : '') + '</span></label>';
    },
    addonChecks: function(c, ctx){
      var z = ctx.pricing; if(!z || !z.addons.length) return '';
      var chosen = ctx.cfg.addons || [];
      return '<div class="field" data-field="addons">' + label(c) + z.addons.map(function(a){
        return '<label class="check"><input type="checkbox" data-addon="' + esc(a.id) + '"' + (chosen.indexOf(a.id) !== -1 ? ' checked' : '') + '><span>' + esc(a.label) + '<span class="c-sub">+' + fmt(a.price) + ' each</span></span></label>';
      }).join('') + '</div>';
    },
    lines: function(c, ctx){
      var rows = ctx.cfg.customLines || [];
      return '<div class="field" data-field="customLines">' + label(c)
        + '<div class="rows" data-rows="customLines">' + rows.map(function(r, i){
          return '<div class="row-line"><input type="text" data-line="' + i + '" data-part="desc" placeholder="What is it? (e.g. Wraparound deck)" value="' + esc(r.desc) + '" aria-label="Description">'
            + '<input type="number" inputmode="decimal" step="any" data-line="' + i + '" data-part="amount" placeholder="$ (use − for a credit)" value="' + esc(r.amount) + '" aria-label="Amount">'
            + '<button type="button" class="remove" data-remove-line="' + i + '" aria-label="Remove">×</button></div>';
        }).join('') + '</div>'
        + '<button type="button" class="add-row" data-add-line="1">+ Add an add-on or credit</button>'
        + helpLine(c, ctx) + '<div class="err" data-err="customLines"></div></div>';
    },
    schedule: function(c, ctx){
      var rows = ctx.cfg.customSchedule || [];
      var info = root.ZKPricing.customScheduleInfo(rows);
      var sumText = rows.length ? (Math.round(info.sum * 100) / 100) + '%' : '';
      return '<div class="field" data-field="customSchedule">' + label(c)
        + (rows.length ? '' : '<div class="help">Standard schedule: engineering first, then 45% / 45% / 10%.</div>')
        + '<div class="rows">' + rows.map(function(r, i){
          return '<div class="row-line sched"><input type="text" data-sched="' + i + '" data-part="name" placeholder="Payment name" value="' + esc(r.name) + '" aria-label="Payment name">'
            + '<input type="number" inputmode="decimal" step="0.5" min="0" max="100" data-sched="' + i + '" data-part="pct" placeholder="%" value="' + esc(r.pct) + '" aria-label="Percent">'
            + '<input type="text" class="sched-desc" data-sched="' + i + '" data-part="desc" placeholder="When it\'s due" value="' + esc(r.desc) + '" aria-label="When it\'s due">'
            + '<button type="button" class="remove" data-remove-sched="' + i + '" aria-label="Remove">×</button></div>';
        }).join('') + '</div>'
        + '<div class="btn-row">'
        + '<button type="button" class="add-row" data-sched-add="1">+ Add a payment</button>'
        + (rows.length ? '<button type="button" class="add-row" data-sched-reset="1">Back to standard</button>' : '<button type="button" class="add-row" data-sched-start="1">Change the schedule</button>')
        + '</div>'
        + (rows.length ? '<div class="help" data-sched-sum>' + (info.isValid ? 'Adds up to 100%. Engineering is still billed first.' : 'Adds up to <b>' + sumText + '</b>. Make it 100% to continue, or click "Back to standard".') + '</div>' : '')
        + '</div>';
    }
  };

  // ---------- adjust-a-price ----------
  // Each item: key (adjustments.<key>), title, standard amount text, and when it applies.
  function adjustBox(items, ctx){
    var open = ctx.ui.adjustOpen || items.some(function(i){ return ctx.cfg.adjustments && ctx.cfg.adjustments[i.key]; });
    var count = items.filter(function(i){ return ctx.cfg.adjustments && ctx.cfg.adjustments[i.key]; }).length;
    var h = '<div class="adjust">';
    h += '<button type="button" class="adjust-link" data-adjust-toggle="1" aria-expanded="' + (open ? 'true' : 'false') + '">' + (open ? 'Hide price adjustments' : 'Adjust a price') + (count ? ' (' + count + ' adjusted)' : '') + '</button>';
    if(open){
      h += '<div class="adjust-box"><div class="help" style="margin:0 0 8px;color:var(--warn-ink)">Only for a price you agreed with the customer. Each change needs a reason; managers see it on the quote.</div>';
      items.forEach(function(i){
        var a = (ctx.cfg.adjustments || {})[i.key] || {};
        h += '<div class="adj-row">'
          + '<div><div class="adj-title">' + esc(i.title) + '</div><div class="adj-std">' + i.standard + '</div></div>'
          + '<div class="field" data-field="adj-' + i.key + '"><input type="number" inputmode="decimal" min="0" step="any" data-adj="' + i.key + '" data-part="amount" placeholder="New $" value="' + esc(a.amount == null ? '' : a.amount) + '" aria-label="New price for ' + esc(i.title) + '"></div>'
          + '<div class="field reason" data-field="reason-' + i.key + '"><input type="text" data-adj="' + i.key + '" data-part="reason" placeholder="Reason (required), e.g. Matched competitor quote" value="' + esc(a.reason || '') + '" aria-label="Reason for ' + esc(i.title) + '"><div class="err" data-err="reason-' + i.key + '"></div></div>'
          + '</div>';
      });
      h += '</div>';
    }
    return h + '</div>';
  }

  // ---------- per-type definitions ----------
  function assemblyChoice(shareText){
    return { key:'assembly', type:'choices', label:'Site assembly',
      tip:'Assembly is done by Zip Kit Assembly LLC, a separate company. "Add our crew" is billed on its own contract, so it isn\'t in the payment schedule.',
      options: function(ctx){
        var r = ctx.result, a = r && r.assemblyEach;
        return [
          { value:'none',   title:'Price as listed', sub:'No change' },
          { value:'remove', title:'Curb delivery only', sub: a ? '−' + fmt(a) + shareText : 'Customer sets it' },
          { value:'add',    title:'Add our assembly crew', sub: a ? '+' + fmt(a) + shareText + ', separate contract' : 'Separate contract' }
        ];
      } };
  }
  var linesCtl = { key:'customLines', type:'lines', label:'Add-ons and credits', section:'more' };
  var promoCtl = { key:'promo', type:'check', section:'more', label:'Promo: credit the design retainer toward engineering', sub:'The retainer comes off the engineering invoice.' };
  var dryinCtl = { key:'dryin', type:'check', section:'more', label:'Include roof dry-in', sub:'Ice & water shield plus labor to close the roof to weather.' };
  function paidCtls(withEngineering){
    var c = [{ key:'designPaid', type:'check', section:'more', label:'Customer already paid the design retainer', sub:'Shows as PAID and drops off the schedule.' }];
    if(withEngineering) c.push({ key:'engineeringPaid', type:'check', section:'more', label:'Customer already paid engineering', sub:'Shows as PAID and drops off the schedule.' });
    return c;
  }
  function discountCtl(what){
    return { key:'discountPct', type:'number', section:'more', label:'Multi-unit discount', suffix:'% off ' + what, min:0, max:15, step:1, placeholder:'0',
      help:'Up to 15%.', showIf: function(ctx){ return (parseInt(ctx.cfg.units, 10) || 1) > 1; } };
  }
  function snowChoice(){
    return { key:'snow', type:'choices', label:'Snow load', tip:'Ask the building department for the site\'s snow load. Standard covers most of Utah\'s valleys.',
      options: function(ctx){
        var z = ctx.pricing, t = ctx.catalog.type(ctx.type);
        var l1 = ctx.type === 'shell' ? t.snow_tiers.tier1 : z.snow.tier1_label;
        var l2 = ctx.type === 'shell' ? t.snow_tiers.tier2 : z.snow.tier2_label;
        var each = ctx.type === 'modular' ? ' per unit' : ' per home';
        return [
          { value:'standard', title:'Standard', sub: ctx.type === 'shell' ? 'Up to 35 PSF, included' : 'Included' },
          { value:'tier1', title:l1, sub:'+' + fmt(z.snow.tier1) + each },
          { value:'tier2', title:l2.charAt(0).toUpperCase() + l2.slice(1), sub:'+' + fmt(z.snow.tier2) + each }
        ];
      } };
  }
  function milesCtl(from){
    return { key:'miles', type:'number', label:'Delivery distance', suffix: from ? 'miles from ' + from : 'miles to the site', min:0, step:1, placeholder:'0', help:'Leave at 0 if you don\'t know yet.' };
  }

  var TYPES = {
    shell: {
      controls: [
        { key:'units', type:'stepper', label:'How many homes?' },
        milesCtl('Cedar City, UT'),
        snowChoice(),
        assemblyChoice(' per home'),
        { key:'windows', type:'select', section:'more', label:'Windows & doors (optional, core states only)',
          tip:'Window and door packages are available but no longer a standard part of the kit.',
          options: function(ctx){
            var z = ctx.pricing, list = ctx.catalog.type('shell').window_packages;
            return [{ value:'', title:'Not included' }].concat(list.map(function(w){ return { value:w.id, title:w.label + ' (+' + fmt(z.windows[w.id]) + ' per home)' }; }));
          } },
        discountCtl('the kit'),
        { key:'mirroredEngineering', type:'check', section:'more', label:'Some homes are mirrored or changed', sub:'Adds 50% engineering for each extra home.', showIf: function(ctx){ return (parseInt(ctx.cfg.units, 10) || 1) > 1; } },
        dryinCtl, promoCtl
      ].concat(paidCtls(true)).concat([linesCtl]),
      adjust: function(ctx){
        var z = ctx.pricing, t = ctx.catalog.type('shell'), items = [];
        if(ctx.cfg.windows) items.push({ key:'windows', title:'Window & door package (per home)', standard:'Standard ' + fmt(z.windows[ctx.cfg.windows]) });
        items.push({ key:'shipping', title:'Shipping (per home)', standard:'Normally miles × $' + z.ship_per_mile });
        items.push({ key:'design', title:'Design retainer', standard:'Standard ' + fmt(t.design_fee) + ' · enter 0 to waive' });
        return items;
      }
    },

    modular: {
      controls: [
        { key:'units', type:'stepper', label:'How many units?' },
        milesCtl(null),
        snowChoice(),
        assemblyChoice(' per unit'),
        { key:'windows', type:'select', section:'more', label:'Window upgrade',
          showIf: function(ctx){ return ctx.pricing.window_upgrades.length > 0; },
          options: function(ctx){
            var z = ctx.pricing;
            return [{ value:'', title:'Standard: ' + z.standard_windows + ' (included)' }].concat(z.window_upgrades.map(function(w){ return { value:w.id, title:w.label + ' (+' + fmt(w.price) + ' per unit)' }; }));
          } },
        { key:'addons', type:'addonChecks', section:'more', label:'Add-ons', showIf: function(ctx){ return ctx.pricing.addons.length > 0; } },
        discountCtl('the unit price'),
        linesCtl
      ],
      adjust: function(ctx){
        var z = ctx.pricing, items = [{ key:'base', title:'Unit price', standard:'Standard ' + fmt(z.base) + ' per unit' }];
        var up = z.window_upgrades.filter(function(w){ return w.id === ctx.cfg.windows; })[0];
        if(up) items.push({ key:'windows', title:'Window upgrade (per unit)', standard:'Standard ' + fmt(up.price) });
        items.push({ key:'shipping', title:'Shipping (per unit)', standard:'Normally miles × $' + z.ship_per_mile.high });
        return items;
      }
    },

    garage: {
      controls: [
        { key:'units', type:'stepper', label:'How many garages?' },
        { key:'garageUse', type:'choices', label:'Is it going with a Zip Kit home?',
          options: function(ctx){ var t = ctx.catalog.type('garage');
            return [
              { value:'standalone', title:'No, garage only', sub:'Design ' + fmt(t.design_fee.standalone) + ' · ships $' + t.ship_per_mile.standalone + '/mi ($' + t.ship_per_mile.standalone_over_600_miles + ' over 600 mi)' },
              { value:'bundled', title:'Yes, with a home', sub:'Design ' + fmt(t.design_fee.bundled) + ' · ships $' + t.ship_per_mile.bundled + '/mi' }
            ]; } },
        milesCtl('Cedar City, UT'),
        assemblyChoice(' per garage'),
        dryinCtl
      ].concat(paidCtls(false)).concat([linesCtl]),
      adjust: function(ctx){
        var t = ctx.catalog.type('garage');
        var std = ctx.cfg.garageUse === 'bundled' ? t.design_fee.bundled : t.design_fee.standalone;
        return [
          { key:'shipping', title:'Shipping (per garage)', standard:'Normally by the mile' },
          { key:'design', title:'Design & engineering', standard:'Standard ' + fmt(std) + ' · enter 0 to waive' }
        ];
      }
    },

    hangar: {
      controls: [
        { key:'units', type:'stepper', label:'How many hangars?' },
        milesCtl('Cedar City, UT'),
        assemblyChoice(' per hangar'),
        discountCtl('the kit'),
        dryinCtl
      ].concat(paidCtls(false)).concat([linesCtl]),
      adjust: function(ctx){
        var t = ctx.catalog.type('hangar');
        return [
          { key:'base', title:'Hangar kit price (per hangar)', standard:'Starting at ' + fmt(ctx.pricing.kit) },
          { key:'shipping', title:'Shipping (per hangar)', standard:'Normally miles × $' + t.ship_per_mile },
          { key:'design', title:'Design & engineering', standard:'Standard ' + fmt(t.design_fee) + ' · enter 0 to waive' }
        ];
      }
    },

    steel: {
      // Project details are entered on the Product step (no model list).
      project: [
        { key:'projectName', type:'text', label:'Project name', placeholder:'e.g. Ranch shop', full:true },
        { key:'buildCost', type:'number', label:'Frame package price', prefix:'$', min:0, step:'any', placeholder:'From the estimator' },
        { key:'engineering', type:'number', label:'Engineering', prefix:'$', min:0, step:'any', placeholder:'From the engineer', optional:true },
        { key:'sqft', type:'number', label:'Square feet', min:0, step:1, optional:true }
      ],
      controls: [
        milesCtl('Cedar City, UT'),
        { key:'shipRate', type:'number', section:'more', label:'Shipping rate', prefix:'$', suffix:'per mile', min:0, step:'any' },
        assemblyChoice(''),
        { key:'scope', type:'textarea', section:'more', label:'What\'s included', placeholder:'One item per line. Shows on the proposal.', optional:true },
        promoCtl
      ].concat(paidCtls(true)).concat([linesCtl]),
      adjust: function(ctx){
        var t = ctx.catalog.type('steel');
        return [{ key:'design', title:'Design retainer', standard:'Standard ' + fmt(t.design_fee) + ' · enter 0 to waive' }];
      }
    },

    custom: {
      project: [
        { key:'projectName', type:'text', label:'Project name', placeholder:'e.g. The Della', full:true },
        { key:'buildCost', type:'number', label:'Build price', prefix:'$', min:0, step:'any', placeholder:'From the estimator' },
        { key:'engineering', type:'number', label:'Engineering', prefix:'$', min:0, step:'any', placeholder:'From the engineer', optional:true },
        { key:'sqft', type:'number', label:'Square feet', min:0, step:1, optional:true }
      ],
      controls: [
        milesCtl('Cedar City, UT'),
        { key:'designTier', type:'choices', label:'Design retainer',
          options: function(ctx){ var t = ctx.catalog.type('custom').design_tiers;
            return [{ value:'custom', title:'Custom design', sub:fmt(t.custom) }, { value:'standard', title:'Standard design', sub:fmt(t.standard) }]; } },
        assemblyChoice(''),
        { key:'shipRate', type:'number', section:'more', label:'Shipping rate', prefix:'$', suffix:'per mile', min:0, step:'any' },
        { key:'scope', type:'textarea', section:'more', label:'What\'s included', placeholder:'One item per line. Shows on the proposal.', optional:true },
        promoCtl
      ].concat(paidCtls(true)).concat([linesCtl, { key:'customSchedule', type:'schedule', section:'more', label:'Payment schedule' }]),
      adjust: function(ctx){
        var t = ctx.catalog.type('custom'), tier = ctx.cfg.designTier === 'standard' ? 'standard' : 'custom';
        return [{ key:'design', title:'Design retainer', standard:'Standard ' + fmt(t.design_tiers[tier]) + ' · enter 0 to waive' }];
      }
    }
  };

  function visible(c, ctx){ return !c.showIf || c.showIf(ctx); }
  function wrap(c, ctx){
    return '<div class="full" data-ctl="' + c.key + '"' + (visible(c, ctx) ? '' : ' hidden') + '>' + RENDER[c.type](c, ctx) + '</div>';
  }

  // Render the Options form for ctx.type. ctx: { catalog, type, product, pricing, cfg, result, ui }
  // Every control is rendered; ones that don't apply yet are hidden, so the
  // form can be updated in place (see patchOptions) without rebuilding it.
  function renderOptions(ctx){
    var def = TYPES[ctx.type];
    var main = def.controls.filter(function(c){ return c.section !== 'more'; });
    var more = def.controls.filter(function(c){ return c.section === 'more'; });
    var moreUsed = more.filter(function(c){ return visible(c, ctx) && isSet(c, ctx.cfg); }).length;
    var h = '<div class="fields">' + main.map(function(c){ return wrap(c, ctx); }).join('') + '</div>';
    if(more.length){
      h += '<details class="more"' + (ctx.ui.moreOpen || moreUsed ? ' open' : '') + ' data-more="1"><summary>More options' + (moreUsed ? ' <span class="count">(' + moreUsed + ' in use)</span>' : '') + '</summary>'
        + '<div class="fields">' + more.map(function(c){ return wrap(c, ctx); }).join('') + '</div></details>';
    }
    h += adjustBox(def.adjust(ctx), ctx);
    return h;
  }

  // Update the form in place after a change: which controls show, which choice
  // tile is selected, and choice labels that depend on the price (assembly).
  // Never replaces the element the rep is interacting with.
  function patchOptions(ctx, root){
    TYPES[ctx.type].controls.forEach(function(c){
      var box = root.querySelector('[data-ctl="' + c.key + '"]');
      if(!box) return;
      box.hidden = !visible(c, ctx);
      if(c.type === 'choices'){
        if(c.key === 'assembly' && !box.contains(document.activeElement)) box.innerHTML = RENDER.choices(c, ctx);
        else Array.prototype.forEach.call(box.querySelectorAll('.choice'), function(l){
          var inp = l.querySelector('input'); l.classList.toggle('on', String(ctx.cfg[c.key]) === inp.value);
        });
      }
    });
  }
  function renderProject(ctx){
    var def = TYPES[ctx.type];
    return '<div class="fields">' + def.project.map(function(c){ return RENDER[c.type](c, ctx); }).join('') + '</div>';
  }
  function isSet(c, cfg){
    var v = cfg[c.key];
    if(c.type === 'lines' || c.type === 'schedule' || c.type === 'addonChecks') return Array.isArray(c.type === 'addonChecks' ? cfg.addons : v) && (c.type === 'addonChecks' ? cfg.addons : v).length > 0;
    if(c.type === 'check') return !!v;
    if(c.key === 'discountPct') return (parseInt(v, 10) || 0) > 0;
    if(c.key === 'shipRate') return false;
    return v != null && v !== '';
  }
  function adjustItems(ctx){ return TYPES[ctx.type].adjust(ctx); }
  function hasProjectStep(t){ return !!(TYPES[t] && TYPES[t].project); }

  root.ZKOptions = { renderOptions: renderOptions, patchOptions: patchOptions, renderProject: renderProject, adjustItems: adjustItems, hasProjectStep: hasProjectStep, esc: esc };
})(window);
