/* =============================================================================
   Zip Kit quote pricing — pure functions, no DOM.

   This is a line-for-line port of the calc*() functions in the old
   ZipKit_Quoting_Tool.html. The arithmetic (including the ORDER of each
   addition, which matters for floating point) is kept exactly as it was, and
   tests/pricing-check.html proves the totals match the old tool to the dollar.
   Do not "tidy" a formula here without re-running that check.

   Usage:
     var q = ZKPricing.price(catalog, config);   // -> quote result
     var stages = ZKPricing.schedule(catalog, q); // -> payment stages

   config (all optional except type; strings are fine, they're parsed the way
   the old form fields were):
     type            'shell' | 'modular' | 'garage' | 'hangar' | 'steel' | 'custom'
     productId       catalog product id (shell / modular / garage / hangar)
     units, miles, discountPct
     snow            'standard' | 'tier1' | 'tier2'
     windows         window package id (shell) or upgrade id (modular); null = none
     addons          [addon id, …]                       (modular)
     garageUse       'standalone' | 'bundled'             (garage)
     assembly        'none' | 'remove' | 'add'
     dryin, designPaid, engineeringPaid, mirroredEngineering, promo   (booleans)
     customLines     [{ desc, amount }]
     adjustments     { base, windows, shipping, design }: each { amount, reason }
     projectName, sqft, buildCost, engineering, shipRate, scope   (steel / custom)
     designTier      'standard' | 'custom'                (custom)
     customSchedule  [{ name, pct, desc }]                (custom)
   ============================================================================= */
