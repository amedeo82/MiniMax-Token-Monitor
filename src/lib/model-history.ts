/**
 * I82 — Storico QUOTA per-modello (generalizzazione multi-modello).
 *
 * FINO A OGGI: lo storico `HistoryPoint[]` { t, interval, weekly } registra
 * solo il modello «general» (le analisi di cicli/storico nascono attorno alle
 * sue due finestre). QUESTA LIB aggiunge uno storico parallelo per OGNI modello
 * osservato nel piano, mantenendo INVARIATO il contratto delle analisi: le
 * funzioni di analisi continuano a consumare `HistoryPoint[]` — chi costruisce
 * lo storico decide il pivot (`historyForModel`).
 *
 * Storage: localStorage `mm-dash-modelhistory-v1`, FIFO 2.000 punti (tutti i
 * modelli insieme, ordinati per t). Valori GREZZI nullable: il forward-fill
 * (`?? precedente ?? 100`) avviene SOLO alla lettura, con le stesse semantiche
 * di `pushHistory` (page.tsx) per il generale.
 *
 * Persistenza server (stesso pattern offline-first di server-history.ts / I16):
 * il localStorage resta la fonte primaria; ogni batch di punti nuovi viene
 * replicato fire-and-forget su `/api/history/models` (tabella `ModelUsagePoint`,
 * lib I42); all'avvio lo storico server viene riscaricato e fuso con il locale.
 * La chiave API non transita mai: solo timestamp, nomi modello e percentuali.
 */

import type { HistoryPoint } from "@/components/history-chart";

/** Un punto grezzo dello storico per-modello (valori nullable). */
export interface ModelHistoryPoint {
  /** Epoch ms del rilevamento. */
  t: number;
  /** Nome del modello come ritornato dall'API (es. "general", "video"). */
  model: string;
  /** % residua della finestra breve (5h general / 24h video), null se assente. */
  interval: number | null;
  /** % residua della finestra settimanale, null se assente. */
  weekly: number | null;
}

/** Campione minimo estratto da uno snapshot (disaccoppiato da UsageSnapshot). */
export interface ModelSample {
  t: number;
  models: { name: string; interval: number | null; weekly: number | null }[];
}

/** Una riga della tabella server `ModelUsagePoint` (formato LONG). */
export interface ModelPointRowClient {
  model: string;
  win: "interval" | "weekly";
  t: number;
  percent: number;
  source: string;
  region: string;
}

export const MODEL_HISTORY_KEY = "mm-dash-modelhistory-v1";
export const MODEL_HISTORY_MAX = 2_000;
/** Finestra di dedup: stesso modello con punto più recente di 20s → sostituisce. */
const DEDUP_MS = 20_000;

/* ----------------------------- storage ----------------------------- */

export function loadModelHistory(): ModelHistoryPoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MODEL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ModelHistoryPoint[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.t === "number" && typeof p.model === "string")
      .sort((a, b) => a.t - b.t)
      .slice(-MODEL_HISTORY_MAX);
  } catch {
    return [];
  }
}

export function saveModelHistory(points: ModelHistoryPoint[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MODEL_HISTORY_KEY, JSON.stringify(points.slice(-MODEL_HISTORY_MAX)));
  } catch {
    /* quota piena: ignora (il server conserva la replica) */
  }
}

/* --------------------------- acquisizione -------------------------- */

/**
 * Accoda i punti di OGNI modello del campione con almeno una finestra non null.
 * Dedup: se l'ultimo punto dello stesso modello è più recente di 20s viene
 * SOSTITUITO (come `pushHistory` per il generale). Restituisce SOLO i punti
 * effettivamente nuovi (per la replica server) e l'array completo troncato.
 */
export function appendModelPoints(
  prev: ModelHistoryPoint[],
  sample: ModelSample,
  max = MODEL_HISTORY_MAX,
): { points: ModelHistoryPoint[]; nuovi: ModelHistoryPoint[] } {
  const nuovi: ModelHistoryPoint[] = [];
  for (const m of sample.models) {
    const interval = typeof m.interval === "number" && isFinite(m.interval) ? m.interval : null;
    const weekly = typeof m.weekly === "number" && isFinite(m.weekly) ? m.weekly : null;
    if (interval === null && weekly === null) continue;
    nuovi.push({ t: sample.t, model: m.name, interval, weekly });
  }
  if (nuovi.length === 0) return { points: prev, nuovi };

  // Dedup per modello: sostituisce l'ultimo punto se troppo vicino nel tempo
  // (stessa semantica di pushHistory: delta < 20s → rimpiazza, ≥ 20s → accoda).
  const lastByModel = new Map<string, number>();
  for (const p of prev) lastByModel.set(p.model, p.t);
  const tenuti = prev.filter((p) => {
    const n = nuovi.find((x) => x.model === p.model);
    return !(n && sample.t - p.t < DEDUP_MS && p.t === lastByModel.get(p.model));
  });
  const points = [...tenuti, ...nuovi].sort((a, b) => a.t - b.t).slice(-max);
  return { points, nuovi };
}

