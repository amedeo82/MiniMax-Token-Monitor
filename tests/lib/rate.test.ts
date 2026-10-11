/**
 * Fase 3 (batch 2) — Test di `lib/rate.ts`: serie del ritmo %/h con gap,
 * reset e SMA-3.
 */
import { describe, test, expect } from "bun:test";
import { rateSeries } from "@/lib/rate";

const H = 3_600_000;
const M = 60_000;

const mk = (t: number, interval: number) => ({ t, interval, weekly: 90 });

describe("rate: rateSeries", () => {
  test("ritmo istantaneo corretto su discese regolari", () => {
    // 90 → 80 in 15min = 40 %/h; 80 → 70 in 15min = 40 %/h
    const r = rateSeries([mk(0, 90), mk(15 * M, 80), mk(30 * M, 70)], "interval", { sma: 1 });
    expect(r.series[0]).toBeNull();
    expect(r.series[1]).toBeCloseTo(40, 2);
    expect(r.series[2]).toBeCloseTo(40, 2);
    expect(r.max).toBeCloseTo(40, 2);
    expect(r.media).toBeCloseTo(40, 2);
    expect(r.validi).toBe(2);
  });

  test("gap > 30 min → null (misura inaffidabile)", () => {
    const r = rateSeries([mk(0, 90), mk(31 * M, 80)], "interval", { sma: 1 });
    expect(r.series[1]).toBeNull();
    expect(r.validi).toBe(0);
  });

  test("gap esattamente 30 min è ancora valido", () => {
    const r = rateSeries([mk(0, 90), mk(30 * M, 85)], "interval", { sma: 1 });
    expect(r.series[1]).not.toBeNull();
    expect(r.series[1]).toBeCloseTo(10, 2);
  });

  test("risalita (reset o rumore) → null", () => {
    const r = rateSeries([mk(0, 70), mk(M, 95), mk(2 * M, 72)], "interval", { sma: 1 });
    expect(r.series[1]).toBeNull(); // reset
    expect(r.series[2]).not.toBeNull(); // discesa dopo il reset: valida
  });

  test("SMA-3 smorza i picchi sui valori consecutivi validi", () => {
    // ritmi grezzi: 24, 12, 24 (golp da 6/3/6 punti ogni 15 minuti)
    const serie = [mk(0, 90), mk(15 * M, 84), mk(30 * M, 81), mk(45 * M, 75)];
    const r = rateSeries(serie, "interval"); // sma default 3
    expect(r.series[1]).toBeCloseTo(24, 2); // media di [24]
    expect(r.series[2]).toBeCloseTo(18, 2); // media di [24, 12]
    expect(r.series[3]).toBeCloseTo(20, 2); // media di [24, 12, 24]
  });

  test("la SMA si interrompe sui null (buffer azzerato)", () => {
    const serie = [mk(0, 90), mk(15 * M, 84), mk(30 * M, 95), mk(45 * M, 83)];
    const r = rateSeries(serie, "interval");
    expect(r.series[2]).toBeNull(); // reset
    expect(r.series[3]).toBeCloseTo(48, 2); // buffer ripartito: (95−83)/0.25h = 48
  });

  test("serie vuota o di un solo punto → tutto null, zero validi", () => {
    expect(rateSeries([], "interval").validi).toBe(0);
    const r = rateSeries([mk(0, 90)], "interval");
    expect(r.series).toHaveLength(1);
    expect(r.series[0]).toBeNull();
    expect(r.max).toBe(0);
    expect(r.media).toBe(0);
  });

  test("funziona anche sulla finestra weekly", () => {
    const r = rateSeries([{ t: 0, interval: 50, weekly: 60 }, { t: 15 * M, interval: 50, weekly: 50 }], "weekly", { sma: 1 });
    expect(r.series[1]).toBeCloseTo(40, 2);
  });
});
