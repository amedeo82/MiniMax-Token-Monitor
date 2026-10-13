/**
 * I71 — Qualità del campionamento dello storico.
 *
 * Le analisi (cicli I26+, pace I31, anomalie I70, EWMA I72) valgono solo se
 * lo storico su cui sono calcolate è «buono»: senza una misura esplicita
 * della qualità un buco di sampling di 3 ore può nascondersi dietro un
 * grafico che sembra regolare. Questo modulo la rende visibile:
 *
 * - **mediana dell'intervallo** campionario osservato: robusta ai buchi
 *   (un gap da 3 ore non sposta la mediana se il resto campiona ogni 2 min),
 *   calcolata sui dt > 0; l'eventuale ultimo punto «in sospeso» non conta;
 * - **copertura attesa/osservata per giorno Europe/Rome**: i punti sono
 *   attribuiti al loro giorno Roma (chiave `YYYY-MM-DD` via Intl `en-CA`,
 *   DST-safe come `startOfTodayRome` di I77); per ogni giorno l'ARCO COPERTO
 *   va dal primo all'ultimo punto del giorno e l'ultimo punto copre un
 *   intervallo suo (`arco + medianaIntervallo`); `attesi = arco coperto /
 *   medianaIntervallo` e `copertura = osservati/attesi` limitata al 100%
 *   (campionare più fitti del previsto NON deve dare copertura > 100);
 * - **gap > 15 min** (`gapMin`, default 15): elenco con inizio, fine e
 *   durata, dal più recente; esattamente 15 minuti NON è un gap.
 *
 * Complementare alla campagna V8 (verifica dei blocchi UTC): V8 dice SE i
 * reset cadono dove devono, la qualità del campionamento dice SE lo storico
 * è abbastanza denso da permettere di dirlo.
 *
 * Funzione pura, opzioni iniettabili per test deterministici.
 */

import { TZ_ROME } from "./time";
import { medianaDi } from "./stats";

export interface SamplingDay {
  /** Chiave del giorno Roma (YYYY-MM-DD). */
  key: string;
  /** Punti effettivamente presenti nel giorno. */
  osservati: number;
  /** Punti attesi secondo la mediana dell'intervallo (≥ 1). */
  attesi: number;
  /** Copertura 0–100 (osservati/attesi, limitata). */
  copertura: number;
}

export interface SamplingGap {
  /** Epoch ms dell'ultimo punto PRIMA del buco. */
  from: number;
  /** Epoch ms del primo punto DOPO il buco. */
  to: number;
  /** Durata del buco (ms). */
  ms: number;
}

export interface SamplingQuality {
  /** Mediana dell'intervallo campionario osservato (ms); 0 se < 2 punti. */
  medianaIntervMs: number;
  /** Punti totali nella serie di input. */
  totalePunti: number;
  /** Giorni Roma in ordine cronologico. */
  giorni: SamplingDay[];
  /** Gap > gapMin, dal più recente. */
  gaps: SamplingGap[];
}

export function samplingQuality(
  history: { t: number }[],
  opts: { gapMin?: number } = {},
): SamplingQuality {
  const gapMs = (opts.gapMin ?? 15) * 60_000;

  if (history.length < 2) {
    return { medianaIntervMs: 0, totalePunti: history.length, giorni: [], gaps: [] };
  }

  // Ordina per tempo (le sorgenti storiche sono cronologiche, ma la funzione
  // è pura e non vuole fare affidamento sull'ordine di input)
  const ts = history.map((h) => h.t).sort((a, b) => a - b);

  // Intervalli validi (dt > 0) → mediana
  const dt: number[] = [];
  const gaps: SamplingGap[] = [];
  for (let i = 1; i < ts.length; i++) {
    const d = ts[i] - ts[i - 1];
    if (d <= 0) continue; // duplicati/retrocessioni: non rappresentano tempo coperto
    dt.push(d);
    if (d > gapMs) gaps.push({ from: ts[i - 1], to: ts[i], ms: d });
  }

  const medianaIntervMs = dt.length > 0 ? medianaDi(dt) : 0;
  gaps.reverse(); // dal più recente

  // Attribuzione per giorno Roma (chiave YYYY-MM-DD, DST-safe)
  const perGiorno = new Map<string, number[]>();
  for (const t of ts) {
    const key = romeDayKey(t);
    const arr = perGiorno.get(key) ?? [];
    arr.push(t);
    perGiorno.set(key, arr);
  }

  const giorni: SamplingDay[] = [...perGiorno.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, arr]) => {
      const primo = arr[0];
      const ultimo = arr[arr.length - 1];
      // L'ultimo punto copre un intervallo suo: l'arco coperto è
      // (ultimo − primo) + medianaIntervallo
      const arcoCoperto = ultimo - primo + (medianaIntervMs > 0 ? medianaIntervMs : 0);
      const attesi = Math.max(1, medianaIntervMs > 0 ? arcoCoperto / medianaIntervMs : arr.length);
      const copertura = Math.min(100, (arr.length / attesi) * 100);
      return { key, osservati: arr.length, attesi, copertura };
    });

  return { medianaIntervMs, totalePunti: ts.length, giorni, gaps };
}

/** Chiave giorno Europe/Rome di un epoch ms (YYYY-MM-DD, via Intl en-CA). */
export function romeDayKey(t: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_ROME,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}
