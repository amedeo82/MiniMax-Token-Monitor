/**
 * I92 — Normalizzazione delle risposte «lista» degli endpoint archivio
 * (/api/history, /api/events) consumate dai client di replica
 * (lib/server-history.ts, lib/server-events.ts).
 *
 * Perché esiste: `pushPointToServer` validava già `typeof json.total === "number"`
 * prima di usare il totale, ma i tre fetcher di LETTURA si fidavano ciecamente
 * della forma `{ok, total, points|events|hours}`. Il fallback offline del
 * service worker (I52, corretto in I92) poteva servire a questi endpoint un
 * payload di ALTRA forma con `ok:true` (JSON del proxy usage): il risultato
 * era `total: undefined` promesso `number` dall'interfaccia → crash di render
 * nei componenti che chiamano `.toLocaleString()` (Registro eventi offline).
 *
 * La normalizzazione è PURA e testabile: coerce il totale degradato a 0 e il
 * campo lista mancante a [], rifiuta tutto il resto (null → i chiamanti
 * mantengono il comportamento «errore silenzioso, dati locali»).
 */

export interface ServerListResult<T> {
  ok: true;
  total: number;
  items: T[];
}

/** Chiavi lista ammesse negli endpoint archivio. */
export type ServerListKey = "points" | "events" | "hours";

/**
 * Normalizza una risposta di endpoint archivio. Restituisce null se la risposta
 * non dichiara `ok: true` (o non è un oggetto): in quel caso il chiamante
 * ritorna null e la UI resta sui dati locali.
 *
 * - `total` non numero finito (assente, undefined, stringa, NaN) → 0;
 * - campo lista assente/non array → [].
 */
export function parseServerListResponse<T>(json: unknown, listKey: ServerListKey): ServerListResult<T> | null {
  if (!json || typeof json !== "object") return null;
  const rec = json as Record<string, unknown>;
  if (rec["ok"] !== true) return null;
  const totalRaw = rec["total"];
  const total =
    typeof totalRaw === "number" && Number.isFinite(totalRaw) ? totalRaw : 0;
  const rawList = rec[listKey];
  const items = Array.isArray(rawList) ? (rawList as T[]) : [];
  return { ok: true, total, items };
}
