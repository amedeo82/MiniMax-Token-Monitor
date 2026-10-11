/**
 * I70 — Anomalie del ritmo di consumo (z-score robusto mediana + MAD).
 *
 * Il ritmo normale è quel valore «attorno a cui» la serie di `rateSeries`
 * (I59) oscilla; un'ANOMALIA è un momento in cui il consumo devia in modo
 * netto dal proprio regime (scoppio di attività, pausa lunga, throttle).
 *
 * Perché lo z-score ROBUSTO (Iglewicz–Hoaglin) e non la media + deviazione
 * standard: media e s.d. sono a loro volta trascinate dagli outlier — un
 * singolo picco enorme gonfia la s.d. e nasconde sé stesso. Mediana e MAD
 * hanno punto di rottura 50%: restano stabili finché almeno metà dei
 * campioni è «normale», condizione tipica di un monitor che campiona ogni
 * 1–5 minuti.
 *
 * - mediana m dei ritmi validi;
 * - MAD = mediana(|x − m|);
 * - z = 0.6745 · (x − m) / MAD   (0.6745 = quartile della normale standard:
 *   rende il MAD confrontabile con una s.d.);
 * - anomalia se |z| > soglia (default 3.5, raccomandazione Iglewicz–Hoaglin).
 *
 * Le statistiche sono calcolate sui ritmi GREZZI (`rateSeries` con
 * `sma: 1`): la SMA-3 di default smorza proprio i picchi che si vogliono
 * segnalare. Con meno di `minValidi` campioni (default 8) le statistiche
 * non sono affidabili e non viene riportata alcuna anomalia.
 *
 * Caso degenere MAD = 0 (più della metà dei campioni identici — tipico di
 * periodi quasi fermi): il z-score robusto non è definibile, si usa come
 * SCALA DI RIPLEGIO la media degli scarti assoluti; se anche quella è 0
 * (tutti i campioni identici) non ci sono anomalie per costruzione.
 *
 * Funzione pura, opzioni iniettabili per test deterministici.
 */

import { rateSeries } from "./rate";
import type { WindowKey } from "./cycles";

/** Una singola anomalia: ritmo fuori regime con relativo z-score robusto. */
export interface RateAnomaly {
  /** Indice nella serie di input del rilevamento anomalo. */
  i: number;
  /** Epoch ms del rilevamento anomalo. */
  t: number;
  /** Ritmo osservato (%/h), già grezzo (senza SMA). */
  valore: number;
  /** z-score robusto con segno: > 0 scoppi di consumo, < 0 pause anomale. */
  z: number;
}

export interface RateAnomalies {
  /** Regime atteso: mediana dei ritmi validi (%/h). */
  mediana: number;
  /** Deviazione mediana assoluta (%/h). */
  mad: number;
  /** Scala effettivamente usata: MAD, o media degli scarti assoluti se MAD = 0. */
  scala: number;
  /** Soglia |z| applicata. */
  soglia: number;
  /** Campioni validi usati per le statistiche. */
  validi: number;
  /** Anomalie in ordine cronologico. */
  anomalie: RateAnomaly[];
}

const Z_CONS = 0.6745;

export function detectRateAnomalies(
  history: { t: number; interval: number; weekly: number }[],
  win: WindowKey,
  opts: { threshold?: number; minValidi?: number } = {},
): RateAnomalies {
  const soglia = opts.threshold ?? 3.5;
  const minValidi = opts.minValidi ?? 8;

  const empty: RateAnomalies = { mediana: 0, mad: 0, scala: 0, soglia, validi: 0, anomalie: [] };

  // Ritmi GREZZI (sma: 1): la SMA di default smorzerebbe i picchi da segnalare
  const rate = rateSeries(history, win, { sma: 1 });
  const validi: { i: number; t: number; v: number }[] = [];
  for (let i = 0; i < rate.series.length; i++) {
    const v = rate.series[i];
    if (v !== null && history[i] !== undefined) validi.push({ i, t: history[i].t, v });
  }
  if (validi.length < minValidi) return { ...empty, validi: validi.length };

  const mediana = medianaDi(validi.map((x) => x.v));
  const scarti = validi.map((x) => Math.abs(x.v - mediana));
  const mad = medianaDi(scarti);

  // MAD = 0 → serie quasi tutta sullo stesso valore: scala di riplegio
  const mediaScarti = scarti.reduce((a, b) => a + b, 0) / scarti.length;
  const scala = mad > 0 ? mad : mediaScarti;
  if (scala <= 0) return { mediana, mad, scala: 0, soglia, validi: validi.length, anomalie: [] };

  const anomalie: RateAnomaly[] = [];
  for (const x of validi) {
    const z = (Z_CONS * (x.v - mediana)) / scala;
    if (Math.abs(z) > soglia) anomalie.push({ i: x.i, t: x.t, valore: x.v, z });
  }

  return { mediana, mad, scala, soglia, validi: validi.length, anomalie };
}

/** Mediana di un array non vuoto (media dei due centrali se pari). */
function medianaDi(valori: number[]): number {
  if (valori.length === 0) return 0;
  const s = [...valori].sort((a, b) => a - b);
  const mezzo = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mezzo] : (s[mezzo - 1] + s[mezzo]) / 2;
}
