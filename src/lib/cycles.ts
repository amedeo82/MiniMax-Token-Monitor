/**
 * I26 — Analisi di lungo periodo dello storico quota.
 *
 * Sbloccata da I16 (persistenza server-side): sui punti conservati (fino a
 * 10.000 lato server) è possibile analizzare cosa succede OLTRE la finestra
 * corrente:
 *
 * - **Cicli di finestra**: un reset è osservabile nello storico come salto
 *   verso l'alto della percentuale residua tra due rilevamenti consecutivi.
 *   Segmentando la serie sui reset si ottengono i "cicli": per ciascuno si
 *   misurano durata, consumo e ritmo (%/h), così da confrontare tra loro le
 *   finestre consecutive (roadmap docs/03 §11 punto 1).
 * - **Consumo per giorno della settimana**: i cali di quota tra due
 *   rilevamenti vengono attribuiti al giorno (Europe/Rome) del punto medio;
 *   aggregando si ottiene il consumo medio per lunedì, martedì, ecc.
 *   (roadmap docs/03 §11 punto 5).
 * - **Media mobile (SMA)**: attenua il rumore dei singoli rilevamenti per
 *   leggere il trend di fondo.
 *
 * Tutte le funzioni sono pure e senza dipendenze: testabili e riusabili sia
 * sullo storico locale (600 punti) sia su quello completo del server.
 */

import type { HistoryPoint } from "@/components/history-chart";

export type WindowKey = "interval" | "weekly";

/**
 * Salto minimo (punti percento) verso l'alto tra due rilevamenti consecutivi
 * per considerarlo un reset di finestra. Il jitter osservato è ≤ 1,5 punti.
 */
export const RESET_JUMP = 15;

/**
 * Un reset è valido solo se il valore DOPO il salto torna almeno a questa
 * soglia: un reset vero riporta la finestra (quasi) piena. Esclude i falsi
 * reset dovuti al mescolarsi di sorgenti che misurano livelli diversi
 * (es. punti «api» reali al 57% alternati a punti «demo» al 77%: il salto
 * +20 non è un reset perché 77 < 85).
 */
export const RESET_TARGET = 85;

/* ------------------------------------------------------------------ */
/* Cicli di finestra                                                   */
/* ------------------------------------------------------------------ */

/** Un ciclo = arco di storico tra due reset consecutivi della stessa finestra. */
export interface Cycle {
  /** Posizione del ciclo nella serie (1-based, ordine cronologico). */
  index: number;
  /** Primo rilevamento del ciclo, epoch ms (post-reset). */
  startT: number;
  /** Ultimo rilevamento del ciclo, epoch ms (pre-reset successivo o "ora"). */
  endT: number;
  /** Percentuale residua al primo rilevamento del ciclo. */
  startValue: number;
  /** Percentuale residua all'ultimo rilevamento del ciclo. */
  endValue: number;
  /** Percentuale residua minima osservata nel ciclo. */
  minValue: number;
  /** Consumo netto osservato (startValue − endValue), punti percento. */
  consumed: number;
  /** Durata osservata del ciclo, ms. */
  durationMs: number;
  /** Ritmo medio di consumo in %/h (positivo = consumo). */
  ratePerHour: number | null;
  /** Rilevamenti che compongono il ciclo. */
  points: number;
  /** true = ciclo ancora in corso (nessun reset successivo osservato). */
  ongoing: boolean;
}

function valueOf(p: HistoryPoint, win: WindowKey): number {
  return win === "interval" ? p.interval : p.weekly;
}

function buildCycle(history: HistoryPoint[], from: number, to: number, win: WindowKey, ongoing: boolean): Cycle {
  const slice = history.slice(from, to + 1);
  const values = slice.map((p) => valueOf(p, win));
  const startValue = values[0];
  const endValue = values[values.length - 1];
  const minValue = Math.min(...values);
  const startT = slice[0].t;
  const endT = slice[slice.length - 1].t;
  const durationMs = Math.max(0, endT - startT);
  // Consumo = drawdown massimo: la quota residua non risale mai senza reset,
  // quindi il consumo reale del ciclo è la discesa dal valore iniziale al
  // minimo osservato (robusto rispetto a rumore/recuperi tra le rilevazioni).
  const consumed = Math.max(0, startValue - minValue);
  const hours = durationMs / 3600_000;
  return {
    index: 0,
    startT,
    endT,
    startValue,
    endValue,
    minValue,
    consumed,
    durationMs,
    ratePerHour: hours > 0 && consumed > 0 ? consumed / hours : null,
    points: slice.length,
    ongoing,
  };
}

/**
 * Segmenta lo storico in cicli di finestra: ogni salto ≥ RESET_JUMP che riporta
 * la quota a ≥ RESET_TARGET chiude il ciclo corrente e ne apre uno nuovo.
 *
 * NB: il primo ciclo della serie può essere "parziale" (lo storico è iniziato
 * a finestra in corso); l'ultimo è quasi sempre quello in corso (ongoing).
 */
export function detectCycles(history: HistoryPoint[], win: WindowKey): Cycle[] {
  if (history.length === 0) return [];

  const cycles: Cycle[] = [];
  let startIdx = 0;

  for (let i = 1; i < history.length; i++) {
    const prev = valueOf(history[i - 1], win);
    const curr = valueOf(history[i], win);
    if (curr - prev >= RESET_JUMP && curr >= RESET_TARGET) {
      cycles.push(buildCycle(history, startIdx, i - 1, win, false));
      startIdx = i;
    }
  }
  // L'ultimo tratto non è mai seguito da un reset osservato → in corso
  cycles.push(buildCycle(history, startIdx, history.length - 1, win, true));

  return cycles.map((c, i) => ({ ...c, index: i + 1 }));
}

