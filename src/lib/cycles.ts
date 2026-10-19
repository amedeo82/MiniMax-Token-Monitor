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
import { medianaDi } from "./stats";

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
  /**
   * I124 — inizio ufficiale della finestra (blocchi UTC per la 5h, lunedì
   * 00:00 UTC per la settimanale). Assente nei cicli dell'euristica
   * (detectCycles, modelli senza cadenza verificata).
   */
  windowStartT?: number;
  /**
   * I124 — fine ufficiale della finestra = MOMENTO DEL RESET: il ciclo si
   * chiude a questo confine anche se dopo l'ultimo campione non ne è arrivato
   * nessuno (le finestre proseguono il conteggio lato MiniMax a prescindere
   * dal campionamento). Assente nei cicli euristici.
   */
  windowEndT?: number;
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

/* ------------------------------------------------------------------ */
/* I124 — Finestre ufficiali e segmentazione a finestre                */
/* ------------------------------------------------------------------ */

/** Durata della finestra settimanale. */
export const SETTIMANA_MS = 7 * 24 * 3_600_000;

/** Offset (ms) del lunedì 00:00 UTC dall'epoca Unix: l'epoch 0 è giovedì 00 UTC. */
const OFFSET_LUNEDI_MS = 4 * 24 * 3_600_000;

/** Giorno UTC in ms e orari dei blocchi (cron oraria ogni 5: 00/05/10/15/20). */
const GIORNO_MS = 24 * 3_600_000;
const BLOCCHI_UTC_H = [0, 5, 10, 15, 20];

/**
 * Inizio della finestra breve che contiene `t`: blocchi fissi a ORARIO UTC
 * {00,05,10,15,20} di OGNI giorno (semantica cron, verdetto V8 con offset
 * 0 ms su 205 campioni). NON è una griglia periodica `floor(t/5h)` ancorata
 * all'epoca: quella deriva di 4h al giorno e coincide con i blocchi reali
 * solo nei giorni in cui (giorni da epoch) ≡ 0 mod 5 — beccato il 19/10
 * (lunedì, allineata per caso) incrociando la simulazione su produzione con
 * il reset osservato venerdì 16/10 alle 20:00 UTC (21:49→22:03 Roma): un
 * venerdì la griglia epoch avrebbe preveduto 21:00, non 20:00.
 *
 * Con la semantica cron l'ultimo blocco (20:00 → mezzanotta) dura 4h reali:
 * la «finestra di 5 ore» è la durata NOMINALE dei blocchi pieni, non una
 * promessa uniforme — la fine esatta va letta con `fineFinestra5h`.
 */
export function inizioFinestra5h(t: number): number {
  const giorno = Math.floor(t / GIORNO_MS) * GIORNO_MS;
  const h = (t - giorno) / 3_600_000;
  let blocco = 0;
  for (const b of BLOCCHI_UTC_H) {
    if (b <= h) blocco = b;
    else break;
  }
  return giorno + blocco * 3_600_000;
}

/**
 * Fine della finestra breve che contiene `t` = MOMENTO DEL RESET: il confine
 * di blocco successivo (00/05/10/15/20 UTC; dopo il blocco delle 20:00 la
 * fine è la mezzanotta successiva — blocco di 4h reali).
 */
export function fineFinestra5h(t: number): number {
  const giorno = Math.floor(t / GIORNO_MS) * GIORNO_MS;
  const h = (t - giorno) / 3_600_000;
  for (const b of BLOCCHI_UTC_H) {
    if (b > h) return giorno + b * 3_600_000;
  }
  return giorno + GIORNO_MS; // h ≥ 20: mezzanotta successiva
}

/**
 * Inizio della finestra settimanale (lunedì 00:00 UTC) che contiene `t`.
 * La finestra è a LIVELLO DI PIANO, condivisa da tutti i modelli (docs/02,
 * triangolazione weekly_start/end_time; conferma 18→19/10/2026: settimanale
 * 46% domenica → 92% lunedì dopo il reset di lunedì 00:00 UTC = 02:00 Roma).
 */
export function inizioSettimanaUtc(t: number): number {
  return Math.floor((t - OFFSET_LUNEDI_MS) / SETTIMANA_MS) * SETTIMANA_MS + OFFSET_LUNEDI_MS;
}

