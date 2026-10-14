/**
 * I51 — Backoff esponenziale con jitter per il polling del monitor.
 *
 * Perché serve: il client interroga il proxy `/api/minimax/usage` a intervallo
 * fisso (impostazione utente). Quando l'API (o la rete) è in difficoltà,
 * reiterare alla stessa caduta:
 * - sprecare richieste che difficilmente avrebbero successo;
 * - rischiare rate-limit o ban temporanei lato MiniMax;
 * - riempire il registro eventi di errori rumorosi.
 *
 * Il modello è lo standard «exponential backoff with full jitter range»:
 * il ritardo raddoppia a ogni errore consecutivo (base × 2^attempt), con un
 * tetto rigido (cap) e un jitter simmetrico ±25% che desincronizza più
 * client/ripper che colpissero l'endpoint nello stesso istante. Un floor di
 * 1 secondo impedisce ritardi nulli (utile quando il Retry-After dichiarato
 * è 0 o quando la base è configurata molto bassa).
 *
 * Il modulo è PURO e senza dipendenze: ogni funzione accetta opzioni
 * (baseMs, capMs, jitter, random) così che i test possano essere
 * deterministici iniettando un generatore fisso.
 *
 * Integrazione:
 * - `page.tsx` usa `delayAfterFailure()` nello scheduler client dopo ogni
 *   rilevamento fallito, e ripristina l'intervallo utente al primo successo.
 * - Il proxy (`api/minimax/usage/route.ts`) ritenta da solo gli errori
 *   transitori (429/5xx/rete/timeout) e inoltra al client `retryAfterMs`
 *   (derivato dall'header Retry-After o da un default prudente): il client
 *   lo usa come FLOOR del proprio ritardo (mai più veloce di quanto l'API
 *   chieda esplicitamente).
 */

/** Ritardo minimo garantito per qualunque attesa (mai più veloce di 1s). */
export const BACKOFF_FLOOR_MS = 1_000;

/** Ritardo di partenza (attempt 0) per un fallimento. */
export const BACKOFF_BASE_MS = 2_000;

/** Tetto rigido del ritardo: oltre non ha senso aspettare (10 minuti). */
export const BACKOFF_CAP_MS = 600_000;

/** Jitter simmetrico: ritardo finale ∈ [delay × (1−j), delay × (1+j)]. */
export const BACKOFF_JITTER = 0.25;

export interface BackoffOptions {
  /** Base del raddoppio (default 2s). */
  baseMs?: number;
  /** Tetto del ritardo (default 10 min). */
  capMs?: number;
  /** Jitter simmetrico ∈ [0,1] (default 0,25). */
  jitter?: number;
  /** Generatore pseudo-casuale iniettabile (default Math.random) — per test deterministici. */
  random?: () => number;
}

/**
 * Ritardo «teorico» per l'attempt n: base × 2^n, limitato dal cap e
 * sollevato al floor. Non applica jitter (vedi `nextBackoffMs`).
 */
export function backoffDelayMs(attempt: number, opts: BackoffOptions = {}): number {
  const base = opts.baseMs ?? BACKOFF_BASE_MS;
  const cap = opts.capMs ?? BACKOFF_CAP_MS;
  const a = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  const raw = base * 2 ** a;
  return Math.min(cap, Math.max(BACKOFF_FLOOR_MS, raw));
}

/**
 * Ritardo concreto per l'attempt n: come `backoffDelayMs` ma con jitter
 * simmetrico (±`jitter`) moltiplicativo. Il cap vale ANCHE dopo il jitter,
 * così l'attesa non supera mai il tetto dichiarato; il floor vale sempre.
 */
export function nextBackoffMs(attempt: number, opts: BackoffOptions = {}): number {
  const jitter = opts.jitter ?? BACKOFF_JITTER;
  const random = opts.random ?? Math.random;
  const cap = opts.capMs ?? BACKOFF_CAP_MS;
  const delay = backoffDelayMs(attempt, opts);
  const factor = 1 + (2 * random() - 1) * jitter;
  return Math.min(cap, Math.max(BACKOFF_FLOOR_MS, Math.round(delay * factor)));
}

/**
 * Converte l'header HTTP `Retry-After` in millisecondi di attesa.
 * Accetta le due forme del protocollo:
 * - secondi: "30" → 30_000;
 * - HTTP-date: "Wed, 21 Oct 2026 07:28:00 GMT" → differenza da `now`.
 * Ritorna null se assente/malformato; mai negativo (date passate → 0).
 */
export function parseRetryAfterMs(value: string | null | undefined, now: number = Date.now()): number | null {
  if (value === null || value === undefined) return null;
  const v = value.trim();
  if (v === "") return null;
  if (/^\d+$/.test(v)) return Math.max(0, Number(v) * 1000);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, d.getTime() - now);
}

/**
 * Decisione client dopo un fallimento: il backoff calcolato per l'attempt n,
 * ma MAI sotto il Retry-After dichiarato dall'API (che fa da floor): se il
 * server chiede di aspettare 30s, il client aspetta almeno 30s anche se il
 * proprio backoff sarebbe più corto. Con Retry-After assente/invalido vale
 * il solo backoff con jitter.
 */
export function delayAfterFailure(
  attempt: number,
  retryAfterMs?: number | null,
  opts: BackoffOptions = {},
): number {
  const backoff = nextBackoffMs(attempt, opts);
  const ra = retryAfterMs !== null && retryAfterMs !== undefined && isFinite(retryAfterMs) && retryAfterMs > 0
    ? Math.floor(retryAfterMs)
    : null;
  return ra !== null ? Math.max(backoff, ra) : backoff;
}

/* ------------------------------------------------------------------ */
/* I100 — poller consapevole di rete e visibilità                      */
/* ------------------------------------------------------------------ */

/**
 * Fattore di dilatazione del polling a tab nascosta. DILATAZIONE, non
 * sospensione: le notifiche a tab chiuso passano dal Service Worker (I52),
 * ma badge/registri/verifiche V1–V6 presuppongono un polling vivo (più lento),
 * non assente.
 */
export const FATTORE_TAB_NASCOSTA = 4;

/** Ritardo effettivo del polling: a tab nascosta dilatato ×4, in visibilità invariato. */
export function ritardoPolling(msBase: number, nascosta: boolean): number {
  return nascosta ? msBase * FATTORE_TAB_NASCOSTA : msBase;
}

/**
 * Al ritorno in visibilità: tick solo se l'ultimo rilevamento è più vecchio
 * della METÀ dell'intervallo base (la dilatazione ×4 a tab nascosta può aver
 * lasciato dati stantii, ma un tick a ogni flap di visibilità sarebbe rumore).
 * Mai rilevato → tick (null = nessuna informazione: meglio aggiornare).
 */
export function tickAllaVisibilita(
  ultimoRilevamento: number | null,
  adesso: number,
  baseMs: number,
): boolean {
  return ultimoRilevamento === null || adesso - ultimoRilevamento > baseMs / 2;
}
