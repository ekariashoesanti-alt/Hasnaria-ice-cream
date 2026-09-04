/* Hasnaria Sales — infographic overlay + Majoo import */
(function () {
  'use strict';

  var SB = window.HASNARIA_SB;
  var KEY = window.HASNARIA_KEY;
  var BRAND = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var TAG_SKU = '⟦SKU:';
  var TAG_PAY_RE = /⟦PAY:cash=([\d.]+)\|qris=([\d.]+)\|tf=([\d.]+)⟧/;
  var STATE = { mode: 'daily', rows: [], loading: false, fetched: false, importing: false, fileName: '', msg: '', error: '', draw: false, viewFrom: '', viewTo: '', viewMonth: '' };

  function jwtAlive(token) {
    try {
      var part = String(token || '').split('.')[1];
      if (!part) return false;
      var b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var payload = JSON.parse(atob(b64));
      return payload && payload.exp && (payload.exp * 1000 > Date.now() + 5000);
    } catch (e) { return false; }
  }
  function pickTokenFromStorage() {
    var prefer = ['hasnaria-auth-v2'];
    var i, k, v, j, t;
    for (i = 0; i < prefer.length; i++) {
      try {
        v = localStorage.getItem(prefer[i]);
        j = JSON.parse(v || '');
        t = j && (j.access_token || (j.currentSession && j.currentSession.access_token));
        if (t && jwtAlive(t)) return t;
      } catch (e) {}
    }
    for (i = 0; i < localStorage.length; i++) {
      k = localStorage.key(i) || '';
      if (k.indexOf('auth') < 0 && k.indexOf('supabase') < 0 && k.indexOf('sb-') < 0) continue;
      try {
        v = localStorage.getItem(k);
        j = JSON.parse(v || '');
        t = j && (j.access_token || (j.currentSession && j.currentSession.access_token));
        if (t && jwtAlive(t)) return t;
      } catch (e) {}
    }
    return null;
  }
  async function tok() {
    if (typeof window.__HASNARIA_GET_ACCESS_TOKEN === 'function') {
      try {
        var fresh = await window.__HASNARIA_GET_ACCESS_TOKEN();
        if (fresh && jwtAlive(fresh)) return fresh;
      } catch (e) {}
    }
    try {
      if (window.__HASNARIA_DB && window.__HASNARIA_DB.auth && window.__HASNARIA_DB.auth.getSession) {
        var res = await window.__HASNARIA_DB.auth.getSession();
        var sess = res && res.data && res.data.session;
        if (sess && sess.access_token && jwtAlive(sess.access_token)) return sess.access_token;
      }
    } catch (e) {}
    return pickTokenFromStorage();
  }
  // truncated intentionally for size - SEE NOTE
  console.error('INCOMPLETE PUSH - full content required');
})();
