/**
 * Fase 3 (batch 3) — Test di `lib/ring-color.ts` (colore continuo, soglie
 * come casi limite) e `lib/tab-identity.ts` (formatTabTitle, colore favicon).
 * Le funzioni canvas/SW non sono testabili senza DOM: qui si verifica la
 * logica pura (title e tinte).
 */
import { describe, test, expect } from "bun:test";
import { coloreContinuo } from "@/lib/ring-color";
import { faviconColor, formatTabTitle } from "@/lib/tab-identity";

describe("I65: coloreContinuo", () => {
  test("casi limite = soglie quotaLevel (0, 10, 30, 60, 100)", () => {
    expect(coloreContinuo(0)).toContain("hsl(0.0");
    expect(coloreContinuo(10)).toContain("hsl(8.0");
    expect(coloreContinuo(30)).toContain("hsl(35.0");
    expect(coloreContinuo(60)).toContain("hsl(100.0");
    expect(coloreContinuo(100)).toContain("hsl(142.0");
  });

  test("interpole lineari tra i fermi (20 = metà tra 10→30)", () => {
    expect(coloreContinuo(20)).toContain("hsl(21.5");
  });

  test("clamp fuori range e null → neutra", () => {
    expect(coloreContinuo(-5)).toBe(coloreContinuo(0));
    expect(coloreContinuo(150)).toBe(coloreContinuo(100));
    expect(coloreContinuo(null)).toContain("hsl(38");
    expect(coloreContinuo(Number.NaN)).toContain("hsl(38");
  });

  test("monotonia: più quota = tinta più verde (hue crescente)", () => {
    const h = (v: number) => Number(coloreContinuo(v).replace("hsl(", "").split(" ")[0]);
    expect(h(20)).toBeLessThan(h(40));
    expect(h(40)).toBeLessThan(h(70));
    expect(h(70)).toBeLessThan(h(95));
  });
});

describe("I67: formatTabTitle + faviconColor", () => {
  test("titolo con residuo arrotondato, demo e senza dati", () => {
    expect(formatTabTitle(84.5)).toBe("85% · MiniMax Token Monitor");
    expect(formatTabTitle(7.2)).toBe("7% · MiniMax Token Monitor");
    expect(formatTabTitle(null)).toBe("MiniMax Token Monitor");
    expect(formatTabTitle(undefined)).toBe("MiniMax Token Monitor");
    expect(formatTabTitle(50, { demo: true })).toBe("demo · MiniMax Token Monitor");
  });

  test("faviconColor = coloreContinuo (stessa semantica visiva)", () => {
    expect(faviconColor(84)).toBe(coloreContinuo(84));
    expect(faviconColor(null)).toBe(coloreContinuo(null));
  });
});
