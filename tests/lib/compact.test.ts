/**
 * Batch 1 client-only — Test di `lib/compact.ts` (I73): parsing robusto del
 * querystring `?compact=1`.
 */
import { describe, test, expect } from "bun:test";
import { readCompactMode } from "@/lib/compact";

describe("compact: readCompactMode", () => {
  test("valori che ATTIVANO la modalità compatta", () => {
    expect(readCompactMode("?compact=1")).toBe(true);
    expect(readCompactMode("?compact")).toBe(true);
    expect(readCompactMode("?compact=true")).toBe(true);
    expect(readCompactMode("?compact=TRUE")).toBe(true);
    expect(readCompactMode("?foo=bar&compact=1")).toBe(true);
  });

  test("valori che NON attivano la modalità", () => {
    expect(readCompactMode("?compact=0")).toBe(false);
    expect(readCompactMode("?compact=false")).toBe(false);
    expect(readCompactMode("?compact=off")).toBe(false);
    expect(readCompactMode("?foo=1")).toBe(false);
    expect(readCompactMode("")).toBe(false);
    expect(readCompactMode(null)).toBe(false);
    expect(readCompactMode(undefined)).toBe(false);
  });

  test("accetta la stringa anche senza il «?» iniziale", () => {
    expect(readCompactMode("compact=1")).toBe(true);
    expect(readCompactMode("compact=0&x=2")).toBe(false);
  });
});
