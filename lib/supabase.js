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

  // ---------- QUOTES ----------
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
      var r = await sb.from('quotes')
        .select('id, quote_number, created_at, updated_at, product_kind, model, units, buyer_name, project_name, total, brand')
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
    }
  };
})();
