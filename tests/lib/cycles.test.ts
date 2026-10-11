/**
 * I50 — Test della libreria core `cycles.ts`: segmentazione in cicli
 * (RESET_JUMP/RESET_TARGET), consumo per giorno della settimana, heatmap
 * giorno × ora e media mobile.
 */
import { describe, test, expect } from "bun:test";
import {
  RESET_JUMP,
  RESET_TARGET,
  detectCycles,
  heatmapConsumption,
  movingAverage,
  summarizeCycles,
  weekdayConsumption,
  type Cycle,
} from "@/lib/cycles";
import type { HistoryPoint } from "@/components/history-chart";

/** Punto di storico sintetico (epoch UTC → fuso Roma è UTC+2 in estate). */
const mk = (t: number, interval: number, weekly = 90): HistoryPoint => ({ t, interval, weekly });

// Estate 2026 (Europe/Rome = UTC+2): 15/06/2026 è LUNEDÌ
const LUN = Date.UTC(2026, 5, 15, 12, 0, 0); // Roma 14:00 di lunedì
const H = 3_600_000;

describe("cycles: detectCycles", () => {
  test("storico vuoto → nessun ciclo", () => {
    expect(detectCycles([], "interval")).toEqual([]);
  });

  test("serie senza reset → un unico ciclo in corso", () => {
    const c = detectCycles([mk(LUN, 90), mk(LUN + H, 80), mk(LUN + 2 * H, 75)], "interval");
    expect(c).toHaveLength(1);
    expect(c[0].ongoing).toBe(true);
    expect(c[0].index).toBe(1);
    expect(c[0].consumed).toBe(15); // 90 − min 75 (drawdown)
    expect(c[0].points).toBe(3);
  });

  test("salto ≥ RESET_JUMP verso ≥ RESET_TARGET chiude il ciclo", () => {
    const serie = [mk(LUN, 90), mk(LUN + H, 80), mk(LUN + 2 * H, 95), mk(LUN + 3 * H, 70)];
    const c = detectCycles(serie, "interval");
    expect(c).toHaveLength(2);
    expect(c[0].ongoing).toBe(false);
    expect(c[0].startValue).toBe(90);
    expect(c[0].minValue).toBe(80);
    expect(c[0].consumed).toBe(10);
    expect(c[0].durationMs).toBe(H);
    expect(c[0].ratePerHour).toBeCloseTo(10, 6);
    expect(c[1].ongoing).toBe(true);
    expect(c[1].startValue).toBe(95);
    expect(c[1].consumed).toBe(25);
    expect(c[1].index).toBe(2);
  });

  test("salto grande ma sotto RESET_TARGET NON è un reset (sorgenti miste)", () => {
    // 57 (api reale) → 77 (demo): +20 ≥ 15 ma 77 < 85 → nessun reset
    const c = detectCycles([mk(LUN, 57), mk(LUN + H, 77)], "interval");
    expect(c).toHaveLength(1);
    expect(c[0].ongoing).toBe(true);
  });

  test("le soglie esportate valgono 15 e 85", () => {
    expect(RESET_JUMP).toBe(15);
    expect(RESET_TARGET).toBe(85);
  });

  test("consumo mai negativo (recuperi sotto soglia reset)", () => {
    const c = detectCycles([mk(LUN, 80), mk(LUN + H, 84)], "interval");
    expect(c[0].consumed).toBe(0);
  });
});

describe("cycles: summarizeCycles", () => {
  test("medie solo sui cicli completati + minEver/maxDuration", () => {
    const serie = [mk(LUN, 90), mk(LUN + H, 80), mk(LUN + 2 * H, 95), mk(LUN + 3 * H, 70)];
    const s = summarizeCycles(detectCycles(serie, "interval"));
    expect(s.total).toBe(2);
    expect(s.completed).toBe(1);
    expect(s.ongoing?.index).toBe(2);
    expect(s.avgDurationMs).toBe(H);
    expect(s.avgConsumed).toBe(10);
    expect(s.avgRatePerHour).toBeCloseTo(10, 6);
    expect(s.minEver).toBe(70);
    expect(s.maxDurationMs).toBe(H);
  });

  test("lista vuota → tutto null", () => {
    const s = summarizeCycles([]);
    expect(s.total).toBe(0);
    expect(s.ongoing).toBeNull();
    expect(s.avgDurationMs).toBeNull();
    expect(s.minEver).toBeNull();
  });

  test("ciclo con consumo 0 non contribuisce al ritmo medio", () => {
    const cicli: Cycle[] = [
      { index: 1, startT: 0, endT: H, startValue: 90, endValue: 90, minValue: 88, consumed: 0, durationMs: H, ratePerHour: null, points: 2, ongoing: false },
      { index: 2, startT: H, endT: 2 * H, startValue: 95, endValue: 75, minValue: 75, consumed: 20, durationMs: H, ratePerHour: 20, points: 2, ongoing: false },
    ];
    const s = summarizeCycles(cicli);
    expect(s.avgRatePerHour).toBe(20);
    expect(s.avgConsumed).toBe(10);
  });
});

