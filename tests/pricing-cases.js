/* Sample quotes for tests/pricing-check.html.
   Hand-picked edge cases plus a seeded spread of combinations across every model.
   Same seed every run, so results are repeatable. */
window.ZK_PRICING_CASES = function(cat){
  'use strict';
  var cases = [];
  function add(name, cfg){ cases.push({ name: name, cfg: cfg }); }
  var seed = 20261013;
  function rnd(){ seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  function pick(a){ return a[Math.floor(rnd() * a.length)]; }
  function chance(p){ return rnd() < p; }
  function ofType(t){ return cat.products.filter(function(p){ return p.type === t; }); }
  var ASM = ['none', 'remove', 'add'];
  var SNOW = ['standard', 'tier1', 'tier2'];
  var WIN = ['cascade_clay_white', 'cascade_black_white', 'amsco_studios', 'andersen_100'];
  function lines(){ return chance(0.35) ? [{ desc: 'Wraparound deck', amount: pick([1500, 4200, 12850]) }].concat(chance(0.4) ? [{ desc: 'No fireplace', amount: -1400 }] : []) : []; }
  function adjAmt(vals){ return { amount: pick(vals), reason: 'test' }; }

  // ---------- Panelized kits: every model, twice, with a spread of options
  ofType('shell').forEach(function(p){
    for(var k = 0; k < 2; k++){
      var cfg = { type:'shell', productId:p.id, units: pick([1, 1, 2, 3, 4]), snow: pick(SNOW), windows: chance(0.6) ? pick(WIN) : null,
        miles: pick([0, 150, 427, 980]), discountPct: pick([0, 0, 5, 10, 15]), assembly: pick(ASM), dryin: chance(0.3),
        designPaid: chance(0.15), engineeringPaid: chance(0.1), mirroredEngineering: chance(0.4), promo: chance(0.3), customLines: lines(), adjustments: {} };
      if(chance(0.2)) cfg.adjustments.windows = adjAmt([5000, 22000]);
      if(chance(0.2)) cfg.adjustments.shipping = adjAmt([0, 3500, 8000]);
      if(chance(0.2)) cfg.adjustments.design = adjAmt([0, 1500, 2500, 4000]);
      add('Kit ' + p.name + ' #' + (k + 1), cfg);
    }
  });
  // Kit edge cases
  var alpine = 'alpine', kolob = 'kolob';
  add('Kit: defaults only', { type:'shell', productId:alpine });
  add('Kit: renamed model (Kolob, was Solitude)', { type:'shell', productId:kolob, units:2, windows:'amsco_studios', miles:300 });
  add('Kit: window adjustment with no package (ignored)', { type:'shell', productId:alpine, windows:null, adjustments:{ windows:{ amount:9000, reason:'t' } } });
  add('Kit: window adjustment equal to standard', { type:'shell', productId:alpine, windows:'andersen_100', adjustments:{ windows:{ amount:49235, reason:'t' } } });
  add('Kit: shipping adjusted to $0', { type:'shell', productId:alpine, miles:500, adjustments:{ shipping:{ amount:0, reason:'t' } } });
  add('Kit: design waived ($0)', { type:'shell', productId:alpine, adjustments:{ design:{ amount:0, reason:'t' } } });
  add('Kit: design paid + engineering paid', { type:'shell', productId:alpine, designPaid:true, engineeringPaid:true });
  add('Kit: mirrored engineering, 1 unit (no effect)', { type:'shell', productId:alpine, units:1, mirroredEngineering:true });
  add('Kit: mirrored engineering, 4 units', { type:'shell', productId:'moab', units:4, mirroredEngineering:true });
  add('Kit: mirrored engineering, 4 units, engineering paid', { type:'shell', productId:'moab', units:4, mirroredEngineering:true, engineeringPaid:true });
  add('Kit: promo with engineering', { type:'shell', productId:'zion', promo:true });
  add('Kit: promo, design bigger than engineering', { type:'shell', productId:'tahoe', promo:true, adjustments:{ design:{ amount:9000, reason:'t' } } });
  add('Kit: promo, engineering paid', { type:'shell', productId:'zion', promo:true, engineeringPaid:true });
  add('Kit: promo, design paid', { type:'shell', productId:'zion', promo:true, designPaid:true });
  add('Kit: assembly remove, 3 units', { type:'shell', productId:'olympic', units:3, assembly:'remove' });
  add('Kit: assembly add, 3 units', { type:'shell', productId:'olympic', units:3, assembly:'add' });
  add('Kit: dry-in, odd miles', { type:'shell', productId:'birch', dryin:true, miles:333.5 });
  add('Kit: 15% discount, 4 units, everything on', { type:'shell', productId:'cedar', units:4, discountPct:15, snow:'tier2', windows:'andersen_100', miles:612, assembly:'add', dryin:true, mirroredEngineering:true, promo:true, customLines:[{ desc:'Deck', amount:4200 }, { desc:'Credit', amount:-1400 }] });
  add('Kit: blank custom line ignored', { type:'shell', productId:alpine, customLines:[{ desc:'', amount:'' }, { desc:'Only text', amount:'' }] });

  // ---------- Modular: every model (incl. parked MVP, still priced by the old tool)
  ofType('modular').forEach(function(p){
    var z = p.pricing[p.brands[0]];
    for(var k = 0; k < 4; k++){
      var cfg = { type:'modular', productId:p.id, units: pick([1, 1, 2, 3, 5]), snow: pick(SNOW),
        windows: z.window_upgrades.length && chance(0.5) ? pick(z.window_upgrades).id : null,
        addons: z.addons.length && chance(0.6) ? [z.addons[0].id] : [],
        miles: pick([0, 120, 455, 900]), discountPct: pick([0, 0, 5, 10]), assembly: pick(ASM), promo: chance(0.2), customLines: lines(), adjustments: {} };
      if(chance(0.25)) cfg.adjustments.base = adjAmt([0, 110000, 250000]);
      if(chance(0.2)) cfg.adjustments.windows = adjAmt([3000, 12000]);
      if(chance(0.2)) cfg.adjustments.shipping = adjAmt([0, 6000]);
      add('Modular ' + p.name + ' #' + (k + 1), cfg);
    }
  });
  add('Modular: Teton defaults', { type:'modular', productId:'teton' });
  add('Modular: XL 470 loft, 3 units, assembly add', { type:'modular', productId:'xl-470', units:3, addons:['additional_loft_120_sqft'], assembly:'add', miles:300 });
  add('Modular: Yellowstone deck, assembly remove, Andersen', { type:'modular', productId:'yellowstone', addons:['rooftop_deck_w_spiral_staircase'], assembly:'remove', windows:'andersen_100_series' });
  add('Modular: Gallatin II negotiated price', { type:'modular', productId:'gallatin-ii', adjustments:{ base:{ amount:149000, reason:'t' } }, units:2, discountPct:5 });
  add('Modular: Gallatin, odd contract (rounding)', { type:'modular', productId:'gallatin', miles:333, units:3, customLines:[{ desc:'x', amount:0.5 }] });
  // MVP Ridgeline and Dakota, back in the sales tool for now (Kelsey 2026-10-22).
  add('Modular: MVP Ridgeline defaults', { type:'modular', productId:'ridgeline' });
  add('Modular: MVP Ridgeline, 2 units, snow tier 2, 420 mi, 5% off', { type:'modular', productId:'ridgeline', units:2, snow:'tier2', miles:420, discountPct:5 });
  add('Modular: MVP Dakota defaults (per module)', { type:'modular', productId:'dakota' });
  add('Modular: MVP Dakota, 3 modules, snow tier 1, 260 mi, add-on line', { type:'modular', productId:'dakota', units:3, snow:'tier1', miles:260, customLines:[{ desc:'Stair tower', amount:18500 }] });

  // ---------- Garages
  ofType('garage').forEach(function(p){
    ['standalone', 'bundled'].forEach(function(use){
      [0, 400, 650].forEach(function(mi){
        var cfg = { type:'garage', productId:p.id, garageUse:use, miles:mi, units: pick([1, 1, 2]), assembly: pick(ASM), dryin: chance(0.3),
          designPaid: chance(0.2), promo: chance(0.2), customLines: lines(), adjustments: {} };
        if(chance(0.25)) cfg.adjustments.design = adjAmt([0, 900]);
        if(chance(0.2)) cfg.adjustments.shipping = adjAmt([0, 2500]);
        add('Garage ' + p.name + ' ' + use + ' ' + mi + 'mi', cfg);
      });
    });
  });
  add('Garage: assembly credit (old tool showed no minus sign)', { type:'garage', productId:'garage-2-car', assembly:'remove', units:2 });

  // ---------- Hangars
  ofType('hangar').forEach(function(p){
    for(var k = 0; k < 6; k++){
      var cfg = { type:'hangar', productId:p.id, units: pick([1, 2, 3]), miles: pick([0, 250, 800]), discountPct: pick([0, 10, 20]),
        assembly: pick(ASM), dryin: chance(0.4), designPaid: chance(0.2), promo: chance(0.2), customLines: lines(), adjustments: {} };
      if(chance(0.4)) cfg.adjustments.base = adjAmt([0, 150000, 170000]);
      if(chance(0.3)) cfg.adjustments.design = adjAmt([0, 1800]);
      if(chance(0.2)) cfg.adjustments.shipping = adjAmt([0, 4000]);
      add('Hangar ' + p.name + ' #' + (k + 1), cfg);
    }
  });

  // ---------- Steel Kit
  add('Steel: blank form', { type:'steel' });
  add('Steel: full', { type:'steel', projectName:'Ranch shop', sqft:1800, buildCost:210000, engineering:9000, miles:500, scope:'Frame package\nTrusses\n\nAnchors', assembly:'remove' });
  add('Steel: engineering TBD, assembly add', { type:'steel', projectName:'Barn', buildCost:98000, miles:120, assembly:'add' });
  add('Steel: paid flags + promo', { type:'steel', buildCost:150000, engineering:6000, designPaid:true, engineeringPaid:true, promo:true });
  add('Steel: promo, engineering due', { type:'steel', buildCost:150000, engineering:6000, promo:true });
  add('Steel: blank ship rate = $0', { type:'steel', buildCost:120000, miles:400, shipRate:'' });
  add('Steel: custom rate, design adjusted, add-ons', { type:'steel', buildCost:175500, engineering:7200, miles:250, shipRate:16, adjustments:{ design:{ amount:1000, reason:'t' } }, customLines:[{ desc:'Insulation', amount:8800 }, { desc:'Credit', amount:-2000 }] });

  // ---------- Custom Home
  var DEF = cat.payment_schedules.custom_home_default.stages;
  add('Custom: blank form', { type:'custom' });
  add('Custom: standard tier', { type:'custom', projectName:'The Della', sqft:2400, buildCost:320000, engineering:15000, miles:300, designTier:'standard' });
  add('Custom: custom tier, assembly add, scope', { type:'custom', projectName:'Big Lost', sqft:3100, buildCost:455000, engineering:18500, miles:620, designTier:'custom', assembly:'add', scope:'Line one\nLine two' });
  add('Custom: assembly remove + add-ons', { type:'custom', buildCost:300000, engineering:12000, assembly:'remove', customLines:[{ desc:'Garage', amount:24000 }, { desc:'Credit', amount:-5000 }] });
  add('Custom: design waived, engineering paid', { type:'custom', buildCost:250000, engineering:10000, engineeringPaid:true, adjustments:{ design:{ amount:0, reason:'t' } } });
  add('Custom: promo', { type:'custom', buildCost:280000, engineering:14000, promo:true });
  add('Custom: default schedule (45/45/10)', { type:'custom', buildCost:333333, engineering:11111, miles:77, customSchedule: DEF });
  add('Custom: 4-stage schedule', { type:'custom', buildCost:410000, engineering:16000, customSchedule:[{ name:'Deposit', pct:20, desc:'At signing' }, { name:'Materials', pct:35, desc:'' }, { name:'Pre-ship', pct:35, desc:'' }, { name:'Final', pct:10, desc:'On set' }] });
  add('Custom: schedule with promo', { type:'custom', buildCost:300001, engineering:14000, promo:true, customSchedule:[{ name:'A', pct:33.3, desc:'' }, { name:'B', pct:33.3, desc:'' }, { name:'C', pct:33.4, desc:'' }] });
  add('Custom: schedule not adding to 100% (ignored)', { type:'custom', buildCost:300000, engineering:14000, customSchedule:[{ name:'A', pct:50, desc:'' }, { name:'B', pct:40, desc:'' }] });
  add('Custom: schedule with blank row', { type:'custom', buildCost:300000, engineering:14000, customSchedule:[{ name:'', pct:'', desc:'' }, { name:'All', pct:100, desc:'' }] });
  add('Custom: blank ship rate = $0', { type:'custom', buildCost:200000, miles:300, shipRate:'' });
  return cases;
};
