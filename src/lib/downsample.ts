/**
 * I68 — Downsampling orario dello storico: aggregazione e merge dei bucket.
 *
 * La tabella Prisma `DownsampledPoint` aggrega i punti grezzi per
 * (hourStart UTC, source): min/max/somma/ultimo per ciascuna finestra +
 * conteggio. La media dell'ora è somma/count. Il merge è INCREMENTALE: la
 * POST di /api/history contribuisce un punto alla volta e aggiorna il bucket
 * della sua ora senza ricalcolare nulla da capo.
 *
 * Funzioni pure (testabili senza DB):
 * - `hourStartOf(t)`: inizio dell'ora UTC che contiene il timestamp;
 * - `mergeHourBucket(existing, punto)`: aggrega un punto nel bucket esistente
 *   (o ne crea uno nuovo), gestendo i valori null per ciascuna finestra;
 * - `serverHourlyToHistory(buckets)`: converte i bucket del server in
 *   HistoryPoint per la UI/export usando l'ULTIMO valore di ogni ora (continuità
 *   con la lettura del grafico: l'ultimo stato osservato nell'ora).
 *
 * Il tracciamento di «quale valore è l'ultimo» non richiede stato extra: il
 * bucket conserva `lastT`, quindi un punto con t >= lastT È il più recente e
 * le sue finestre non null diventano gli «ultimo» del bucket.
 */

/** Un punto grezzo (sottoinsieme di UsagePoint) che alimenta il bucket. */
export interface RawPoint {
  t: number;
  interval: number | null;
  weekly: number | null;
}

/** Statistiche di una finestra dentro un'ora (media = somma/count). */
export interface HourStats {
  min: number | null;
  max: number | null;
  somma: number;
  ultimo: number | null;
}

/** Il bucket orario aggregato (forma condivisa DB/API). */
export interface HourBucket {
  hourStart: number;
  source: string;
  interval: HourStats;
  weekly: HourStats;
  count: number;
  lastT: number;
}

/** Bucket vuoto con contatori a zero e finestre «non osservate». */
export function emptyHourBucket(hourStart: number, source: string): HourBucket {
  const vuota: HourStats = { min: null, max: null, somma: 0, ultimo: null };
  return {
    hourStart,
    source,
    interval: { ...vuota },
    weekly: { ...vuota },
    count: 0,
    lastT: 0,
  };
}

/** Inizio dell'ora UTC che contiene il timestamp (epoch ms, allineato all'ora). */
export function hourStartOf(t: number): number {
  return Math.floor(t / 3_600_000) * 3_600_000;
}

/** Aggiorna le statistiche di una finestra con un nuovo valore (o null). */
function mergeStats(s: HourStats, v: number | null, isUltimo: boolean): HourStats {
  if (v === null || !isFinite(v)) return s;
  return {
    min: s.min === null ? v : Math.min(s.min, v),
    max: s.max === null ? v : Math.max(s.max, v),
    somma: s.somma + v,
    ultimo: isUltimo ? v : s.ultimo,
  };
}

/**
 * Aggrega un punto grezzo nel bucket esistente (o in uno vuoto) e restituisce
 * il bucket aggiornato. Un punto che ha ENTRAMBE le finestre null non conta
 * né per `count` né per le statistiche (non osserva nulla), ma aggiorna
 * comunque lastT.
 */
export function mergeHourBucket(existing: HourBucket, punto: RawPoint): HourBucket {
  const t = punto.t;
  const isUltimo = t >= existing.lastT;

  const osserva = punto.interval !== null || punto.weekly !== null;

  return {
    ...existing,
    interval: mergeStats(existing.interval, punto.interval, isUltimo),
    weekly: mergeStats(existing.weekly, punto.weekly, isUltimo),
    count: existing.count + (osserva ? 1 : 0),
    lastT: Math.max(existing.lastT, t),
  };
}

/**
 * Converte i bucket del server in HistoryPoint per la UI/export: per ogni ora
 * usa l'ULTIMO valore osservato (continuità con il grafico). Le ore con
 * entrambe le finestre non osservate vengono scartate.
 */
export function serverHourlyToHistory(
  buckets: { t: number; interval: HourStats; weekly: HourStats }[],
): { t: number; interval: number; weekly: number }[] {
  return buckets
    .filter((b) => b.interval.ultimo !== null || b.weekly.ultimo !== null)
    .map((b) => ({
      t: b.t,
      interval: b.interval.ultimo ?? 100,
      weekly: b.weekly.ultimo ?? 100,
    }));
}
