/**
 * Tipi e parser per la risposta dell'API MiniMax Token Plan.
 *
 * Endpoint ufficiale (Europa): POST/GET https://www.minimax.io/v1/token_plan/remains
 * Header: Authorization: Bearer <Subscription Key>
 *
 * Struttura risposta (piatta o annidata sotto `data`):
 * {
 *   "base_resp": { "status_code": 0, "status_msg": "success" },
 *   "current_subscribe_title": "...",          // opzionale
 *   "points_balance" | "credits_balance": ..., // opzionale
 *   "model_remains": [
 *     {
 *       "model_name": "general" | "video" | ...,
 *       "current_interval_remaining_percent": 84.5,   // finestra 5h
 *       "current_interval_total_count": 0,            // 0 quando la quota è in percentuale
 *       "current_interval_usage_count": 0,            // NB: quota RIMANENTE
 *       "current_interval_status": "...",
 *       "start_time": 1759400000000,                  // epoch s o ms
 *       "end_time": 1759418000000,
 *       "remains_time": 12345678,                     // durata residua in ms (o s)
 *       "current_weekly_remaining_percent": 62.3,     // finestra settimanale
 *       "weekly_start_time": ..., "weekly_end_time": ...,
 *       "weekly_remains_time": ..., ...
 *     }
 *   ]
 * }
 *
 * Riferimenti: documentazione ufficiale MiniMax (m-plan/faq), plugin open-source
 * CreditGauge (query_plugins/minimax) e CodexBar (MiniMaxUsageFetcher.swift).
 */

export type Region = "eu" | "cn";

export const REGION_ENDPOINTS: Record<Region, string> = {
  eu: "https://www.minimax.io/v1/token_plan/remains",
  cn: "https://www.minimaxi.com/v1/token_plan/remains",
};

export const REGION_LABELS: Record<Region, string> = {
  eu: "Europa (minimax.io)",
  cn: "Cina (minimaxi.com)",
};

/** Un elemento di quota per un modello, per un tipo di finestra. */
export interface QuotaWindow {
  /** Percentuale di quota rimanente (0–100). */
  remainingPercent: number | null;
  /** Quota totale dichiarata (se presente; 0 = non dichiarata). */
  totalCount: number | null;
  /** Quota rimanente dichiarata come numero (se presente). */
  remainingCount: number | null;
  /** Stato riportato dall'API (es. "normal"). */
  status: string | null;
  /** Inizio della finestra (epoch → Date). */
  start: number | null;
  /** Fine della finestra = reset (epoch → ms). */
  end: number | null;
  /** Durata residua dichiarata dall'API in ms (campo remains_time). */
  remainsTimeMs: number | null;
}

export interface ModelQuota {
  /** Identificatore modello ritornato dall'API (es. "general", "video"). */
  modelName: string;
  /** Etichetta leggibile in italiano. */
  label: string;
  /** Finestra a 5 ore (presente per modelli non video). */
  interval: QuotaWindow | null;
  /** Finestra settimanale (7 giorni). */
  weekly: QuotaWindow | null;
}

export interface UsageSnapshot {
  /** Titolo del piano (current_subscribe_title / plan_name / …). */
  planTitle: string | null;
  /** Saldo crediti/punti, se presente. */
  credits: number | null;
  /** Quota per modello. */
  models: ModelQuota[];
  /** Epoch (ms) del momento in cui lo snapshot è stato ricevuto. */
  fetchedAt: number;
  /** Origine dei dati. */
  source: "api" | "demo";
  /** Regione usata per la chiamata. */
  region: Region;
}

export interface ApiError {
  code: string;
  message: string;
  /** Eventuale status HTTP dell'API MiniMax. */
  httpStatus?: number;
  /** Eventuale status_code di business MiniMax. */
  statusCode?: number;
  /** I51 — attesa minima consigliata (ms) per errori transitori (dal Retry-After upstream). */
  retryAfterMs?: number;
  /** I51 — true se l'errore è transitorio (429/5xx/rete/timeout: ritentare ha senso). */
  transient?: boolean;
}

/* ------------------------------------------------------------------ */
/* Helper interni                                                      */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v))) return Number(v);
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return null;
}

/** Epoch in ms normalizzato (accetta secondi o millisecondi). */
function epochMs(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  if (n > 1_000_000_000_000) return n; // già ms
  if (n > 1_000_000_000) return n * 1000; // secondi
  return null; // troppo piccolo per essere un tempo credibile
}

/** Durata residua in ms (accetta ms o secondi). */
function durationMs(v: unknown): number | null {
  const n = num(v);
  if (n === null || n <= 0) return null;
  if (n > 1_000_000) return n; // ms
  return n * 1000; // secondi
}

const MODEL_LABELS: Record<string, string> = {
  general: "Testo · Immagini · Audio",
  text: "Testo",
  video: "Video (H3)",
  image: "Immagini",
  audio: "Audio",
  speech: "Voce · Sintesi",
  search: "Ricerca web",
};

