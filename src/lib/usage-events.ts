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

import type { UsageSnapshot, ModelQuota } from "./minimax";

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
  try {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-EVENTS_MAX)));
  } catch {
    /* quota localStorage piena: il registro resta solo in memoria */
  }
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
  /** Soglia "attenzione" in % residua (0 = disattivata). */
  alertThresholdWarn: number;
  /** Soglia "critica" in % residua (0 = disattivata). */
  alertThresholdCrit: number;
  /** Notifica quando una finestra si resetta (salto verso il 100%). */
  notifyReset: boolean;
  /** Usa anche le Notification API del browser (serve permesso). */
  browserNotifications: boolean;
}

export const ALERT_DEFAULTS: AlertConfig = {
  alertsEnabled: true,
  alertThresholdWarn: 25,
  alertThresholdCrit: 10,
  notifyReset: true,
  browserNotifications: false,
};

/* ------------------------------------------------------------------ */
/* Banner di quota bassa (stateless, dallo snapshot corrente)           */
/* ------------------------------------------------------------------ */

export interface BannerInfo {
  level: "warn" | "crit";
  /** Voci del banner: una per finestra sotto soglia. */
  items: { model: string; modelLabel: string; win: "interval" | "weekly"; remaining: number; threshold: number }[];
}

/** Etichetta italiana della finestra (breve). */
function winShortLabel(win: "interval" | "weekly"): string {
  return win === "interval" ? "finestra di 5 ore" : "finestra settimanale";
}

/**
 * Livello del banner di quota bassa in base allo snapshot CORRENTE.
 * Considera solo il modello "general" (le due finestre che governano i modelli testuali).
 */
export function deriveBanner(snapshot: UsageSnapshot | null, cfg: AlertConfig): BannerInfo | null {
  if (!cfg.alertsEnabled || !snapshot) return null;
  const general = snapshot.models.find((m) => m.modelName.toLowerCase() === "general");
  if (!general) return null;

  const items: BannerInfo["items"] = [];
  const check = (win: "interval" | "weekly", w: ModelQuota["interval"], thr: number) => {
    if (thr <= 0 || !w || w.remainingPercent === null) return;
    if (w.remainingPercent < thr) {
      items.push({
        model: general.modelName,
        modelLabel: general.label,
        win,
        remaining: w.remainingPercent,
        threshold: thr,
      });
    }
  };

  // Soglia critica prevale: se una finestra è sotto la critica, quella voce è "crit"
  check("interval", general.interval, cfg.alertThresholdCrit);
  check("weekly", general.weekly, cfg.alertThresholdCrit);
  if (items.some((i) => i.threshold === cfg.alertThresholdCrit)) return { level: "crit", items };

  check("interval", general.interval, cfg.alertThresholdWarn);
  check("weekly", general.weekly, cfg.alertThresholdWarn);
  return items.length > 0 ? { level: "warn", items } : null;
}

/* ------------------------------------------------------------------ */
/* Transizioni tra snapshot (toast, notifiche, eventi)                 */
/* ------------------------------------------------------------------ */

export interface ThresholdAlert {
  model: string;
  modelLabel: string;
  win: "interval" | "weekly";
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

  const winKey = (win: "interval" | "weekly") => (win === "interval" ? "interval" : "weekly");

  for (const nextModel of next.models) {
    const prevModel = prev.models.find(
      (m) => m.modelName.toLowerCase() === nextModel.modelName.toLowerCase(),
    );
    if (!prevModel) continue;

    for (const win of ["interval", "weekly"] as const) {
      const pw = prevModel[winKey(win)];
      const nw = nextModel[winKey(win)];
      if (!pw || !nw) continue;
      if (pw.remainingPercent === null || nw.remainingPercent === null) continue;

      const from = pw.remainingPercent;
      const to = nw.remainingPercent;

      // Reset: salto verso l'alto di ≥ 25 punti, arrivando almeno al 90%
      if (cfg.notifyReset && to >= 90 && from <= to - 25) {
        result.resets.push({ model: nextModel.modelName, modelLabel: nextModel.label, win, from, to });
        result.events.push(
          makeEvent("reset", `Reset rilevato: ${winShortLabel(win)} di «${nextModel.modelName}» tornata al ${to.toFixed(1)}% (prima: ${from.toFixed(1)}%)`, {
            model: nextModel.modelName,
            win,
            value: to,
          }),
        );
        continue;
      }

      // Attraversamento soglia critica (dal sopra della soglia al sotto)
      if (cfg.alertThresholdCrit > 0 && from >= cfg.alertThresholdCrit && to < cfg.alertThresholdCrit) {
        result.alerts.push({
          model: nextModel.modelName, modelLabel: nextModel.label, win, level: "crit", from, to,
          threshold: cfg.alertThresholdCrit,
        });
        result.events.push(
          makeEvent("crit", `Soglia CRITICA superata: ${winShortLabel(win)} di «${nextModel.modelName}» al ${to.toFixed(1)}% (sotto il ${cfg.alertThresholdCrit}%)`, {
            model: nextModel.modelName,
            win,
            value: to,
          }),
        );
        continue;
      }

      // Attraversamento soglia di attenzione
      if (
        cfg.alertThresholdWarn > 0 &&
        from >= cfg.alertThresholdWarn &&
        to < cfg.alertThresholdWarn &&
        to >= Math.max(cfg.alertThresholdCrit, 0)
      ) {
        result.alerts.push({
          model: nextModel.modelName, modelLabel: nextModel.label, win, level: "warn", from, to,
          threshold: cfg.alertThresholdWarn,
        });
        result.events.push(
          makeEvent("warn", `Soglia di attenzione superata: ${winShortLabel(win)} di «${nextModel.modelName}» al ${to.toFixed(1)}% (sotto il ${cfg.alertThresholdWarn}%)`, {
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
