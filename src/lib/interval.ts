/**
 * I69 — Selettore intervallo temporale: preset di ampiezza e filtro client-side
 * dello storico già in memoria.
 *
 * Il monitor conserva fino a 600 punti in locale (e 2.000+ sul server): quando i
 * dati diventano densi il grafico e le analisi guadagnano leggibilità restringendo
 * la finestra osservata. Il filtro è puramente visivo: NON elimina punti
 * dall'archivio (locale o server), seleziona solo quali mostrare.
 *
 * Finestra semiaperta `[now − ampiezza, +∞)`:
 * - bordo inferiore INCLUSIVO (un punto esattamente a now − 24h rientra in «24h»);
 * - nessun bordo superiore (tolleranza a leggeri sfasamenti d'orologio: un punto
 *   con timestamp nel futuro non viene scartato);
 * - «tutto» restituisce lo STESSO array di input (nessuna copia, nessun lavoro).
 *
 * Funzione pura, deterministica (now iniettabile per i test).
 */

export type RangePreset = "6h" | "24h" | "3g" | "7g" | "30g" | "all";

export interface RangePresetMeta {
  id: RangePreset;
  /** Etichetta breve per il selettore a chips. */
  label: string;
  /** Ampiezza in ms; null = nessun limite («tutto»). */
  ms: number | null;
}

const H = 3_600_000;
const G = 86_400_000;

export const RANGE_PRESETS: RangePresetMeta[] = [
  { id: "6h", label: "6h", ms: 6 * H },
  { id: "24h", label: "24h", ms: 24 * H },
  { id: "3g", label: "3g", ms: 3 * G },
  { id: "7g", label: "7g", ms: 7 * G },
  { id: "30g", label: "30g", ms: 30 * G },
  { id: "all", label: "Tutto", ms: null },
];

/** Ampiezza del preset in ms (null = «tutto»). Unknown → null (fallback sicuro). */
export function presetWindowMs(preset: RangePreset): number | null {
  return RANGE_PRESETS.find((p) => p.id === preset)?.ms ?? null;
}

/**
 * Filtra lo storico per preset: conserva i punti con `t >= now − ampiezza`
 * (bordo inclusivo) preservando l'ordine cronologico. «tutto» restituisce
 * l'array originale; preset sconosciuto si comporta come «tutto».
 */
export function filterHistoryByPreset<T extends { t: number }>(
  history: T[],
  preset: RangePreset,
  nowMs: number,
): T[] {
  const ms = presetWindowMs(preset);
  if (ms === null) return history;
  const from = nowMs - ms;
  return history.filter((p) => p.t >= from);
}