/** Riepilogo statistico dei cicli (le medie considerano solo i cicli completati). */
export interface CycleSummary {
  /** Cicli totali osservati (completati + in corso). */
  total: number;
  /** Cicli completati (chiusi da un reset osservato). */
  completed: number;
  /** Ciclo attualmente in corso, se presente. */
  ongoing: Cycle | null;
  /** Durata media dei cicli completati, ms. */
  avgDurationMs: number | null;
  /** Consumo medio per ciclo completato, punti percento. */
  avgConsumed: number | null;
  /** Ritmo medio di consumo dei cicli completati, %/h. */
  avgRatePerHour: number | null;
  /** Residuo minimo assoluto registrato sull'intera serie. */
  minEver: number | null;
  /** Durata del ciclo completato più lungo, ms. */
  maxDurationMs: number | null;
}

export function summarizeCycles(cycles: Cycle[]): CycleSummary {
  const completed = cycles.filter((c) => !c.ongoing);
  const ongoing = cycles.find((c) => c.ongoing) ?? null;

  const avg = (nums: number[]): number | null =>
    nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;

  return {
    total: cycles.length,
    completed: completed.length,
    ongoing,
    avgDurationMs: avg(completed.map((c) => c.durationMs)),
    avgConsumed: avg(completed.map((c) => c.consumed)),
    avgRatePerHour: avg(completed.map((c) => c.ratePerHour).filter((r): r is number => r !== null)),
    minEver: cycles.length > 0 ? Math.min(...cycles.map((c) => c.minValue)) : null,
    maxDurationMs: completed.length > 0 ? Math.max(...completed.map((c) => c.durationMs)) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Consumo per giorno della settimana                                  */
/* ------------------------------------------------------------------ */

export interface WeekdayStat {
  /** Chiave EN ("Mon"…"Sun") per l'ordinamento. */
  key: string;
  /** Etichetta breve italiana ("lun"…"dom"). */
  label: string;
  /** Consumo totale osservato nel giorno (punti percento). */
  consumed: number;
  /** Giorni distinti di quel weekday presenti nello storico. */
  days: number;
  /** Consumo medio per giorno: consumed / days (0 se il giorno non appare). */
  avgPerDay: number;
}

const EN_TO_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const IT_LABELS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

// Formattatori riusabili (la creazione di Intl.DateTimeFormat è costosa)
const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", weekday: "short" });
const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Consumo per giorno della settimana (Europe/Rome): viene attribuito a ciascun
 * giorno solo il calo del MINIMO progressivo della quota (drawdown). La quota
 * residua infatti non risale mai senza reset: i rimbalzi tra rilevamenti
 * (rumore o sorgenti miste) non sono consumo reale e non vengono contati.
 * Il giorno di attribuzione è quello (Europe/Rome) del punto medio tra i due
 * temporali; le medie dividono per i giorni distinti di quel weekday presenti
 * nello storico (un giorno presente ma senza consumo conta come 0).
 */
export function weekdayConsumption(history: HistoryPoint[], win: WindowKey): WeekdayStat[] {
  const stats: WeekdayStat[] = IT_LABELS.map((label, i) => ({
    key: Object.keys(EN_TO_INDEX)[i] ?? "",
    label,
    consumed: 0,
    days: 0,
    avgPerDay: 0,
  }));
  // Ordine key coerente con l'indice
  const keys = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (let i = 0; i < 7; i++) stats[i].key = keys[i];

  if (history.length < 2) return stats;

  const seenDays = new Map<string, number>(); // data ISO (Roma) → indice weekday
  let ref = valueOf(history[0], win); // minimo progressivo della finestra corrente

  for (let i = 1; i < history.length; i++) {
    const v = valueOf(history[i], win);

    // Giorni distinti presenti nello storico (da entrambi i punti)
    for (const t of [history[i - 1].t, history[i].t]) {
      const dayKey = dateFmt.format(new Date(t));
      if (!seenDays.has(dayKey)) {
        const wd = weekdayFmt.format(new Date(t));
        const idx = EN_TO_INDEX[wd] ?? -1;
        seenDays.set(dayKey, idx);
        if (idx >= 0) stats[idx].days += 1;
      }
    }

    const isReset = v - ref >= RESET_JUMP && v >= RESET_TARGET;
    if (v < ref) {
      // Discesa sotto il minimo progressivo: consumo reale da attribuire
      const drop = ref - v;
      const midT = (history[i - 1].t + history[i].t) / 2;
      const idx = EN_TO_INDEX[weekdayFmt.format(new Date(midT))] ?? -1;
      if (idx >= 0) stats[idx].consumed += drop;
      ref = v;
    } else if (isReset) {
      // Reset vero: nuova baseline, nessun consumo
      ref = v;
    }
    // Recupero sotto la soglia di reset (rumore): ref resta al minimo, niente consumo
  }

  for (const s of stats) s.avgPerDay = s.days > 0 ? s.consumed / s.days : 0;
  return stats;
}

/* ------------------------------------------------------------------ */
/* Media mobile                                                        */
/* ------------------------------------------------------------------ */

/**
 * Simple Moving Average: per ogni posizione restituisce la media degli ultimi
 * `k` valori (null finché la finestra non è piena). `k` minimo 2.
 */
export function movingAverage(values: number[], k: number): (number | null)[] {
  const window = Math.max(2, Math.floor(k));
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}
