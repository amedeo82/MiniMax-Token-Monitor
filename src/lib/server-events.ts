/**
 * I27 — Helper client per la replica del registro eventi con il server.
 *
 * Stessa strategia "offline-first" dello storico (lib/server-history.ts):
 * - il localStorage resta la fonte primaria per la UI (max 200 eventi, scrittura
 *   sincrona, zero latenza);
 * - ogni nuovo evento viene replicato sul server in fire-and-forget (nessun
 *   blocco UI, errori silenziosi: la dashboard funziona identicamente anche
 *   senza server);
 * - all'avvio l'archivio server viene scaricato e fuso con il registro locale
 *   (dedup per id): gli eventi sopravvivono a cache svuotate e cambio dispositivo,
 *   mentre il server conserva l'archivio completo (fino a 5.000 eventi / 180 giorni)
 *   per l'export CSV/JSON di lungo periodo.
 *
 * Nessun dato sensibile transita qui: solo timestamp, tipo, messaggio e
 * percentuale residua dell'evento.
 */

import type { UsageEvent } from "./usage-events";
import { parseServerListResponse } from "./server-response";

export interface ServerEventRow {
  id: string;
  t: number;
  kind: string;
  model: string | null;
  win: string | null;
  message: string;
  value: number | null;
}

export interface ServerEventsResult {
  ok: boolean;
  total: number;
  events: ServerEventRow[];
}

const VALID_KINDS: readonly string[] = ["reset", "warn", "crit", "error", "info"];

/** Converte le righe server in UsageEvent (scartando le righe non interpretabili). */
export function serverEventsToEvents(rows: ServerEventRow[]): UsageEvent[] {
  return rows
    .filter((r) => VALID_KINDS.includes(r.kind))
    .map((r) => ({
      id: r.id,
      t: r.t,
      kind: r.kind as UsageEvent["kind"],
      model: r.model,
      win: r.win === "interval" || r.win === "weekly" ? r.win : null,
      message: r.message,
      value: r.value,
    }));
}

/**
 * Fonde due registri deduplicando per id (vince la copia locale, più recente).
 * Restituisce l'array ordinato per tempo crescente.
 */
export function mergeEvents(local: UsageEvent[], remote: UsageEvent[]): UsageEvent[] {
  const byId = new Map<string, UsageEvent>();
  for (const e of remote) byId.set(e.id, e);
  for (const e of local) byId.set(e.id, e);
  return Array.from(byId.values()).sort((a, b) => a.t - b.t);
}

/** Replica uno o più nuovi eventi sul server (fire-and-forget, errori silenziosi). */
export function pushEventsToServer(
  events: UsageEvent | UsageEvent[],
  meta: {
    /** Chiamato quando il server conferma il totale conservato. */
    onTotal?: (total: number) => void;
  } = {},
): void {
  if (typeof window === "undefined") return;
  const list = (Array.isArray(events) ? events : [events]).map((e) => ({
    id: e.id,
    t: e.t,
    kind: e.kind,
    model: e.model,
    win: e.win,
    message: e.message,
    value: e.value,
  }));
  if (list.length === 0) return;

  try {
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: list }),
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

/** Scarica l'archivio eventi conservato sul server (opzionalmente per tipo). */
export async function fetchServerEvents(limit = 2000, kind?: string): Promise<ServerEventsResult | null> {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (kind) params.set("kind", kind);
    const res = await fetch(`/api/events?${params.toString()}`);
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    /* I92 — normalizzazione: total garantito number, events mancante = [].
       Prima ci si fidava della forma: il fallback offline del SW poteva
       servire un payload di altra forma con ok:true → total undefined →
       crash di render del Registro eventi quando offline. */
    const parsed = parseServerListResponse<ServerEventRow>(json, "events");
    return parsed ? { ok: true, total: parsed.total, events: parsed.items } : null;
  } catch {
    return null;
  }
}

/** Svuota l'archivio eventi sul server (richiede conferma a monte). */
export async function clearServerEvents(): Promise<number | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/events", { method: "DELETE" });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok: boolean; deleted: number };
    return json.ok ? json.deleted : null;
  } catch {
    return null;
  }
}
