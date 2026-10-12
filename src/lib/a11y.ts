/**
 * I79 — Descrizioni testuali (sr-only / aria-label) dei grafici.
 *
 * Tre generatori PURI e deterministici: trasformano i dati già calcolati
 * dalle librerie di analisi in frasi italiane che uno screen reader può
 * leggere al posto dell'immagine. Nessuna dipendenza da React o dal DOM;
 * i formatter di tempo sono quelli condivisi di lib/time.ts (Europe/Rome).
 *
 * Consumo (docs/03 §5.18):
 * - `descrizioneHeatmap`    → <p sr-only> in HeatmapSection (analysis-panel);
 * - `descrizioneCalendario` → <p sr-only> in CalendarSection (analysis-panel);
 * - `descrizioneResetClock` → aria-label dinamico dell'SVG ResetClock
 *   (diagnostica-panel, role="img").
 */

import { WEEKDAY_LABELS } from "@/lib/cycles";
import type { CalendarGrid, HeatmapGrid } from "@/lib/cycles";
import { formatDateTimeRome } from "@/lib/time";

/* ------------------------------------------------------------------ */
/* Heatmap (I32) — consumo per giorno della settimana × ora            */
/* ------------------------------------------------------------------ */

/**
 * Descrizione della heatmap 7×24: consumo totale attribuito, ora di picco
 * (giorno + ora Europe/Rome) e blocchi attivi su 168. Con `total <= 0`
 * (griglia vuota) restituisce una frase sensata: il chiamante potrebbe
 * comunque usarla (le sezioni mostrano l'empty state, ma la funzione è totale).
 */
export function descrizioneHeatmap(grid: HeatmapGrid, winLabel: string): string {
  if (grid.total <= 0) {
    return `Heatmap del consumo per giorno e ora (${winLabel}): nessun consumo attribuito a blocchi giorno-ora.`;
  }
  // ora di picco: prima cella col valore massimo (stessa scelta della sezione UI)
  let picco: { giorno: string; ora: number; valore: number } | null = null;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const v = grid.cells[d][h];
      if (v > 0 && (!picco || v > picco.valore)) {
        picco = { giorno: WEEKDAY_LABELS[d], ora: h, valore: v };
      }
    }
  }
  const piccoTxt = picco
    ? ` Ora di picco: ${picco.giorno} alle ${String(picco.ora).padStart(2, "0")}:00 con ${picco.valore.toFixed(1)}%.`
    : "";
  return (
    `Heatmap del consumo per giorno della settimana e ora del giorno (${winLabel}). ` +
    `Consumo totale attribuito ${grid.total.toFixed(1)}%.` +
    piccoTxt +
    ` ${grid.populated} blocchi giorno-ora con consumo su 168.`
  );
}

/* ------------------------------------------------------------------ */
/* Calendario (I58) — consumo per giorno di calendario                 */
/* ------------------------------------------------------------------ */

/**
 * Descrizione del calendario stile GitHub: consumo totale e giorni con dati,
 * giorno più intenso (data + valore) e nota sulla settimana corrente.
 */
export function descrizioneCalendario(grid: CalendarGrid, winLabel: string): string {
  if (grid.total <= 0) {
    return `Calendario del consumo per giorno (${winLabel}): nessun consumo attribuito a giorni di calendario.`;
  }
  // giorno più intenso: scorrimento cronologico delle settimane (lun→dom)
  let maxCell: { date: string; value: number } | null = null;
  for (const settimana of grid.weeks) {
    for (const cella of settimana) {
      if (cella.date && cella.value !== null && cella.value > 0 && (!maxCell || cella.value > maxCell.value)) {
        maxCell = { date: cella.date, value: cella.value };
      }
    }
  }
  const maxTxt = maxCell ? ` Giorno più intenso: ${maxCell.date} con ${maxCell.value.toFixed(1)}%.` : "";
  return (
    `Calendario del consumo per giorno di calendario (ultime ${grid.weeks.length} settimane, ${winLabel}). ` +
    `Consumo totale ${grid.total.toFixed(1)}% su ${grid.giorni} giorni con dati.` +
    maxTxt +
    ` La settimana corrente è l'ultima colonna della griglia.`
  );
}

/* ------------------------------------------------------------------ */
/* Orologio dei reset (I60) — dot plot reset osservati vs blocchi UTC  */
/* ------------------------------------------------------------------ */

/** Un reset osservato dal ResetClock (mezzo tra fine ciclo e inizio successivo). */
export interface ResetOsservatoA11y {
  t: number;
  win: "interval" | "weekly";
}

/** Blocchi teorici dei reset MiniMax in ore UTC (stessa costante del pannello). */
const BLOCCHI_UTC = [0, 5, 10, 15, 20];

/**
 * Descrizione dell'orologio dei reset: quanti reset osservati nella finestra
 * mostrata, ripartiti per finestra, l'ultimo con data/ora Rome e i blocchi
 * teorici UTC. `da`/`a` delimitano la finestra visibile (il chiamante usa gli
 * stessi confini del grafico: ultimi 7 giorni).
 */
export function descrizioneResetClock(
  osservati: ResetOsservatoA11y[],
  da: number,
  a: number,
): string {
  const visibili = osservati.filter((r) => r.t >= da && r.t <= a);
  const interval = visibili.filter((r) => r.win === "interval").length;
  const weekly = visibili.length - interval;
  const blocchi = BLOCCHI_UTC.map((h) => `${String(h).padStart(2, "0")}:00`).join(", ");
  if (visibili.length === 0) {
    return (
      `Orologio dei reset: nessun reset osservato negli ultimi 7 giorni. ` +
      `Blocchi teorici UTC alle ${blocchi} (01:00 ora italiana durante l'ora legale).`
    );
  }
  const ultimo = visibili[visibili.length - 1];
  const ultimoTxt = ` Ultimo reset: ${formatDateTimeRome(ultimo.t)} (${ultimo.win === "interval" ? "finestra di 5 ore" : "finestra settimanale"}).`;
  return (
    `Orologio dei reset: ${visibili.length} reset osservati negli ultimi 7 giorni — ` +
    `${interval} della finestra di 5 ore e ${weekly} settimanali.` +
    ultimoTxt +
    ` La corsa «UTC» segna i blocchi teorici alle ${blocchi}.`
  );
}