(function(root){
  'use strict';

  function fmt(n){ return '$' + Math.round(n).toLocaleString('en-US'); }
  function num(v){ return parseFloat(v) || 0; }
  function int(v){ return parseInt(v, 10) || 0; }
  function nonNeg(v){ return Math.max(0, num(v)); }

  // An adjustment counts as "entered" when it has a non-blank amount — the same
  // test the old tool used on its "(override)" fields (raw text !== '').
  function adj(cfg, key){
    var a = cfg.adjustments && cfg.adjustments[key];
    if(!a || a.amount === null || a.amount === undefined || String(a.amount).trim() === '') return null;
    return { amount: Math.max(0, parseFloat(a.amount) || 0), reason: a.reason || '' };
  }

  // Line builders. kind: 'charge' adds, 'credit' subtracts (shown with −),
  // 'note' shows text instead of a dollar figure (PAID, WAIVED, $14/mi …).
  function charge(key, label, amount, sub, extra){ return Object.assign({ key:key, kind:'charge', label:label, amount:amount, sub:sub||'' }, extra||{}); }
  function credit(key, label, amount, sub, extra){ return Object.assign({ key:key, kind:'credit', label:label, amount:amount, sub:sub||'' }, extra||{}); }
  function note(key, label, text, sub){ return { key:key, kind:'note', label:label, text:text, sub:sub||'' }; }

  function customItems(cfg){
    var items = [];
    (cfg.customLines || []).forEach(function(c){
      var desc = String(c.desc == null ? '' : c.desc).trim();
      var amt = num(c.amount);
      if(desc || amt) items.push({ desc: desc || 'Custom item', amt: amt });
    });
    return items;
  }

  // Site assembly (separate assembly contract; the company is catalog.json brands.zipkit.assembly.by): 10% of the per-unit shell figure.
  function assembly(cfg, shellPerUnit, units, rate){
    var mode = cfg.assembly === 'remove' ? 'remove' : (cfg.assembly === 'add' ? 'add' : 'none');
    var no = mode === 'remove', add = mode === 'add';
    var per = Math.round(Number(shellPerUnit) * rate);
    var total = per * Math.max(1, units);
    return {
      no: no, add: add, per: per, total: total,
      displayAdj:  no ? -total : (add ? total : 0),   // customer-facing total
      contractAdj: no ? -total : 0,                   // manufacturing contract (add-assembly is a separate contract)
      record: (no || add) ? { mode: no ? 'removed' : 'added', amount: total, per_unit: per } : null
    };
  }

  function findProduct(cat, cfg){
    var p = null;
    cat.products.forEach(function(x){ if(x.id === cfg.productId) p = x; });
    if(!p) throw new Error('Unknown product: ' + cfg.productId);
    return p;
  }
  function brandPricing(p){ return p.pricing[p.brands[0]]; }

  // ---------------------------------------------------------------- shell
  function priceShell(cat, cfg){
    var T = cat.product_types.shell;
    var p = findProduct(cat, cfg), z = brandPricing(p);
    var units = Math.max(1, int(cfg.units) || 1);
    var miles = nonNeg(cfg.miles);
    var disc = Math.min(T.max_discount_pct, Math.max(0, int(cfg.discountPct)));  // old slider: 0–15, whole numbers
    var shell = z.shell_kit, eng = z.engineering, rate = z.ship_per_mile;
    var snow = cfg.snow === 'tier1' ? z.snow.tier1 : (cfg.snow === 'tier2' ? z.snow.tier2 : 0);
    var hasWin = !!(cfg.windows && z.windows[cfg.windows] != null);
    var stdWin = hasWin ? z.windows[cfg.windows] : 0;
    var wAdj = adj(cfg, 'windows');
    var winOverride = wAdj ? wAdj.amount : 0;
    var winIsOverride = hasWin && winOverride > 0 && winOverride !== stdWin;
    var win = hasWin ? (winOverride > 0 ? winOverride : stdWin) : 0;
    var computedShipPer = miles * rate;
    var sAdj = adj(cfg, 'shipping');
    var shipPer = sAdj ? sAdj.amount : computedShipPer;
    var discPer = shell * (disc / 100);
    var designPaid = !!cfg.designPaid, engPaid = !!cfg.engineeringPaid;
    var std = T.design_fee;
    var dAdj = adj(cfg, 'design');
    var effectiveDesign = dAdj ? dAdj.amount : std;
    var dIsOverride = !!dAdj && effectiveDesign !== std;
    var dryin = !!cfg.dryin;
    var lines = [];

    lines.push(charge('base', 'Panelized shell kit', shell * units, (units > 1 ? fmt(shell) + ' × ' + units + ' units' : 'pre-framed panel shell') + (dryin ? ' · incl. dry-in' : '')));
    if(disc > 0) lines.push(credit('discount', 'Multi-unit discount', discPer * units, disc + '% off shell kits'));
    if(designPaid) lines.push(note('design', 'Architectural design', 'PAID', 'already received · was ' + fmt(effectiveDesign) + (dIsOverride ? ' (custom amount)' : '')));
    else if(effectiveDesign > 0) lines.push(charge('design', 'Architectural design', effectiveDesign, dIsOverride ? 'full conceptual drawings · custom amount (standard ' + fmt(std) + ')' : 'full conceptual drawings', { adjusted: dIsOverride }));
    else lines.push(note('design', 'Architectural design', 'WAIVED', 'design retainer waived for this customer'));

    var engModified = !!cfg.mirroredEngineering;
    var additionalEng = (engModified && units > 1) ? Math.round(eng * T.mirrored_engineering_rate * (units - 1)) : 0;
    if(engPaid) lines.push(note('engineering', 'Engineering submittal', 'PAID', 'already received · was ' + fmt(eng + additionalEng)));
    else lines.push(charge('engineering', 'Engineering submittal', eng, 'full submittal engineered docs' + (units > 1 && !engModified ? ' · covers all ' + units + ' identical units' : '')));
    if(!engPaid && additionalEng > 0) lines.push(charge('engineering_extra', 'Additional engineering', additionalEng, '50% of ' + fmt(eng) + ' × ' + (units - 1) + ' mirrored/adjusted unit' + (units - 1 > 1 ? 's' : '')));
    if(snow > 0) lines.push(charge('snow', 'Snow load upgrade', snow * units, units > 1 ? fmt(snow) + ' × ' + units : 'per unit'));
    if(win > 0){
      var winSubBase = winIsOverride ? 'non-standard package · incl. entry doors, shipping & install' : 'incl. standard entry doors, shipping & install';
      lines.push(charge('windows', 'Window & door package', win * units, units > 1 ? fmt(win) + ' × ' + units + ' · ' + winSubBase : winSubBase, { adjusted: winIsOverride }));
    } else lines.push(note('windows', 'Windows & doors', 'not included', 'select a package — doors come with it'));
    if(shipPer > 0) lines.push(charge('shipping', 'Shipping', shipPer * units, miles.toLocaleString('en-US') + ' mi from Cedar City, UT' + (units > 1 ? ' · ' + fmt(shipPer) + ' × ' + units : ''), { adjusted: !!sAdj }));
    else lines.push(note('shipping', 'Shipping', '$' + rate + '/mi', 'from Cedar City, UT · enter distance'));

    var customs = customItems(cfg);
    var customTotal = customs.reduce(function(a, c){ return a + c.amt; }, 0);
    customs.forEach(function(c, i){ lines.push(charge('custom-' + i, c.desc, c.amt, 'add-on')); });

    var asm = assembly(cfg, shell, units, cat.brands.zipkit.assembly.rate);
    if(asm.no)  lines.push(credit('assembly', 'Assembly credit (curb delivery)', asm.total, '10% of shell · customer takes curb delivery, arranges own site set'));
    if(asm.add) lines.push(charge('assembly', 'Site assembly', asm.total, '10% of shell · billed on a separate assembly contract'));

    var designAmt = designPaid ? 0 : effectiveDesign;
    var totalEng = eng + additionalEng;
    var engAmt = engPaid ? 0 : totalEng;
    var total = (shell - discPer) * units + designAmt + engAmt + snow * units + win * units + shipPer * units + customTotal + asm.displayAdj;
    var contract = (shell - discPer) * units + snow * units + win * units + shipPer * units + customTotal + asm.contractAdj;
    return finish(cfg, p, lines, {
      kind: 'Shell Kit', model: p.name, units: units,
      design: effectiveDesign, engineering: totalEng,
      designPaid: designPaid, engineeringPaid: engPaid,
      contract: contract, total: total, company: 'zipkit',
      assembly: asm.record, dryin: dryin
    }, units > 1 ? fmt(total / units) + ' per unit' : '');
  }

  // ---------------------------------------------------------------- modular
  function priceModular(cat, cfg){
    var T = cat.product_types.modular;
    var p = findProduct(cat, cfg), brand = p.brands[0], z = p.pricing[brand];
    var perModule = z.price_basis === 'per_module';
    var units = Math.max(1, int(cfg.units) || 1);
    var miles = nonNeg(cfg.miles);
    var disc = Math.min(T.max_discount_pct, Math.max(0, int(cfg.discountPct)));  // old slider: 0–15, whole numbers
    var defaultBase = z.base, shipHigh = z.ship_per_mile.high, shipLow = z.ship_per_mile.low;
    var bAdj = adj(cfg, 'base');
    var overrideBase = bAdj ? bAdj.amount : 0;
    var base = overrideBase > 0 ? overrideBase : defaultBase;
    var isOverride = overrideBase > 0 && overrideBase !== defaultBase;
    var snow = cfg.snow === 'tier1' ? z.snow.tier1 : (cfg.snow === 'tier2' ? z.snow.tier2 : 0);
    var up = null;
    z.window_upgrades.forEach(function(w){ if(w.id === cfg.windows) up = w; });
    var stdWinCost = up ? up.price : 0;
    var wAdj = adj(cfg, 'windows');
    var mWinOverride = wAdj ? wAdj.amount : 0;
    var mWinIsOverride = !!up && mWinOverride > 0 && mWinOverride !== stdWinCost;
    var winCost = up ? (mWinOverride > 0 ? mWinOverride : stdWinCost) : 0;

    var chosen = cfg.addons || [];
    var addonTotal = 0, addonLines = [];
    z.addons.forEach(function(a){
      if(chosen.indexOf(a.id) !== -1){ addonTotal += a.price; addonLines.push(charge('addon-' + a.id, a.label, a.price * units, units > 1 ? fmt(a.price) + ' × ' + units : 'optional')); }
    });
    var mComputedShipPer = miles * shipHigh;
    var sAdj = adj(cfg, 'shipping');
    var shipPer = sAdj ? sAdj.amount : mComputedShipPer;
    var discPer = base * (disc / 100);
    var lines = [];
    var unitSub = isOverride
      ? (units > 1 ? fmt(base) + ' × ' + units + (perModule ? ' modules · negotiated' : ' units · negotiated') : 'negotiated price' + (perModule ? ' per module' : ' per unit'))
      : (units > 1 ? fmt(base) + ' × ' + units + (perModule ? ' modules' : ' units') : (perModule ? 'per module' : 'move-in ready'));
    lines.push(charge('base', 'Completed modular unit', base * units, unitSub, { adjusted: isOverride }));
    if(disc > 0) lines.push(credit('discount', 'Multi-unit discount', discPer * units, disc + '% off base'));
    if(winCost > 0){
      var mWinSubBase = mWinIsOverride ? 'non-standard upgrade · custom selection' : up.label;
      lines.push(charge('windows', 'Window upgrade', winCost * units, units > 1 ? fmt(winCost) + ' × ' + units + ' · ' + mWinSubBase : mWinSubBase, { adjusted: mWinIsOverride }));
    }
    lines = lines.concat(addonLines);
    if(snow > 0) lines.push(charge('snow', 'Snow load upgrade', snow * units, units > 1 ? fmt(snow) + ' × ' + units : 'per unit'));
    if(shipPer > 0) lines.push(charge('shipping', 'Shipping', shipPer * units, miles.toLocaleString('en-US') + ' mi · high end of range' + (units > 1 ? ' · ' + fmt(shipPer) + ' × ' + units : ''), { adjusted: !!sAdj }));
    else lines.push(note('shipping', 'Shipping', '$' + shipLow + '–$' + shipHigh + '/mi', 'enter distance · uses high end'));

    var customs = customItems(cfg);
    var customTotal = customs.reduce(function(a, c){ return a + c.amt; }, 0);
    customs.forEach(function(c, i){ lines.push(charge('custom-' + i, c.desc, c.amt, c.amt < 0 ? 'credit' : 'add-on')); });

    // Modular base bundles design + engineering + windows, so assembly is 10% of
    // the shell-only share (≈85% of base), as in the old tool.
    var asm = assembly(cfg, base * T.assembly_shell_fraction, units, cat.brands.zipkit.assembly.rate);
    if(asm.no)  lines.push(credit('assembly', 'Assembly credit (curb delivery)', asm.total, '10% of shell portion (≈85% of base) · customer arranges own site set'));
    if(asm.add) lines.push(charge('assembly', 'Site assembly', asm.total, '10% of shell portion (≈85% of base) · billed on a separate assembly contract'));

    var contractBase = (base - discPer) * units + winCost * units + addonTotal * units + snow * units + shipPer * units + customTotal;
    var total = contractBase + asm.displayAdj;
    var contract = contractBase + asm.contractAdj;
    return finish(cfg, p, lines, {
      kind: 'Modular', model: p.name, units: units,
      design: 0, engineering: 0, contract: contract, total: total,
      company: brand, assembly: asm.record
    }, units > 1 ? fmt(total / units) + (perModule ? ' per module' : ' per unit') : '');
  }

  // ---------------------------------------------------------------- garage
  function priceGarage(cat, cfg){
    var T = cat.product_types.garage;
    var p = findProduct(cat, cfg), kit = p.pricing.zipkit.shell_kit;
    var units = Math.max(1, int(cfg.units) || 1);
    var bundled = cfg.garageUse === 'bundled';
    var stdDesign = bundled ? T.design_fee.bundled : T.design_fee.standalone;
    var dAdj = adj(cfg, 'design');
    var design = dAdj ? dAdj.amount : stdDesign;
    var dIsOverride = !!dAdj && design !== stdDesign;
    var miles = nonNeg(cfg.miles);
    var grate, rateDesc;
    if(bundled){ grate = T.ship_per_mile.bundled; rateDesc = '$' + grate + '/mi (bundled with a home)'; }
    else if(miles > 600){ grate = T.ship_per_mile.standalone_over_600_miles; rateDesc = '$' + grate + '/mi (standalone, over 600 mi)'; }
    else { grate = T.ship_per_mile.standalone; rateDesc = '$' + grate + '/mi (standalone, up to 600 mi)'; }
    var gComputedShipPer = miles * grate;
    var sAdj = adj(cfg, 'shipping');
    var shipPer = sAdj ? sAdj.amount : gComputedShipPer;
    var designPaid = !!cfg.designPaid;
    var dryin = !!cfg.dryin;
    var lines = [];
    lines.push(charge('base', 'Garage shell kit', kit * units, (units > 1 ? fmt(kit) + ' × ' + units + ' units' : 'pre-framed 2×6 panel shell') + (dryin ? ' · incl. dry-in' : '')));
    if(designPaid) lines.push(note('design', 'Design & engineering', 'PAID', 'already received · was ' + fmt(design) + (dIsOverride ? ' (custom amount)' : '')));
    else if(design > 0) lines.push(charge('design', 'Design & engineering', design, 'full conceptual drawings + submittal docs · ' + (dIsOverride ? 'custom amount (standard ' + fmt(stdDesign) + ')' : (bundled ? 'bundled with a home' : 'standalone')), { adjusted: dIsOverride }));
    else lines.push(note('design', 'Design & engineering', 'WAIVED', 'fee waived for this customer'));
    if(shipPer > 0) lines.push(charge('shipping', 'Shipping', shipPer * units, miles.toLocaleString('en-US') + ' mi from Cedar City, UT · ' + rateDesc + (units > 1 ? ' · ' + fmt(shipPer) + ' × ' + units : ''), { adjusted: !!sAdj }));
    else lines.push(note('shipping', 'Shipping', '$' + grate + '/mi', bundled ? 'bundled with a home' : 'standalone · enter distance'));

    var customs = customItems(cfg);
    var customTotal = customs.reduce(function(a, c){ return a + c.amt; }, 0);
    customs.forEach(function(c, i){ lines.push(charge('custom-' + i, c.desc, c.amt, c.amt < 0 ? 'credit' : 'add-on')); });

    var asm = assembly(cfg, kit, units, cat.brands.zipkit.assembly.rate);
    // (The old tool showed this credit without a minus sign; it always subtracted.)
    if(asm.no)  lines.push(credit('assembly', 'Assembly credit (curb delivery)', asm.total, '10% of shell · customer arranges own site set'));
    if(asm.add) lines.push(charge('assembly', 'Site assembly', asm.total, '10% of shell · billed on a separate assembly contract'));

    var designAmt = designPaid ? 0 : design;
    var total = kit * units + designAmt + shipPer * units + customTotal + asm.displayAdj;
    return finish(cfg, p, lines, {
      kind: 'Garage', model: p.name + ' garage', units: units,
      design: design, engineering: 0,
      designPaid: designPaid, engineeringPaid: false,
      contract: kit * units + shipPer * units + customTotal + asm.contractAdj, total: total,
      company: 'zipkit', assembly: asm.record, dryin: dryin
    }, units > 1 ? fmt(total / units) + ' per unit' : '');
  }

  // ---------------------------------------------------------------- hangar
  function priceHangar(cat, cfg){
    var T = cat.product_types.hangar;
    var p = findProduct(cat, cfg), defaultBase = p.pricing.zksteel.kit;
    var units = Math.max(1, int(cfg.units) || 1);
    var miles = nonNeg(cfg.miles);
    var disc = Math.min(T.max_discount_pct, Math.max(0, int(cfg.discountPct)));  // old slider: 0–15, whole numbers
    var bAdj = adj(cfg, 'base');
    var overrideBase = bAdj ? bAdj.amount : 0;
    var base = overrideBase > 0 ? overrideBase : defaultBase;
    var isOverride = overrideBase > 0 && overrideBase !== defaultBase;
    var rate = T.ship_per_mile;
    var hComputedShipPer = miles * rate;
    var sAdj = adj(cfg, 'shipping');
    var shipPer = sAdj ? sAdj.amount : hComputedShipPer;
    var discPer = base * (disc / 100);
    var dryin = !!cfg.dryin;
    var unitSub = isOverride
      ? (units > 1 ? fmt(base) + ' × ' + units + ' units · negotiated' : 'negotiated price per unit')
      : (units > 1 ? fmt(base) + ' × ' + units + ' units' : 'pre-framed hangar shell');
    if(dryin) unitSub += ' · incl. dry-in';
    var designPaid = !!cfg.designPaid;
    var std = T.design_fee;
    var dAdj = adj(cfg, 'design');
    var eff = dAdj ? dAdj.amount : std;
    var dIsOverride = !!dAdj && eff !== std;
    var lines = [];
    lines.push(charge('base', 'Hangar shell kit', base * units, unitSub, { adjusted: isOverride }));
    if(disc > 0) lines.push(credit('discount', 'Multi-unit discount', discPer * units, disc + '% off kit'));
    if(designPaid) lines.push(note('design', 'Design & engineering', 'PAID', 'already received · was ' + fmt(eff) + (dIsOverride ? ' (custom amount)' : '')));
    else if(eff > 0) lines.push(charge('design', 'Design & engineering', eff, dIsOverride ? 'full conceptual drawings + submittal docs · custom amount (standard ' + fmt(std) + ')' : 'full conceptual drawings + submittal docs', { adjusted: dIsOverride }));
    else lines.push(note('design', 'Design & engineering', 'WAIVED', 'fee waived for this customer'));
    if(shipPer > 0) lines.push(charge('shipping', 'Shipping', shipPer * units, miles.toLocaleString('en-US') + ' mi from Cedar City, UT' + (units > 1 ? ' · ' + fmt(shipPer) + ' × ' + units : ''), { adjusted: !!sAdj }));
    else lines.push(note('shipping', 'Shipping', '$' + rate + '/mi', 'from Cedar City, UT · enter distance'));

    var customs = customItems(cfg);
    var customTotal = customs.reduce(function(a, c){ return a + c.amt; }, 0);
    customs.forEach(function(c, i){ lines.push(charge('custom-' + i, c.desc, c.amt, c.amt < 0 ? 'credit' : 'add-on')); });

    var asm = assembly(cfg, base, units, cat.brands.zksteel.assembly.rate);
    if(asm.no)  lines.push(credit('assembly', 'Assembly credit (curb delivery)', asm.total, '10% of shell · customer arranges own site set'));
    if(asm.add) lines.push(charge('assembly', 'Site assembly', asm.total, '10% of shell · billed on a separate assembly contract'));

    var designAmt = designPaid ? 0 : eff;
    var total = (base - discPer) * units + designAmt + shipPer * units + customTotal + asm.displayAdj;
    var contract = (base - discPer) * units + shipPer * units + customTotal + asm.contractAdj;
    return finish(cfg, p, lines, {
      kind: 'Hangar', model: p.name + ' hangar', units: units,
      design: eff, engineering: 0,
      designPaid: designPaid, engineeringPaid: false,
      contract: contract, total: total, company: 'zksteel',
      assembly: asm.record, dryin: dryin
    }, units > 1 ? fmt(total / units) + ' per unit' : '');
  }

  // ------------------------------------------------- steel + custom (no model list)
  function scopeLines(cfg){
    return String(cfg.scope || '').trim().split(/\r?\n/).map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 0; });
  }
  function engineeringLine(lines, eng, engPaid, sub){
    if(engPaid && eng > 0) lines.push(note('engineering', 'Engineering submittal', 'PAID', 'already received · was ' + fmt(eng)));
    else if(eng > 0) lines.push(charge('engineering', 'Engineering submittal', eng, sub));
    else lines.push(note('engineering', 'Engineering submittal', 'TBD', 'enter project-specific amount'));
  }

  function priceSteel(cat, cfg){
    var T = cat.product_types.steel;
    var name = String(cfg.projectName || '').trim();
    var sqft = int(cfg.sqft);
    var build = num(cfg.buildCost), eng = num(cfg.engineering);
    var miles = nonNeg(cfg.miles);
    var rate = (cfg.shipRate === undefined || cfg.shipRate === null) ? T.default_ship_per_mile : nonNeg(cfg.shipRate);  // blank field = $0, as before
    var ship = miles * rate;
    var designPaid = !!cfg.designPaid, engPaid = !!cfg.engineeringPaid;
    var std = T.design_fee;
    var dAdj = adj(cfg, 'design');
    var eff = dAdj ? dAdj.amount : std;
    var dIsOverride = !!dAdj && eff !== std;
    var lines = [];
    if(build > 0) lines.push(charge('base', 'Light-gauge steel frame package', build, name || 'negotiated package price'));
    if(designPaid) lines.push(note('design', 'Architectural design', 'PAID', 'already received · was ' + fmt(eff) + (dIsOverride ? ' (custom amount)' : '')));
    else if(eff > 0) lines.push(charge('design', 'Architectural design', eff, dIsOverride ? 'full conceptual drawings · custom amount (standard ' + fmt(std) + ')' : 'full conceptual drawings · steel retainer', { adjusted: dIsOverride }));
    else lines.push(note('design', 'Architectural design', 'WAIVED', 'design retainer waived for this customer'));
    engineeringLine(lines, eng, engPaid, 'stamped engineering · full submittal engineered docs');
    if(ship > 0) lines.push(charge('shipping', 'Shipping', ship, miles.toLocaleString('en-US') + ' mi from Cedar City, UT · $' + rate + '/mi'));

    var customs = customItems(cfg);
    var customTotal = customs.reduce(function(a, c){ return a + c.amt; }, 0);
    customs.forEach(function(c, i){ lines.push(charge('custom-' + i, c.desc, c.amt, c.amt < 0 ? 'credit' : 'add-on')); });

    var asm = assembly(cfg, build, 1, cat.brands.zksteel.assembly.rate);
    if(asm.no)  lines.push(credit('assembly', 'Assembly credit (curb delivery)', asm.total, '10% of frame package · customer arranges own site set'));
    if(asm.add) lines.push(charge('assembly', 'Site assembly', asm.total, '10% of frame package · billed on a separate assembly contract'));

    var designAmt = designPaid ? 0 : eff;
    var engAmt = engPaid ? 0 : eng;
    var total = build + designAmt + engAmt + ship + customTotal + asm.displayAdj;
    var contract = build + ship + customTotal + asm.contractAdj;
    return finish(cfg, null, lines, {
      kind: 'Steel Frame', model: name || 'Light-gauge steel frame', units: 1,
      design: eff, engineering: eng,
      designPaid: designPaid, engineeringPaid: engPaid,
      contract: contract, total: total, company: 'zksteel',
      sqft: sqft, customScope: scopeLines(cfg), assembly: asm.record
    }, (sqft > 0 && total > 0) ? fmt(total / sqft) + ' / sqft' : '');
  }

  // The Custom Home payment schedule editor: same validity rule as the old tool.
  function customScheduleInfo(list){
    var stages = [];
    (list || []).forEach(function(s){
      var n = String(s.name == null ? '' : s.name).trim();
      var pct = num(s.pct);
      var d = String(s.desc == null ? '' : s.desc).trim();
      if(n || pct > 0) stages.push({ name: n || 'Payment', pct: pct, desc: d });
    });
    var sum = stages.reduce(function(a, s){ return a + s.pct; }, 0);
    return { stages: stages, sum: sum, isValid: stages.length > 0 && Math.abs(sum - 100) < 0.01 };
  }

  function priceCustom(cat, cfg){
    var T = cat.product_types.custom;
    var name = String(cfg.projectName || '').trim();
    var sqft = int(cfg.sqft);
    var build = num(cfg.buildCost), eng = num(cfg.engineering);
    var miles = nonNeg(cfg.miles);
    var rate = (cfg.shipRate === undefined || cfg.shipRate === null) ? T.default_ship_per_mile : nonNeg(cfg.shipRate);  // blank field = $0, as before
    var ship = miles * rate;
    var designPaid = !!cfg.designPaid, engPaid = !!cfg.engineeringPaid;
    var tierKey = cfg.designTier === 'standard' ? 'standard' : (cfg.designTier === 'custom' ? 'custom' : T.default_design_tier);
    var designTier = T.design_tiers[tierKey];
    var designLabel = designTier === 2500 ? 'Standard tier' : (designTier === 3500 ? 'Custom tier' : 'per project');
    var dAdj = adj(cfg, 'design');
    var eff = dAdj ? dAdj.amount : designTier;
    var dIsOverride = !!dAdj && eff !== designTier;
    var lines = [];
    if(build > 0) lines.push(charge('base', 'Custom build', build, name || 'negotiated construction price'));
    if(designPaid) lines.push(note('design', 'Architectural design', 'PAID', 'already received · was ' + fmt(eff) + (dIsOverride ? ' (custom amount)' : '')));
    else if(eff > 0) lines.push(charge('design', 'Architectural design', eff, dIsOverride ? 'full conceptual drawings · custom amount (tier ' + fmt(designTier) + ')' : 'full conceptual drawings · ' + designLabel, { adjusted: dIsOverride }));
    else lines.push(note('design', 'Architectural design', 'WAIVED', 'design retainer waived for this customer'));
    engineeringLine(lines, eng, engPaid, 'full submittal engineered docs');
    if(ship > 0) lines.push(charge('shipping', 'Shipping', ship, miles.toLocaleString('en-US') + ' mi from Cedar City, UT · $' + rate + '/mi'));

    var customs = customItems(cfg);
    var customTotal = customs.reduce(function(a, c){ return a + c.amt; }, 0);
    customs.forEach(function(c, i){ lines.push(charge('custom-' + i, c.desc, c.amt, c.amt < 0 ? 'credit' : 'add-on')); });

    var asm = assembly(cfg, build, 1, cat.brands.zipkit.assembly.rate);
    if(asm.no)  lines.push(credit('assembly', 'Assembly credit (curb delivery)', asm.total, '10% of build · customer arranges own site set'));
    if(asm.add) lines.push(charge('assembly', 'Site assembly', asm.total, '10% of build · billed on a separate assembly contract'));

    var designAmt = designPaid ? 0 : eff;
    var engAmt = engPaid ? 0 : eng;
    var total = build + designAmt + engAmt + ship + customTotal + asm.displayAdj;
    var contract = build + ship + customTotal + asm.contractAdj;
    var sched = customScheduleInfo(cfg.customSchedule);
    var r = finish(cfg, null, lines, {
      kind: 'Custom Home', model: name || 'Custom home', units: 1,
      design: eff, engineering: eng,
      designPaid: designPaid, engineeringPaid: engPaid,
      contract: contract, total: total, company: 'zipkit',
      customSchedule: sched.isValid ? sched.stages : null,
      sqft: sqft, customScope: scopeLines(cfg), assembly: asm.record
    }, (sqft > 0 && total > 0) ? fmt(total / sqft) + ' / sqft' : '');
    r.scheduleEditor = sched;   // for the editor's running total
    return r;
  }

  // Common wrap-up: the old QUOTE object (saved as quote_data, read by the
  // portal) plus the lines and a few display figures.
  function finish(cfg, product, lines, quote, perUnitText){
    quote.designCreditPromo = !!cfg.promo;
    // Promo: design retainer credited toward engineering (shown on the proposal).
    var promoCredit = (quote.designCreditPromo && quote.design > 0 && quote.engineering > 0 && !quote.engineeringPaid)
      ? Math.min(quote.design, quote.engineering) : 0;
    return {
      type: cfg.type,
      productId: product ? product.id : null,
      quote: quote,
      lines: lines,
      total: quote.total,
      contract: quote.contract,
      perUnitText: perUnitText,
      promoCredit: promoCredit,
      displayedTotal: quote.total - promoCredit,
      adjusted: lines.some(function(l){ return l.adjusted; }) || !!(cfg.adjustments && ['base','windows','shipping','design'].some(function(k){ return adj(cfg, k); }))
    };
  }

  var PRICERS = { shell: priceShell, modular: priceModular, garage: priceGarage, hangar: priceHangar, steel: priceSteel, custom: priceCustom };

  function price(cat, cfg){
    var fn = PRICERS[cfg.type];
    if(!fn) throw new Error('Unknown product type: ' + cfg.type);
    return fn(cat, cfg);
  }

  // ------------------------------------------------------------- payment schedule
  // Same stages and rounding as the old invoiceStages() for every product
  // EXCEPT Zip Kit modular, which uses the contract generator's 5/30/30/30/5
  // (catalog payment_schedules.zk_modular), figured on the contract amount.
  function schedule(cat, result){
    var q = result.quote;
    var stages = [];
    if(q.kind === 'Modular'){
      var def = cat.payment_schedules.zk_modular.stages;
      // Same as the contract generator: each stage rounded, and the last one is
      // the total minus the others, subtracted one at a time.
      var base = q.contract, rest = q.contract;
      def.forEach(function(s){
        var amt = s.absorbs_rounding ? 0 : Math.round(base * (s.pct / 100));
        if(!s.absorbs_rounding) rest = rest - amt;
        stages.push({ key: s.key, name: s.name, desc: s.desc, amount: amt });
      });
      def.forEach(function(s, i){ if(s.absorbs_rounding) stages[i].amount = rest; });
      return stages;
    }
    var S = {};
    cat.payment_schedules.zk_kit_standard.stages.forEach(function(s){ S[s.key] = s; });
    if(q.design > 0 && !q.designPaid) stages.push({ key: 'design', name: S.design.name, desc: S.design.desc, amount: q.design });

    if(q.kind === 'Custom Home' && q.customSchedule && q.customSchedule.length){
      var promoCredit = (q.designCreditPromo && q.design > 0 && q.engineering > 0 && !q.engineeringPaid) ? Math.min(q.design, q.engineering) : 0;
      if(q.engineering > 0 && !q.engineeringPaid){
        var engAmtCS = Math.max(0, q.engineering - promoCredit);
        var engDescCS = promoCredit > 0
          ? 'Full submittal engineering (' + fmt(q.engineering) + ' less ' + fmt(promoCredit) + ' design-retainer credit) · due after contract signing'
          : 'Full submittal engineering · due after contract signing';
        stages.push({ key: 'engineering', name: 'Engineering', desc: engDescCS, amount: engAmtCS });
      }
      var schedBase = q.contract, lastIdx = q.customSchedule.length - 1, assignedC = 0;
      q.customSchedule.forEach(function(s, i){
        var amt = (i === lastIdx) ? (schedBase - assignedC) : Math.round(schedBase * s.pct / 100);
        assignedC += amt;
        stages.push({ key: 'custom-' + i, name: s.name, desc: s.desc || '', amount: amt });
      });
      return stages;
    }

    if(q.engineering > 0 && !q.engineeringPaid){
      var engAmt = q.engineering;
      var engDesc = S.engineering.desc;
      if(q.designCreditPromo && q.design > 0){
        engAmt = Math.max(0, q.engineering - q.design);
        engDesc = 'Full submittal engineering (' + fmt(q.engineering) + ' less ' + fmt(q.design) + ' design-retainer credit) · due after contract signing';
      }
      if(engAmt > 0) stages.push({ key: 'engineering', name: 'Engineering', desc: engDesc, amount: engAmt });
      else stages.push({ key: 'engineering', name: 'Engineering', desc: 'Fully covered by ' + fmt(q.design) + ' design-retainer credit — no additional invoice', amount: 0 });
    }
    var m = S.materials, p = S.preship, f = S.final;
    var c = q.contract;
    stages.push({ key: 'materials', name: m.name, desc: m.desc, amount: Math.round(c * (m.pct / 100)) });
    stages.push({ key: 'preship',   name: p.name, desc: p.desc, amount: Math.round(c * (p.pct / 100)) });
    // Old tool: final = contract − round(45%) × 2 (one subtraction).
    stages.push({ key: 'final',     name: f.name, desc: f.desc, amount: c - (Math.round(c * (m.pct / 100)) + Math.round(c * (p.pct / 100))) });
    return stages;
  }

  var api = { price: price, schedule: schedule, customScheduleInfo: customScheduleInfo, fmt: fmt };
  (root.ZK = root.ZK || {}).Pricing = api;
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
