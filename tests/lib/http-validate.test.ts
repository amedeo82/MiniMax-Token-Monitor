/**
 * I99 — Contratto di lib/http-validate.ts (validazione input condivisa I91).
 *
 * toEpoch e toFloat sono le porte d'ingresso di TUTTI i body delle API
 * archivio: le semantiche documentate (epoch ms vs secondi, clamp 0–100)
 * sono contratti che proteggono i dati — qui vengono fissate.
 */
import { describe, test, expect } from "bun:test";
import { toEpoch, toFloat } from "../../src/lib/http-validate";

describe("I99 — lib/http-validate: toEpoch", () => {
  test("epoch ms (> 1e12) passa invariato", () => {
    expect(toEpoch(1_760_000_000_000)).toBe(1_760_000_000_000);
    expect(toEpoch("1760000000000")).toBe(1_760_000_000_000);
  });

  test("epoch in secondi (1e9 < n < 1e12) → moltiplicato per 1000", () => {
    expect(toEpoch(1_760_000_000)).toBe(1_760_000_000_000);
    expect(toEpoch("1760000000")).toBe(1_760_000_000_000);
  });

  test("valori troppo piccoli / non numerici → null", () => {
    expect(toEpoch(1_000)).toBeNull();
    expect(toEpoch(999_999_999)).toBeNull();
    expect(toEpoch("abc")).toBeNull();
    expect(toEpoch(true)).toBeNull();
    expect(toEpoch(null)).toBeNull();
    expect(toEpoch(undefined)).toBeNull();
    expect(toEpoch(NaN)).toBeNull();
    expect(toEpoch(Infinity)).toBeNull();
  });
});

describe("I99 — lib/http-validate: toFloat (percentuali clampate 0–100)", () => {
  test("numero finito → clamp a [0, 100]", () => {
    expect(toFloat(50)).toBe(50);
    expect(toFloat(-5)).toBe(0);
    expect(toFloat(150)).toBe(100);
    expect(toFloat(99.9)).toBe(99.9);
  });

  test("stringa numerica → numero clampato; altrimenti null", () => {
    expect(toFloat("42")).toBe(42);
    expect(toFloat(" 7 ")).toBe(7);
    expect(toFloat("-1")).toBe(0);
    expect(toFloat("120")).toBe(100);
    expect(toFloat("")).toBeNull();
    expect(toFloat("x")).toBeNull();
    expect(toFloat(null)).toBeNull();
    expect(toFloat(undefined)).toBeNull();
    expect(toFloat({})).toBeNull();
  });
});
