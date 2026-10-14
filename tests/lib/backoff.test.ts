/**
 * I51 — Test deterministici del modulo backoff (generatore random iniettabile).
 */
import { describe, test, expect } from "bun:test";
import {
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  BACKOFF_FLOOR_MS,
  backoffDelayMs,
  nextBackoffMs,
  parseRetryAfterMs,
  delayAfterFailure,
  ritardoPolling,
  tickAllaVisibilita,
  FATTORE_TAB_NASCOSTA,
} from "@/lib/backoff";

const fisso = (v: number) => () => v;

describe("backoff: backoffDelayMs (ritardo teorico)", () => {
  test("attempt 0 → base", () => {
    expect(backoffDelayMs(0)).toBe(BACKOFF_BASE_MS);
  });

  test("raddoppia a ogni errore (×2)", () => {
    expect(backoffDelayMs(1)).toBe(BACKOFF_BASE_MS * 2);
    expect(backoffDelayMs(2)).toBe(BACKOFF_BASE_MS * 4);
    expect(backoffDelayMs(3)).toBe(BACKOFF_BASE_MS * 8);
  });

  test("cap 10 minuti mai superato", () => {
    expect(backoffDelayMs(20)).toBe(BACKOFF_CAP_MS);
    expect(backoffDelayMs(200)).toBe(BACKOFF_CAP_MS);
  });

  test("floor 1s con base molto bassa", () => {
    expect(backoffDelayMs(0, { baseMs: 100 })).toBe(BACKOFF_FLOOR_MS);
  });

  test("attempt negativo o non finito trattato come 0", () => {
    expect(backoffDelayMs(-5)).toBe(BACKOFF_BASE_MS);
    expect(backoffDelayMs(Number.NaN)).toBe(BACKOFF_BASE_MS);
  });
});

describe("backoff: nextBackoffMs (jitter ±25%)", () => {
  test("random = 0.5 → ritardo esatto senza deviazione", () => {
    expect(nextBackoffMs(1, { random: fisso(0.5) })).toBe(BACKOFF_BASE_MS * 2);
  });

  test("random = 0 → −25% (estremo inferiore)", () => {
    expect(nextBackoffMs(1, { random: fisso(0) })).toBe(Math.round(BACKOFF_BASE_MS * 2 * 0.75));
  });

  test("random = 1 → +25% (estremo superiore)", () => {
    expect(nextBackoffMs(1, { random: fisso(1) })).toBe(Math.round(BACKOFF_BASE_MS * 2 * 1.25));
  });

  test("il cap vale anche dopo il jitter", () => {
    expect(nextBackoffMs(50, { random: fisso(1) })).toBe(BACKOFF_CAP_MS);
  });

  test("il floor 1s vale anche dopo il jitter", () => {
    expect(nextBackoffMs(0, { baseMs: 100, random: fisso(0) })).toBe(BACKOFF_FLOOR_MS);
  });
});

describe("backoff: parseRetryAfterMs", () => {
  const ora = Date.UTC(2026, 9, 11, 12, 0, 0); // 11/10/2026 12:00 UTC

  test("null/undefined/vuoto → null", () => {
    expect(parseRetryAfterMs(null, ora)).toBeNull();
    expect(parseRetryAfterMs(undefined, ora)).toBeNull();
    expect(parseRetryAfterMs("", ora)).toBeNull();
  });

  test("secondi → millisecondi", () => {
    expect(parseRetryAfterMs("30", ora)).toBe(30_000);
    expect(parseRetryAfterMs(" 5 ", ora)).toBe(5_000);
  });

  test('"0" → 0 (non null)', () => {
    expect(parseRetryAfterMs("0", ora)).toBe(0);
  });

  test("HTTP-date futura → differenza da now", () => {
    const futuro = new Date(ora + 60_000).toUTCString();
    expect(parseRetryAfterMs(futuro, ora)).toBe(60_000);
  });

  test("HTTP-date passata → 0 (mai negativo)", () => {
    const passato = new Date(ora - 120_000).toUTCString();
    expect(parseRetryAfterMs(passato, ora)).toBe(0);
  });

  test("valore malformato → null", () => {
    expect(parseRetryAfterMs("subito", ora)).toBeNull();
  });
});

describe("backoff: delayAfterFailure (Retry-After come floor del client)", () => {
  test("senza Retry-After → backoff con jitter", () => {
    expect(delayAfterFailure(1, null, { random: fisso(0.5) })).toBe(BACKOFF_BASE_MS * 2);
  });

  test("Retry-After 0 o invalido ignorato", () => {
    expect(delayAfterFailure(1, 0, { random: fisso(0.5) })).toBe(BACKOFF_BASE_MS * 2);
    expect(delayAfterFailure(1, -3, { random: fisso(0.5) })).toBe(BACKOFF_BASE_MS * 2);
  });

  test("Retry-After > backoff → vince il Retry-After", () => {
    expect(delayAfterFailure(1, 30_000, { random: fisso(0.5) })).toBe(30_000);
  });

  test("Retry-After < backoff → vince il backoff", () => {
    expect(delayAfterFailure(4, 3_000, { random: fisso(0.5) })).toBe(BACKOFF_BASE_MS * 16);
  });
});

/* ------------------------------------------------------------------ */
/* I100 — poller consapevole di rete e visibilità                      */
/* ------------------------------------------------------------------ */

describe("backoff I100: ritardoPolling (dilatazione a tab nascosta)", () => {
  test("in visibilità il ritardo è invariato", () => {
    expect(ritardoPolling(10_000, false)).toBe(10_000);
    expect(ritardoPolling(60_000, false)).toBe(60_000);
  });

  test("a tab nascosta il polling si DILATA ×4 (non si sospende: mai 0/Infinity)", () => {
    expect(ritardoPolling(10_000, true)).toBe(40_000);
    expect(ritardoPolling(60_000, true)).toBe(240_000);
    expect(FATTORE_TAB_NASCOSTA).toBe(4);
  });
});

describe("backoff I100: tickAllaVisibilita (tick solo se dati stantii)", () => {
  const BASE = 30_000; // intervallo base 30 s → metà = 15 s

  test("mai rilevato (null) → tick", () => {
    expect(tickAllaVisibilita(null, 1_000_000, BASE)).toBe(true);
  });

  test("ultimo rilevamento più vecchio di metà intervallo → tick", () => {
    expect(tickAllaVisibilita(1_000_000 - 15_001, 1_000_000, BASE)).toBe(true);
    expect(tickAllaVisibilita(1_000_000 - 60_000, 1_000_000, BASE)).toBe(true);
  });

  test("rilevamento recente (entro metà intervallo) → NO tick (niente rumore al flap)", () => {
    expect(tickAllaVisibilita(1_000_000 - 15_000, 1_000_000, BASE)).toBe(false);
    expect(tickAllaVisibilita(1_000_000 - 1_000, 1_000_000, BASE)).toBe(false);
  });
});