export function modelLabel(name: string): string {
  return MODEL_LABELS[name.toLowerCase()] ?? name;
}

/** Etichette delle due finestre per il display. */
export const WINDOW_LABELS = {
  interval: { short: "5 ore", long: "Finestra di 5 ore", desc: "Modelli testo, immagini e audio" },
  weekly: { short: "Settimanale", long: "Finestra di 7 giorni", desc: "Tutti i modelli, video incluso" },
} as const;

/**
 * Endpoint aggiuntivi della piattaforma MiniMax utili per arricchire il monitoraggio
 * (riferimenti: platform.minimax.io/docs, issue GitHub MiniMax-AI/MiniMax-M2 #88/#99).
 */
export const EXTRA_ENDPOINTS: { method: string; url: string; desc: string }[] = [
  {
    method: "GET",
    url: "https://api.minimax.io/v1/models",
    desc: "Catalogo dei modelli disponibili (OpenAI-compatible): MiniMax-M3, H3, ecc.",
  },
  {
    method: "POST",
    url: "https://api.minimax.io/v1/chat/completions",
    desc: "Chat completions: ogni risposta include usage {prompt_tokens, completion_tokens, total_tokens, cached_tokens} → consumo token reale",
  },
  {
    method: "POST",
    url: "https://api.minimax.io/v1/video_generation",
    desc: "Creazione task di generazione video (modelli H3)",
  },
  {
    method: "GET",
    url: "https://api.minimax.io/v1/query/video_generation?task_id=…",
    desc: "Stato e risultato di un task video",
  },
];

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Normalizza il codice di stato: l'API talvolta usa numeri (1, 2, 3)
 * e talvolta stringhe ("normal", "exhausted", …).
 */
function normalizeStatus(v: unknown): string | null {
  if (typeof v === "number" && isFinite(v)) return String(v);
  return str(v);
}

/**
 * Mappatura empirica dei codici di stato osservati nell'API Token Plan:
 * - 1 → finestra attiva / in uso (es. modello "general" con consumo registrato)
 * - 3 → finestra inattiva / mai usata nel periodo (es. modello "video" inutilizzato)
 * - 2 → ipotesi non confermata: esaurita (da verificare empiricamente)
 * - stringhe testuali usate da alcune versioni dell'endpoint
 */
export function statusLabel(status: string | null): {
  label: string;
  tone: "ok" | "idle" | "warn" | "crit";
  hint: string;
} | null {
  if (status === null) return null;
  switch (status) {
    case "1":
      return { label: "Attiva · in uso", tone: "ok", hint: "Finestra attiva con utilizzo registrato" };
    case "2":
      return { label: "Esaurita (ipotesi)", tone: "crit", hint: "Codice 2: presumibilmente quota esaurita" };
    case "3":
      return { label: "Inattiva · mai usata", tone: "idle", hint: "Nessun utilizzo registrato in questa finestra" };
    case "normal":
      return { label: "Normale", tone: "ok", hint: "Stato normale riportato dall'API" };
    case "exhausted":
    case "exhausted_hard":
      return { label: "Esaurita", tone: "crit", hint: "Quota della finestra terminata" };
    case "throttled":
      return { label: "Limitata", tone: "warn", hint: "Frequenza di richieste temporaneamente limitata" };
    default:
      return { label: `Stato ${status}`, tone: "warn", hint: "Codice di stato non catalogato" };
  }
}

/**
 * Deduce l'ora del server dal momento della risposta: end_time − remains_time.
 * Consente di sincronizzare i countdown senza fidarsi dell'orologio locale.
 */
export function inferServerTime(models: ModelQuota[]): number | null {
  for (const m of models) {
    for (const w of [m.interval, m.weekly]) {
      if (w?.end !== null && w?.end !== undefined && w.remainsTimeMs !== null && w.remainsTimeMs > 0) {
        const t = w.end - w.remainsTimeMs;
        if (t > 1_000_000_000_000) return t;
      }
    }
  }
  return null;
}

/** Percentuale consumata (100 − residua), già limitata a 0–100. */
export function consumedPercent(w: QuotaWindow): number | null {
  if (w.remainingPercent === null) return null;
  return Math.max(0, Math.min(100, 100 - w.remainingPercent));
}