/**
 * I124 — Esclude i punti demo dall'analisi (proposal (a) del task 69): i tick
 * demo replicati nello storico fuso generano falsi reset (12/12 marker di
 * produzione dimostrati falsi in task 69). I punti SENZA marca (legacy
 * pre-I124) restano inclusi: non sono discriminabili a posteriori — la pulizia
 * dello storico locale è delegata a «Svuota storico locale» (Impostazioni →
 * Persistenza, I124).
 */
export function senzaDemo(history: HistoryPoint[]): HistoryPoint[] {
  return history.filter((p) => p.source !== "demo");
}

/**
 * I124 — Segmentazione a FINESTRE UFFICIALI: ogni finestra con almeno un
 * rilevamento è un ciclo («interval» → blocchi orari fissi UTC 00/05/10/15/20,
 * semantica cron — l'ultimo blocco 20:00→mezzanotta dura 4h reali; «weekly» → settimane
 * da lunedì 00:00 UTC, valide per QUALUNQUE modello: la finestra settimanale
 * è a livello di piano). Sostituisce l'euristica dei salti (detectCycles)
 * dove la cadenza è nota: il reset non è più «osservato» ma DEDOTTO dal
 * confine di finestra, quindi:
 *
 * - un ciclo si chiude al suo reset ufficiale anche se dopo l'ultimo campione
 *   non ne è arrivato nessuno (progetto chiuso / quota esaurita): le finestre
 *   proseguono il conteggio e i reset lato MiniMax a prescindere dal
 *   campionamento — prima, con dati fermi, l'ultimo tratto restava «in corso»
 *   per giorni (il ciclo «2 giorni 1 ora» riportato dall'utente il 19/10);
 * - le finestre SENZA rilevamenti non producono cicli: nessun consumo è
 *   osservabile (non vengono inventate righe vuote);
 * - `ongoing` significa «la finestra non è ancora terminata»: con dati fermi
 *   oltre l'ultimo confine NESSUN ciclo risulta in corso.
 *
 * Le metriche restano OSSERVATE (primo→ultimo campione della finestra): con
 * campionamento sparso durata e ritmo sono limiti inferiori onesti. Il primo
 * ciclo della serie può essere parziale (storico iniziato a finestra in corso).
 *
 * `now` iniettabile per test deterministici.
 */
export function detectCyclesFinestre(
  history: HistoryPoint[],
  win: WindowKey,
  now: number = Date.now(),
): Cycle[] {
  const serie = senzaDemo(history);
  if (serie.length === 0) return [];

  const inizio = win === "interval" ? inizioFinestra5h : inizioSettimanaUtc;
  /* La fine della finestra NON è sempre inizio + periodo: per la 5h i blocchi
     sono ancorati all'orario UTC (l'ultimo, 20:00→mezzanotta, dura 4h reali);
     per la settimanale inizio + 7 giorni resta esatto. La fine si deriva dal
     PRIMO punto del ciclo (tutti i punti del ciclo condividono la finestra). */
  const fineDi = win === "interval" ? fineFinestra5h : (t: number) => inizioSettimanaUtc(t) + SETTIMANA_MS;

  const cycles: Cycle[] = [];
  let startIdx = 0;
  let chiave = inizio(serie[0].t);
  for (let i = 1; i < serie.length; i++) {
    const k = inizio(serie[i].t);
    if (k !== chiave) {
      cycles.push(buildCycleFinestra(serie, startIdx, i - 1, win, chiave, fineDi(serie[startIdx].t), now));
      startIdx = i;
      chiave = k;
    }
  }
  cycles.push(buildCycleFinestra(serie, startIdx, serie.length - 1, win, chiave, fineDi(serie[startIdx].t), now));

  return cycles.map((c, i) => ({ ...c, index: i + 1 }));
}

