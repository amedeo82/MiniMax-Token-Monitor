/* I44 — dataset sintetico + file di backup equivalenti agli export reali.
   punti general: 40 rilevamenti orari da 50h a 10h fa, 4 cicli a dente di sega.
   righe per-modello (video): 15 timestamp × 2 finestre, source api (formato I42).
   eventi: 6 voci di tutti i kind (reset/warn/crit/error/pace/waste). */
(function () {
  var S = window.__i44;
  var now = Date.now();
  S.now0 = now;
  var points = [];
  for (var i = 0; i < 40; i++) {
    var t = now - (50 - i) * 3600000;
    var interval = 100 - (i % 10) * 8;
    var weekly = Math.round((95 - i * 0.5) * 10) / 10;
    points.push({ t: t, interval: interval, weekly: weekly });
  }
  var modelPoints = [];
  for (var j = 0; j < 15; j++) {
    var mt = now - (48 - j * 3) * 3600000;
    modelPoints.push({ model: 'video', win: 'interval', t: mt, percent: 98 - j * 5, source: 'api', region: 'eu' });
    modelPoints.push({ model: 'video', win: 'weekly', t: mt, percent: Math.round((90 - j * 2) * 10) / 10, source: 'api', region: 'eu' });
  }
  var events = [
    { id: 'i44-ev-1', t: now - 40 * 3600000, kind: 'reset', model: 'general', win: 'interval', message: 'Reset rilevato (test I44): finestra di 5 ore di general tornata al 100.0%', value: 100 },
    { id: 'i44-ev-2', t: now - 39 * 3600000, kind: 'warn', model: 'general', win: 'interval', message: 'Soglia di attenzione superata (test I44)', value: 24.8 },
    { id: 'i44-ev-3', t: now - 30 * 3600000, kind: 'crit', model: 'general', win: 'weekly', message: 'Quota quasi esaurita (test I44)', value: 9.5 },
    { id: 'i44-ev-4', t: now - 20 * 3600000, kind: 'error', model: null, win: null, message: 'Rilevamento fallito (test I44)', value: null },
    { id: 'i44-ev-5', t: now - 12 * 3600000, kind: 'pace', model: 'general', win: 'interval', message: 'Fermo tecnico previsto (test I44): esaurimento stimato prima del reset', value: 22.1 },
    { id: 'i44-ev-6', t: now - 6 * 3600000, kind: 'waste', model: 'video', win: 'weekly', message: 'Spreco previsto (test I44): 41.0% della finestra inutilizzata', value: 41 }
  ];
  var exportedAt = new Date(now - 3600000).toISOString();
  S.backupFull = JSON.stringify({ exportedAt: exportedAt, points: points, modelPoints: modelPoints });
  S.backupEvents = JSON.stringify({ exportedAt: exportedAt, events: events });
  S.expected = { points: points, modelPoints: modelPoints, events: events, exportedAt: exportedAt };
  S.usage = {
    base_resp: { status_code: 0, status_msg: 'success' },
    current_subscribe_title: 'Token Plan (mock I44)',
    credits_balance: 12.34,
    model_remains: [
      { model_name: 'general', current_interval_remaining_percent: 55.5, start_time: now - 2 * 3600000, end_time: now + 3 * 3600000, remains_time: 3 * 3600000, current_weekly_remaining_percent: 80.4, weekly_start_time: now - 2 * 86400000, weekly_end_time: now + 5 * 86400000, weekly_remains_time: 5 * 86400000 },
      { model_name: 'video', current_interval_remaining_percent: 70, start_time: now - 12 * 3600000, end_time: now + 12 * 3600000, remains_time: 12 * 3600000 }
    ]
  };
  /* Helper: contamina il negozio (un punto + un evento extra) per il test «sostituisci». */
  S.pollute = function () {
    S.points.push({ t: now - 2 * 3600000, interval: 77.7, weekly: 88.8, source: 'api', region: 'eu' });
    S.events.push({ id: 'i44-extra-ev', t: now - 1800000, kind: 'info', model: null, win: null, message: 'Evento extra da scartare col replace (test I44)', value: null });
    return S.points.length + '/' + S.events.length;
  };
  /* Helper: confronta il negozio con il backup atteso (ignora punti con t oltre il cutoff). */
  S.diff = function (cutoffT) {
    var res = { pointsMissing: 0, pointsExtra: 0, modelMissing: 0, modelExtra: 0, eventsMissing: 0, eventsExtra: 0, pollPoints: 0 };
    var key = function (p) { return '' + p.t; };
    var expP = {}, i;
    for (i = 0; i < S.expected.points.length; i++) expP[key(S.expected.points[i])] = S.expected.points[i];
    for (i = 0; i < S.points.length; i++) {
      var p = S.points[i];
      if (p.t > cutoffT) { res.pollPoints++; continue; }
      var e = expP[key(p)];
      if (!e) { res.pointsExtra++; continue; }
      if (e.interval !== p.interval || e.weekly !== p.weekly) res.pointsExtra++;
      delete expP[key(p)];
    }
    for (var a in expP) res.pointsMissing++;
    var expM = {};
    var mkey = function (p) { return p.model + '|' + p.win + '|' + p.t; };
    for (i = 0; i < S.expected.modelPoints.length; i++) expM[mkey(S.expected.modelPoints[i])] = S.expected.modelPoints[i];
    for (i = 0; i < S.modelPoints.length; i++) {
      var mp = S.modelPoints[i];
      var em = expM[mkey(mp)];
      if (!em) { res.modelExtra++; continue; }
      if (em.percent !== mp.percent || em.source !== mp.source || em.region !== mp.region) res.modelExtra++;
      delete expM[mkey(mp)];
    }
    for (var b in expM) res.modelMissing++;
    var expE = {};
    for (i = 0; i < S.expected.events.length; i++) expE[S.expected.events[i].id] = S.expected.events[i];
    for (i = 0; i < S.events.length; i++) {
      var ev = S.events[i];
      if (ev.t > cutoffT) continue;
      var ee = expE[ev.id];
      if (!ee) { res.eventsExtra++; continue; }
      if (ee.kind !== ev.kind || ee.t !== ev.t || ee.message !== ev.message || ee.value !== ev.value || (ee.model || null) !== ev.model || (ee.win || null) !== ev.win) res.eventsExtra++;
      delete expE[ev.id];
    }
    for (var c in expE) res.eventsMissing++;
    return res;
  };
  S.state = function () {
    return { p: S.points.length, m: S.modelPoints.length, e: S.events.length, posts: S.posts, deletes: S.deletes, polls: S.usagePolls };
  };
  /* Helper: inietta un file nell'input nascosto di ripristino e dispatcha change. */
  S.injectFile = function (name, content) {
    var input = document.querySelector('input[type="file"][aria-label="Seleziona il file di backup JSON"]');
    if (!input) return 'input-non-trovato';
    var dt = new DataTransfer();
    dt.items.add(new File([content], name, { type: 'application/json' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return 'iniettato';
  };
  return 'seme-ok: 40 punti, 30 righe video, 6 eventi';
})()