function parseWindow(
  item: Record<string, unknown>,
  prefix: "" | "weekly_",
  kind: "interval" | "weekly",
): QuotaWindow | null {
  const remainingPercentKey =
    kind === "interval" ? "current_interval_remaining_percent" : "current_weekly_remaining_percent";
  const totalKey = kind === "interval" ? "current_interval_total_count" : "current_weekly_total_count";
  const remainingKey = kind === "interval" ? "current_interval_usage_count" : "current_weekly_usage_count";
  const statusKey = kind === "interval" ? "current_interval_status" : "current_weekly_status";
  const startKey = kind === "interval" ? "start_time" : "weekly_start_time";
  const endKey = kind === "interval" ? "end_time" : "weekly_end_time";
  const remainsKey = kind === "interval" ? "remains_time" : "weekly_remains_time";

  const remainingPercent = num(item[remainingPercentKey]);
  const totalCount = num(item[totalKey]);
  const remainingCount = num(item[remainingKey]);
  const start = epochMs(item[startKey]);
  const end = epochMs(item[endKey]);
  const remainsTimeMs = durationMs(item[remainsKey]);
  const status = normalizeStatus(item[statusKey]);

  // Nessun dato utile → finestra assente
  const hasAny =
    remainingPercent !== null || totalCount !== null || remainingCount !== null || start !== null || end !== null;
  if (!hasAny) return null;

  return {
    remainingPercent,
    totalCount,
    remainingCount,
    status,
    start,
    end,
    remainsTimeMs,
  };
}

/**
 * Normalizza la risposta grezza dell'API in uno snapshot tipizzato.
 * Accetta risposta piatta o annidata sotto `data`, e i vari alias di campo
 * osservati nelle implementazioni open-source.
 */
export function parseUsageResponse(raw: unknown, opts: { source: "api" | "demo"; region: Region; fetchedAt?: number }): UsageSnapshot {
  if (!isRecord(raw)) throw new Error("Risposta API non valida: atteso un oggetto JSON.");

  // Alcune versioni annidano tutto sotto `data`
  const payload: Record<string, unknown> =
    isRecord(raw["data"]) && (isRecord((raw["data"] as Record<string, unknown>)["model_remains"]) ||
      Array.isArray((raw["data"] as Record<string, unknown>)["model_remains"]))
      ? (raw["data"] as Record<string, unknown>)
      : raw;

  // base_resp (può trovarsi sia a livello radice sia dentro data)
  const baseResp = (isRecord(raw["base_resp"]) ? raw["base_resp"] : undefined) ??
    (isRecord(payload["base_resp"]) ? payload["base_resp"] : undefined);

  const statusCode = baseResp ? num(baseResp["status_code"]) : null;
  const statusMsg = baseResp ? str(baseResp["status_msg"]) : null;

  if (statusCode !== null && statusCode !== 0) {
    const err = new Error(
      statusCode === 1004
        ? "Chiave API non valida o non autenticata (status_code 1004). Verifica la Subscription Key nelle impostazioni."
        : `Errore API MiniMax: ${statusMsg ?? `status_code ${statusCode}`}`,
    ) as Error & { statusCode?: number };
    err.statusCode = statusCode;
    throw err;
  }

  const modelRemains = Array.isArray(payload["model_remains"]) ? payload["model_remains"] : [];

  const models: ModelQuota[] = [];
  for (const entry of modelRemains) {
    if (!isRecord(entry)) continue;
    const name = str(entry["model_name"]);
    if (!name) continue;

    const interval = parseWindow(entry, "", "interval");
    const weekly = parseWindow(entry, "weekly_", "weekly");
    if (!interval && !weekly) continue;

    models.push({ modelName: name, label: modelLabel(name), interval, weekly });
  }

  // Titolo del piano — primo campo disponibile tra gli alias noti
  const planTitle =
    str(payload["current_subscribe_title"]) ??
    str(payload["plan_name"]) ??
    str(payload["combo_title"]) ??
    str(payload["current_plan_title"]) ??
    (isRecord(payload["current_combo_card"]) ? str((payload["current_combo_card"] as Record<string, unknown>)["title"]) : null);

  const credits =
    num(payload["points_balance"]) ??
    num(payload["point_balance"]) ??
    num(payload["credits_balance"]) ??
    num(payload["credit_balance"]) ??
    num(payload["balance"]);

  return {
    planTitle,
    credits: credits !== null ? credits : null,
    models,
    fetchedAt: opts.fetchedAt ?? Date.now(),
    source: opts.source,
    region: opts.region,
  };
}

/** Cerca la quota di un modello per nome (case-insensitive). */
export function findModel(snapshot: UsageSnapshot, name: string): ModelQuota | undefined {
  const target = name.toLowerCase();
  return snapshot.models.find((m) => m.modelName.toLowerCase() === target);
}

/** Stato della quota in una categoria leggibile. */
export function quotaLevel(remainingPercent: number | null): {
  label: string;
  color: "ok" | "good" | "warn" | "crit";
} {
  if (remainingPercent === null) return { label: "N/D", color: "warn" };
  if (remainingPercent > 60) return { label: "Ampia disponibilità", color: "ok" };
  if (remainingPercent > 30) return { label: "Buona disponibilità", color: "good" };
  if (remainingPercent > 10) return { label: "Attenzione: quota in esaurimento", color: "warn" };
  return { label: "Quota quasi esaurita", color: "crit" };
}
