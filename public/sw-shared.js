/**
 * I52 — Fonte unica condivisa tra la pagina e il Service Worker (ADR-14).
 *
 * Questo file contiene la logica ESSENZIALE che deve essere IDENTICA su
 * entrambi i lati:
 * - `parseUsagePayload`: parsing tollerante della risposta Token Plan
 *   (specchio fedele di `parseUsageResponse` in src/lib/minimax.ts);
 * - `quotaKeyFor`: risoluzione del tipo finestra h5/h24/weekly (specchio di
 *   `windowThresholdKey` in src/lib/usage-events.ts);
 * - `evaluate`: transizioni warn/crit/reset tra due snapshot (specchio di
 *   `evaluateTransitions`).
 *
 * Perché un duplicato in JavaScript puro? Il Service Worker è un classico
 * script servito da /public: non può importare i moduli TypeScript di src/.
 * La correttezza del doppio binomio è garantita dai TEST DI PARITA
 * (tests/lib/sw-parity.test.ts): le stesse fixture passano da entrambe le
 * implementazioni e gli output vengono confrontati. Se il TS evolve e il JS
 * no, la suite rompe e la divergenza non passa inosservata.
 *
 * Bug corretti durante la verifica I52 e qui coperti dai test:
 * - base_resp annidato: alcune risposte mettono base_resp SOLO dentro `data`;
 * - (nel SW) lo snapshot cachato era un errore 1004: qui il parser segnala
 *   correttamente ok:false con statusCode, così il SW non notifica mai.
 */
