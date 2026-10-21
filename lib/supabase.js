// ============================================================================
// ZipKit Sales Tool — Supabase client + auth/quotes helpers
// ============================================================================
// Loaded via <script src="lib/supabase.js"></script> AFTER the supabase-js CDN.
// Everything lives under window.ZK (ZK.auth, ZK.quotes, ZK.fetchWire, ...).
// The portal and contract generator still use the old window.zk* names, so
// those are kept as aliases unless ZK_CONFIG.legacyGlobals is false.
// Supabase URL and key come from ZK_CONFIG when a host page (or WordPress)
// supplies them; otherwise the defaults below are used.
//
// Project: ZipKit Sales (Supabase)
// Schema:  profiles + quotes with RLS — see Phase 1 schema SQL.
// ============================================================================

// ============================================================================
// LOGIN GATE TOGGLE
// Set to true to require sales reps to sign in before using the tools. When
// true, each rep's saved quotes are isolated by Supabase RLS so they only
// see their own work.
// ============================================================================
(function(root){
var ZK = root.ZK = root.ZK || {};
var CFG = ZK.config || root.ZK_CONFIG || {};
if(CFG.requireAuth === undefined) CFG.requireAuth = true;
ZK.config = ZK.config || CFG;

(function(){
  if(!window.supabase || !window.supabase.createClient){
    console.error('[zk] supabase-js CDN not loaded before lib/supabase.js');
    return;
  }

  var SUPABASE_URL     = CFG.supabaseUrl || 'https://slbkkeiyaobdesnpifml.supabase.co';
  var SUPABASE_PUB_KEY = CFG.supabaseKey || 'sb_publishable_KQWnDMCOXbFKq4eVpx0kAQ_T7HmySYB';

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUB_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  // ---------- AUTH ----------
  ZK.auth = {
    client: sb,
    signIn: async function(email, password){
      var r = await sb.auth.signInWithPassword({ email: email, password: password });
      if(r.error) throw r.error;
      return r.data;
    },
    signOut: async function(){
      await sb.auth.signOut();
    },
    getCurrentUser: async function(){
      var r = await sb.auth.getUser();
      return r.data && r.data.user;
    },
    // True when profiles.is_admin=true for the signed-in user. Backed by the
    // is_current_user_admin() SECURITY DEFINER function (see admin_migration.sql).
    // Returns false safely if the function or column doesn't exist yet.
    isAdmin: async function(){
      var u = await ZK.auth.getCurrentUser();
      if(!u) return false;
      var r = await sb.rpc('is_current_user_admin');
      if(r.error){
        // Function may not exist yet — user hasn't run the admin migration.
        return false;
      }
      return !!r.data;
    },
    onAuthChange: function(callback){
      return sb.auth.onAuthStateChange(function(event, session){
        callback(session ? session.user : null);
      });
    }
  };

  // Translate the "column payments does not exist" error into a clear hint so
  // the rep knows to run the one-line migration in Supabase.
  function _pmtErr(err){
    var msg = (err && err.message) || String(err);
    if(/column .*payments.* does not exist|schema cache/i.test(msg)){
      return new Error('Payments tracking not enabled yet. Run this once in Supabase SQL Editor:  alter table quotes add column if not exists payments jsonb default \'[]\'::jsonb;');
    }
    return err;
  }
  function _invErr(err){
    var msg = (err && err.message) || String(err);
    if(/column .*invoices.* does not exist|schema cache/i.test(msg)){
      return new Error('Invoice tracking not enabled yet. Run this once in Supabase SQL Editor:  alter table quotes add column if not exists invoices jsonb default \'[]\'::jsonb;');
    }
    return err;
  }

  // ---------- QUOTES / PROJECTS ----------
  // Each saved record represents a "project" — it can carry payments so the tool
  // shows running balance + remaining. Payments are stored as a JSONB array on
  // the row; keeping them there (rather than a separate table) means no join and
  // trivial RLS reuse. Payment shape: {id, amount, date, note}.
  ZK.quotes = {
    save: async function(data){
      var u = await ZK.auth.getCurrentUser();
      if(!u) throw new Error('Not signed in.');
      data.created_by = u.id;
      var r = await sb.from('quotes').insert(data).select().single();
      if(r.error) throw r.error;
      return r.data;
    },
    update: async function(id, data){
      var r = await sb.from('quotes').update(data).eq('id', id).select().single();
      if(r.error) throw r.error;
      return r.data;
    },
    list: async function(){
      // Select * so the query works whether or not the `payments` migration has
      // been run yet. Missing columns just come back undefined; the render code
      // treats them defensively (Array.isArray, fallback to `total`, etc.).
      var r = await sb.from('quotes')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200);
      if(r.error) throw r.error;
      return r.data || [];
    },
    // ADMIN ONLY. Returns every rep's saved projects (relies on the admin RLS
    // policy on `quotes`), enriched with the rep's name under q._rep.
    listAll: async function(){
      var r = await sb.from('quotes')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(2000);
      if(r.error) throw r.error;
      var quotes = r.data || [];
      // Enrich with rep name. (profiles has no email column.) Admin RLS on `profiles` lets us read
      // everyone's row; without admin the join just fails silently and cards
      // fall back to showing the raw user id.
      var ids = [];
      var seen = {};
      quotes.forEach(function(q){ if(q.created_by && !seen[q.created_by]){ seen[q.created_by] = 1; ids.push(q.created_by); } });
      if(!ids.length) return quotes;
      var pr = await sb.from('profiles').select('id, full_name').in('id', ids);
      var byId = {};
      (pr.data || []).forEach(function(p){ byId[p.id] = p; });
      quotes.forEach(function(q){ q._rep = byId[q.created_by] || { id: q.created_by, email: null, full_name: null }; });
      return quotes;
    },
    get: async function(id){
      var r = await sb.from('quotes').select('*').eq('id', id).single();
      if(r.error) throw r.error;
      return r.data;
    },
    remove: async function(id){
      var r = await sb.from('quotes').delete().eq('id', id);
      if(r.error) throw r.error;
    },
    // ---- Payments / Invoices ----
    // Server-side atomic append via the *_atomic RPCs added in the
    // crit_fixes_migration. The old client-side read-modify-write was
    // racy (two concurrent adds could clobber each other); the new path
    // does the append inside a single UPDATE statement server-side.
    //
    // Backward compat: if the RPC doesn't exist yet (rep hasn't run the
    // migration), fall back to the legacy read-modify-write so nothing
    // breaks. The friendly _pmtErr / _invErr messages still surface if
    // the payments/invoices columns themselves are missing.
    addPayment: async function(id, payment){
      var r = await sb.rpc('add_payment_atomic', { quote_id: id, payment: payment });
      if(!r.error){
        // RPC returns setof quotes — take the first (and only) row.
        return Array.isArray(r.data) ? r.data[0] : r.data;
      }
      if(!/function .*add_payment_atomic.* does not exist/i.test(r.error.message || '')) throw _pmtErr(r.error);
      // ---- Legacy fallback: read-modify-write ----
      var cur = await sb.from('quotes').select('payments').eq('id', id).single();
      if(cur.error) throw _pmtErr(cur.error);
      var list = Array.isArray(cur.data.payments) ? cur.data.payments.slice() : [];
      payment.id = payment.id || 'pmt-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);
      payment.date = payment.date || new Date().toISOString().slice(0,10);
      list.push(payment);
      var upd = await sb.from('quotes').update({payments: list}).eq('id', id).select().single();
      if(upd.error) throw _pmtErr(upd.error);
      return upd.data;
    },
    removePayment: async function(id, paymentId){
      var r = await sb.rpc('remove_payment_atomic', { quote_id: id, payment_id: paymentId });
      if(!r.error){
        return Array.isArray(r.data) ? r.data[0] : r.data;
      }
      if(!/function .*remove_payment_atomic.* does not exist/i.test(r.error.message || '')) throw _pmtErr(r.error);
      var cur = await sb.from('quotes').select('payments').eq('id', id).single();
      if(cur.error) throw _pmtErr(cur.error);
      var list = (Array.isArray(cur.data.payments) ? cur.data.payments : []).filter(function(p){ return p.id !== paymentId; });
      var upd = await sb.from('quotes').update({payments: list}).eq('id', id).select().single();
      if(upd.error) throw _pmtErr(upd.error);
      return upd.data;
    },
    // Track invoices sent against a project. Each invoice:
    //   {id, number, description, amount, sent_date, notes, paid_id?}.
    // paid_id (optional) links to a payment id when the invoice has been paid.
    addInvoice: async function(id, invoice){
      var r = await sb.rpc('add_invoice_atomic', { quote_id: id, invoice: invoice });
      if(!r.error){
        return Array.isArray(r.data) ? r.data[0] : r.data;
      }
      if(!/function .*add_invoice_atomic.* does not exist/i.test(r.error.message || '')) throw _invErr(r.error);
      var cur = await sb.from('quotes').select('invoices').eq('id', id).single();
      if(cur.error) throw _invErr(cur.error);
      var list = Array.isArray(cur.data.invoices) ? cur.data.invoices.slice() : [];
      invoice.id = invoice.id || 'inv-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);
      invoice.sent_date = invoice.sent_date || new Date().toISOString().slice(0,10);
      list.push(invoice);
      var upd = await sb.from('quotes').update({invoices: list}).eq('id', id).select().single();
      if(upd.error) throw _invErr(upd.error);
      return upd.data;
    },
    removeInvoice: async function(id, invoiceId){
      var r = await sb.rpc('remove_invoice_atomic', { quote_id: id, invoice_id: invoiceId });
      if(!r.error){
        return Array.isArray(r.data) ? r.data[0] : r.data;
      }
      if(!/function .*remove_invoice_atomic.* does not exist/i.test(r.error.message || '')) throw _invErr(r.error);
      var cur = await sb.from('quotes').select('invoices').eq('id', id).single();
      if(cur.error) throw _invErr(cur.error);
      var list = (Array.isArray(cur.data.invoices) ? cur.data.invoices : []).filter(function(i){ return i.id !== invoiceId; });
      var upd = await sb.from('quotes').update({invoices: list}).eq('id', id).select().single();
      if(upd.error) throw _invErr(upd.error);
      return upd.data;
    }
  };
})();

// ---------- Renamed models ----------
// Saved quotes, contracts and projects keep the model name they were saved
// with. Show them under today's name (Kelsey 2026-10-20). The catalog's
// "aliases" hold the same list for the new quote tool.
ZK.RENAMED_MODELS = { 'Solitude': 'Kolob', 'Shasta': 'Oakley', 'Summit': 'Ozark' };
ZK.modelName = function(name){
  return (name && Object.prototype.hasOwnProperty.call(ZK.RENAMED_MODELS, name)) ? ZK.RENAMED_MODELS[name] : name;
};

// ---------- Shared payment-tracking UI helpers ----------
// Used by both the quoting tool's My Projects modal and the contract generator's
// My Contracts modal. Attached to window so both HTML pages can call them.
ZK.fmtMoney = function(n){
  if(n == null || n === '') return '—';
  var num = Number(n);
  if(!isFinite(num)) return '—';
  return '$' + Math.round(num).toLocaleString('en-US');
};
ZK.sumPayments = function(payments){
  if(!Array.isArray(payments)) return 0;
  return payments.reduce(function(a,p){ return a + (Number(p.amount) || 0); }, 0);
};
ZK.sumInvoices = function(invoices){
  if(!Array.isArray(invoices)) return 0;
  return invoices.reduce(function(a,i){ return a + (Number(i.amount) || 0); }, 0);
};
// ---------- Shared brand + payment metadata ----------
// Check details (payable-to + mailing address) for each brand. Wire details
// (account + routing numbers) are NOT kept in this repo: they live in the
// Supabase `payment_accounts` table (sql/2026-10_payment_accounts.sql) and are
// fetched by zkFetchWire() each time an invoice is generated.
ZK.paymentInfo = {
  zipkit: {
    payable: 'Zip Kit Homes, LLC',
    mailing: ['3665 W 2700 S', 'Cedar City, UT 84721']
  },
  mvp: {
    payable: 'Mountain Valley Prefab',
    mailing: ['3665 W 2700 S', 'Cedar City, UT 84721']
  },
  // ZipKit Steel is the same legal entity as ZipKit Homes, so check details
  // and the bank account are identical. Only the displayed brand differs.
  zksteel: {
    payable: 'Zip Kit Homes, LLC',
    mailing: ['3665 W 2700 S', 'Cedar City, UT 84721']
  }
};

// Which payment_accounts row each brand uses (Zip Kit Steel banks with Zip Kit).
ZK.paymentAccountKey = { zipkit: 'zipkit', zksteel: 'zipkit', mvp: 'mvp' };

// True only for a value made entirely of digits (surrounding spaces ignored).
// Placeholders like 'XXXXXXXX', blanks, dashes or notes all count as missing,
// so they can never print on a real invoice.
ZK.isDigits = function(v){
  return /^[0-9]+$/.test(String(v == null ? '' : v).trim());
};

// Fetch wire details for a brand from Supabase. Resolves to null on any
// problem (not signed in, table missing, row missing, numbers blank or not
// all digits, slow network) so invoices fall back to "Contact the office".
ZK.fetchWire = async function(brand){
  var key = ZK.paymentAccountKey[brand] || 'zipkit';
  var client = ZK.auth && ZK.auth.client;
  if(!client) return null;
  try {
    var query = client.from('payment_accounts')
      .select('account_name, account_number, routing_number, bank_name, bank_branch, bank_address, business_address')
      .eq('brand', key)
      .maybeSingle();
    var timeout = new Promise(function(resolve){ setTimeout(function(){ resolve({ error: 'timeout' }); }, 6000); });
    var r = await Promise.race([query, timeout]);
    var d = r && r.data;
    if(r.error || !d || !ZK.isDigits(d.account_number) || !ZK.isDigits(d.routing_number)) return null;
    return {
      accountName:     d.account_name || '',
      accountNumber:   String(d.account_number).trim(),
      routingNumber:   String(d.routing_number).trim(),
      bank:            d.bank_name || '',
      bankBranch:      d.bank_branch || null,
      bankAddress:     Array.isArray(d.bank_address) ? d.bank_address : [],
      businessAddress: Array.isArray(d.business_address) ? d.business_address : []
    };
  } catch(e){
    return null;
  }
};

// The "Wire transfer" box contents for an invoice. `wire` is the result of
// zkFetchWire(); when it's null the box tells the customer to contact the office.
ZK.wireHTML = function(wire, contact){
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  contact = contact || {};
  // Re-check here too, so no caller can print a placeholder or partial number.
  if(!wire || !ZK.isDigits(wire.accountNumber) || !ZK.isDigits(wire.routingNumber)){
    var how = [contact.email, contact.tel].filter(function(x){ return x; }).map(esc).join(' &nbsp;·&nbsp; ');
    return '<div style="color:#5f5e5a;">Contact the office for wire instructions.'+(how ? '<br>'+how : '')+'</div>';
  }
  var label = 'color:#888; padding:1px 6px 1px 0; vertical-align:top; white-space:nowrap;';
  var cell  = 'padding:1px 0; vertical-align:top;';
  function row(l, v){ return '<tr><td style="'+label+'">'+l+'</td><td style="'+cell+'">'+v+'</td></tr>'; }
  var bank = esc(wire.bank)
    + (wire.bankBranch ? '<br>'+esc(wire.bankBranch) : '')
    + (wire.bankAddress.length ? '<br>'+wire.bankAddress.map(esc).join('<br>') : '');
  return '<table style="width:100%; font-size:11px; border-collapse:collapse;">'
    + row('Account name', esc(wire.accountName))
    + row('Account #', esc(wire.accountNumber))
    + row('Routing #', esc(wire.routingNumber))
    + row('Bank', bank)
    + (wire.businessAddress.length ? row('Business addr', wire.businessAddress.map(esc).join('<br>')) : '')
    + '</table>';
};

// Shown in an invoice window while the wire details load.
ZK.invoiceLoadingHTML = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preparing invoice…</title></head>'
  + '<body style="margin:0; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#5f5e5a; padding:40px; text-align:center;">Preparing invoice…</body></html>';
ZK.brandInfo = {
  zipkit:  { name: 'Zip Kit Homes',           addr: '3665 West 2700 South, Cedar City UT 84721',     tel: '(435) 340·1171', email: 'sales@zipkithomes.com',           logoFile: 'zk-logo.png' },
  mvp:     { name: 'Mountain Valley Prefab',  addr: '3791 East 49th North, Idaho Falls ID 83401',    tel: '208·970·6904', email: 'sales@mountainvalleyprefab.com',  logoFile: 'mvp-logo.png' },
  zksteel: { name: 'Zip Kit Steel',           addr: '3665 West 2700 South, Cedar City UT 84721',     tel: '(435) 340·1171', email: 'sales@zipkitsteel.com',           logoFile: 'zksteel-logo.png' }
};

ZK.projectBalance = function(row){
  // Contract amount is what's actually owed (falls back to total for legacy rows).
  var contract  = Number(row.contract_amount || row.total || 0);
  var paid      = ZK.sumPayments(row.payments);
  var invoiced  = ZK.sumInvoices(row.invoices);
  return {
    contract: contract,
    invoiced: invoiced,
    paid: paid,
    // What's still owed overall (contract - paid). Never negative.
    remaining: Math.max(0, contract - paid),
    // What's been billed but not yet paid (invoiced - paid). Never negative.
    outstanding: Math.max(0, invoiced - paid),
    // What still needs to be billed (contract - invoiced). Never negative.
    notInvoiced: Math.max(0, contract - invoiced),
    pctPaid:     contract > 0 ? Math.min(100, Math.round((paid/contract) * 100)) : 0,
    pctInvoiced: contract > 0 ? Math.min(100, Math.round((invoiced/contract) * 100)) : 0
  };
};

// ---------- Local test store (localhost only) ----------
// The test pages turn this on (localStorage 'zk-test-store' = '1') so a
// practice quote and contract can be made end to end without touching the
// real database. Rows live in this browser's localStorage only. It can never
// turn on outside localhost / 127.0.0.1.
(function(){
  var on = false;
  try { on = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && localStorage.getItem('zk-test-store') === '1'; } catch(e){}
  if(!on) return;
  var KEY = 'zk-test-rows', user = { id: 'test-rep', email: 'new.rep@example.test' };
  function clone(x){ return JSON.parse(JSON.stringify(x)); }
  function all(){ try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e){ return []; } }
  function put(list){ localStorage.setItem(KEY, JSON.stringify(list)); }
  function find(list, id){ for(var i = 0; i < list.length; i++) if(list[i].id === id) return i; throw new Error('Not found in the test store.'); }
  function now(){ return new Date().toISOString(); }
  function append(field, prefix){
    return async function(id, item){ var list = all(), i = find(list, id); item = clone(item); item.id = item.id || prefix + Date.now();
      list[i][field] = (list[i][field] || []).concat([item]); list[i].updated_at = now(); put(list); return clone(list[i]); };
  }
  function drop(field){
    return async function(id, itemId){ var list = all(), i = find(list, id);
      list[i][field] = (list[i][field] || []).filter(function(x){ return x.id !== itemId; }); put(list); return clone(list[i]); };
  }
  ZK.TEST_STORE = true;
  ZK.auth = {
    client: null,
    signIn: async function(){ return { user: user }; },
    signOut: async function(){},
    getCurrentUser: async function(){ return user; },
    isAdmin: async function(){ try { return localStorage.getItem('zk-test-admin') === '1'; } catch(e){ return false; } },
    onAuthChange: function(){ return { data: { subscription: { unsubscribe: function(){} } } }; }
  };
  ZK.quotes = {
    save: async function(data){
      var list = all(), row = clone(data);
      row.id = 'test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      row.created_by = user.id; row.created_at = row.updated_at = now();
      row.quote_number = 'ZK-TEST-' + (1001 + list.length);
      row.payments = row.payments || []; row.invoices = row.invoices || [];
      list.unshift(row); put(list); return clone(row);
    },
    update: async function(id, data){ var list = all(), i = find(list, id); Object.assign(list[i], clone(data), { updated_at: now() }); put(list); return clone(list[i]); },
    list: async function(){ return all(); },
    listAll: async function(){ return all(); },
    get: async function(id){ var list = all(); return clone(list[find(list, id)]); },
    remove: async function(id){ put(all().filter(function(r){ return r.id !== id; })); },
    addPayment: append('payments', 'pmt-'), removePayment: drop('payments'),
    addInvoice: append('invoices', 'inv-'), removeInvoice: drop('invoices')
  };
})();

// Old global names for the portal and the contract generator (not used by the
// new quote tool). WordPress turns these off with legacyGlobals: false.
if(CFG.legacyGlobals !== false){
  root.ZK_REQUIRE_AUTH = CFG.requireAuth;
  ['auth', 'quotes', 'fmtMoney', 'sumPayments', 'sumInvoices', 'paymentInfo', 'paymentAccountKey', 'isDigits',
   'fetchWire', 'wireHTML', 'invoiceLoadingHTML', 'brandInfo', 'projectBalance'].forEach(function(k){
    if(ZK[k] !== undefined) root['zk' + k.charAt(0).toUpperCase() + k.slice(1)] = ZK[k];
  });
}
})(window);
