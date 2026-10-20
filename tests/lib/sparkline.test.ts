/**
 * I131 — test della geometria della sparkline (src/lib/sparkline.ts).
 *
 * Valori chiusi calcolati a mano sul viewport di default (96×24, pad 2) e su
 * un viewport custom: la normalizzazione è min/max con y INVERTITA (valore
 * alto = y piccolo, origine SVG in alto a sinistra), la serie piatta sta a
 * metà altezza e sotto i 2 punti non c'è forma da disegnare.
 */
import { describe, test, expect } from "bun:test";
import { puntiSparkline } from "@/lib/sparkline";

describe("I131: geometria della sparkline (puntiSparkline)", () => {
  test("normalizzazione min/max con y invertita su [0, 50, 100] nel viewport di default", () => {
    // 96×24 pad 2 → usableW 92, usableH 20; x: 2, 48, 94.
    // y invertita: 0 → 22 (in basso), 50 → 12 (metà), 100 → 2 (in alto).
    const p = puntiSparkline([0, 50, 100]);
    expect(p).toHaveLength(3);
    expect(p.map((q) => q.x)).toEqual([2, 48, 94]);
    expect(p.map((q) => q.y)).toEqual([22, 12, 2]);
  });

  test("serie piatta (min === max): tutti i punti a metà altezza, media costante è una lettura legittima", () => {
    const p = puntiSparkline([5, 5, 5, 5]);
    expect(p).toHaveLength(4);
    expect(p.every((q) => q.y === 12)).toBe(true); // h/2 = 12
    // x resta distribuito: prima a sinistra, ultima a destra
    expect(p[0].x).toBe(2);
    expect(p[p.length - 1].x).toBe(94);
  });

  test("meno di 2 punti: nessuna forma (array vuoto) con 0 e 1 punto", () => {
    expect(puntiSparkline([])).toEqual([]);
    expect(puntiSparkline([42])).toEqual([]);
  });

  test("viewport custom (200×40, pad 5) su [70, 92, 48]: normalizzazione min/max, NON primo/ultimo", () => {
    // min 48, max 92, range 44; usableW 190, usableH 30.
    // x: 5, 100, 195 (monotona crescente).
    // y: 70 → 5+15=20 (il PRIMO punto non è né in alto né in basso:
    //     la scala è min/max — start−end darebbe 5/35/… e sarebbe sbagliato),
    //    92 → 5 (massimo in alto), 48 → 35 (minimo in basso).
    const p = puntiSparkline([70, 92, 48], 200, 40, 5);
    expect(p).toHaveLength(3);
    expect(p.map((q) => q.x)).toEqual([5, 100, 195]);
    expect(p.map((q) => q.y)).toEqual([20, 5, 35]);
  });
});
