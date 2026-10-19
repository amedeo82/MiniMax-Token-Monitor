/**
 * I124 — Test della segmentazione a FINESTRE UFFICIALI (lib/cycles.ts):
 * - blocchi fissi 5h UTC (verdetto V8, docs/02) per la finestra «interval»;
 * - settimane da lunedì 00:00 UTC (finestra a livello di piano) per «weekly»;
 * - esclusione dei punti demo (senzaDemo — proposal (a) del task 69);
 * - semantica «ongoing» legata al CONFINE di finestra: un ciclo si chiude al
 *   suo reset ufficiale anche senza campioni successivi (le finestre
 *   proseguono il conteggio lato MiniMax a prescindere dal campionamento).
 *
 * I casi marcati «produzione» replicano i dati reali del 19/10/2026
 * (GET /api/history, 28 punti): residuo 17% alle 16:59 Roma → 96% alle
 * 17:04 Roma (confine 15:00 UTC attraversato esattamente) e settimanale
 * 46% domenica 18/10 → 92% lunedì 19/10 (reset di lunedì 00:00 UTC).
 */
import { describe, test, expect } from "bun:test";
import {
  detectCycles,
  detectCyclesFinestre,
  senzaDemo,
  inizioFinestra5h,
  inizioSettimanaUtc,
  FINESTRA_5H_MS,
  SETTIMANA_MS,
  summarizeCycles,
  sprecoPerCiclo,
} from "@/lib/cycles";
import type { HistoryPoint } from "@/components/history-chart";

const mk = (t: number, interval: number, weekly = 90, source?: string): HistoryPoint =>
  source === undefined ? { t, interval, weekly } : { t, interval, weekly, source };

/** Casi reali di produzione (19/10/2026, Europe/Rome = UTC+2). */
const BLOCCO_15UTC = Date.UTC(2026, 9, 19, 15, 0, 0); // 17:00 Roma — confine osservato
const P16_59 = Date.UTC(2026, 9, 19, 14, 59, 28); // 16:59:28 Roma → interval 17%
const P17_04 = Date.UTC(2026, 9, 19, 15, 4, 29); // 17:04:29 Roma → interval 96%

describe("cycles-finestre: inizioFinestra5h", () => {
  test("allinea al blocco UTC che contiene il timestamp (caso produzione 19/10)", () => {
    expect(inizioFinestra5h(P16_59)).toBe(BLOCCO_15UTC - FINESTRA_5H_MS); // blocco 10:00 UTC
    expect(inizioFinestra5h(P17_04)).toBe(BLOCCO_15UTC); // blocco 15:00 UTC
  });

  test("un confine esatto è sé stesso (floor stabile) e epoch 0 → blocco 0", () => {
    expect(inizioFinestra5h(BLOCCO_15UTC)).toBe(BLOCCO_15UTC);
    expect(inizioFinestra5h(0)).toBe(0);
  });
});

describe("cycles-finestre: inizioSettimanaUtc", () => {
  test("lunedì 00:00 UTC è un confine esatto", () => {
    const lunedi = Date.UTC(2026, 9, 19, 0, 0, 0); // 19/10/2026 è lunedì
    expect(inizioSettimanaUtc(lunedi)).toBe(lunedi);
    expect(inizioSettimanaUtc(lunedi + SETTIMANA_MS - 1)).toBe(lunedi);
    expect(inizioSettimanaUtc(lunedi + SETTIMANA_MS)).toBe(lunedi + SETTIMANA_MS);
  });

  test("domenica appartiene alla settimana iniziata lunedì precedente", () => {
    const domenica = Date.UTC(2026, 9, 18, 15, 55, 0); // 18/10/2026
    expect(inizioSettimanaUtc(domenica)).toBe(Date.UTC(2026, 9, 12, 0, 0, 0));
  });
});

describe("cycles-finestre: senzaDemo", () => {
  test("esclude i punti demo e conserva gli altri (anche senza marca legacy)", () => {
    const serie = [mk(1, 50, 60, "api"), mk(2, 40, 60, "demo"), mk(3, 45, 60), mk(4, 30, 60, "import")];
    const f = senzaDemo(serie);
    expect(f).toHaveLength(3);
    expect(f.map((p) => p.t)).toEqual([1, 3, 4]);
  });

  test("serie vuota → vuota", () => {
    expect(senzaDemo([])).toEqual([]);
  });
});

