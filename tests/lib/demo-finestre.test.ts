/**
 * I125 — Test di fedeltà della modalità DEMO alle finestre verificate
 * dell'API MiniMax (verdetto V8, docs/02 §5/§10):
 * - finestra breve del general = BLOCCO FISSO corrente a orario UTC
 *   {00,05,10,15,20} (4h reali nell'ultimo blocco del giorno) — non più
 *   «iniziata 3,2h fa» (rolling, non fedele al server osservato);
 * - finestra settimanale = settimana corrente da LUNEDÌ 00:00 UTC
 *   (livello di piano, condivisa tra i modelli);
 * - invariante remains_time ≡ end − now (docs/02 §4) su entrambe le finestre;
 * - percentuali sempre in [0,100] (l'API non sfora mai: nemmeno il jitter deve farlo);
 * - al confine di blocco il residuo torna verso il 100% (reset osservato
 *   sull'API reale: 17% alle 16:59 → 96% alle 17:04 Roma del 19/10).
 *
 * Gli istanti di test sono deterministicamente scelti in punti significativi
 * della settimana reale del 19–20/10/2026 (lunedì → martedì).
 */
import { describe, test, expect } from "bun:test";
import { makeDemoSnapshot, makeDemoHistory, makeDemoModelHistory } from "@/lib/demo";
import { fineFinestra5h, inizioFinestra5h, inizioSettimanaUtc, SETTIMANA_MS } from "@/lib/cycles";

/** Martedì 20/10/2026 13:17:58,714 UTC — dentro il blocco 10:00 (pieno, 5h). */
const T_MARTEDI = Date.UTC(2026, 9, 20, 13, 17, 58, 714);
/** Lunedì 19/10/2026 01:30 UTC — primo blocco del giorno, 1,5h dopo il reset settimanale. */
const T_LUNEDI_MATTINO = Date.UTC(2026, 9, 19, 1, 30, 0, 0);
/** Lunedì 19/10/2026 21:15 UTC — dentro l'ULTIMO blocco (20:00→mezzanotta, 4h reali). */
const T_LUNEDI_SERA = Date.UTC(2026, 9, 19, 21, 15, 0, 0);

const generalDi = (t: number) => {
  const snap = makeDemoSnapshot("eu", t);
  const g = snap.models.find((m) => m.modelName === "general");
  if (!g) throw new Error("il demo snapshot deve contenere il modello general");
  return g;
};