(function (global) {
  "use strict";

  /* --------------------------- helper --------------------------- */

  function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }

  function num(v) {
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v))) return Number(v);
    return null;
  }

  function str(v) {
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  }

  function epochMs(v) {
    var n = num(v);
    if (n === null) return null;
    if (n > 1e12) return n; // già ms
    if (n > 1e9) return n * 1000; // secondi
    return null;
  }

  function durationMs(v) {
    var n = num(v);
    if (n === null || n <= 0) return null;
    return n > 1e6 ? n : n * 1000; // ms oppure secondi
  }

  function normalizeStatus(v) {
    if (typeof v === "number" && isFinite(v)) return String(v);
    return str(v);
  }

  var MODEL_LABELS = {
    general: "Testo · Immagini · Audio",
    text: "Testo",
    video: "Video (H3)",
    image: "Immagini",
    audio: "Audio",
    speech: "Voce · Sintesi",
    search: "Ricerca web",
  };

  function modelLabel(name) {
    var k = String(name || "").toLowerCase();
    return MODEL_LABELS[k] || name;
  }

  /* --------------------------- parsing --------------------------- */

  function parseWindow(item, kind) {
    var p = kind === "weekly" ? "weekly_" : "current_interval_";
    var remainingPercent = num(item[kind === "weekly" ? "current_weekly_remaining_percent" : "current_interval_remaining_percent"]);
    var totalCount = num(item[kind === "weekly" ? "current_weekly_total_count" : "current_interval_total_count"]);
    var remainingCount = num(item[kind === "weekly" ? "current_weekly_usage_count" : "current_interval_usage_count"]);
    var status = normalizeStatus(item[kind === "weekly" ? "current_weekly_status" : "current_interval_status"]);
    var start = epochMs(item[kind === "weekly" ? "weekly_start_time" : "start_time"]);
    var end = epochMs(item[kind === "weekly" ? "weekly_end_time" : "end_time"]);
    var remainsTimeMs = durationMs(item[kind === "weekly" ? "weekly_remains_time" : "remains_time"]);

    var hasAny =
      remainingPercent !== null || totalCount !== null || remainingCount !== null || start !== null || end !== null;
    if (!hasAny) return null;

    return { remainingPercent: remainingPercent, totalCount: totalCount, remainingCount: remainingCount, status: status, start: start, end: end, remainsTimeMs: remainsTimeMs };
  }

  /**
   * Specchio di parseUsageResponse: accetta risposta piatta o annidata sotto
   * `data`, legge base_resp a livello radice O dentro data (bug annidato) e
   * restituisce { ok:true, snapshot } oppure { ok:false, statusCode?, error }.
   */
  function parseUsagePayload(raw) {
    if (!isRecord(raw)) return { ok: false, error: "Risposta API non valida: atteso un oggetto JSON." };

    var payload = raw;
    if (isRecord(raw.data) && (isRecord(raw.data.model_remains) || Array.isArray(raw.data.model_remains))) {
      payload = raw.data;
    }

    // base_resp: prima a livello radice, poi dentro data (bug base_resp annidato)
    var baseResp = null;
    if (isRecord(raw.base_resp)) baseResp = raw.base_resp;
    else if (isRecord(payload.base_resp)) baseResp = payload.base_resp;

    var statusCode = baseResp ? num(baseResp.status_code) : null;
    var statusMsg = baseResp ? str(baseResp.status_msg) : null;

    if (statusCode !== null && statusCode !== 0) {
      return {
        ok: false,
        statusCode: statusCode,
        error:
          statusCode === 1004
            ? "Chiave API non valida o non autenticata (status_code 1004)."
            : "Errore API MiniMax: " + (statusMsg !== null ? statusMsg : "status_code " + statusCode),
      };
    }

    var list = Array.isArray(payload.model_remains) ? payload.model_remains : [];
    var models = [];
    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      if (!isRecord(entry)) continue;
      var name = str(entry.model_name);
      if (!name) continue;
      var interval = parseWindow(entry, "interval");
      var weekly = parseWindow(entry, "weekly");
      if (interval === null && weekly === null) continue;
      models.push({ modelName: name, label: modelLabel(name), interval: interval, weekly: weekly });
    }

    var planTitle =
      str(payload.current_subscribe_title) !== null
        ? str(payload.current_subscribe_title)
        : str(payload.plan_name) !== null
          ? str(payload.plan_name)
          : str(payload.combo_title) !== null
            ? str(payload.combo_title)
            : str(payload.current_plan_title) !== null
              ? str(payload.current_plan_title)
              : isRecord(payload.current_combo_card)
                ? str(payload.current_combo_card.title)
                : null;

    var credits =
      num(payload.points_balance) !== null
        ? num(payload.points_balance)
        : num(payload.point_balance) !== null
          ? num(payload.point_balance)
          : num(payload.credits_balance) !== null
            ? num(payload.credits_balance)
            : num(payload.credit_balance) !== null
              ? num(payload.credit_balance)
              : num(payload.balance);

    return {
      ok: true,
      snapshot: {
        planTitle: planTitle,
        credits: credits,
        models: models,
        fetchedAt: Date.now(),
        source: "api",
        region: "eu",
      },
    };
  }

  /* -------------------- soglie per tipo finestra -------------------- */

  var HOUR_MS = 3600000;

  var WIN_LABELS = {
    h5: "finestra di 5 ore",
    h24: "finestra giornaliera (24 ore)",
    weekly: "finestra settimanale",
  };

  /**
   * Specchio di windowThresholdKey: la durata reale (start→end) prevale sul
   * nome del modello; fallback video → h24, tutto il resto → h5.
   */
  function quotaKeyFor(modelName, win, w) {
    if (win === "weekly") return "weekly";
    if (w && w.start !== null && w.end !== null) {
      var dur = w.end - w.start;
      if (dur >= 23 * HOUR_MS && dur <= 25 * HOUR_MS) return "h24";
      if (dur >= 4 * HOUR_MS && dur <= 6 * HOUR_MS) return "h5";
    }
    return String(modelName).toLowerCase() === "video" ? "h24" : "h5";
  }

  /* ------------------------ transizioni ------------------------ */

  /**
   * Specchio di evaluateTransitions: confronta lo snapshot precedente con
   * quello nuovo e individua reset (salto ≥ +25 verso ≥ 90) e attraversamenti
   * verso il basso delle soglie crit/warn del tipo finestra risolto.
   * Restituisce { alerts: [...], resets: [...] } senza eventi (il registro è
   * cura della pagina; il SW usa questi dati SOLO per le notifiche).
   */
  function evaluate(prev, next, cfg) {
    var alerts = [];
    var resets = [];
    if (!cfg || !cfg.alertsEnabled || !prev || !next) return { alerts: alerts, resets: resets };

    for (var m = 0; m < next.models.length; m++) {
      var nm = next.models[m];
      var pm = null;
      for (var p = 0; p < prev.models.length; p++) {
        if (String(prev.models[p].modelName).toLowerCase() === String(nm.modelName).toLowerCase()) {
          pm = prev.models[p];
          break;
        }
      }
      if (!pm) continue;

      var wins = ["interval", "weekly"];
      for (var wi = 0; wi < wins.length; wi++) {
        var win = wins[wi];
        var pw = pm[win];
        var nw = nm[win];
        if (!pw || !nw) continue;
        if (pw.remainingPercent === null || nw.remainingPercent === null) continue;

        var from = pw.remainingPercent;
        var to = nw.remainingPercent;
        var key = quotaKeyFor(nm.modelName, win, nw);
        var thrCrit = cfg.thresholds[key].crit;
        var thrWarn = cfg.thresholds[key].warn;
        var winLabel = WIN_LABELS[key];

        if (cfg.notifyReset && to >= 90 && from <= to - 25) {
          resets.push({ model: nm.modelName, modelLabel: nm.label, win: win, winKey: key, winLabel: winLabel, from: from, to: to });
          continue;
        }
        if (thrCrit > 0 && from >= thrCrit && to < thrCrit) {
          alerts.push({ model: nm.modelName, modelLabel: nm.label, win: win, winKey: key, winLabel: winLabel, level: "crit", from: from, to: to, threshold: thrCrit });
          continue;
        }
        if (thrWarn > 0 && from >= thrWarn && to < thrWarn && to >= Math.max(thrCrit, 0)) {
          alerts.push({ model: nm.modelName, modelLabel: nm.label, win: win, winKey: key, winLabel: winLabel, level: "warn", from: from, to: to, threshold: thrWarn });
        }
      }
    }

    return { alerts: alerts, resets: resets };
  }

  var MMSwShared = {
    parseUsagePayload: parseUsagePayload,
    quotaKeyFor: quotaKeyFor,
    evaluate: evaluate,
    WIN_LABELS: WIN_LABELS,
    modelLabel: modelLabel,
  };

  /* Classic script (SW) → globale; ESM (test bun) → export nominali. */
  if (typeof self !== "undefined") self.MMSwShared = MMSwShared;
  if (typeof globalThis !== "undefined") globalThis.MMSwShared = MMSwShared;
  if (typeof module !== "undefined" && module.exports) module.exports = MMSwShared;
})(typeof globalThis !== "undefined" ? globalThis : self);
