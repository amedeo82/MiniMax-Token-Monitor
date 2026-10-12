/* I44 — intercettore fetch stateful per la verifica (confinato alla sessione).
   Simula /api/history, /api/events e /api/minimax/usage in memoria (upsert,
   dedup, DELETE per scope), con i COMPORTAMENTI delle route reali.
   Installato dopo il caricamento: le uniche richieste che raggiungono il
   server reale sono le GET/POST precedenti a questo punto, già smistate
   dalle route Playwright statiche (rete di sicurezza anti-scrittura). */
(function () {
  if (window.__i44 && window.__i44.installed) return 'gia-installato';
  var S = window.__i44 || (window.__i44 = {});
  S.installed = true;
  S.points = S.points || [];
  S.modelPoints = S.modelPoints || [];
  S.events = S.events || [];
  S.posts = S.posts || 0;
  S.deletes = S.deletes || 0;
  S.usagePolls = S.usagePolls || 0;
  S.log = S.log || [];
  var orig = window.fetch.bind(window);
  function epoch(v) {
    var n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    if (!isFinite(n)) return null;
    if (n > 1e12) return Math.round(n);
    if (n > 1e9) return Math.round(n * 1000);
    return null;
  }
  function pct(v) {
    var n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    return isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
  }
  function str(v, max) {
    return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null;
  }
  function json(res) {
    return new Response(JSON.stringify(res), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = ((init && init.method) || 'GET').toUpperCase();
    var u;
    try { u = new URL(url, location.origin); } catch (e) { return orig(input, init); }
    if (u.origin !== location.origin) return orig(input, init);
    var body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) { body = null; }

    if (u.pathname === '/api/history') {
      if (method === 'POST') {
        S.posts++;
        var stored = 0, modelStored = 0, i, row, k;
        var list = (body && body.points) || [];
        for (k = 0; k < list.length; k++) {
          var p = list[k];
          var t = epoch(p.t);
          if (t === null) continue;
          row = { t: t, interval: pct(p.interval), weekly: pct(p.weekly), source: str(p.source, 16) || 'api', region: p.region === 'cn' ? 'cn' : 'eu' };
          for (i = 0; i < S.points.length; i++) { if (S.points[i].t === t) { S.points[i] = row; break; } }
          if (i >= S.points.length) S.points.push(row);
          stored++;
        }
        var mlist = (body && body.modelPoints) || [];
        for (k = 0; k < mlist.length; k++) {
          var mp = mlist[k];
          var m = str(mp.model, 32);
          var win = mp.win === 'interval' || mp.win === 'weekly' ? mp.win : null;
          var mt = epoch(mp.t);
          var pc = pct(mp.percent);
          if (m === null || win === null || mt === null || pc === null || m === 'general') continue;
          row = { model: m, win: win, t: mt, percent: pc, source: str(mp.source, 16) || 'api', region: mp.region === 'cn' ? 'cn' : 'eu' };
          var found = false;
          for (i = 0; i < S.modelPoints.length; i++) {
            if (S.modelPoints[i].model === row.model && S.modelPoints[i].win === row.win && S.modelPoints[i].t === row.t) { S.modelPoints[i] = row; found = true; break; }
          }
          if (!found) S.modelPoints.push(row);
          modelStored++;
        }
        S.log.push('POST history +' + stored + '/' + modelStored);
        return json({ ok: true, stored: stored, total: S.points.length, modelStored: modelStored, modelTotal: S.modelPoints.length });
      }
      if (method === 'DELETE') {
        S.deletes++;
        var modelP = u.searchParams.get('model');
        var scope = u.searchParams.get('scope');
        if (modelP !== null) {
          var beforeM = S.modelPoints.length;
          S.modelPoints = modelP === 'all' ? [] : S.modelPoints.filter(function (x) { return x.model !== modelP.toLowerCase(); });
          return json({ ok: true, deleted: 0, modelDeleted: beforeM - S.modelPoints.length });
        }
        if (scope === 'general') {
          var beforeG = S.points.length;
          S.points = [];
          return json({ ok: true, deleted: beforeG, modelDeleted: 0 });
        }
        var d = S.points.length, dm = S.modelPoints.length;
        S.points = []; S.modelPoints = [];
        return json({ ok: true, deleted: d, modelDeleted: dm });
      }
      var modelG = u.searchParams.get('model');
      var limit = Number(u.searchParams.get('limit') || '2000') || 2000;
      if (modelG !== null) {
        var mm = modelG.toLowerCase();
        var rows = (modelG === 'all' ? S.modelPoints : S.modelPoints.filter(function (x) { return x.model === mm; })).slice(0, limit);
        return json({ ok: true, total: S.modelPoints.length, points: [], modelPoints: rows });
      }
      return json({ ok: true, total: S.points.length, modelTotal: S.modelPoints.length, points: S.points.slice().sort(function (a, b) { return a.t - b.t; }).slice(0, limit) });
    }

    if (u.pathname === '/api/events') {
      if (method === 'POST') {
        S.posts++;
        var storedE = 0, kinds = ['reset', 'warn', 'crit', 'error', 'info', 'pace', 'waste'];
        var elist = (body && body.events) || [];
        for (var q = 0; q < elist.length; q++) {
          var ev = elist[q];
          var id = str(ev.id, 64);
          var et = epoch(ev.t);
          var kind = kinds.indexOf(ev.kind) >= 0 ? ev.kind : null;
          var msg = str(ev.message, 500);
          if (id === null || et === null || kind === null || msg === null) continue;
          var erow = { id: id, t: et, kind: kind, model: str(ev.model, 64), win: ev.win === 'interval' || ev.win === 'weekly' ? ev.win : null, message: msg, value: pct(ev.value) };
          var fi = -1;
          for (var w = 0; w < S.events.length; w++) { if (S.events[w].id === id) { fi = w; break; } }
          if (fi >= 0) S.events[fi] = erow; else S.events.push(erow);
          storedE++;
        }
        S.log.push('POST events +' + storedE);
        return json({ ok: true, stored: storedE, total: S.events.length });
      }
      if (method === 'DELETE') {
        S.deletes++;
        var de = S.events.length;
        S.events = [];
        return json({ ok: true, deleted: de });
      }
      var limE = Number(u.searchParams.get('limit') || '2000') || 2000;
      return json({ ok: true, total: S.events.length, events: S.events.slice().sort(function (a, b) { return a.t - b.t; }).slice(0, limE) });
    }

    if (u.pathname === '/api/minimax/usage' && method === 'POST') {
      S.usagePolls++;
      S.log.push('POLL usage');
      return json({ ok: true, data: S.usage, fetchedAt: Date.now(), endpoint: 'mock://token_plan/remains', fallback: false });
    }
    return orig(input, init);
  };
  return 'installato';
})()
