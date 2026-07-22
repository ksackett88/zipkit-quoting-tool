// ============================================================================
// ZipKit Sales Tool — Supabase client + auth/quotes helpers
// ============================================================================
// Loaded via <script src="lib/supabase.js"></script> AFTER the supabase-js CDN.
// Exposes window.zkAuth and window.zkQuotes used by the tool pages.
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
window.ZK_REQUIRE_AUTH = true;

(function(){
  if(!window.supabase || !window.supabase.createClient){
    console.error('[zk] supabase-js CDN not loaded before lib/supabase.js');
    return;
  }

  var SUPABASE_URL     = 'https://slbkkeiyaobdesnpifml.supabase.co';
  var SUPABASE_PUB_KEY = 'sb_publishable_KQWnDMCOXbFKq4eVpx0kAQ_T7HmySYB';

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUB_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  // ---------- AUTH ----------
  window.zkAuth = {
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
  window.zkQuotes = {
    save: async function(data){
      var u = await window.zkAuth.getCurrentUser();
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
    get: async function(id){
      var r = await sb.from('quotes').select('*').eq('id', id).single();
      if(r.error) throw r.error;
      return r.data;
    },
    remove: async function(id){
      var r = await sb.from('quotes').delete().eq('id', id);
      if(r.error) throw r.error;
    },
    // ---- Payments ----
    // Add a payment record to a project. Returns the updated row.
    addPayment: async function(id, payment){
      var cur = await sb.from('quotes').select('payments').eq('id', id).single();
      if(cur.error) throw _pmtErr(cur.error);
      var list = Array.isArray(cur.data.payments) ? cur.data.payments.slice() : [];
      // Stamp id + created_at if missing so client code can key on them safely.
      payment.id = payment.id || 'pmt-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);
      payment.date = payment.date || new Date().toISOString().slice(0,10);
      list.push(payment);
      var upd = await sb.from('quotes').update({payments: list}).eq('id', id).select().single();
      if(upd.error) throw _pmtErr(upd.error);
      return upd.data;
    },
    removePayment: async function(id, paymentId){
      var cur = await sb.from('quotes').select('payments').eq('id', id).single();
      if(cur.error) throw _pmtErr(cur.error);
      var list = (Array.isArray(cur.data.payments) ? cur.data.payments : []).filter(function(p){ return p.id !== paymentId; });
      var upd = await sb.from('quotes').update({payments: list}).eq('id', id).select().single();
      if(upd.error) throw _pmtErr(upd.error);
      return upd.data;
    },
    // ---- Invoices ----
    // Track invoices sent against a project. Each invoice: {id, number, description, amount, sent_date, notes, paid_id?}.
    // paid_id (optional) links to a payment id when the invoice has been paid.
    addInvoice: async function(id, invoice){
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
      var cur = await sb.from('quotes').select('invoices').eq('id', id).single();
      if(cur.error) throw _invErr(cur.error);
      var list = (Array.isArray(cur.data.invoices) ? cur.data.invoices : []).filter(function(i){ return i.id !== invoiceId; });
      var upd = await sb.from('quotes').update({invoices: list}).eq('id', id).select().single();
      if(upd.error) throw _invErr(upd.error);
      return upd.data;
    }
  };
})();

// ---------- Shared payment-tracking UI helpers ----------
// Used by both the quoting tool's My Projects modal and the contract generator's
// My Contracts modal. Attached to window so both HTML pages can call them.
window.zkFmtMoney = function(n){
  if(n == null || n === '') return '—';
  var num = Number(n);
  if(!isFinite(num)) return '—';
  return '$' + Math.round(num).toLocaleString('en-US');
};
window.zkSumPayments = function(payments){
  if(!Array.isArray(payments)) return 0;
  return payments.reduce(function(a,p){ return a + (Number(p.amount) || 0); }, 0);
};
window.zkSumInvoices = function(invoices){
  if(!Array.isArray(invoices)) return 0;
  return invoices.reduce(function(a,i){ return a + (Number(i.amount) || 0); }, 0);
};
// ---------- Shared brand + payment metadata ----------
// Payment / wire / mailing details for each brand. Change here once; every doc
// (invoices generated from the portal, quoting tool, or contract generator)
// picks it up.
window.zkPaymentInfo = {
  zipkit: {
    payable: 'Zip Kit Homes, LLC',
    mailing: ['3665 W 2700 S', 'Cedar City, UT 84720'],
    wire: {
      accountName: 'ZipKit USA LLC',
      accountNumber: '501019237956',
      routingNumber: '324079555',
      bank: 'Mountain America Credit Union',
      bankBranch: 'Royal Hunt Drive UT Branch',
      bankAddress: ['1701 Royal Hunte Dr.', 'Cedar City, UT 84720'],
      businessAddress: ['3665 W 2700 S', 'Cedar City, UT 84720']
    }
  },
  mvp: {
    payable: 'Mountain Valley Prefab',
    mailing: ['3665 W 2700 S', 'Cedar City, UT 84720'],
    wire: {
      accountName: 'Mountain Valley Prefab',
      accountNumber: '501012652914',
      routingNumber: '324079555',
      bank: 'Mountain America Credit Union',
      bankBranch: null,
      bankAddress: [],
      businessAddress: ['3791 East 49th North', 'Idaho Falls, ID 83401']
    }
  },
  zksteel: {
    payable: 'Zip Kit Homes, LLC',
    mailing: ['3665 W 2700 S', 'Cedar City, UT 84720'],
    wire: {
      accountName: 'ZipKit USA LLC',
      accountNumber: '501019237956',
      routingNumber: '324079555',
      bank: 'Mountain America Credit Union',
      bankBranch: 'Royal Hunt Drive UT Branch',
      bankAddress: ['1701 Royal Hunte Dr.', 'Cedar City, UT 84720'],
      businessAddress: ['3665 W 2700 S', 'Cedar City, UT 84720']
    }
  }
};
window.zkBrandInfo = {
  zipkit:  { name: 'Zip Kit Homes',           addr: '3665 West 2700 South, Cedar City UT 84720',     tel: '(435) 340·1171', email: 'sales@zipkithomes.com',           logoFile: 'zk-logo.png' },
  mvp:     { name: 'Mountain Valley Prefab',  addr: '3791 East 49th North, Idaho Falls ID 83401',    tel: '(435) 592·3596', email: 'sales@mountainvalleyprefab.com',  logoFile: 'mvp-logo.png' },
  zksteel: { name: 'Zip Kit Steel',           addr: '3665 West 2700 South, Cedar City UT 84720',     tel: '(435) 340·1171', email: 'sales@zipkitsteel.com',           logoFile: 'zksteel-logo.png' }
};

window.zkProjectBalance = function(row){
  // Contract amount is what's actually owed (falls back to total for legacy rows).
  var contract  = Number(row.contract_amount || row.total || 0);
  var paid      = window.zkSumPayments(row.payments);
  var invoiced  = window.zkSumInvoices(row.invoices);
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
