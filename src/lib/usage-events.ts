/**
 * Motore di monitoraggio della dashboard: avvisi di soglia, rilevamento dei reset
 * e registro eventi locale.
 *
 * Principi (vedi docs/03 §5.5):
 * - Tutto derivato ESCLUSIVAMENTE dagli snapshot di `token_plan/remains` e dallo
 *   storico locale: nessuna chiamata aggiuntiva, zero consumo di quota.
 * - Il BANNER di quota bassa è derivato dallo snapshot corrente (stateless).
 * - I TOAST / NOTIFICHE / EVENTI nascono solo da TRANSIZIONI tra due snapshot
 *   consecutivi (attraversamento di soglia verso il basso, salto di reset verso l'alto,
 *   passaggio ok → errore), così non si spammano ad ogni polling.
 */

import type { UsageSnapshot, QuotaWindow } from "./minimax";
import { persistJson } from "./persist-json";

/* ------------------------------------------------------------------ */
/* Registro eventi (localStorage)                                      */
/* ------------------------------------------------------------------ */

export type UsageEventKind = "reset" | "warn" | "crit" | "error" | "info";

export interface UsageEvent {
  id: string;
  /** Epoch ms dell'evento. */
  t: number;
  kind: UsageEventKind;
  /** Modello coinvolto (es. "general") o null per eventi generici. */
  model: string | null;
  /** Finestra coinvolta o null. */
  win: "interval" | "weekly" | null;
  message: string;
  /** Percentuale residua al momento dell'evento, se rilevante. */
  value: number | null;
}

const EVENTS_KEY = "mm-dash-events-v1";
const EVENTS_MAX = 200;

function readEvents(): UsageEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is UsageEvent =>
        typeof e === "object" && e !== null &&
        typeof (e as UsageEvent).id === "string" &&
        typeof (e as UsageEvent).t === "number" &&
        typeof (e as UsageEvent).message === "string",
    );
  } catch {
    return [];
  }
}

function writeEvents(events: UsageEvent[]): void {
  // I98 — scrittura con gestione esplicita della quota: su storage pieno il
  // registro viene ridotto FIFO (notifica una tantum, vedi persist-json.ts);
  // nessun catch silenzioso.
  persistJson(EVENTS_KEY, events.slice(-EVENTS_MAX), {
    riduci: (e, n) => e.slice(-n),
    etichetta: "registro eventi",
  });
}

/** Carica il registro eventi (dal più vecchio al più recente). */
export function loadEvents(): UsageEvent[] {
  if (typeof window === "undefined") return [];
  return readEvents();
}

/** Aggiunge uno o più eventi e restituisce il registro aggiornato (max EVENTS_MAX). */
export function appendEvents(list: UsageEvent | UsageEvent[]): UsageEvent[] {
  const added = Array.isArray(list) ? list : [list];
  const next = [...readEvents(), ...added].slice(-EVENTS_MAX);
  writeEvents(next);
  return next;
}

/** Svuota il registro eventi. */
export function clearEvents(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(EVENTS_KEY);
  } catch {
    /* noop */
  }
}

/**
 * I27 — Sostituisce il registro con una lista già fusa con l'archivio server
 * (usato dal merge all'avvio): il diario locale resta limitato a EVENTS_MAX.
 */
export function replaceEvents(events: UsageEvent[]): UsageEvent[] {
  const next = events.slice(-EVENTS_MAX);
  writeEvents(next);
  return next;
}

let idCounter = 0;

