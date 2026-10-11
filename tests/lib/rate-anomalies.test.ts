/**
 * Batch 2 analisi (I70) — Test di `lib/rate-anomalies.ts`: z-score robusto
 * (mediana + MAD) sui ritmi grezzi di rateSeries.
 *
 * I dati di test sono costruiti a ritmi NOTI: con passi di 15 minuti il ritmo
 * è (drop %) × 4 (es. drop 5 in 15 min → 20 %/h).
 */
import { describe, test, expect } from "bun:test";
import { detectRateAnomalies } from "@/lib/rate-anomalies";

const M = 60_000;

const mk = (t: number, interval: number) => ({ t, interval, weekly: 90 });

/** Costruisce la serie a ritmi noti: ogni ritmo è il drop (in punti) × 4. */
function serieARitmi(ritmi: number[], partenza = 90): { t: number; interval: number; weekly: number }[] {
  const out = [mk(0, partenza)];
  let v = partenza;
  ritmi.forEach((r, i) => {
    v -= r / 4; // drop % per un passo di 15 minuti
    out.push(mk((i + 1) * 15 * M, v));
  });
  return out;
}

describe("I70: detectRateAnomalies", () => {
  test("rileva lo scoppio di consumo fuori regime", () => {
    // 11 ritmi: [20,18,22,19,21,17,23,20,18,60,20] → mediana 20, MAD 2,
    // z(60) = 0.6745·40/2 ≈ 13.5 → unica anomalia
    const r = detectRateAnomalies(serieARitmi([20, 18, 22, 19, 21, 17, 23, 20, 18, 60, 20]), "interval");
    expect(r.validi).toBe(11);
    expect(r.mediana).toBeCloseTo(20, 2);
    expect(r.mad).toBeCloseTo(2, 2);
    expect(r.anomalie).toHaveLength(1);
    expect(r.anomalie[0].i).toBe(10);
    expect(r.anomalie[0].t).toBe(10 * 15 * M);
    expect(r.anomalie[0].valore).toBeCloseTo(60, 2);
    expect(r.anomalie[0].z).toBeGreaterThan(3.5);
  });

  test("serie regolare (ritmi alternati) → nessuna anomalia", () => {
    const r = detectRateAnomalies(serieARitmi([20, 21.6, 20, 21.6, 20, 21.6, 20, 21.6, 20, 21.6, 20, 21.6]), "interval");
    expect(r.anomalie).toHaveLength(0);
  });

  test("pausa anomala → z negativo (fallback MAD = 0 con media degli scarti)", () => {
    // 10 ritmi a 20 e uno a 0.5: mediana 20, MAD 0 → scala = media scarti,
    // z(0.5) = 0.6745·(0.5−20)/1.77 ≈ −7.4 → anomalia con z < 0
    const r = detectRateAnomalies(serieARitmi([20, 20, 20, 20, 20, 0.5, 20, 20, 20, 20, 20]), "interval");
    expect(r.mad).toBe(0);
    expect(r.scala).toBeGreaterThan(0);
    expect(r.anomalie).toHaveLength(1);
    expect(r.anomalie[0].z).toBeLessThan(0);
    expect(r.anomalie[0].valore).toBeCloseTo(0.5, 2);
  });

  test("tutti i ritmi identici (MAD = 0 e media scarti = 0) → nessuna anomalia", () => {
    const r = detectRateAnomalies(serieARitmi([20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20]), "interval");
    expect(r.mediana).toBeCloseTo(20, 2);
    expect(r.mad).toBe(0);
    expect(r.scala).toBe(0);
    expect(r.anomalie).toHaveLength(0);
  });

  test("sotto minValidi le statistiche non sono riportate", () => {
    // 6 ritmi validi con uno scoppio enorme: sotto 8 campioni → niente
    const r = detectRateAnomalies(serieARitmi([20, 20, 60, 20, 20, 20]), "interval");
    expect(r.validi).toBe(6);
    expect(r.anomalie).toHaveLength(0);
    expect(r.mediana).toBe(0);
  });

  test("soglia personalizzata: threshold 2 segnala anche la pausa moderata", () => {
    // z(14) = 0.6745·6/2 ≈ 2.02 > 2, z(60) ≈ 13.5 → 2 anomalie (una negativa, una positiva)
    const r = detectRateAnomalies(serieARitmi([20, 18, 22, 19, 21, 17, 23, 20, 14, 60, 20]), "interval", {
      threshold: 2,
    });
    expect(r.anomalie).toHaveLength(2);
    expect(r.soglia).toBe(2);
    expect(r.anomalie[0].z).toBeLessThan(0); // la pausa (14 %/h)
    expect(r.anomalie[1].z).toBeGreaterThan(3.5); // lo scoppio (60 %/h)
  });

  test("anomalie in ordine cronologico", () => {
    const r = detectRateAnomalies(serieARitmi([20, 18, 22, 19, 21, 17, 23, 20, 14, 60, 20]), "interval", {
      threshold: 2,
    });
    const ts = r.anomalie.map((a) => a.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
  });

  test("funziona anche sulla finestra weekly", () => {
    const history = serieARitmi([20, 18, 22, 19, 21, 17, 23, 20, 18, 60, 20]).map((p) => ({
      t: p.t,
      interval: 90, // costante: nessun ritmo su interval
      weekly: p.interval,
    }));
    const r = detectRateAnomalies(history, "weekly");
    expect(r.anomalie).toHaveLength(1);
    expect(r.anomalie[0].valore).toBeCloseTo(60, 2);
  });

  test("serie vuota o di un solo punto → nessuna statistica", () => {
    const vuoto = detectRateAnomalies([], "interval");
    expect(vuoto.validi).toBe(0);
    expect(vuoto.anomalie).toHaveLength(0);
    const uno = detectRateAnomalies([mk(0, 90)], "interval");
    expect(uno.validi).toBe(0);
    expect(uno.anomalie).toHaveLength(0);
  });

  test("i ritmi usati sono GREZZI: lo scoppio non viene smorzato dalla SMA", () => {
    // Con sma di default il 60 sarebbe media con i vicini (≈33): con sma:1 no
    const r = detectRateAnomalies(serieARitmi([20, 20, 20, 20, 20, 20, 20, 20, 20, 60, 20]), "interval");
    expect(r.anomalie).toHaveLength(1);
    expect(r.anomalie[0].valore).toBeCloseTo(60, 2);
  });
});
