/**
 * I16 — Helper client per la sincronizzazione dello storico con il server.
 *
 * Strategia "offline-first":
 * - il localStorage resta la fonte primaria per la UI (scrittura sincrona, zero latenza);
 * - ogni nuovo punto viene replicato sul server in fire-and-forget (nessun blocco UI,
 *   errori silenziosi: la dashboard funziona identicamente anche senza server);
 * - all'avvio lo storico server viene scaricato e fuso con quello locale, così lo
 *   storico sopravvive a cache svuotate e dura nel tempo (fino a 10.000 punti lato server).
 *
 * La chiave API non transita mai qui: si inviano solo timestamp e percentuali residue.
 * I120 — le scritture allegano `x-admin-token` quando l'utente ha salvato il
 * token admin nel browser (guardia I95 del server: altrimenti nessun header).
 */

import type { HistoryPoint } from "@/components/history-chart";
import type { HourStats } from "@/lib/downsample";
import { headerAdmin } from "@/lib/admin-token";
import { parseServerListResponse } from "@/lib/server-response";

export interface ServerPoint {
  t: number;
  interval: number | null;
  weekly: number | null;
  source: string;
  region: string;
}

/** I68 — un bucket orario derivato come restituito da ?granularity=hour. */
export interface ServerHourBucket {
  t: number;
  source: string;
  count: number;
  interval: HourStats;
  weekly: HourStats;
}

export interface ServerHourlyResult {
  ok: boolean;
  total: number;
  hours: ServerHourBucket[];
}

export interface ServerHistoryResult {
  ok: boolean;
  total: number;
  points: ServerPoint[];
}

/** Converte i punti server (valori nullable) in HistoryPoint per la UI.
 *  I124 — la `source` del server (api/demo/import) passa al punto: le analisi
 *  escludono i demo (senzaDemo in cycles.ts). */
export function serverPointsToHistory(points: ServerPoint[]): HistoryPoint[] {
  return points
    .filter((p) => p.interval !== null || p.weekly !== null)
    .map((p) => ({
      t: p.t,
      interval: p.interval ?? 100,
      weekly: p.weekly ?? 100,
      source: p.source,
    }));
}

/**
 * Fonde due storici ordinati per tempo, deduplicando i punti con lo stesso
 * timestamp (vince il punto locale, più recente). Restituisce l'array ordinato.
 */
export function mergeHistories(local: HistoryPoint[], remote: HistoryPoint[]): HistoryPoint[] {
  const byT = new Map<number, HistoryPoint>();
  for (const p of remote) byT.set(p.t, p);
  for (const p of local) byT.set(p.t, p);
  return Array.from(byT.values()).sort((a, b) => a.t - b.t);
}

/** Replica un nuovo punto sul server (fire-and-forget, errori silenziosi). */
export function pushPointToServer(
  point: HistoryPoint,
  meta: {
    source: string;
    region: string;
    /** Chiamato quando il server conferma il totale conservato. */
    onTotal?: (total: number) => void;
  },
): void {
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headerAdmin() },
      body: JSON.stringify({
        points: [{ t: point.t, interval: point.interval, weekly: point.weekly, source: meta.source, region: meta.region }],
      }),
      keepalive: true,
    })
      .then(async (res) => {
        if (!res.ok || !meta.onTotal) return;
        try {
          const json = (await res.json()) as { ok: boolean; total?: number };
          if (json.ok && typeof json.total === "number") meta.onTotal(json.total);
        } catch {
          /* risposta non interpretabile: ignora */
        }
      })
      .catch(() => {
        /* offline o server non raggiungibile: la UI continua con il localStorage */
      });
  } catch {
    /* noop */
  }
}

/** Scarica lo storico completo conservato sul server. */
export async function fetchServerHistory(limit = 2000): Promise<ServerHistoryResult | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(`/api/history?limit=${limit}`);
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    /* I92 — normalizzazione: total garantito number, points mancante = [].
       Prima ci si fidava della forma: il fallback offline del SW poteva
       servire un payload di altra forma con ok:true → total undefined →
       crash di render nei componenti che lo formattano. */
    const parsed = parseServerListResponse<ServerPoint>(json, "points");
    return parsed ? { ok: true, total: parsed.total, points: parsed.items } : null;
  } catch {
    return null;
  }
}

/**
 * I68 — Scarica la grana ORARIA derivata dal server (bucket già aggregati:
 * min/max/media/ultimo per ora e sorgente). Sorgente opzionale per filtrare.
 */
export async function fetchServerHourly(
  limit = 10_000,
  source?: string,
): Promise<ServerHourlyResult | null> {
  if (typeof window === "undefined") return null;
  try {
    const qs = new URLSearchParams({ granularity: "hour", limit: String(limit) });
    if (source) qs.set("source", source);
    const res = await fetch(`/api/history?${qs.toString()}`);
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    /* I92 — stessa normalizzazione di fetchServerHistory. */
    const parsed = parseServerListResponse<ServerHourBucket>(json, "hours");
    return parsed ? { ok: true, total: parsed.total, hours: parsed.items } : null;
  } catch {
    return null;
  }
}

/** Svuota lo storico server (richiede conferma a monte). */
export async function clearServerHistory(): Promise<number | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/history", { method: "DELETE", headers: headerAdmin() });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok: boolean; deleted: number };
    return json.ok ? json.deleted : null;
  } catch {
    return null;
  }
}
