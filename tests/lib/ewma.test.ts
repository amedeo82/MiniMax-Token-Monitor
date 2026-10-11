/**
 * Batch 2 analisi (I72) — Test di `lib/ewma.ts`: proiezione esponenzialmente
 * pesata (confronto A/B con il verdetto lineare I23/I31).
 *
 * I dati di test sono costruiti a ritmi NOTI: con passi di 15 minuti il ritmo
 * è (drop %) × 4 (es. drop 5 in 15 min → 20 %/h).
 */
import { describe, test, expect } from "bun:test";
import { ewmaProjection } from "@/lib/ewma";

const M = 60_000;
const H = 3_600_000;

const mk = (t: number, interval: number) => ({ t, interval, weekly: 90 });

function serieARitmi(ritmi: number[], partenza = 90): { t: number; interval: number; weekly: number }[] {
  const out = [mk(0, partenza)];
  let v = partenza;
  ritmi.forEach((r, i) => {
    v -= r / 4; // drop % per un passo di 15 minuti
    out.push(mk((i + 1) * 15 * M, v));
  });
  return out;
}

describe("I72: ewmaProjection", () => {
  test("ritmo costante → EWMA uguale al ritmo ed esaurimento esatto", () => {
    const serie = serieARitmi([20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20]);
    const r = ewmaProjection(serie, "interval");
    expect(r.campioni).toBe(11);
    expect(r.ritmo).toBeCloseTo(20, 2);
    // vUltimo = 90 − 55/4·... = 35 → 35/20 = 1.75 h
    expect(r.esaurimentoMs).toBeCloseTo(1.75 * H, 0);
    expect(r.esaurimentoAt).toBeCloseTo(11 * 15 * M + 1.75 * H, 0);
    expect(r.halfLifeMs).toBe(2 * H); // default
  });

  test("reagisce prima del lineare quando il ritmo recente aumenta", () => {
    // 8 ritmi a 20 poi 2 a 40: la corda lineare dà (90−30)/2.5h = 24 %/h,
    // l'EWMA pesa di più l'ultimo tratto → ritmo > 24 e esaurimento anticipato
    const serie = serieARitmi([20, 20, 20, 20, 20, 20, 20, 20, 40, 40]);
    const r = ewmaProjection(serie, "interval");
    expect(r.campioni).toBe(10);
    expect(r.ritmo).not.toBeNull();
    expect(r.ritmo!).toBeGreaterThan(24);
    expect(r.ritmo!).toBeLessThan(40);
    // esaurimento anticipato rispetto al lineare: 30/ritmo < 30/24
    expect(r.esaurimentoMs!).toBeLessThan((30 / 24) * H);
  });

  test("mezza vita più corta → segue ancora di più l'ultimo tratto", () => {
    const serie = serieARitmi([20, 20, 20, 20, 20, 20, 20, 20, 40, 40]);
    const corta = ewmaProjection(serie, "interval", { halfLifeMs: 15 * M });
    const lunga = ewmaProjection(serie, "interval", { halfLifeMs: 6 * H });
    expect(corta.ritmo!).toBeGreaterThan(lunga.ritmo!);
    // e la mezza vita usata è riportata
    expect(corta.halfLifeMs).toBe(15 * M);
  });

  test("gap > 30 min scartato (stessa regola di lib/rate.ts)", () => {
    const ts = [0, 15 * M, 30 * M, 45 * M, 60 * M];
    const serie = [
      ...ts.map((t, i) => mk(t, 90 - i * 5)),
      mk(60 * M + 40 * M, 60), // 40 min dopo: gap → scartato
    ];
    const r = ewmaProjection(serie, "interval");
    expect(r.campioni).toBe(4);
  });

  test("risalita (reset o rumore) scartata: la discesa dopo il reset conta", () => {
    const serie = [mk(0, 90), mk(15 * M, 85), mk(30 * M, 95), mk(45 * M, 90)];
    const r = ewmaProjection(serie, "interval");
    expect(r.campioni).toBe(2); // 90→85 e 95→90
    expect(r.ritmo).toBeCloseTo(20, 2); // drop 5 in 15 min su entrambe le coppie
  });

  test("ritmo nullo o trascurabile → nessun esaurimento stimato", () => {
    // quota ferma: i ritmi validi esistono ma valgono 0 → proiezione vuota
    const serie = [mk(0, 90), mk(15 * M, 90), mk(30 * M, 90), mk(45 * M, 90)];
    const r = ewmaProjection(serie, "interval");
    expect(r.campioni).toBe(3);
    expect(r.ritmo).toBeNull();
    expect(r.esaurimentoAt).toBeNull();
    expect(r.esaurimentoMs).toBeNull();
  });

  test("meno di due punti → proiezione vuota", () => {
    const vuoto = ewmaProjection([], "interval");
    expect(vuoto.ritmo).toBeNull();
    expect(vuoto.campioni).toBe(0);
    const uno = ewmaProjection([mk(0, 90)], "interval");
    expect(uno.ritmo).toBeNull();
    expect(uno.campioni).toBe(0);
  });

  test("funziona anche sulla finestra weekly", () => {
    const history = serieARitmi([20, 20, 20, 20, 20, 20]).map((p) => ({
      t: p.t,
      interval: 90, // costante
      weekly: p.interval,
    }));
    const r = ewmaProjection(history, "weekly");
    expect(r.ritmo).toBeCloseTo(20, 2);
    expect(r.campioni).toBe(6);
  });

  test("l'ancoraggio è all'ultimo rilevamento (come computeTrend)", () => {
    // anche se l'ULTIMA coppia è un reset (risalita scartata), il residuo è
    // quello DOPO il reset: vUltimo = 96, ritmo = 20 → 96/20 = 4.8 h
    const serie = [mk(0, 90), mk(15 * M, 85), mk(30 * M, 96)];
    const r = ewmaProjection(serie, "interval");
    expect(r.campioni).toBe(1); // solo 85→96 scartata? no: 90→85 valida, 85→96 risalita
    expect(r.ritmo).toBeCloseTo(20, 2);
    expect(r.esaurimentoMs).toBeCloseTo(4.8 * H, 0);
  });
});
