/**
 * I99 — Contratto di lib/stats.ts (funzioni statistiche condivise I91).
 * La mediana era triplicata (sampling/rate-anomalies/cycles): la definizione
 * unica qui è la fonte per le analisi — parità, clamp e casi limite.
 */
import { describe, test, expect } from "bun:test";
import { medianaDi } from "../../src/lib/stats";

describe("I99 — lib/stats: medianaDi", () => {
  test("numero dispari di valori → il centrale", () => {
    expect(medianaDi([5, 1, 3])).toBe(3);
  });

  test("numero pari di valori → media dei due centrali", () => {
    expect(medianaDi([4, 1, 3, 2])).toBe(2.5);
  });

  test("array vuoto → 0 (convenzione documentate, mai NaN)", () => {
    expect(medianaDi([])).toBe(0);
  });

  test("non modifica l'array di input (copia interna)", () => {
    const valori = [3, 1, 2];
    medianaDi(valori);
    expect(valori).toEqual([3, 1, 2]);
  });
});
