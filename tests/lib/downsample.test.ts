/**
 * Batch 3 infrastruttura (I68) — Test di `lib/downsample.ts`: bucket orari
 * derivati (min/max/somma/ultimo per ora UTC e sorgente) e conversione per
 * la UI/export.
 */
import { describe, test, expect } from "bun:test";
import { emptyHourBucket, hourStartOf, mergeHourBucket, serverHourlyToHistory } from "@/lib/downsample";

const H = 3_600_000;

describe("I68: hourStartOf", () => {
  test("allinea all'ora UTC (floor)", () => {
    expect(hourStartOf(Date.UTC(2026, 9, 11, 13, 7, 59))).toBe(Date.UTC(2026, 9, 11, 13, 0, 0));
    expect(hourStartOf(Date.UTC(2026, 9, 11, 13, 0, 0))).toBe(Date.UTC(2026, 9, 11, 13, 0, 0));
    expect(hourStartOf(Date.UTC(2026, 9, 11, 0, 0, 1))).toBe(Date.UTC(2026, 9, 11, 0, 0, 0));
  });

  test("il confine di giorno UTC cade su bucket pieni", () => {
    expect(hourStartOf(Date.UTC(2026, 9, 12, 0, 0, 0) - 1)).toBe(Date.UTC(2026, 9, 11, 23, 0, 0));
  });
});

describe("I68: mergeHourBucket", () => {
  const HS = Date.UTC(2026, 9, 11, 13, 0, 0);

  test("primo punto: crea min/max/somma/ultimo e count", () => {
    let b = emptyHourBucket(HS, "api");
    b = mergeHourBucket(b, { t: HS + 5 * 60_000, interval: 40, weekly: 70 });
    b = mergeHourBucket(b, { t: HS + 15 * 60_000, interval: 30, weekly: 68 });
    expect(b.count).toBe(2);
    expect(b.interval.min).toBe(30);
    expect(b.interval.max).toBe(40);
    expect(b.interval.somma).toBeCloseTo(70, 6);
    expect(b.interval.ultimo).toBe(30); // il punto più recente
    expect(b.weekly.ultimo).toBe(68);
    expect(b.lastT).toBe(HS + 15 * 60_000);
    // media = somma/count
    expect(b.interval.somma / b.count).toBeCloseTo(35, 6);
  });

  test("punto fuori ordine: min/max crescono ma «ultimo» resta del punto più recente", () => {
    let b = emptyHourBucket(HS, "api");
    b = mergeHourBucket(b, { t: HS + 30 * 60_000, interval: 50, weekly: null });
    b = mergeHourBucket(b, { t: HS + 10 * 60_000, interval: 20, weekly: null }); // in ritardo
    expect(b.count).toBe(2);
    expect(b.interval.min).toBe(20);
    expect(b.interval.max).toBe(50);
    expect(b.interval.ultimo).toBe(50); // t maggiore, non l'ultimo arrivato
    expect(b.lastT).toBe(HS + 30 * 60_000);
  });

  test("valori null non contano per la finestra (ma il count sì se almeno una finestra osserva)", () => {
    let b = emptyHourBucket(HS, "api");
    b = mergeHourBucket(b, { t: HS + 1 * 60_000, interval: null, weekly: 80 });
    b = mergeHourBucket(b, { t: HS + 2 * 60_000, interval: 45, weekly: null });
    expect(b.count).toBe(2);
    expect(b.interval.min).toBe(45);
    expect(b.interval.somma).toBeCloseTo(45, 6);
    expect(b.weekly.min).toBe(80);
    expect(b.weekly.somma).toBeCloseTo(80, 6);
  });

  test("punto con entrambe le finestre null: nessun count, nessuna statistica", () => {
    let b = emptyHourBucket(HS, "api");
    b = mergeHourBucket(b, { t: HS + 1 * 60_000, interval: 50, weekly: 80 });
    b = mergeHourBucket(b, { t: HS + 2 * 60_000, interval: null, weekly: null });
    expect(b.count).toBe(1);
    expect(b.interval.somma).toBeCloseTo(50, 6);
    expect(b.weekly.somma).toBeCloseTo(80, 6);
  });

  test("sorgenti diverse → bucket separati (nessun mix api/demo)", () => {
    const api = mergeHourBucket(emptyHourBucket(HS, "api"), { t: HS, interval: 50, weekly: 80 });
    const demo = mergeHourBucket(emptyHourBucket(HS, "demo"), { t: HS, interval: 90, weekly: 95 });
    expect(api.interval.max).toBe(50);
    expect(demo.interval.max).toBe(90);
  });

  test("merge idempotente del medesimo punto (t = lastT): i valori non cambiano l'ultimo", () => {
    let b = emptyHourBucket(HS, "api");
    b = mergeHourBucket(b, { t: HS, interval: 50, weekly: 80 });
    b = mergeHourBucket(b, { t: HS, interval: 50, weekly: 80 });
    expect(b.count).toBe(2); // il punto viene contato di nuovo (il DB evita il doppio via unique t)
    expect(b.interval.ultimo).toBe(50);
  });
});

describe("I68: serverHourlyToHistory", () => {
  test("usa l'ultimo valore di ogni ora e scarta le ore non osservate", () => {
    const buckets = [
      { t: 1_000, interval: { min: 40, max: 50, somma: 90, ultimo: 40 }, weekly: { min: 70, max: 80, somma: 150, ultimo: 70 }, count: 2 },
      { t: 2_000, interval: { min: null, max: null, somma: 0, ultimo: null }, weekly: { min: null, max: null, somma: 0, ultimo: null }, count: 0 },
      { t: 3_000, interval: { min: 20, max: 25, somma: 45, ultimo: 25 }, weekly: { min: 60, max: 60, somma: 60, ultimo: 60 }, count: 2 },
    ];
    const punti = serverHourlyToHistory(buckets);
    expect(punti).toEqual([
      { t: 1_000, interval: 40, weekly: 70 },
      { t: 3_000, interval: 25, weekly: 60 },
    ]);
  });

  test("ore con una sola finestra osservata: l'altra vale 100 (stessa convenzione di I16)", () => {
    const buckets = [
      { t: 1_000, interval: { min: 40, max: 40, somma: 40, ultimo: 40 }, weekly: { min: null, max: null, somma: 0, ultimo: null }, count: 1 },
    ];
    expect(serverHourlyToHistory(buckets)).toEqual([{ t: 1_000, interval: 40, weekly: 100 }]);
  });

  test("serie vuota → punti vuoti", () => {
    expect(serverHourlyToHistory([])).toEqual([]);
  });
});