/* ------------------------------ lettura ---------------------------- */

/**
 * Storico FLAT `HistoryPoint[]` di UN modello: filtra, ordina e forward-fill
 * dei null (`?? precedente ?? 100`) — le stesse semantiche di `pushHistory`.
 * È il ponte verso tutte le analisi esistenti (contratto invariato, §5.19).
 */
export function historyForModel(points: ModelHistoryPoint[], model: string): HistoryPoint[] {
  const out: HistoryPoint[] = [];
  for (const p of points) {
    if (p.model !== model) continue;
    const prev = out[out.length - 1];
    out.push({
      t: p.t,
      interval: p.interval ?? prev?.interval ?? 100,
      weekly: p.weekly ?? prev?.weekly ?? 100,
    });
  }
  return out;
}

/** Nomi dei modelli osservati: «general» sempre primo, poi ordine di prima comparsa. */
export function modelNamesOsservati(points: ModelHistoryPoint[]): string[] {
  const visti: string[] = [];
  for (const p of points) {
    if (!visti.includes(p.model)) visti.push(p.model);
  }
  return ["general", ...visti.filter((m) => m !== "general")];
}

/* ------------------------------- sync ------------------------------ */

/** Fonde due storici per-modello ordinati: dedup per (model, t), vince il locale. */
export function mergeModelHistories(
  local: ModelHistoryPoint[],
  remote: ModelHistoryPoint[],
): ModelHistoryPoint[] {
  const byKey = new Map<string, ModelHistoryPoint>();
  for (const p of remote) byKey.set(`${p.model}|${p.t}`, p);
  for (const p of local) byKey.set(`${p.model}|${p.t}`, p);
  return Array.from(byKey.values()).sort((a, b) => a.t - b.t);
}

/**
 * Converte le righe LONG del server (una per model+win+t) nei punti WIDE della
 * UI. Righe orfane (una sola finestra) diventano punti con l'altra a null: il
 * forward-fill di `historyForModel` le recupera alla lettura.
 */
export function modelRowsToPoints(rows: ModelPointRowClient[]): ModelHistoryPoint[] {
  const byKey = new Map<string, ModelHistoryPoint>();
  for (const r of rows) {
    if (r.win !== "interval" && r.win !== "weekly") continue;
    const key = `${r.model}|${r.t}`;
    const p = byKey.get(key) ?? { t: r.t, model: r.model, interval: null, weekly: null };
    if (r.win === "interval") p.interval = r.percent;
    else p.weekly = r.percent;
    byKey.set(key, p);
  }
  return Array.from(byKey.values()).sort((a, b) => a.t - b.t);
}

/** Scarica lo storico per-modello conservato sul server (null = non raggiungibile). */
export async function fetchServerModelHistory(
  limit = 4000,
): Promise<{ ok: boolean; total: number; rows: ModelPointRowClient[] } | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(`/api/history/models?limit=${limit}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      ok: boolean;
      total?: number;
      points?: ModelPointRowClient[];
    };
    return json.ok ? { ok: true, total: json.total ?? 0, rows: json.points ?? [] } : null;
  } catch {
    return null;
  }
}

/** Replica un batch di punti nuovi sul server (fire-and-forget, errori silenziosi). */
export function pushModelPointsToServer(
  points: ModelHistoryPoint[],
  meta: { source: string; region: string },
): void {
  if (typeof window === "undefined" || points.length === 0) return;
  try {
    void fetch("/api/history/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        points: points.map((p) => ({
          t: p.t,
          model: p.model,
          interval: p.interval,
          weekly: p.weekly,
          source: meta.source,
          region: meta.region,
        })),
      }),
      keepalive: true,
    }).catch(() => {
      /* offline: la UI continua con il localStorage */
    });
  } catch {
    /* noop */
  }
}

/** Svuota lo storico per-modello del server (tutti i modelli se model assente). */
export async function clearServerModelHistory(model?: string): Promise<number | null> {
  if (typeof window === "undefined") return null;
  try {
    const qs = model ? `?model=${encodeURIComponent(model)}` : "";
    const res = await fetch(`/api/history/models${qs}`, { method: "DELETE" });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok: boolean; deleted: number };
    return json.ok ? json.deleted : null;
  } catch {
    return null;
  }
}
