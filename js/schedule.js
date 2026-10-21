/* Contract payment schedules: presets, amounts, checks, and the printed
   tables and paragraphs. The quote tool's schedule editor and the contract
   generator both use this file, so a contract prints exactly the rows the rep
   saw on screen (Kelsey 2026-10-20/21; wording in docs/simple-sales-tool/
   CONTRACT-WORDING.md).

   A row: { role, title, short, when, pct } or, for kit engineering,
   { role:'engineering', fixed:true, ... }. Text can hold these tokens:
     {n}      this row's payment number      {pct}   this row's percent, e.g. 45%
     {units}  this row's units, e.g. "Units 1–3" (multi-unit modular halves)
   Rows are numbered in order ("Payment 1, 2 …"). A row with numbered:false
   prints its title alone (the kit's "Final Payment — Load Confirmation").

   Amounts: percent rows are figured on the schedule base (kits: the contract
   remainder, Contract Total less Engineering; modular: the contract total).
   Each is rounded to the dollar and the last percent row takes what's left,
   which is the same rounding the contract generator has always used. */
(function(root){
  'use strict';

  function clone(x){ return JSON.parse(JSON.stringify(x)); }
  function num(v){ var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function pctText(p){ return (Math.round(num(p) * 100) / 100) + '%'; }
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmt(n){ return '$' + Math.round(n).toLocaleString('en-US'); }

  // ------------------------------------------------------------------ presets
  // Kit wording is today's Section 5 rows word for word. "home" is the Custom
  // Home contract (also used for garage, hangar and steel for now).
  function kitRows(home){
    var thing = home ? 'Buyer\'s custom Home' : 'Buyer\'s Kit', it = home ? 'the Home' : 'the Kit';
    return [
      { role:'engineering', fixed:true, title:'Engineering', short:'Engineering',
        when:'Due upon execution of this Agreement. Delivers full submit-ready, engineer-stamped ' + (home ? 'custom ' : '') + 'plans within four (4) weeks and reserves Buyer\'s production slot.' },
      { role:'materials', pct:45, title:'Materials Procurement', short:'Materials Procurement',
        when:'{pct} of the contract remainder. Due within ten (10) calendar days of Seller\'s written notice of engineering delivery. Reimburses Seller for lumber, structural components, hardware, and all raw materials procured specifically for ' + thing + ' (non-refundable — see ' + (home ? 'below' : 'Section 5') + ').' },
      { role:'preship', pct:45, title:'Pre-Shipment', short:'Pre-Shipment',
        when:'{pct} of the contract remainder. Due within ten (10) calendar days of Seller\'s written notice of fabrication completion. Seller will not begin loading ' + it + ' until Payment {n} is received in full.' },
      { role:'final', pct:10, numbered:false, title:'Final Payment — Load Confirmation', short:'Final Payment — Load Confirmation',
        when:'{pct} of the contract remainder. Due upon Seller\'s Load Confirmation. Payment Confirmation must be received before the truck departs Seller\'s yard.' }
    ];
  }
  // Modular 5/30/30/30/5. Payment 1 keeps "At project start" until Kelsey
  // confirms Sven's answer on question A.
  var MOD_DESIGN = { role:'design', pct:5, title:'Design & Engineering', short:'Design & Engineering',
    when:'Due at project start to begin design and engineering. Non-refundable once design and engineering work starts.' };
  var MOD_MATERIALS = { role:'materials', pct:30, title:'Materials Procurement', short:'Materials Procurement',
    when:'Due upon execution of this Agreement. Non-refundable.' };
  function modularRows(){
    return [ clone(MOD_DESIGN), clone(MOD_MATERIALS),
      { role:'framing', pct:30, title:'Framing Completion', short:'Framing Completion',
        when:'Within ten (10) calendar days of Seller\'s written invoice at framing completion.' },
      { role:'paint', pct:30, title:'Exterior Siding and Interior Paint Completion', short:'Siding & Paint Completion',
        when:'Within ten (10) calendar days of Seller\'s written invoice. Units are not released for shipment until paid.' },
      { role:'final', pct:5, title:'Final Payment', short:'Final, last unit set',
        when:'Due when the last Modular Unit is set on site.' }
    ];
  }
  // Multi-unit, Sven's order: framing first half, framing last half, then
  // siding and paint first half, last half.
  function multiRows(){
    function framing(h){ return { role:'framing', half:h, pct:15, title:'Framing Completion, {units}', short:'Framing, {units}',
      when:'Within ten (10) calendar days of Seller\'s written invoice at framing completion of {units}.' }; }
    function paint(h){ return { role:'paint', half:h, pct:15, title:'Siding and Paint Completion, {units}', short:'Siding & Paint, {units}',
      when:'Within ten (10) calendar days of Seller\'s written invoice. {units} are not released for shipment until paid.' }; }
    return [ clone(MOD_DESIGN), clone(MOD_MATERIALS), framing('first'), framing('last'), paint('first'), paint('last'),
      { role:'final', pct:5, multi:true, title:'Final Payment', short:'Final, last unit set',
        when:'{pct} plus any approved change orders or invoices not yet paid, after the last Modular Unit is set on site.' }
    ];
  }

  var PRESETS = {
    kit:     { label:'Panelized kit: engineering, then 45 / 45 / 10', rows: function(){ return kitRows(false); } },
    home:    { label:'Engineering, then 45 / 45 / 10', rows: function(){ return kitRows(true); } },
    modular: { label:'Modular: 5 / 30 / 30 / 30 / 5', rows: modularRows },
    multi:   { label:'Modular, more than one unit: 5 / 30 / 15 / 15 / 15 / 15 / 5', rows: multiRows }
  };

  // Which contract a quote becomes, and its starting preset.
  function contractFor(type){
    if(type === 'modular') return 'modular';
    if(type === 'shell') return 'shell';
    return 'custom';          // custom, garage, hangar, steel: the Custom Home contract for now
  }
  function presetsFor(type, units){
    if(type === 'modular') return (units || 1) >= 2 ? ['multi', 'modular'] : ['modular'];
    return [type === 'shell' ? 'kit' : 'home'];
  }
  function defaultPreset(type, units){ return presetsFor(type, units)[0]; }
  function preset(key){ var p = PRESETS[key]; return p ? p.rows() : []; }
  function presetLabel(key){ return PRESETS[key] ? PRESETS[key].label : ''; }
  function isKitStyle(type){ return type !== 'modular'; }

  // A rep's own row.
  function blankRow(){ return { role:'custom', pct:'', title:'', short:'', when:'' }; }

  // ------------------------------------------------------------------ units
  // Odd counts put the extra unit in the first half (Kelsey 2026-10-20).
  function halves(units){
    var u = Math.max(1, parseInt(units, 10) || 1), first = Math.ceil(u / 2);
    return { first: [1, first], last: [Math.min(first + 1, u), u] };
  }
  function unitsLabel(range){
    return range[0] === range[1] ? 'Unit ' + range[0] : 'Units ' + range[0] + '–' + range[1];
  }

  // ------------------------------------------------------------------ text
  function numberRows(rows, skip){
    var n = 0;
    return rows.map(function(r, i){ if(skip && skip[i]) return null; n++; return n; });
  }
  function fill(text, row, n, units){
    var h = row.half ? halves(units)[row.half] : null;
    return String(text == null ? '' : text)
      .replace(/\{n\}/g, String(n))
      .replace(/\{pct\}/g, row.fixed ? '' : pctText(row.pct))
      .replace(/\{units\}/g, h ? unitsLabel(h) : 'the Modular Units');
  }
  // "Payment 2 — Materials Procurement (45%)"
  function rowName(row, n, units, useShort){
    var t = fill(useShort && row.short ? row.short : row.title, row, n, units);
    var head = (row.numbered === false || n == null) ? t : 'Payment ' + n + ' — ' + t;
    return row.fixed ? head : head + ' (' + pctText(row.pct) + ')';
  }

  // ------------------------------------------------------------------ amounts
  // ctx: { base, engineering, promoCredit, engineeringPaid }
  function amounts(rows, ctx){
    var base = num(ctx.base), lastPct = -1, assigned = 0;
    rows.forEach(function(r, i){ if(!r.fixed) lastPct = i; });
    return rows.map(function(r, i){
      if(r.fixed){
        if(ctx.engineeringPaid) return { amount: 0, paid: true, was: num(ctx.engineering) };
        return { amount: Math.max(0, num(ctx.engineering) - num(ctx.promoCredit)), base: num(ctx.engineering), promo: num(ctx.promoCredit) };
      }
      var amt = i === lastPct ? base - assigned : Math.round(base * num(r.pct) / 100);
      assigned += amt;
      return { amount: amt };
    });
  }

  // ------------------------------------------------------------------ checks
  function check(rows){
    var sum = 0, pctRows = 0, problems = [];
    rows.forEach(function(r, i){
      var label = 'Row ' + (i + 1);
      if(!String(r.title || '').trim()) problems.push(label + ' needs a name.');
      if(!String(r.when || '').trim()) problems.push(label + ' needs its "when it\'s due" wording. It prints on the contract.');
      if(!r.fixed){
        pctRows++;
        var p = parseFloat(r.pct);
        if(!(p > 0)) problems.push(label + ' needs a percent above 0.');
        else sum += p;
      }
    });
    sum = Math.round(sum * 100) / 100;
    if(!pctRows) problems.push('Add at least one payment with a percent.');
    var ok = !problems.length && Math.abs(sum - 100) < 0.005;
    return { sum: sum, ok: ok, problems: problems, off: Math.round((100 - sum) * 100) / 100 };
  }
  // True when the rows are a preset exactly as written (some contract notes
  // only print for the standard schedule).
  function isPreset(rows, key){
    var p = preset(key);
    if(p.length !== rows.length) return false;
    return p.every(function(r, i){
      var x = rows[i];
      return x.role === r.role && !!x.fixed === !!r.fixed && (r.fixed || num(x.pct) === num(r.pct)) && x.title === r.title && x.when === r.when && (x.short || '') === (r.short || '');
    });
  }
  // Removing these rows takes a contract clause with them; the editor asks first.
  var CLAUSE_ROLES = {
    materials: 'the non-refundable materials clause',
    preship: 'the "no loading until paid" condition',
    paint: 'the "not released for shipment until paid" clause',
    final: 'the final payment clause'
  };

  // Saved rows -> clean rows (old or hand-edited data can't break a contract).
  function normalize(rows){
    return (Array.isArray(rows) ? rows : []).map(function(r){
      var o = { role: r.role || 'custom', title: String(r.title || ''), short: String(r.short || ''), when: String(r.when || '') };
      if(r.fixed) o.fixed = true; else o.pct = r.pct === '' || r.pct == null ? '' : num(r.pct);
      if(r.numbered === false) o.numbered = false;
      if(r.half === 'first' || r.half === 'last') o.half = r.half;
      if(r.multi) o.multi = true;
      return o;
    });
  }

  // ------------------------------------------------------------------ printing
  // A finished schedule: rows with numbers, names, wording and amounts.
  // sched: { rows, units }, ctx: amounts() context.
  function build(sched, ctx){
    var rows = normalize(sched.rows), units = sched.units || 1, am = amounts(rows, ctx);
    // No engineering on this quote ($0, not already paid): its row doesn't print
    // and the payments after it move up a number (Kelsey 2026-10-21).
    var skip = rows.map(function(r){ return !!(r.fixed && !ctx.engineeringPaid && num(ctx.engineering) === 0); });
    var nums = numberRows(rows, skip);
    return rows.map(function(r, i){
      var a = am[i], n = nums[i];
      return { row: r, n: n, skip: skip[i], title: fill(r.title, r, n, units), name: rowName(r, n, units, false), short: rowName(r, n, units, true),
        when: fill(r.when, r, n, units), amount: a.amount, paid: !!a.paid, was: a.was, promo: a.promo || 0, engBase: a.base || 0,
        units: r.half ? unitsLabel(halves(units)[r.half]) : '' };
    });
  }
  // The rows that print (a $0 engineering row doesn't).
  function printed(built){
    var out = built.filter(function(b){ return !b.skip; });
    out.edited = built.edited || out.length !== built.length;
    return out;
  }
  function numberOf(built, role){ for(var i = 0; i < built.length; i++) if(built[i].row.role === role) return built[i].n; return null; }
  function has(built, role){ return numberOf(built, role) != null; }

  // What the portal stores for invoices: one stage per row, same names and amounts.
  function stages(built){
    return built.filter(function(b){ return !b.paid && !b.skip; }).map(function(b){
      return { key: stageKey(b), name: b.name, desc: b.when, amount: b.amount };
    });
  }
  // The portal's invoice key for a row. "design" is the kit design retainer
  // (paid outside the contract), so the modular Design & Engineering payment
  // gets its own key.
  function stageKey(b){
    var r = b.row;
    if(r.role === 'custom') return 'custom-' + b.n;
    if(r.role === 'design') return 'design-engineering';
    return r.role + (r.half ? '-' + r.half : '');
  }

  // Cover page: short names and amounts (Kelsey, answer E).
  var TD = 'padding:4px 8px;border:1px solid #ccc;';
  function coverTable(built){
    return '<table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:11.5px;">'
      + '<tr><td style="' + TD + 'background:#f5f3ec;font-weight:600;" colspan="2">Estimated Timing &amp; Payment Schedule</td></tr>'
      + built.map(function(b){
          return '<tr><td style="' + TD + '">' + esc(b.short) + '</td><td style="' + TD + 'text-align:right;white-space:nowrap;' + (b.paid ? 'color:#888;' : '') + '">' + (b.paid ? 'PAID' : fmt(b.amount)) + '</td></tr>';
        }).join('')
      + '</table>';
  }

  // Kit / Custom Home Section 5 table (the "grid" style the contract uses).
  function kitTable(built){
    return '<table class="grid">'
      + '<tr><th style="width:32%;">Payment</th><th class="amt" style="width:18%;">Amount</th><th style="width:50%;">When due &amp; what it covers</th></tr>'
      + built.map(function(b){
          if(b.paid) return '<tr><td>' + esc(b.name) + '</td><td class="amt" style="color:#888;">PAID</td><td class="note">Already received · was ' + fmt(b.was) + '</td></tr>';
          var promo = b.promo > 0 ? ' ' + fmt(b.engBase) + ' less ' + fmt(b.promo) + ' design-retainer promo credit.' : '';
          return '<tr><td>' + esc(b.name) + '</td><td class="amt">' + fmt(b.amount) + '</td><td class="note">' + esc(b.when) + promo + '</td></tr>';
        }).join('')
      + '</table>';
  }

  // Paragraphs under the kit table, word for word, each tied to its row.
  function kitParagraphs(built, home){
    var h = '', m = numberOf(built, 'materials');
    if(m != null){
      h += '<h3 class="sub">Materials Procurement &mdash; non-refundable</h3>';
      h += home
        ? '<p>Payment ' + m + ' constitutes reimbursement for materials procured specifically for Buyer\'s custom Home. Upon receipt of Payment ' + m + ', Seller will purchase lumber, structural components, hardware, and all other raw materials required to fabricate Buyer\'s Home to Buyer\'s unique custom specifications. These materials are custom-ordered and cut to specification and cannot be returned to suppliers, resold, or repurposed for another project. Buyer expressly acknowledges and agrees that Payment ' + m + ' represents actual costs incurred by Seller on Buyer\'s behalf and is therefore non-refundable upon receipt.</p>'
        : '<p>Payment ' + m + ' constitutes reimbursement for materials procured specifically for Buyer\'s Kit. Upon receipt of Payment ' + m + ', Seller will purchase lumber, structural components, hardware, and all other raw materials required to fabricate Buyer\'s Kit to Buyer\'s unique floor plan and specifications. These materials are custom-ordered and cut to specification and cannot be returned to suppliers, resold, or repurposed for another project. Buyer expressly acknowledges and agrees that Payment ' + m + ' represents actual costs incurred by Seller on Buyer\'s behalf and is therefore non-refundable upon receipt. In the event Buyer cancels or defaults after Payment ' + m + ' has been received, Seller shall retain Payment ' + m + ' as reimbursement for those actual material costs. If Buyer cancels within seven (7) calendar days of Payment ' + m + ' and before Seller has issued purchase orders for Buyer-specific materials, Seller shall refund Payment ' + m + ' less Seller\'s actual documented costs incurred as of the date of cancellation.</p>';
    }
    if(has(built, 'final')){
      h += '<h3 class="sub">Final Payment &mdash; release of the truck</h3>'
        + '<p>The Final Payment is due upon Seller\'s issuance of Load Confirmation. Before the truck departs Seller\'s yard, Buyer must furnish Payment Confirmation. Seller will not release the truck from the yard until Payment Confirmation is received. Payment Confirmation may be furnished by (i) written confirmation of a wire transfer sufficient for funds to settle no later than the date of Delivery, or (ii) written confirmation that a certified or cashier\'s check will be presented at the project site at Delivery, naming the individual who will present it.</p>';
    }
    h += home
      ? '<p><b>Payment and warranty are independent.</b> Final Payment is not contingent upon the resolution of any outstanding warranty claims or punch list items. Buyer\'s warranty rights under Section 9 are not affected by remitting Final Payment.</p>'
      : '<p><b>Payment and warranty are independent.</b> Final Payment is not contingent upon the resolution of any outstanding warranty claims or punch list items. Buyer\'s warranty rights under Section 9 are not affected by remitting Final Payment. Payment and warranty obligations are independent of one another.</p>';
    return h;
  }

  // Modular Section 4: the table, then a paragraph for every row.
  var P = '<p style="font-size:12px;line-height:1.55;margin:0 0 10px;">';
  var C = 'padding:5px 8px;border:1px solid #ccc;';
  function modularSection(built){
    var h = '<table style="width:100%;border-collapse:collapse;margin:4px 0 12px;font-size:11.5px;">'
      + '<tr><th style="' + C + 'background:#f5f3ec;text-align:left;width:40%;">Payment</th><th style="' + C + 'background:#f5f3ec;text-align:right;width:16%;">Amount</th><th style="' + C + 'background:#f5f3ec;text-align:left;">When due</th></tr>'
      + built.map(function(b){
          return '<tr><td style="' + C + '">' + esc(b.name) + '</td><td style="' + C + 'text-align:right;white-space:nowrap;">' + fmt(b.amount) + '</td><td style="' + C + 'font-size:11px;">' + esc(b.when) + '</td></tr>';
        }).join('')
      + '</table>';
    built.forEach(function(b){ h += modularParagraph(b); });
    return h;
  }
  function modularParagraph(b){
    var r = b.row, n = b.n, pct = pctText(r.pct), u = b.units;
    function head(t){ return P + '<b>Payment ' + n + ' — ' + t + '</b><br>'; }
    if(r.role === 'design') return head('Design and Engineering Payment: ' + pct + ' of the Purchase Price') + 'Due at project start to begin design and engineering. Non-refundable once design and engineering work starts.</p>';
    if(r.role === 'materials') return head('Materials Procurement Payment: ' + pct + ' of the Purchase Price')
      + 'Due upon execution of this Agreement unless otherwise agreed in writing by both Parties. Payment ' + n + ' constitutes reimbursement for materials procured specifically for Buyer\'s Modular Home. Upon execution of this Agreement, Seller will immediately purchase lumber, structural components, hardware, and all other raw materials required to fabricate Buyer\'s Modular Home to Buyer\'s unique floor plan and specifications. These materials are custom-ordered and cut to specification and cannot be returned to suppliers, resold, or repurposed for another project.</p>'
      + P + 'Buyer expressly acknowledges and agrees that Payment ' + n + ' represents actual costs incurred by Seller on Buyer\'s behalf and is therefore non-refundable upon execution. This payment is not a penalty, earnest money, or speculative deposit — it reflects the direct cost of materials that Seller has procured exclusively for Buyer\'s project. In the event Buyer cancels or defaults after execution, Seller shall retain Payment ' + n + ' as reimbursement for those actual material costs. This payment is non-refundable except as expressly provided in the Seller default provisions of Section 11.</p>';
    if(r.role === 'framing') return u
      ? head('Framing Completion Payment, ' + u + ': ' + pct + ' of the Purchase Price') + 'Due upon completion of framing of Modular ' + u + '. Seller shall provide Buyer with written notice and invoice when framing is complete. Buyer agrees to make Payment ' + n + ' within ten (10) calendar days of receiving Seller\'s written invoice.</p>'
      : head('Framing Completion Payment: ' + pct + ' of the Purchase Price') + 'Due upon completion of framing of the Modular Units. Seller shall provide Buyer with written notice and invoice when framing is complete. Buyer agrees to make Payment ' + n + ' within ten (10) calendar days of receiving Seller\'s written invoice.</p>';
    if(r.role === 'paint') return u
      ? head('Exterior Siding and Interior Paint Completion Payment, ' + u + ': ' + pct + ' of the Purchase Price') + 'Due upon completion of exterior siding and interior paint on Modular ' + u + '. Seller shall provide Buyer with written notice and invoice when this milestone is complete. Buyer agrees to make Payment ' + n + ' within ten (10) calendar days of receiving Seller\'s written invoice. Seller shall not release Modular ' + u + ' for shipment until Payment ' + n + ' is received in full.</p>'
      : head('Exterior Siding and Interior Paint Completion Payment: ' + pct + ' of the Purchase Price') + 'Due upon completion of exterior siding and interior paint on the Modular Units. Seller shall provide Buyer with written notice and invoice when this milestone is complete. Buyer agrees to make Payment ' + n + ' within ten (10) calendar days of receiving Seller\'s written invoice. Seller shall not release the Modular Units for shipment until Payment ' + n + ' is received in full.</p>';
    if(r.role === 'final') return head('Final Payment: ' + pct + ' of the Purchase Price' + (r.multi ? ', plus any approved change orders or invoices not yet paid' : ''))
      + 'Due and payable on-site when the last Modular Unit is set on site. Payment shall be made by wire transfer or check, payable to {{SELLER_NAME}}, and delivered to Seller\'s crew leader on the day the last Modular Unit is set. Before Seller\'s crew departs, Buyer or Buyer\'s general contractor shall conduct an on-site walkthrough with Seller\'s crew leader to confirm that Seller\'s scope of work has been completed. Buyer is required to schedule any required local jurisdictional inspections in a timely manner; failure to do so is solely the responsibility of Buyer. Final payment is not contingent upon the resolution of any outstanding warranty claims or punch list items. The existence of any warranty items or items requiring a return visit by Seller shall not delay, reduce, or offset Buyer\'s obligation to remit final payment in full. Seller acknowledges its warranty obligations and will schedule a return visit to address any valid warranty items submitted in writing by Buyer in accordance with Section 9. Payment and warranty obligations are independent of one another.</p>';
    // A payment the rep added: its own heading and wording.
    return head(esc(fill(r.title, r, n, 1)) + ': ' + pct + ' of the Purchase Price') + esc(b.when) + '</p>';
  }

  var api = {
    PRESETS: PRESETS, CLAUSE_ROLES: CLAUSE_ROLES,
    contractFor: contractFor, presetsFor: presetsFor, defaultPreset: defaultPreset, preset: preset, presetLabel: presetLabel,
    isKitStyle: isKitStyle, blankRow: blankRow, halves: halves, unitsLabel: unitsLabel,
    amounts: amounts, check: check, isPreset: isPreset, normalize: normalize, build: build, printed: printed, stages: stages, stageKey: stageKey,
    numberOf: numberOf, coverTable: coverTable, kitTable: kitTable, kitParagraphs: kitParagraphs, modularSection: modularSection,
    pctText: pctText
  };
  (root.ZK = root.ZK || {}).Schedule = api;
})(typeof window !== 'undefined' ? window : this);