describe("cycles-finestre: detectCyclesFinestre (interval)", () => {
  test("produzione 19/10: 17% alle 16:59 → 96% alle 17:04 = DUE cicli al confine 15:00 UTC", () => {
    const blocco10 = BLOCCO_15UTC - FINESTRA_5H_MS;
    const serie = [
      mk(blocco10 + 4_900_000, 38), // pomeriggio del blocco 10:00 UTC
      mk(P16_59, 17),
      mk(P17_04, 96), // post-reset: NON serve alcun salto «osservato» per chiudere il ciclo
      mk(P17_04 + 900_000, 83),
    ];
    const now = BLOCCO_15UTC + 3_000_000; // 17:50 Roma: finestra 15–20 UTC ancora aperta
    const c = detectCyclesFinestre(serie, "interval", now);
    expect(c).toHaveLength(2);
    expect(c[0].windowStartT).toBe(blocco10);
    expect(c[0].windowEndT).toBe(BLOCCO_15UTC);
    expect(c[0].ongoing).toBe(false);
    expect(c[0].endValue).toBe(17);
    expect(c[1].windowStartT).toBe(BLOCCO_15UTC);
    expect(c[1].ongoing).toBe(true);
    expect(c[1].startValue).toBe(96);
  });

  test("il ciclo si chiude al reset ufficiale ANCHE senza campioni successivi", () => {
    const serie = [mk(BLOCCO_15UTC + 60_000, 50), mk(BLOCCO_15UTC + 120_000, 30)];
    const now = BLOCCO_15UTC + FINESTRA_5H_MS + 3_600_000; // ore dopo il reset, zero campioni
    const c = detectCyclesFinestre(serie, "interval", now);
    expect(c).toHaveLength(1);
    expect(c[0].ongoing).toBe(false); // prima di I124 l'ultimo tratto restava «in corso» per sempre
    expect(c[0].windowEndT).toBe(BLOCCO_15UTC + FINESTRA_5H_MS);
  });

  test("le finestre SENZA campioni non producono cicli (buchi di campionamento)", () => {
    const w1 = BLOCCO_15UTC - 2 * FINESTRA_5H_MS; // blocco 05:00 UTC
    const w3 = BLOCCO_15UTC; // blocco 15:00 UTC — il blocco 10:00 resta VUOTO
    const serie = [mk(w1 + 60_000, 80), mk(w1 + 120_000, 70), mk(w3 + 60_000, 95), mk(w3 + 120_000, 90)];
    const c = detectCyclesFinestre(serie, "interval", BLOCCO_15UTC + FINESTRA_5H_MS - 1);
    expect(c).toHaveLength(2);
    expect(c[0].windowStartT).toBe(w1);
    expect(c[1].windowStartT).toBe(w3);
  });

  test("i punti demo sono esclusi: nessun ciclo falso, nessun consumo finto", () => {
    const serie = [
      mk(BLOCCO_15UTC - FINESTRA_5H_MS + 60_000, 40, 90, "demo"),
      mk(BLOCCO_15UTC + 60_000, 96),
      mk(BLOCCO_15UTC + 120_000, 90),
    ];
    const c = detectCyclesFinestre(serie, "interval", BLOCCO_15UTC + FINESTRA_5H_MS - 1);
    expect(c).toHaveLength(1);
    expect(c[0].startValue).toBe(96);
  });

  test("i punti senza marca (legacy pre-I124) restano inclusi", () => {
    const serie = [mk(BLOCCO_15UTC + 60_000, 96), mk(BLOCCO_15UTC + 120_000, 80)];
    const c = detectCyclesFinestre(serie, "interval", BLOCCO_15UTC + FINESTRA_5H_MS - 1);
    expect(c).toHaveLength(1);
    expect(c[0].consumed).toBe(16);
  });

  test("consumo e ritmo restano OSSERVATI (primo→ultimo campione della finestra)", () => {
    const serie = [mk(BLOCCO_15UTC + 60_000, 96), mk(BLOCCO_15UTC + 3_660_000, 76)];
    const c = detectCyclesFinestre(serie, "interval", BLOCCO_15UTC + FINESTRA_5H_MS - 1);
    expect(c[0].durationMs).toBe(3_600_000);
    expect(c[0].consumed).toBe(20);
    expect(c[0].ratePerHour).toBeCloseTo(20, 6);
  });

  test("serie vuota o tutta demo → nessun ciclo", () => {
    expect(detectCyclesFinestre([], "interval", 0)).toEqual([]);
    expect(detectCyclesFinestre([mk(1, 50, 60, "demo")], "interval", 2)).toEqual([]);
  });

  test("integrazione summarizeCycles/sprecoPerCiclo sui cicli a finestre", () => {
    const blocco10 = BLOCCO_15UTC - FINESTRA_5H_MS;
    const serie = [
      mk(blocco10 + 60_000, 60),
      mk(blocco10 + 120_000, 20), // finestra conclusa: spreco osservato = endValue 20
      mk(BLOCCO_15UTC + 60_000, 96),
      mk(BLOCCO_15UTC + 120_000, 90),
    ];
    /* now DENTRO la seconda finestra: la prima è completata, la seconda in
       corso (a differenza dell'euristica, qui «in corso» è una proprietà
       della finestra, non dell'assenza di reset osservato). */
    const cicli = detectCyclesFinestre(serie, "interval", BLOCCO_15UTC + 60_000);
    const s = summarizeCycles(cicli);
    expect(s.total).toBe(2);
    expect(s.completed).toBe(1);
    expect(s.ongoing?.index).toBe(2);
    const sp = sprecoPerCiclo(cicli);
    expect(sp?.media).toBeCloseTo(20, 6);
  });
});