/** buildCycle + metadati della finestra ufficiale e semantica «ongoing» I124. */
function buildCycleFinestra(
  history: HistoryPoint[],
  from: number,
  to: number,
  win: WindowKey,
  inizioFinestra: number,
  fineFinestra: number,
  now: number,
): Cycle {
  const base = buildCycle(history, from, to, win, false);
  return {
    ...base,
    ongoing: fineFinestra > now,
    windowStartT: inizioFinestra,
    windowEndT: fineFinestra,
  };
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

/** Etichette brevi italiane per i giorni della settimana (0 = lunedì). */
export const WEEKDAY_LABELS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

const IT_LABELS = WEEKDAY_LABELS;

// Formattatori riusabili (la creazione di Intl.DateTimeFormat è costosa)
const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", weekday: "short" });
const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
/** Ora del giorno (0–23) in fuso Europe/Rome (h23: la mezzanotte è "0", non "24"). */
const hourFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Rome",
  hour: "numeric",
  hourCycle: "h23",
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
  const keys = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const stats: WeekdayStat[] = keys.map((key, i) => ({
    key,
    label: IT_LABELS[i] ?? "",
    consumed: 0,
    days: 0,
    avgPerDay: 0,
  }));

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
/* Heatmap: consumo per giorno × ora (I32)                             */
/* ------------------------------------------------------------------ */

/** Griglia di consumo 7×24: righe = giorni (0 = lunedì), colonne = ore 0–23 Europe/Rome. */
export interface HeatmapGrid {
  /** Consumo attribuito a ciascuna cella (punti percento, drawdown). */
  cells: number[][];
  /** Numero di cali di quota attribuiti a ciascuna cella (diagnostica/tooltip). */
  events: number[][];
  /** Somma di tutte le celle (consumo totale attribuito). */
  total: number;
  /** Valore massimo di cella (0 se nessun consumo) — serve alla scala di colore. */
  max: number;
  /** Celle con almeno un consumo (per le note a fondo pannello). */
  populated: number;
}

/**
 * Consumo per (giorno della settimana × ora del giorno) in fuso Europe/Rome.
 *
 * Stessa semantica di `weekdayConsumption` (drawdown del minimo progressivo,
 * reset riconosciuti con la bicondizione RESET_JUMP/RESET_TARGET e mai contati
 * come consumo), ma con attribuzione alla CELLA (giorno, ora) del punto medio
 * tra i due rilevamenti. I giorni/ore senza dati restano a 0.
 */
export function heatmapConsumption(history: HistoryPoint[], win: WindowKey): HeatmapGrid {
  const cells: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const events: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

  if (history.length < 2) {
    return { cells, events, total: 0, max: 0, populated: 0 };
  }

  let ref = valueOf(history[0], win); // minimo progressivo della finestra corrente

  for (let i = 1; i < history.length; i++) {
    const v = valueOf(history[i], win);

    if (v < ref) {
      // Discesa sotto il minimo progressivo: consumo reale da attribuire
      const drop = ref - v;
      const midT = (history[i - 1].t + history[i].t) / 2;
      const mid = new Date(midT);
      const dayIdx = EN_TO_INDEX[weekdayFmt.format(mid)] ?? -1;
      const hourIdx = Number(hourFmt.format(mid));
      if (dayIdx >= 0 && Number.isInteger(hourIdx) && hourIdx >= 0 && hourIdx <= 23) {
        cells[dayIdx][hourIdx] += drop;
        events[dayIdx][hourIdx] += 1;
      }
      ref = v;
    } else if (v - ref >= RESET_JUMP && v >= RESET_TARGET) {
      // Reset vero: nuova baseline, nessun consumo
      ref = v;
    }
    // Recupero sotto la soglia di reset (rumore): ref resta al minimo, niente consumo
  }

  let total = 0;
  let max = 0;
  let populated = 0;
  for (const row of cells) {
    for (const v of row) {
      total += v;
      if (v > max) max = v;
      if (v > 0) populated += 1;
    }
  }
  return { cells, events, total, max, populated };
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

/* ------------------------------------------------------------------ */
/* I57 — Spreco per ciclo                                              */
/* ------------------------------------------------------------------ */

/** Statistiche di spreco sui cicli completati (I57). */
export interface WasteStats {
  /** Cicli completati analizzati. */
  n: number;
  /** Residuo medio al reset (punti percento). */
  media: number;
  /** Residuo mediano al reset. */
  mediana: number;
  /** Spreco più grande osservato (peggiore ciclo). */
  max: number;
  /** Cicli «puliti» con spreco < 5 punti. */
  clean: number;
  /** Percentuale di cicli puliti (0–100). */
  percClean: number;
}

/**
 * I57 — Quanto quota il reset «buttata via»: per ogni ciclo completato lo
 * spreco è il residuo osservato all'ultimo rilevamento prima del reset
 * (`endValue`): quella quota il reset la riporta a pieno senza che sia stata
 * usata. Media/mediana/max sui cicli completati; `clean` conta i cicli con
 * spreco sotto 5 punti (reset «in orario», fine finestra quasi a secco).
 * Ritorna null senza cicli completati.
 */
export function sprecoPerCiclo(cycles: Cycle[]): WasteStats | null {
  const completati = cycles.filter((c) => !c.ongoing);
  if (completati.length === 0) return null;
  const sprechi = completati.map((c) => Math.max(0, c.endValue));
  const media = sprechi.reduce((a, b) => a + b, 0) / sprechi.length;
  const mediana = medianaDi(sprechi);
  const clean = sprechi.filter((s) => s < 5).length;
  return {
    n: sprechi.length,
    media,
    mediana,
    max: Math.max(...sprechi),
    clean,
    percClean: (clean / sprechi.length) * 100,
  };
}

/* ------------------------------------------------------------------ */
/* I63 — Prevedibilità dei cicli                                       */
/* ------------------------------------------------------------------ */

/** Indice di regolarità dei cicli (I63). */
export interface Prevedibilita {
  /** Cicli completati analizzati (≥ 3). */
  n: number;
  /** Durata media dei cicli completati, ms. */
  mediaMs: number;
  /** Deviazione standard POPOLAZIONE delle durate, ms. */
  sigmaMs: number;
  /** Coefficiente di variazione σ/μ (0 = perfettamente regolari). */
  cv: number;
  /** Indice di regolarità 0–100: 100 × (1 − min(1, cv)). */
  indice: number;
}

/**
 * I63 — Quanto sono prevedibili le durate dei cicli: σ popolazione e
 * coefficiente di variazione sulle durate dei cicli completati; l'indice di
 * regolarità mappa cv ∈ [0,1] → [100, 0]. Ritorna null con meno di 3 cicli
 * completati (con 2 la statistica non significa nulla).
 */
export function prevedibilitaCicli(cycles: Cycle[]): Prevedibilita | null {
  const durate = cycles.filter((c) => !c.ongoing).map((c) => c.durationMs);
  if (durate.length < 3) return null;
  const mediaMs = durate.reduce((a, b) => a + b, 0) / durate.length;
  if (mediaMs <= 0) return null;
  const varianza = durate.reduce((acc, d) => acc + (d - mediaMs) ** 2, 0) / durate.length;
  const sigmaMs = Math.sqrt(varianza);
  const cv = sigmaMs / mediaMs;
  return {
    n: durate.length,
    mediaMs,
    sigmaMs,
    cv,
    indice: Math.round(Math.max(0, Math.min(100, 100 * (1 - Math.min(1, cv))))),
  };
}

/* ------------------------------------------------------------------ */
/* I58 — Calendario del consumo per giorno di calendario               */
/* ------------------------------------------------------------------ */

/** Una cella del calendario (I58): giorno senza dati → value null. */
export interface DayCell {
  /** Data in formato YYYY-MM-DD (Europe/Rome) o null per celle future/vuote. */
  date: string | null;
  /** Consumo attribuito al giorno (punti percento) o null. */
  value: number | null;
}

/** Griglia calendario (I58): righe = settimane, colonne = lun→dom. */
export interface CalendarGrid {
  /** Settimane in ordine cronologico; la CORRENTE è sempre l'ultima riga. */
  weeks: DayCell[][];
  /** Consumo massimo di un giorno (per la scala di colore). */
  max: number;
  /** Giorni con almeno un consumo. */
  giorni: number;
  /** Consumo totale attribuito. */
  total: number;
}

// Formatter riusabili (quelli top-file: date stringa en-CA = DST-safe di costruzione,
// weekday en-US per l'allineamento al lunedì — vedi sezione «Consumo per giorno»).

/**
 * I58 — Consumo per giorno DI CALENDARIO (stile GitHub): il drawdown tra
 * rilevamenti è attribuito al giorno (Europe/Rome) del punto medio (stessa
 * semantica di `weekdayConsumption`/`heatmapConsumption`), poi aggregato per
 * data. La griglia copre le ultime `settimane` settimane (default 26) a
 * partire da lunedì; la settimana corrente è SEMPRE l'ultima riga, con celle
 * future a null.
 */
export function consumoGiornaliero(
  history: HistoryPoint[],
  win: WindowKey,
  settimane = 26,
): CalendarGrid {
  const perGiorno = new Map<string, number>();
  if (history.length >= 2) {
    let ref = valueOf(history[0], win);
    for (let i = 1; i < history.length; i++) {
      const v = valueOf(history[i], win);
      if (v < ref) {
        const midT = (history[i - 1].t + history[i].t) / 2;
        const dayKey = dateFmt.format(new Date(midT));
        perGiorno.set(dayKey, (perGiorno.get(dayKey) ?? 0) + (ref - v));
        ref = v;
      } else if (v - ref >= RESET_JUMP && v >= RESET_TARGET) {
        ref = v;
      }
      // recupero sotto soglia: rumore, nessun consumo
    }
  }

  // Intervallo dei giorni: dal primo all'ultimo giorno CON DATI (fallback: oggi
  // se non c'è alcun consumo). Terminare all'ultimo giorno osservato rende la
  // griglia deterministica anche con storico non odierno; con dati vivi l'ultimo
  // giorno osservato è proprio oggi (settimana corrente = ultima riga).
  const oggi = dateFmt.format(new Date());
  const giorniOsservati = [...perGiorno.keys()].sort();
  const primo = giorniOsservati[0] ?? oggi;
  const ultimo = giorniOsservati[giorniOsservati.length - 1] ?? primo;

  // Crea la sequenza di date (stringhe) da `primo` (allineato al lunedì) a `ultimo`.
  const [y, m, d] = primo.split("-").map(Number);
  let cursor = new Date(Date.UTC(y, m - 1, d));
  // Torna al lunedì della settimana di `primo`
  while (weekdayFmt.format(cursor) !== "Mon") {
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  const [fy, fm, fd] = ultimo.split("-").map(Number);
  const fine = new Date(Date.UTC(fy, fm - 1, fd));

  const weeks: DayCell[][] = [];
  let currentWeek: DayCell[] = [];
  let max = 0;
  let giorni = 0;
  let total = 0;

  // Limite di sicurezza: non scavalcare le settimane richieste per eccesso
  while (cursor.getTime() <= fine.getTime()) {
    const key = dateFmt.format(cursor);
    const value = perGiorno.get(key) ?? null;
    currentWeek.push({ date: key, value });
    if (value !== null) {
      giorni += 1;
      total += value;
      if (value > max) max = value;
    }
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    cursor = new Date(cursor.getTime() + 86_400_000);
    if (weeks.length > settimane) break; // margine di sicurezza
  }
  if (currentWeek.length > 0) {
    // Settimana corrente COMPLETATA con celle vuote fino a domenica
    while (currentWeek.length < 7) currentWeek.push({ date: null, value: null });
    weeks.push(currentWeek);
  }

  // Taglia alle ultime `settimane` settimane (la corrente è sempre l'ultima)
  const taglio = weeks.slice(-Math.max(1, settimane));
  return { weeks: taglio, max, giorni, total };
}

/* ------------------------------------------------------------------ */
/* I64 — Oggi vs media degli stessi weekday                            */
/* ------------------------------------------------------------------ */

/** Confronto «oggi vs media» (I64). */
export interface OggiVsMedia {
  /** Data di oggi (YYYY-MM-DD, Europe/Rome). */
  oggiKey: string;
  /** Consumo di oggi (0 se nessun rilevamento in calo ancora oggi). */
  oggi: number;
  /** Media dei consumi degli stessi weekday nelle ultime N settimane (oggi escluso). */
  media: number;
  /** Differenza oggi − media (positiva = oggi più consumo). */
  differenza: number;
  /** Numero di giorni usati nella media. */
  giorniConsiderati: number;
  /** true se nessun giorno confrontabile (media non significativa). */
  senzaMedia: boolean;
}

/**
 * I64 — Consumo di OGGI contro la media degli STESSI weekday delle ultime
 * `settimane` settimane (default 5), con oggi ESCLUSO dalla media. Riusa
 * l'aggregazione per giorno di `consumoGiornaliero`.
 */
export function oggiVsMedia(history: HistoryPoint[], win: WindowKey, settimane = 5): OggiVsMedia {
  const grid = consumoGiornaliero(history, win, Math.max(settimane + 1, 6));
  const flat = grid.weeks.flat().filter((c): c is { date: string; value: number } => c.date !== null && c.value !== null);
  const oggiKey = flat.length > 0 ? flat[flat.length - 1].date : dateFmt.format(new Date());
  const oggi = flat.find((c) => c.date === oggiKey)?.value ?? 0;

  // Weekday (0=lun … 6=dom) di oggi, calcolato dalla data stringa su un utcnoon
  const [oy, om, od] = oggiKey.split("-").map(Number);
  const probe = new Date(Date.UTC(oy, om - 1, od, 12));
  const idx = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekdayFmt.format(probe));

  const confrontabili = flat
    .filter((c) => c.date !== oggiKey)
    .filter((c) => {
      const [cy, cm, cd] = c.date.split("-").map(Number);
      const p = new Date(Date.UTC(cy, cm - 1, cd, 12));
      return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekdayFmt.format(p)) === idx;
    });

  const lastN = confrontabili.slice(-settimane);
  const media =
    lastN.length > 0 ? lastN.reduce((a, c) => a + c.value, 0) / lastN.length : 0;

  return {
    oggiKey,
    oggi,
    media,
    differenza: oggi - media,
    giorniConsiderati: lastN.length,
    senzaMedia: lastN.length === 0,
  };
}

/* ------------------------------------------------------------------ */
/* I61 — Istogramma del residuo                                        */
/* ------------------------------------------------------------------ */

/** Una fascia dell'istogramma del residuo (I61). */
export interface ResiduoFascia {
  /** Etichetta «0–10» … «90–100». */
  label: string;
  /** Limite inferiore (incluso), 0–90. */
  from: number;
  /** Limite superiore (incluso), 10–100. */
  to: number;
  /** Rilevamenti con residuo nella fascia. */
  count: number;
  /** Colore della fascia (BAND_COLORS). */
  color: string;
}

/** Distribuzione del residuo (I61). */
export interface Distribuzione {
  fasce: ResiduoFascia[];
  /** Rilevamenti totali distribuiti. */
  n: number;
  /** Conteggio massimo (per la scala delle barre). */
  max: number;
}

/**
 * Colori delle 10 fasce di residuo: dal rosso (0–10) al verde (90–100), con
 * i toni di `quotaLevel` come casi limite (10/30/60).
 */
export const BAND_COLORS: string[] = [
  "#ef4444", // 0–10   crit
  "#fb7185", // 10–20  crit→warn
  "#f97316", // 20–30  warn
  "#f59e0b", // 30–40  warn
  "#fbbf24", // 40–50  warn→good
  "#eab308", // 50–60  good
  "#a3e635", // 60–70  good→ok
  "#84cc16", // 70–80  ok
  "#4ade80", // 80–90  ok
  "#22c55e", // 90–100 ok pieno
];

/**
 * I61 — Istogramma del residuo osservato: ogni rilevamento della finestra è
 * assegnato alla fascia con CEIL (84,5 → 80–90; 0 → 0–10; 100 → 90–100).
 */
export function distribuzioneResiduo(history: HistoryPoint[], win: WindowKey): Distribuzione {
  const counts = new Array<number>(10).fill(0);
  let n = 0;
  for (const p of history) {
    const v = valueOf(p, win);
    if (!isFinite(v)) continue;
    const idx = Math.min(9, Math.max(0, Math.ceil(v / 10) - 1));
    counts[idx] += 1;
    n += 1;
  }
  const fasce: ResiduoFascia[] = counts.map((count, i) => ({
    label: `${i * 10}–${i * 10 + 10}`,
    from: i * 10,
    to: i * 10 + 10,
    count,
    color: BAND_COLORS[i],
  }));
  return { fasce, n, max: Math.max(0, ...counts) };
}
