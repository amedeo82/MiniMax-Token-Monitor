/**
 * I59 — Serie del ritmo di consumo (%/h) tra rilevamenti consecutivi.
 *
 * Il ritmo istantaneo è la pendenza locale della quota: (v_prev − v_curr)/Δh,
 * positiva quando la quota scende (consumo). Due casi sono inaffidabili e
 * vengono AZZERATI a null:
 * - gap troppo lungo tra i due rilevamenti (> `gapMs`, default 30 min): una
 *   pendenza su 40 minuti di buco non rappresenta nessun «ritmo»;
 * - quota in RISALITA: senza reset non risale (rumore), con reset il salto
 *   non è consumo: in entrambi i casi il ritmo non è definibile.
 *
 * Sui valori validi consecutivi viene applicata una SMA-3 (medie mobili corte)
 * per attenuare il rumore dei singoli rilevamenti mantenendo i picchi.
 *
 * Funzione pura, opzioni iniettabili per test deterministici.
 */

import { RESET_JUMP, RESET_TARGET, type WindowKey } from "./cycles";

export interface RatePoint {
  /** (number|null)[] stessa lunghezza della serie di input. */
  series: (number | null)[];
  /** Ritmo massimo osservato (già lisciato), per la scala del grafico. */
  max: number;
  /** Ritmo medio dei valori validi, per il KPI. */
  media: number;
  /** Numero di campioni validi. */
  validi: number;
}

const GAP_DEFAULT_MS = 30 * 60_000;

export function rateSeries(
  history: { t: number; interval: number; weekly: number }[],
  win: WindowKey,
  opts: { gapMs?: number; sma?: number } = {},
): RatePoint {
  const gapMs = opts.gapMs ?? GAP_DEFAULT_MS;
  const smaK = Math.max(1, Math.floor(opts.sma ?? 3));
  const raw: (number | null)[] = [];

  for (let i = 0; i < history.length; i++) {
    if (i === 0) {
      raw.push(null);
      continue;
    }
    const prev = history[i - 1];
    const curr = history[i];
    const vPrev = win === "interval" ? prev.interval : prev.weekly;
    const vCurr = win === "interval" ? curr.interval : curr.weekly;
    const dt = curr.t - prev.t;

    // Gap troppo lungo → null (misura inaffidabile)
    if (dt <= 0 || dt > gapMs) {
      raw.push(null);
      continue;
    }
    // Risalita: reset o rumore → null (non è consumo)
    if (vCurr > vPrev || (vCurr - vPrev >= RESET_JUMP && vCurr >= RESET_TARGET)) {
      raw.push(null);
      continue;
    }
    const hours = dt / 3_600_000;
    raw.push(hours > 0 ? (vPrev - vCurr) / hours : null);
  }

  // SMA sui valori validi consecutivi (finestra smaK, arrotondata al centesimo)
  const series: (number | null)[] = new Array(raw.length).fill(null);
  let buffer: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (v === null) {
      buffer = [];
      continue;
    }
    buffer.push(v);
    if (buffer.length > smaK) buffer.shift();
    const media = buffer.reduce((a, b) => a + b, 0) / buffer.length;
    series[i] = Math.round(media * 100) / 100;
  }

  const validi = series.filter((v): v is number => v !== null);
  const max = validi.length > 0 ? Math.max(...validi) : 0;
  const media = validi.length > 0 ? validi.reduce((a, b) => a + b, 0) / validi.length : 0;
  return { series, max, media, validi: validi.length };
}