describe("I125 — finestre demo ancorate alle finestre ufficiali", () => {
  test("la finestra breve è il blocco fisso corrente, non una finestra rolling", () => {
    const g = generalDi(T_MARTEDI);
    expect(g.interval?.start).toBe(inizioFinestra5h(T_MARTEDI));
    expect(g.interval?.end).toBe(fineFinestra5h(T_MARTEDI));
    expect(g.interval?.start).toBe(Date.UTC(2026, 9, 20, 10, 0, 0));
    // blocco pieno: 5h nominali
    expect(g.interval!.end! - g.interval!.start!).toBe(5 * 3_600_000);
  });

  test("nell'ultimo blocco del giorno (20:00→mezzanotta) la finestra dura 4h reali", () => {
    const g = generalDi(T_LUNEDI_SERA);
    expect(g.interval?.start).toBe(Date.UTC(2026, 9, 19, 20, 0, 0));
    expect(g.interval?.end).toBe(Date.UTC(2026, 9, 20, 0, 0, 0));
    expect(g.interval!.end! - g.interval!.start!).toBe(4 * 3_600_000);
  });

  test("la finestra settimanale è la settimana corrente da lunedì 00:00 UTC", () => {
    const g = generalDi(T_MARTEDI);
    expect(g.weekly?.start).toBe(inizioSettimanaUtc(T_MARTEDI));
    const d = new Date(g.weekly!.start!);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(9);
    expect(d.getUTCDate()).toBe(19);
    expect(d.getUTCDay()).toBe(1); // lunedì
    expect(d.getUTCHours()).toBe(0);
    expect(g.weekly!.end! - g.weekly!.start!).toBe(SETTIMANA_MS);
  });

  test("la finestra settimanale è condivisa tra i modelli (livello di piano)", () => {
    const snap = makeDemoSnapshot("eu", T_MARTEDI);
    const g = snap.models.find((m) => m.modelName === "general")!;
    const v = snap.models.find((m) => m.modelName === "video")!;
    expect(v.weekly?.start).toBe(g.weekly?.start);
    expect(v.weekly?.end).toBe(g.weekly?.end);
    expect(v.weekly?.remainsTimeMs).toBe(g.weekly?.remainsTimeMs);
  });

  test("subito dopo il reset settimanale il residuo simulato è verso il 100%", () => {
    const g = generalDi(T_LUNEDI_MATTINO);
    // 1,5h su 168 con curva eased: residuo ≈ 99,98, jitter ≤ 0,8 → sempre > 98
    expect(g.weekly?.remainingPercent).toBeGreaterThan(98);
  });

  test("invariante remains_time ≡ end − now su entrambe le finestre e i due modelli", () => {
    for (const t of [T_LUNEDI_MATTINO, T_MARTEDI, T_LUNEDI_SERA]) {
      const snap = makeDemoSnapshot("eu", t);
      for (const m of snap.models) {
        for (const w of [m.interval, m.weekly]) {
          expect(w?.remainsTimeMs).toBe(w!.end! - t);
        }
      }
    }
  });

  test("le percentuali demo restano sempre in [0,100] (il jitter non sfora)", () => {
    for (const t of [T_LUNEDI_MATTINO, T_MARTEDI, T_LUNEDI_SERA]) {
      const snap = makeDemoSnapshot("eu", t);
      for (const m of snap.models) {
        for (const w of [m.interval, m.weekly]) {
          expect(w?.remainingPercent).toBeGreaterThanOrEqual(0);
          expect(w?.remainingPercent).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  test("al confine di blocco il residuo torna verso il 100% (reset osservato sull'API reale)", () => {
    const step = 15 * 60_000;
    const prima = Date.UTC(2026, 9, 19, 19, 45, 0, 0); // blocco 15:00→20:00 (quasi pieno)
    const dopo = Date.UTC(2026, 9, 19, 20, 5, 0, 0); // blocco 20:00→mezzanotta (5 min dopo il reset)
    expect(inizioFinestra5h(prima)).not.toBe(inizioFinestra5h(dopo));
    const gPrima = generalDi(prima);
    const gDopo = generalDi(dopo);
    // dopo il confine: 5 min su 4h → residuo prossimo al 100 (jitter ≤ 1,2)
    expect(gDopo.interval?.remainingPercent).toBeGreaterThan(98);
    // prima del confine: finale di blocco → curva al floor (≈ 12, jitter ≤ 1,2)
    const residuoPrima = gPrima.interval?.remainingPercent ?? -1;
    expect(residuoPrima).toBeLessThan(14);
    expect(residuoPrima).toBeLessThan(gDopo.interval!.remainingPercent!);
  });

  test("lo storico demo è marcato «demo» e le percentuali in [0,100]", () => {
    const punti = makeDemoHistory(8, 15 * 60_000);
    expect(punti.length).toBe(9); // samples + 1 (i = samples..0)
    for (const p of punti) {
      expect(p.source).toBe("demo");
      expect(p.interval).toBeGreaterThanOrEqual(0);
      expect(p.interval).toBeLessThanOrEqual(100);
      expect(p.weekly).toBeGreaterThanOrEqual(0);
      expect(p.weekly).toBeLessThanOrEqual(100);
    }
  });

  test("il backfill per-modello è marcato «demo» e coerente con i modelli simulati", () => {
    const mod = makeDemoModelHistory(3, 10 * 60_000);
    expect(mod.length).toBeGreaterThan(0);
    for (const p of mod) {
      expect(p.source).toBe("demo");
      expect(["general", "video"]).toContain(p.model);
      if (p.interval !== null) {
        expect(p.interval).toBeGreaterThanOrEqual(0);
        expect(p.interval).toBeLessThanOrEqual(100);
      }
      if (p.weekly !== null) {
        expect(p.weekly).toBeGreaterThanOrEqual(0);
        expect(p.weekly).toBeLessThanOrEqual(100);
      }
    }
  });
});
