/* Customer documents: Ballpark estimate (1 page, range-priced) and Proposal.
   Ported from the old tool's generatePreliminaryEstimate() / generateProposal(),
   with the same wording, except where noted for Zip Kit modular. Returns full
   HTML pages; the caller opens them in a new window. */
(function(root){
  'use strict';
  var fmt = function(n){ return root.ZK.Pricing.fmt(n); };
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  // Photos use the document-size copy where one is configured (ZK.photo).
  function absUrl(path){ return new URL(root.ZK.photo ? root.ZK.photo(path, 'doc') : path, root.location.href).href; }

  var SCOPE = {
    'Shell Kit': {
      included: ['Pre-framed wall, floor, and roof panels','Zip Wall sheathing with taped seams','All structural posts, beams, headers, and metal hardware','All windows and exterior entry doors (with selected window package)','Standard interior stairs','Labor to set and erect panels, framing, trusses, window/door install','Shipping to the job site'],
      notIncluded: ['Foundation','Crane to set panels (scheduled by GC)','Roof sheathing dry-in (ice & water shield + labor)','Siding — materials and installation','Finished roofing (metal, shingles, etc.)','Mechanical, electrical, plumbing — materials and labor','Insulation, drywall, and interior finishes','General Contractor fee / profit','Sales tax']
    },
    'Modular': {
      included: ['Completed move-in-ready modular unit','Architectural design and full engineering','Standard window and exterior door package','Interior finishes — cabinets, countertops, flooring, fixtures','Mechanical, electrical, plumbing fully installed','Appliances per standard spec'],
      notIncluded: ['Site prep and foundation','Crane set on site','Shipping (billed per mile — see pricing breakdown)','Utility connections (water, sewer, power, gas)','Building permits and inspections','Sales tax']
    },
    'Garage': {
      included: ['Pre-framed 2×6 panel shell','Design and engineering','Shipping to the job site'],
      notIncluded: ['Foundation','Garage doors','Windows and exterior entry doors','Roof sheathing dry-in (ice & water shield + labor)','Siding and finished roofing','Mechanical, electrical, plumbing','Interior finishes','Sales tax']
    },
    'Hangar': {
      included: ['Pre-framed hangar shell — walls, roof panels, structural components','Zip Wall sheathing with taped seams','All structural posts, beams, headers, and metal hardware','Design and engineering (stamped)','Shipping to the job site'],
      notIncluded: ['Foundation and slab','Crane to set panels (scheduled by GC)','Hangar door (bifold, sliding, or hydraulic — supplied separately)','Personnel windows and entry doors','Roof sheathing dry-in (ice & water shield + labor)','Siding and finished roofing','Insulation, drywall, and interior finishes','Mechanical, electrical, plumbing — materials and labor','Aviation-specific items (hangar door hardware, fire suppression, lighting)','Snow load engineering beyond model default','Sales tax']
    }
  };
  var DRYIN = {
    'Shell Kit': ['Roof sheathing and ice & water shield dry-in','Labor to install roof dry-in (ice & water shield + close-to-weather)'],
    'Garage':    ['Roof sheathing and ice & water shield dry-in','Labor to install roof dry-in'],
    'Hangar':    ['Roof sheathing and ice & water shield dry-in','Labor to install roof dry-in']
  };
  var KIND_PHOTO = { 'Custom Home': 'photos/customhome.jpg', 'Steel Frame': 'photos/steelhouse.jpg' };

  function scopeFor(q){
    if(q.kind === 'Custom Home' || q.kind === 'Steel Frame'){
      var line = q.kind === 'Steel Frame'
        ? 'Light-gauge steel frame package per design specifications'
        : 'Full custom build per design specifications';
      return { included: (q.customScope && q.customScope.length) ? q.customScope.slice() : [line],
        notIncluded: ['Anything not specifically listed above','Site prep and foundation','Utility connections','Building permits and inspections','Sales tax'] };
    }
    var s = SCOPE[q.kind] || SCOPE['Shell Kit'];
    // Stairs print only for kit models that have them (js/kit-scope.js), same as
    // the contract. Set-and-erect labor is ours only when our crew is added.
    if(s === SCOPE['Shell Kit']){
      var stairs = !!(root.ZK.KitScope && root.ZK.KitScope.has(q.model, 'stairs')), crew = !!(q.assembly && q.assembly.mode === 'added');
      s = { included: s.included.filter(function(t){
          if(t === 'Standard interior stairs') return stairs;
          if(t.indexOf('Labor to set and erect panels') === 0) return crew;
          return true;
        }), notIncluded: s.notIncluded };
    }
    if(q.dryin && DRYIN[q.kind]){
      return { included: s.included.concat(DRYIN[q.kind]),
        notIncluded: s.notIncluded.filter(function(t){ var l = t.toLowerCase(); return l.indexOf('dry-in') === -1 && l.indexOf('dry in') === -1; }) };
    }
    return { included: s.included.slice(), notIncluded: s.notIncluded.slice() };
  }

  // Price lines as table rows with inline styles (documents can't see the tool's CSS).
  function priceRows(r, size){
    var fs = size || 13;
    return r.lines.map(function(l){
      var amt = l.kind === 'note' ? '<span style="color:#9c9789;font-weight:400;">' + esc(l.text) + '</span>'
        : (l.kind === 'credit' ? '<span style="color:#0f6e56;">−' + fmt(l.amount) + '</span>' : fmt(l.amount));
      return '<tr><td style="padding:' + (fs > 12 ? '8px 0' : '4px 6px') + ';border-bottom:1px solid #f0eee7;vertical-align:top;font-size:' + fs + 'px;">' + esc(l.label)
        + (l.sub ? '<div style="font-size:' + (fs - 2) + 'px;color:#5f5e5a;margin-top:1px;line-height:1.3;">' + esc(l.sub) + '</div>' : '') + '</td>'
        + '<td style="padding:' + (fs > 12 ? '8px 0' : '4px 6px') + ';border-bottom:1px solid #f0eee7;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;vertical-align:top;font-size:' + fs + 'px;">' + amt + '</td></tr>';
    }).join('');
  }

  function brandColors(b){ return { main: b.colors.main, dark: b.colors.dark }; }
  function logoBlock(b, h){
    return '<img src="' + esc(absUrl(b.logo)) + '" alt="' + esc(b.name) + '" style="height:' + h + 'px;" onerror="this.style.display=\'none\';">';
  }
  function printButton(color, label){
    return '<div style="text-align:center; padding:20px;" class="noprint"><button onclick="window.print()" style="padding:10px 28px; font-size:14px; background:' + color + '; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:600;">' + (label || 'Print / Save as PDF') + '</button></div>';
  }

  // d: { result, schedule, customer, rep, brand, number, date, range:{low,high}, projectName }
  function ballpark(d){
    var r = d.result, q = r.quote, b = d.brand, c = brandColors(b), cust = d.customer, rep = d.rep || {};
    var isModular = q.kind === 'Modular';
    var buildingType = q.kind + (isModular ? ' (factory-built, delivered move-in ready)'
      : q.kind === 'Steel Frame' ? ' (light-gauge steel frame package)'
      : q.kind === 'Custom Home' ? ' (custom-designed panelized home)'
      : ' (pre-framed panelized ' + (q.kind === 'Shell Kit' ? 'shell kit' : q.kind === 'Garage' ? 'garage' : q.kind === 'Hangar' ? 'hangar' : 'kit') + ')');
    var scope = scopeFor(q).included;
    var scopeCapped = scope.length > 8 ? scope.slice(0, 8) : scope;
    var asmNote = (q.assembly && q.assembly.mode === 'added') ? 'Site assembly is included in this estimate range and will be billed on a separate assembly contract.'
      : (q.assembly && q.assembly.mode === 'removed') ? 'Site assembly is NOT included — customer takes curb delivery and arranges own site set.'
      : 'Site assembly is optional and quoted on a separate assembly contract. Ask your sales rep for the assembly range.';
    var location = [cust.city, cust.state].filter(Boolean).join(', ');
    var feesLine = isModular ? 'Design and engineering are included in the modular price.' : 'Design retainer and engineering fees are separate and paid up front.';
    var css = '@page{size:letter;margin:0.4in;}@media print{.noprint{display:none;} body{-webkit-print-color-adjust:exact; print-color-adjust:exact;}}';
    var html = ''
      + '<div style="max-width:780px; margin:0 auto; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#1c1c1a; padding:0;">'
      + '<div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1c1c1a; padding-bottom:10px;">'
      + '<div>' + logoBlock(b, 42) + '<div style="font-size:10.5px; color:#5f5e5a; margin-top:4px; line-height:1.45;">' + esc(b.address) + '<br>' + esc(b.phone) + ' &nbsp;|&nbsp; ' + esc(b.email) + '</div></div>'
      + '<div style="text-align:right;"><div style="font-size:20px; font-weight:700; letter-spacing:-0.02em; color:' + c.dark + ';">PRELIMINARY ESTIMATE</div><div style="font-size:10px; color:#5f5e5a; margin-top:2px; text-transform:uppercase; letter-spacing:0.05em;">For budgetary purposes only</div><div style="font-size:10.5px; color:#5f5e5a; margin-top:3px;">' + (d.number ? '#' + esc(d.number) + ' &middot; ' : '') + esc(d.date) + '</div></div>'
      + '</div>'
      + '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; font-size:11px;">'
      + '<div style="background:#faf9f5; padding:8px 12px; border-radius:6px;"><div style="color:#888; text-transform:uppercase; font-size:9.5px; letter-spacing:0.05em;">Prepared for</div>'
      + '<div style="font-size:14px; font-weight:600; line-height:1.25; margin-top:2px;">' + esc(cust.name) + '</div>'
      + (location ? '<div style="color:#5f5e5a; font-size:10.5px; margin-top:1px;">' + esc(location) + '</div>' : '')
      + (cust.email ? '<div style="color:#5f5e5a; font-size:10.5px;">' + esc(cust.email) + '</div>' : '')
      + (cust.phone ? '<div style="color:#5f5e5a; font-size:10.5px;">' + esc(cust.phone) + '</div>' : '')
      + '</div>'
      + '<div style="background:#faf9f5; padding:8px 12px; border-radius:6px;"><div style="color:#888; text-transform:uppercase; font-size:9.5px; letter-spacing:0.05em;">Project</div>'
      + '<div style="font-size:14px; font-weight:600; line-height:1.25; margin-top:2px;">' + esc(d.projectName) + '</div>'
      + '<div style="color:#5f5e5a; font-size:10.5px; margin-top:1px;">' + esc(q.model) + (q.units > 1 ? ' × ' + q.units : '') + ' &middot; ' + esc(buildingType) + '</div>'
      + (d.shipsFrom && !isModular ? '<div style="color:#5f5e5a; font-size:10.5px;">Manufactured at <b>' + esc(d.shipsFrom) + '</b></div>' : '')
      + '</div></div>'
      + '<div style="text-align:center; margin-top:12px; padding:12px 14px; background:linear-gradient(135deg, ' + c.main + ', ' + c.dark + '); color:#fff; border-radius:7px;">'
      + '<div style="font-size:10.5px; text-transform:uppercase; letter-spacing:0.12em; opacity:0.9;">Estimated project range</div>'
      + '<div style="font-size:28px; font-weight:700; margin-top:4px; letter-spacing:-0.02em; line-height:1.15;">' + fmt(d.range.low) + ' &nbsp;&mdash;&nbsp; ' + fmt(d.range.high) + '</div>'
      + '<div style="font-size:10.5px; margin-top:3px; opacity:0.85;">Ballpark for budgetary planning &middot; not a formal quote or contract</div></div>'
      + '<div style="margin-top:12px; border:1px solid #e2e0d8; border-radius:6px; padding:8px 12px;">'
      + '<div style="display:flex; justify-content:space-between; align-items:baseline;"><div style="font-size:10.5px; text-transform:uppercase; letter-spacing:0.05em; color:#888;">Included in this range</div><div style="font-size:9.5px; color:#888; font-style:italic;">Line items shown as the basis for the range above</div></div>'
      + '<table style="width:100%; border-collapse:collapse; margin-top:4px; color:#1c1c1a;"><tbody>' + priceRows(r, 11) + '</tbody>'
      + '<tfoot><tr style="border-top:1.5px solid #1c1c1a;"><td style="padding:5px 4px 2px; font-weight:700; font-size:11px;">Total (basis for range)</td><td style="padding:5px 4px 2px; text-align:right; font-weight:700; font-size:11px;">' + fmt(q.total) + '</td></tr></tfoot></table>'
      + '<ul style="margin:6px 0 0;padding:0 0 0 16px;font-size:10.5px;color:#5f5e5a;line-height:1.4;columns:2;column-gap:18px;">' + scopeCapped.map(function(t){ return '<li style="margin-bottom:1px;break-inside:avoid;">' + esc(t) + '</li>'; }).join('') + '</ul>'
      + '<div style="font-size:10.5px; color:#5f5e5a; margin-top:8px; padding-top:6px; border-top:1px solid #f0eee7; line-height:1.45;"><b>Assembly:</b> ' + esc(asmNote) + '</div></div>'
      + '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px; font-size:11px;">'
      + '<div style="border:1px solid #e2e0d8; border-radius:6px; padding:8px 12px;"><div style="color:#888; text-transform:uppercase; font-size:9.5px; letter-spacing:0.05em; margin-bottom:4px;">Ideal construction start</div><div style="border-bottom:1px solid #1c1c1a; height:22px;"></div><div style="font-size:9.5px; color:#888; margin-top:3px;">When the buyer plans to break ground</div></div>'
      + '<div style="border:1px solid #e2e0d8; border-radius:6px; padding:8px 12px;"><div style="color:#888; text-transform:uppercase; font-size:9.5px; letter-spacing:0.05em; margin-bottom:4px;">Attached plans / sketches</div><div style="font-size:10.5px; color:#5f5e5a;"><b>_____</b> page(s) of concept sketches, floor plans, or reference photos attached.</div></div>'
      + '</div>'
      + '<div style="margin-top:10px; background:#f5f3ec; border-left:3px solid #5f5e5a; border-radius:4px; padding:8px 12px; font-size:10px; color:#5f5e5a; line-height:1.5;">'
      + '<b style="text-transform:uppercase; letter-spacing:0.05em; color:#1c1c1a;">Important &mdash; this is a preliminary estimate.</b> '
      + 'Ballpark range for budgetary purposes only &mdash; <b>not a formal proposal, quote, or contract</b>. '
      + 'Actual pricing is set after design finalization, engineering, and confirmed specifications (windows, doors, snow load, etc.). '
      + 'Change orders, upgrades, or custom scope may adjust final pricing outside this range. '
      + 'Valid for 30 days from the date above; material pricing is subject to market fluctuation. '
      + esc(feesLine) + '</div>'
      + '<div style="margin-top:10px; background:#fff7e6; border-left:3px solid ' + c.main + '; border-radius:4px; padding:8px 12px; font-size:10.5px; color:#1c1c1a; line-height:1.5;">'
      + '<b style="text-transform:uppercase; letter-spacing:0.05em; color:' + c.dark + ';">Next steps</b> &nbsp; '
      + '<b>1.</b> Finalize your design (Design Intake) &nbsp; <b>2.</b> Confirm specs and selections &nbsp; <b>3.</b> Prepare site and financing &nbsp; <b>4.</b> Receive your formal proposal with a firm price and payment schedule</div>'
      + '<div style="margin-top:12px; border-top:2px solid #1c1c1a; padding-top:8px;">'
      + '<div style="font-size:10.5px; color:#5f5e5a; margin-bottom:8px; line-height:1.5;">By signing below, I acknowledge that this is a preliminary estimate for budgetary purposes only, and I would like to move forward with the design phase.</div>'
      + '<div style="display:grid; grid-template-columns:1.5fr 1fr 1fr; gap:14px; font-size:10px;">'
      + '<div><div style="border-bottom:1px solid #1c1c1a; height:24px;"></div><div style="color:#888; margin-top:2px;">Buyer signature</div></div>'
      + '<div><div style="border-bottom:1px solid #1c1c1a; height:24px;"></div><div style="color:#888; margin-top:2px;">Printed name</div></div>'
      + '<div><div style="border-bottom:1px solid #1c1c1a; height:24px;"></div><div style="color:#888; margin-top:2px;">Date</div></div>'
      + '</div></div>'
      + (rep.name ? '<div style="margin-top:8px; padding-top:5px; border-top:1px solid #e2e0d8; font-size:9.5px; color:#888; text-align:center;">Prepared by <b>' + esc(rep.name) + '</b>' + (rep.email ? ' &middot; ' + esc(rep.email) : '') + (rep.phone ? ' &middot; ' + esc(rep.phone) : '') + '</div>' : '')
      + '</div>';
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preliminary Estimate — ' + esc(cust.name) + '</title><style>' + css + '</style></head><body style="margin:0; background:#fff;">'
      + html + printButton(c.main) + '</body></html>';
  }

  function proposal(d){
    var r = d.result, q = r.quote, b = d.brand, c = brandColors(b), cust = d.customer, rep = d.rep || {};
    var isModular = q.kind === 'Modular';
    var scope = scopeFor(q);
    var location = [cust.city, cust.state].filter(Boolean).join(', ');
    var photo = absUrl(d.photo || KIND_PHOTO[q.kind] || 'photos/customhome.jpg');
    var rows = priceRows(r, 13);
    if(r.promoCredit > 0){
      rows += '<tr><td style="padding:8px 0;border-bottom:1px solid #f0eee7;color:#0f6e56;font-size:13px;"><b>Promo: design retainer credited toward engineering</b><div style="font-size:11px;color:#0f6e56;">limited-time credit applied at proposal</div></td><td style="padding:8px 0;border-bottom:1px solid #f0eee7;text-align:right;color:#0f6e56;font-weight:600;font-size:13px;">-' + fmt(r.promoCredit) + '</td></tr>';
    }
    var displayedTotal = r.displayedTotal;
    var sched = d.schedule, schedTotal = sched.reduce(function(a, s){ return a + (s.paid ? 0 : s.amount); }, 0);
    var schedRows = sched.map(function(s){
      return '<tr><td style="padding:9px 12px; border-bottom:1px solid #eee;">' + esc(s.name) + '<div style="font-size:11px;color:#888;margin-top:2px;">' + esc(s.desc) + '</div></td><td style="padding:9px 12px; text-align:right; border-bottom:1px solid #eee; font-weight:500;' + (s.paid ? ' color:#888;' : '') + '">' + (s.paid ? 'PAID' : fmt(s.amount)) + '</td></tr>';
    }).join('');
    var asmAdded = q.assembly && q.assembly.mode === 'added', asmRemoved = q.assembly && q.assembly.mode === 'removed';
    // Zip Kit modular has no separate engineering invoice: design and engineering are the 5% first payment.
    var acceptText = isModular
      ? 'to accept. We\'ll send the contract for signature and the first invoice (Design &amp; Engineering, 5%) — production scheduling begins once the contract is executed and that payment clears.'
      : 'to accept. We\'ll send the contract for signature and the engineering invoice — production scheduling begins once the contract is executed and the engineering payment clears.';
    var coverText = isModular
      ? 'This proposal reflects the scope and pricing for your modular home. It is valid for thirty (30) days from the date above; once a contract is signed, pricing is locked for nine (9) months. Reply to this proposal to move forward — we\'ll prepare the contract for your signature and the first invoice to release production.'
      : 'This proposal reflects the final scope and pricing developed during your design phase. It is valid for thirty (30) days from the date above; once a contract is signed, pricing is locked for nine (9) months. Reply to this proposal to move forward — we\'ll prepare the contract for your signature and the engineering invoice to release production.';
    var html = ''
      + '<div style="max-width:780px; margin:0 auto; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#1c1c1a;">'
      // Cover
      + '<div style="page-break-after:always; padding:32px;">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">' + logoBlock(b, 72)
      + '<div style="text-align:right; font-size:11px; color:#888; text-transform:uppercase; letter-spacing:0.08em;">Proposal · ' + esc(d.number || 'Draft') + '</div></div>'
      + '<div style="position:relative; width:100%; aspect-ratio:16/9; background:linear-gradient(135deg, ' + c.main + ', ' + c.dark + '); border-radius:8px; overflow:hidden;">'
      + '<img src="' + esc(photo) + '" alt="" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.style.display=\'none\';">'
      + '<div style="position:absolute; left:0; bottom:0; width:100%; box-sizing:border-box; background:linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0)); padding:80px 28px 24px; color:#fff;">'
      + '<div style="font-size:13px; text-transform:uppercase; letter-spacing:0.12em; opacity:0.85; margin-bottom:8px;">Proposal prepared for</div>'
      + '<div style="font-size:30px; font-weight:700; line-height:1.15;">' + esc(cust.name) + '</div>'
      + (location ? '<div style="font-size:15px; margin-top:4px; opacity:0.92;">' + esc(location) + '</div>' : '')
      + '<div style="font-size:14px; margin-top:8px; opacity:0.92;">' + esc(q.kind) + ' · ' + esc(q.model) + (q.units > 1 ? ' × ' + q.units : '') + ' · ' + esc(d.date) + '</div>'
      + '</div></div>'
      + '<div style="margin-top:28px; display:flex; justify-content:space-between; font-size:13px; gap:20px;">'
      + '<div><div style="color:#888; text-transform:uppercase; font-size:11px; letter-spacing:0.05em;">From</div>'
      + '<div style="font-weight:600; font-size:15px; margin-top:4px;">' + esc(b.name) + '</div>'
      + '<div style="color:#555; margin-top:2px;">' + esc(b.address) + '</div><div style="color:#555;">' + esc(b.phone) + ' · ' + esc(b.email) + '</div>'
      + (rep.name ? '<div style="color:#555; margin-top:6px;">Sales rep: <b>' + esc(rep.name) + '</b></div>' : '') + '</div>'
      + '<div style="text-align:right;"><div style="color:#888; text-transform:uppercase; font-size:11px; letter-spacing:0.05em;">Project total</div>'
      + '<div style="font-size:32px; font-weight:700; color:' + c.main + '; margin-top:4px;">' + fmt(displayedTotal) + '</div>'
      + (r.promoCredit > 0 ? '<div style="color:#0f6e56; font-size:11px; margin-top:2px; font-weight:600;">includes ' + fmt(r.promoCredit) + ' promo credit</div>' : '')
      + (q.units > 1 ? '<div style="color:#888; font-size:12px;">' + fmt(displayedTotal / q.units) + ' per unit</div>' : '')
      + '</div></div>'
      + '<div style="margin-top:26px; background:#f5f3ec; border-radius:8px; padding:16px 20px; font-size:13px; color:#5f5e5a; line-height:1.6;">' + coverText + '</div>'
      + '</div>'
      // Detail
      + '<div style="padding:32px;">'
      + '<div style="border-bottom:2px solid #1c1c1a; padding-bottom:14px; margin-bottom:22px;"><div style="font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:#888;">Project details</div><div style="font-size:22px; font-weight:700; margin-top:4px;">' + esc(d.projectName) + '</div></div>'
      + '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:28px; font-size:13px;">'
      + '<div style="background:#faf9f5; padding:14px 16px; border-radius:8px;"><div style="color:#888; text-transform:uppercase; font-size:11px; letter-spacing:0.05em;">Buyer</div><div style="font-weight:500; margin-top:4px;">' + esc(cust.name) + '</div>'
      + (cust.email ? '<div style="color:#555; font-size:12px; margin-top:2px;">' + esc(cust.email) + '</div>' : '')
      + (cust.phone ? '<div style="color:#555; font-size:12px;">' + esc(cust.phone) + '</div>' : '')
      + (location ? '<div style="color:#555; font-size:12px;">' + esc(location) + '</div>' : '') + '</div>'
      + '<div style="background:#faf9f5; padding:14px 16px; border-radius:8px;"><div style="color:#888; text-transform:uppercase; font-size:11px; letter-spacing:0.05em;">Model</div><div style="font-weight:500; margin-top:4px;">' + esc(q.model) + (q.units > 1 ? ' × ' + q.units : '') + '</div><div style="color:#555; font-size:12px; margin-top:2px;">' + esc(q.kind) + '</div></div>'
      + '</div>'
      + '<h3 style="font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:#1c1c1a; border-bottom:2px solid #1c1c1a; padding-bottom:6px; margin:0 0 14px;">Pricing breakdown</h3>'
      + '<table style="width:100%; border-collapse:collapse; margin-bottom:18px;"><tbody>' + rows + '</tbody></table>'
      + (asmAdded
        ? '<div style="border-top:2px solid #1c1c1a; padding-top:12px; margin-bottom:30px; font-size:13px;">'
          + '<div style="display:flex; justify-content:space-between; padding:2px 0; color:#5f5e5a;"><span>Manufacturing subtotal <span style="font-size:11px; color:#888;">(billed by ' + esc(b.name) + ')</span></span><span style="font-family:menlo,consolas,monospace;">' + fmt(displayedTotal - q.assembly.amount) + '</span></div>'
          + '<div style="display:flex; justify-content:space-between; padding:2px 0; color:#5f5e5a;"><span>Site assembly <span style="font-size:11px; color:#888;">(billed on a separate assembly contract)</span></span><span style="font-family:menlo,consolas,monospace;">' + fmt(q.assembly.amount) + '</span></div>'
          + '<div style="display:flex; justify-content:space-between; padding:8px 0 0; margin-top:6px; border-top:1px solid #1c1c1a; font-size:15px; font-weight:700;"><span>Combined total <span style="font-size:11px; font-weight:400; color:#888;">(two contracts)</span></span><span style="color:' + c.main + '; font-size:22px;">' + fmt(displayedTotal) + '</span></div></div>'
        : '<div style="display:flex; justify-content:flex-end; border-top:2px solid #1c1c1a; padding-top:12px; margin-bottom:30px;"><div style="font-size:14px; color:#555; margin-right:18px; align-self:center;">Project total</div><div style="font-size:26px; font-weight:700; color:' + c.main + ';">' + fmt(displayedTotal) + '</div></div>')
      + '<div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:30px;">'
      + '<div><h3 style="font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:#0f6e56; border-bottom:2px solid #0f6e56; padding-bottom:6px; margin:0 0 12px;">What\'s included</h3><ul style="margin:0; padding-left:18px; font-size:12px; color:#1c1c1a; line-height:1.7;">' + scope.included.map(function(t){ return '<li style="margin-bottom:5px;">' + esc(t) + '</li>'; }).join('') + '</ul></div>'
      + '<div><h3 style="font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:#854f0b; border-bottom:2px solid #854f0b; padding-bottom:6px; margin:0 0 12px;">Not included</h3><ul style="margin:0; padding-left:18px; font-size:12px; color:#5f5e5a; line-height:1.7;">' + scope.notIncluded.map(function(t){ return '<li style="margin-bottom:5px;">' + esc(t) + '</li>'; }).join('') + '</ul></div>'
      + '</div>'
      + '<div style="page-break-before:always; break-before:page; padding-top:8px;">'
      + '<h3 style="font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:#1c1c1a; border-bottom:2px solid #1c1c1a; padding-bottom:6px; margin:0 0 14px;">Payment schedule <span style="font-size:11px; font-weight:400; color:#888; text-transform:none; letter-spacing:0;">' + (asmAdded ? '· manufacturing contract only' : '') + '</span></h3>'
      + '<table style="width:100%; border-collapse:collapse; font-size:13px; page-break-inside:avoid; break-inside:avoid;"><tbody>' + schedRows
      + '<tr><td style="padding:10px 12px; font-weight:700;">Total</td><td style="padding:10px 12px; text-align:right; font-weight:700;">' + fmt(schedTotal) + '</td></tr></tbody></table>'
      + (asmAdded
        ? '<div style="margin-top:14px; padding:12px 16px; background:#fff7e6; border-left:3px solid #d85a30; border-radius:4px; font-size:12px; color:#5f5e5a; line-height:1.6;"><b style="color:#993c1d;">Site assembly (' + fmt(q.assembly.amount) + ') is billed on a separate assembly contract</b> and is <b>not included</b> in the schedule above. The manufacturing contract and payment schedule shown here cover our scope through curb delivery. Site set and assembly are covered by a separate assembly contract with its own scope, deliverables, and payment terms — you\'ll receive that contract alongside this one.</div>'
        : (asmRemoved ? '<div style="margin-top:14px; padding:12px 16px; background:#f5f3ec; border-left:3px solid #888; border-radius:4px; font-size:12px; color:#5f5e5a; line-height:1.6;"><b>Curb delivery only</b> — this proposal excludes site assembly. Our scope ends when the kit is delivered to the curb; the customer is responsible for site set and assembly.</div>' : ''))
      + '</div>'
      + '<div style="margin-top:30px; background:' + c.main + '; color:#fff; padding:22px 24px; border-radius:8px;">'
      + '<div style="font-size:13px; text-transform:uppercase; letter-spacing:0.08em; opacity:0.85;">Next steps</div>'
      + '<div style="font-size:16px; margin-top:8px; line-height:1.5;">Reply to ' + esc(rep.email || b.email) + ' or call ' + esc(rep.phone || b.phone) + ' ' + acceptText + '</div>'
      + (rep.name ? '<div style="font-size:13px; margin-top:10px; opacity:0.9;">Your contact: ' + esc(rep.name) + (rep.email ? ' · ' + esc(rep.email) : '') + (rep.phone ? ' · ' + esc(rep.phone) : '') + '</div>' : '')
      + '</div>'
      + '<div style="margin-top:24px; font-size:11px; color:#888; line-height:1.6; border-top:1px solid #e2e0d8; padding-top:14px;">This proposal is valid for thirty (30) days from the proposal date. Once a contract is signed, pricing is locked for nine (9) months. Pricing may change due to material costs or scope adjustments if not signed within the proposal window. Items in the "Not included" list are the buyer\'s responsibility unless added in writing. Shipping is calculated to the address provided. Sales tax is not included. Final contract terms will govern in the event of conflict with this proposal.</div>'
      + '</div></div>';
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Proposal ' + esc(d.number || 'Draft') + ' — ' + esc(cust.name) + '</title></head><body style="margin:0; background:#fff;">'
      + html + printButton(c.main) + '<style>@media print{.noprint{display:none;} body{-webkit-print-color-adjust:exact; print-color-adjust:exact;}}</style></body></html>';
  }

  // Suggested ballpark range: total ±10%, rounded to the nearest $1,000 (as before).
  function suggestedRange(total){
    var roundK = function(n){ return Math.max(0, Math.round(n / 1000) * 1000); };
    return { low: roundK(total * 0.90), high: roundK(total * 1.10) };
  }

  (root.ZK = root.ZK || {}).Documents = { ballpark: ballpark, proposal: proposal, suggestedRange: suggestedRange };
})(window);