/** Factory di un evento con id univoco (timestamp + contatore monotonicо). */
export function makeEvent(
  kind: UsageEventKind,
  message: string,
  opts: { t?: number; model?: string | null; win?: "interval" | "weekly" | null; value?: number | null } = {},
): UsageEvent {
  return {
    id: `${Date.now()}-${(idCounter = (idCounter + 1) % 1_000_000).toString(36)}`,
    t: opts.t ?? Date.now(),
    kind,
    model: opts.model ?? null,
    win: opts.win ?? null,
    message,
    value: opts.value ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Configurazione avvisi                                               */
/* ------------------------------------------------------------------ */

export interface AlertConfig {
  /** Motore avvisi attivo (banner + toast + notifiche). */
  alertsEnabled: boolean;
  /** Soglie personalizzate per tipo di finestra (I28). */
  thresholds: AlertThresholds;
  /** Notifica quando una finestra si resetta (salto verso il 100%). */
  notifyReset: boolean;
  /** Usa anche le Notification API del browser (serve permesso). */
  browserNotifications: boolean;
}

/** Soglie (warn/crit) di una singola finestra, in % residua (0 = disattivata). */
export interface WindowThresholds {
  warn: number;
  crit: number;
}

/**
 * Chiave del tipo di finestra per le soglie personalizzate (I28):
 * - "h5"     → finestra di 5 ore (modelli testo/immagine/audio);
 * - "h24"    → finestra giornaliera a 24 ore (modello video);
 * - "weekly" → finestra settimanale (7 giorni, tutti i modelli).
 */
export type WindowThresholdKey = "h5" | "h24" | "weekly";

export interface AlertThresholds {
  h5: WindowThresholds;
  h24: WindowThresholds;
  weekly: WindowThresholds;
}

export const ALERT_DEFAULTS: AlertConfig = {
  alertsEnabled: true,
  thresholds: {
    h5: { warn: 25, crit: 10 },
    h24: { warn: 25, crit: 10 },
    weekly: { warn: 25, crit: 10 },
  },
  notifyReset: true,
  browserNotifications: false,
};

/** Etichetta italiana del tipo di finestra (per messaggi, toast e banner). */
export const WIN_THRESHOLD_LABELS: Record<WindowThresholdKey, string> = {
  h5: "finestra di 5 ore",
  h24: "finestra giornaliera (24 ore)",
  weekly: "finestra settimanale",
};

const HOUR_MS = 3_600_000;

/**
 * Risolve la chiave soglia per una coppia (modello, finestra): la finestra
 * "interval" è di 5 ore per i modelli testo ma di 24 ore per il video — la
 * durata reale (start → end) prevale sul nome del modello (robusto se MiniMax
 * aggiungesse altri tipi); in assenza di durata usa il nome (fallback demo).
 */
export function windowThresholdKey(
  modelName: string,
  win: "interval" | "weekly",
  w: QuotaWindow | null,
): WindowThresholdKey {
  if (win === "weekly") return "weekly";
  if (w && w.start !== null && w.end !== null) {
    const dur = w.end - w.start;
    if (dur >= 23 * HOUR_MS && dur <= 25 * HOUR_MS) return "h24";
    if (dur >= 4 * HOUR_MS && dur <= 6 * HOUR_MS) return "h5";
  }
  return modelName.toLowerCase() === "video" ? "h24" : "h5";
}

/**
 * I28 — Migrazione dalle vecchie soglie globali (`alertThresholdWarn/Crit`)
 * alle soglie per finestra: i valori legacy si applicano a TUTTE le finestre,
 * così il comportamento dell'utente resta identico dopo l'aggiornamento.
 * Accetta un oggetto qualunque (es. JSON dal localStorage) e restituisce le
 * soglie coerenti, oppure null se non c'è nulla di valido da migrare.
 */
export function migrateLegacyThresholds(raw: unknown): AlertThresholds | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  // Forma nuova: thresholds { h5, h24, weekly } — valida e completa i pezzi mancanti.
  const t = r.thresholds;
  if (typeof t === "object" && t !== null) {
    const tt = t as Record<string, unknown>;
    const pick = (v: unknown, def: WindowThresholds): WindowThresholds => {
      if (typeof v !== "object" || v === null) return def;
      const o = v as Record<string, unknown>;
      return {
        warn: typeof o.warn === "number" && isFinite(o.warn) && o.warn >= 0 ? o.warn : def.warn,
        crit: typeof o.crit === "number" && isFinite(o.crit) && o.crit >= 0 ? o.crit : def.crit,
      };
    };
    return {
      h5: pick(tt.h5, ALERT_DEFAULTS.thresholds.h5),
      h24: pick(tt.h24, ALERT_DEFAULTS.thresholds.h24),
      weekly: pick(tt.weekly, ALERT_DEFAULTS.thresholds.weekly),
    };
  }

  // Forma legacy: due numeri globali.
  const warn = typeof r.alertThresholdWarn === "number" && isFinite(r.alertThresholdWarn) && r.alertThresholdWarn >= 0 ? r.alertThresholdWarn : null;
  const crit = typeof r.alertThresholdCrit === "number" && isFinite(r.alertThresholdCrit) && r.alertThresholdCrit >= 0 ? r.alertThresholdCrit : null;
  if (warn === null && crit === null) return null;
  const w = warn ?? ALERT_DEFAULTS.thresholds.h5.warn;
  const c = crit ?? ALERT_DEFAULTS.thresholds.h5.crit;
  return { h5: { warn: w, crit: c }, h24: { warn: w, crit: c }, weekly: { warn: w, crit: c } };
}

/* ------------------------------------------------------------------ */
/* Banner di quota bassa (stateless, dallo snapshot corrente)           */
/* ------------------------------------------------------------------ */

export interface BannerInfo {
  level: "warn" | "crit";
  /** Voci del banner: una per (modello, finestra) sotto soglia. */
  items: {
    model: string;
    modelLabel: string;
    win: "interval" | "weekly";
    /** Tipo di finestra risolto (I28) — determina soglie ed etichetta. */
    winKey: WindowThresholdKey;
    winLabel: string;
    remaining: number;
    threshold: number;
  }[];
}

/**
 * Livello del banner di quota bassa in base allo snapshot CORRENTE.
 * I28: considera TUTTI i modelli e applica a ciascuna finestra le soglie
 * del proprio tipo (5 ore / 24 ore / settimanale).
 */
export function deriveBanner(snapshot: UsageSnapshot | null, cfg: AlertConfig): BannerInfo | null {
  if (!cfg.alertsEnabled || !snapshot) return null;

  const collect = (level: "warn" | "crit"): BannerInfo["items"] => {
    const items: BannerInfo["items"] = [];
    for (const model of snapshot.models) {
      for (const win of ["interval", "weekly"] as const) {
        const w = model[win];
        if (!w || w.remainingPercent === null) continue;
        const winKey = windowThresholdKey(model.modelName, win, w);
        const thr = level === "crit" ? cfg.thresholds[winKey].crit : cfg.thresholds[winKey].warn;
        if (thr <= 0) continue;
        if (w.remainingPercent < thr) {
          items.push({
            model: model.modelName,
            modelLabel: model.label,
            win,
            winKey,
            winLabel: WIN_THRESHOLD_LABELS[winKey],
            remaining: w.remainingPercent,
            threshold: thr,
          });
        }
      }
    }
    return items;
  };

  // Soglia critica prevale: se una finestra è sotto la sua critica, il banner è "crit"
  const critItems = collect("crit");
  if (critItems.length > 0) return { level: "crit", items: critItems };

  const warnItems = collect("warn");
  return warnItems.length > 0 ? { level: "warn", items: warnItems } : null;
}

/* ------------------------------------------------------------------ */
/* Transizioni tra snapshot (toast, notifiche, eventi)                 */
/* ------------------------------------------------------------------ */

export interface ThresholdAlert {
  model: string;
  modelLabel: string;
  win: "interval" | "weekly";
  /** Tipo di finestra risolto (I28). */
  winKey: WindowThresholdKey;
  winLabel: string;
  level: "warn" | "crit";
  /** Percentuale precedente → attuale. */
  from: number;
  to: number;
  threshold: number;
}

export interface ResetAlert {
  model: string;
  modelLabel: string;
  win: "interval" | "weekly";
  /** Tipo di finestra risolto (I28). */
  winKey: WindowThresholdKey;
  winLabel: string;
  from: number;
  to: number;
}

export interface TransitionResult {
  alerts: ThresholdAlert[];
  resets: ResetAlert[];
  events: UsageEvent[];
}

/**
 * Confronta lo snapshot precedente con quello nuovo e individua le transizioni:
 * - attraversamento verso il basso delle soglie warn/crit;
 * - reset di una finestra (salto significativo verso l'alto, ≥ +25 punti e ≥ 90%).
 * Genera anche gli eventi corrispondenti per il registro.
 */
export function evaluateTransitions(
  prev: UsageSnapshot | null,
  next: UsageSnapshot,
  cfg: AlertConfig,
): TransitionResult {
  const result: TransitionResult = { alerts: [], resets: [], events: [] };
  if (!cfg.alertsEnabled || !prev) return result;

  for (const nextModel of next.models) {
    const prevModel = prev.models.find(
      (m) => m.modelName.toLowerCase() === nextModel.modelName.toLowerCase(),
    );
    if (!prevModel) continue;

    for (const win of ["interval", "weekly"] as const) {
      const pw = prevModel[win];
      const nw = nextModel[win];
      if (!pw || !nw) continue;
      if (pw.remainingPercent === null || nw.remainingPercent === null) continue;

      const from = pw.remainingPercent;
      const to = nw.remainingPercent;
      // I28: ogni (modello, finestra) usa le soglie del proprio tipo di finestra
      const winKey2 = windowThresholdKey(nextModel.modelName, win, nw);
      const winLabel = WIN_THRESHOLD_LABELS[winKey2];
      const thrCrit = cfg.thresholds[winKey2].crit;
      const thrWarn = cfg.thresholds[winKey2].warn;

      // Reset: salto verso l'alto di ≥ 25 punti, arrivando almeno al 90%
      if (cfg.notifyReset && to >= 90 && from <= to - 25) {
        result.resets.push({
          model: nextModel.modelName, modelLabel: nextModel.label, win, winKey: winKey2, winLabel, from, to,
        });
        result.events.push(
          makeEvent("reset", `Reset rilevato: ${winLabel} di «${nextModel.modelName}» tornata al ${to.toFixed(1)}% (prima: ${from.toFixed(1)}%)`, {
            model: nextModel.modelName,
            win,
            value: to,
          }),
        );
        continue;
      }

      // Attraversamento soglia critica (dal sopra della soglia al sotto)
      if (thrCrit > 0 && from >= thrCrit && to < thrCrit) {
        result.alerts.push({
          model: nextModel.modelName, modelLabel: nextModel.label, win, winKey: winKey2, winLabel,
          level: "crit", from, to, threshold: thrCrit,
        });
        result.events.push(
          makeEvent("crit", `Soglia CRITICA superata: ${winLabel} di «${nextModel.modelName}» al ${to.toFixed(1)}% (sotto il ${thrCrit}%)`, {
            model: nextModel.modelName,
            win,
            value: to,
          }),
        );
        continue;
      }

      // Attraversamento soglia di attenzione
      if (thrWarn > 0 && from >= thrWarn && to < thrWarn && to >= Math.max(thrCrit, 0)) {
        result.alerts.push({
          model: nextModel.modelName, modelLabel: nextModel.label, win, winKey: winKey2, winLabel,
          level: "warn", from, to, threshold: thrWarn,
        });
        result.events.push(
          makeEvent("warn", `Soglia di attenzione superata: ${winLabel} di «${nextModel.modelName}» al ${to.toFixed(1)}% (sotto il ${thrWarn}%)`, {
            model: nextModel.modelName,
            win,
            value: to,
          }),
        );
      }
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Notifiche del browser (Notification API, opzionali)                 */
/* ------------------------------------------------------------------ */

/** true se le notifiche del browser sono disponibili e consentite. */
export function canNotify(): boolean {
  return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
}

/** Mostra una notifica del browser (silenziosa se il permesso manca). */
export function notifyBrowser(title: string, body: string): void {
  if (!canNotify()) return;
  try {
    new Notification(title, { body, icon: "/favicon.ico", tag: "mm-dash" });
  } catch {
    /* alcuni browser richiedono il ServiceWorker: ignora silenziosamente */
  }
}