describe("cycles-finestre: detectCyclesFinestre (weekly)", () => {
  test("produzione 18→19/10: settimanale 46% domenica → 92% lunedì = DUE settimane", () => {
    const lun19 = Date.UTC(2026, 9, 19, 0, 0, 0);
    const serie = [
      mk(Date.UTC(2026, 9, 17, 17, 54, 0), 81, 61), // sab 17/10 → settimana lun 12/10
      mk(Date.UTC(2026, 9, 18, 15, 44, 0), 0, 46), // dom 18/10 → stessa settimana
      mk(Date.UTC(2026, 9, 19, 14, 12, 0), 38, 92), // lun 19/10 → settimana NUOVA (reset lun 00 UTC)
      mk(Date.UTC(2026, 9, 19, 15, 32, 0), 80, 87),
    ];
    const c = detectCyclesFinestre(serie, "weekly", lun19 + SETTIMANA_MS - 1);
    expect(c).toHaveLength(2);
    expect(c[0].windowStartT).toBe(Date.UTC(2026, 9, 12, 0, 0, 0));
    expect(c[0].windowEndT).toBe(lun19);
    expect(c[0].endValue).toBe(46);
    expect(c[0].ongoing).toBe(false);
    expect(c[1].windowStartT).toBe(lun19);
    expect(c[1].startValue).toBe(92);
  });

  test("la settimana è in corso fino al lunedì 00:00 UTC successivo (poi conclusa)", () => {
    const lun19 = Date.UTC(2026, 9, 19, 0, 0, 0);
    const serie = [mk(lun19 + 3_600_000, 50, 90)];
    expect(detectCyclesFinestre(serie, "weekly", lun19 + 3_600_000)[0].ongoing).toBe(true);
    expect(detectCyclesFinestre(serie, "weekly", lun19 + SETTIMANA_MS)[0].ongoing).toBe(false);
  });
});

describe("cycles-finestre: l'euristica detectCycles resta disponibile (modelli non-general)", () => {
  test("salto ≥15 verso ≥85 chiude il ciclo come prima (contratto invariato)", () => {
    const t0 = BLOCCO_15UTC + 60_000;
    const serie = [mk(t0, 90), mk(t0 + 3_600_000, 80), mk(t0 + 7_200_000, 95), mk(t0 + 10_800_000, 70)];
    const c = detectCycles(serie, "interval");
    expect(c).toHaveLength(2);
    expect(c[1].ongoing).toBe(true);
    expect(c[0].windowEndT).toBeUndefined(); // euristica: nessun metadato di finestra
  });
});