describe("cycles: weekdayConsumption", () => {
  test("attribuisce il drawdown al giorno (Roma) del punto medio", () => {
    // lun 14:00 Roma → lun 16:00 Roma (−10) → mar 16:00 Roma (−10) → rumore +2 → reset +24 → mer −6
    const serie = [
      mk(LUN, 90),
      mk(LUN + 2 * H, 80), // midpoint lun 15:00 Roma
      mk(Date.UTC(2026, 5, 16, 14, 0, 0), 70), // midpoint mar
      mk(Date.UTC(2026, 5, 16, 16, 0, 0), 72), // recupero (rumore): nessun consumo
      mk(Date.UTC(2026, 5, 16, 18, 0, 0), 96), // reset: nessun consumo
      mk(Date.UTC(2026, 5, 17, 12, 0, 0), 90), // midpoint mer
    ];
    const stats = weekdayConsumption(serie, "interval");
    const lun = stats.find((s) => s.label === "lun")!;
    const mar = stats.find((s) => s.label === "mar")!;
    const mer = stats.find((s) => s.label === "mer")!;
    expect(lun.consumed).toBeCloseTo(10, 6);
    expect(mar.consumed).toBeCloseTo(10, 6);
    expect(mer.consumed).toBeCloseTo(6, 6);
    expect(lun.days).toBe(1);
    expect(lun.avgPerDay).toBeCloseTo(10, 6);
  });

  test("storico troppo corto → statistiche a zero", () => {
    const stats = weekdayConsumption([mk(LUN, 90)], "interval");
    expect(stats).toHaveLength(7);
    expect(stats.every((s) => s.consumed === 0 && s.days === 0)).toBe(true);
  });
});

describe("cycles: heatmapConsumption", () => {
  test("attribuzione cella (giorno, ora) del punto medio + contatori", () => {
    const serie = [
      mk(LUN, 90), // Roma lun 14:00
      mk(LUN + 2 * H, 80), // midpoint Roma lun 15:00 → cells[0][15] += 10
      mk(LUN + 4 * H, 75), // midpoint Roma lun 17:00 → cells[0][17] += 5
      mk(Date.UTC(2026, 5, 16, 8, 0, 0), 65), // midpoint Roma mar 02:00 → cells[1][2] += 10
      mk(Date.UTC(2026, 5, 16, 10, 0, 0), 95), // reset (+30, ≥85): nessun consumo
    ];
    const g = heatmapConsumption(serie, "interval");
    expect(g.cells[0][15]).toBeCloseTo(10, 6);
    expect(g.cells[0][17]).toBeCloseTo(5, 6);
    expect(g.cells[1][2]).toBeCloseTo(10, 6);
    expect(g.events[0][15]).toBe(1);
    expect(g.events[1][2]).toBe(1);
    expect(g.events[0][16]).toBe(0);
    expect(g.total).toBeCloseTo(25, 6);
    expect(g.max).toBeCloseTo(10, 6);
    expect(g.populated).toBe(3);
  });

  test("griglia vuota per storico insufficiente", () => {
    const g = heatmapConsumption([mk(LUN, 90)], "interval");
    expect(g.total).toBe(0);
    expect(g.max).toBe(0);
    expect(g.populated).toBe(0);
    expect(g.cells).toHaveLength(7);
    expect(g.cells[0]).toHaveLength(24);
  });
});

describe("cycles: movingAverage", () => {
  test("null finché la finestra non è piena, poi medie corrette", () => {
    const ma = movingAverage([1, 2, 3, 4], 2);
    expect(ma[0]).toBeNull();
    expect(ma[1]).toBeCloseTo(1.5, 9);
    expect(ma[2]).toBeCloseTo(2.5, 9);
    expect(ma[3]).toBeCloseTo(3.5, 9);
  });

  test("k < 2 assorbito a 2", () => {
    const ma = movingAverage([5, 7], 0);
    expect(ma[0]).toBeNull();
    expect(ma[1]).toBe(6);
  });

  test("lista vuota → lista vuota", () => {
    expect(movingAverage([], 5)).toEqual([]);
  });
});
