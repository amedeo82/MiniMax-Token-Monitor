/**
 * Batch 2 analisi (I71) — Test di `lib/sampling.ts`: qualità del
 * campionamento (mediana intervallo, copertura per giorno Roma, gap > 15 min).
 */
import { describe, test, expect } from "bun:test";
import { samplingQuality, romeDayKey } from "@/lib/sampling";

const M = 60_000;
/** 10/10/2026 ore 12:00 UTC = 14:00 a Roma (CEST), piena giornata. */
const BASE = Date.UTC(2026, 9, 10, 12, 0, 0);

const punti = (ts: number[]) => ts.map((t) => ({ t }));

describe("I71: samplingQuality", () => {
  test("serie vuota o di un solo punto → nessuna statistica", () => {
    expect(samplingQuality([])).toEqual({ medianaIntervMs: 0, totalePunti: 0, giorni: [], gaps: [] });
    const q = samplingQuality(punti([BASE]));
    expect(q.medianaIntervMs).toBe(0);
    expect(q.giorni).toHaveLength(0);
    expect(q.gaps).toHaveLength(0);
  });

  test("mediana dell'intervallo su campionamento regolare", () => {
    // 10 punti ogni 5 min → 9 intervalli di 5 min
    const ts = Array.from({ length: 10 }, (_, i) => BASE + i * 5 * M);
    const q = samplingQuality(punti(ts));
    expect(q.medianaIntervMs).toBe(5 * M);
    expect(q.totalePunti).toBe(10);
  });

  test("la mediana è robusta ai buchi (un gap non sposta l'intervallo tipico)", () => {
    // 9 intervalli da 5 min e uno da 2h: mediana = 5 min
    const ts = [...Array.from({ length: 10 }, (_, i) => BASE + i * 5 * M), BASE + 10 * 5 * M + 2 * 3_600_000];
    const q = samplingQuality(punti(ts));
    expect(q.medianaIntervMs).toBe(5 * M);
  });

  test("gap > 15 min rilevato con inizio, fine e durata", () => {
    const ts = [BASE, BASE + 5 * M, BASE + 45 * M, BASE + 50 * M]; // buco da 40 min
    const q = samplingQuality(punti(ts));
    expect(q.gaps).toHaveLength(1);
    expect(q.gaps[0].from).toBe(BASE + 5 * M);
    expect(q.gaps[0].to).toBe(BASE + 45 * M);
    expect(q.gaps[0].ms).toBe(40 * M);
  });

  test("esattamente 15 minuti NON è un gap; 16 minuti lo è", () => {
    const ts15 = [BASE, BASE + 15 * M];
    expect(samplingQuality(punti(ts15)).gaps).toHaveLength(0);
    const ts16 = [BASE, BASE + 16 * M];
    expect(samplingQuality(punti(ts16)).gaps).toHaveLength(1);
  });

  test("gap opzionale personalizzabile (gapMin)", () => {
    const ts = [BASE, BASE + 40 * M];
    expect(samplingQuality(punti(ts)).gaps).toHaveLength(1);
    expect(samplingQuality(punti(ts), { gapMin: 60 }).gaps).toHaveLength(0);
  });

  test("i gap sono elencati dal più recente", () => {
    const ts = [BASE, BASE + 2 * 3_600_000, BASE + 2 * 3_600_000 + 5 * M, BASE + 4 * 3_600_000];
    const q = samplingQuality(punti(ts));
    expect(q.gaps).toHaveLength(2);
    expect(q.gaps[0].from).toBe(BASE + 2 * 3_600_000 + 5 * M); // il buco più recente
    expect(q.gaps[0].ms).toBeCloseTo(115 * M, 0);
    expect(q.gaps[1].from).toBe(BASE);
  });

  test("copertura 100% su campionamento uniforme (l'ultimo punto copre un intervallo suo)", () => {
    // 13 punti ogni 5 min = arco di 60 min + 5 min coperti → attesi 13
    const ts = Array.from({ length: 13 }, (_, i) => BASE + i * 5 * M);
    const q = samplingQuality(punti(ts));
    expect(q.giorni).toHaveLength(1);
    expect(q.giorni[0].osservati).toBe(13);
    expect(q.giorni[0].attesi).toBeCloseTo(13, 5);
    expect(q.giorni[0].copertura).toBeCloseTo(100, 5);
  });

  test("giorno con un buco grande → copertura sotto il 100%", () => {
    // 1h campionata ogni 5 min, buco di 2h, poi ancora 1h:
    // arco coperto = 4h 5min → attesi 49, osservati 26 → ~53%
    const prima = Array.from({ length: 13 }, (_, i) => BASE + i * 5 * M);
    const dopo = Array.from({ length: 13 }, (_, i) => BASE + 3 * 3_600_000 + i * 5 * M);
    const q = samplingQuality(punti([...prima, ...dopo]));
    expect(q.giorni).toHaveLength(1);
    expect(q.giorni[0].osservati).toBe(26);
    expect(q.giorni[0].copertura).toBeGreaterThan(50);
    expect(q.giorni[0].copertura).toBeLessThan(55);
    expect(q.gaps).toHaveLength(1);
  });

  test("campionamento più fitto del previsto → copertura limitata al 100%", () => {
    // dts: 0.5 min poi 8×5 min → mediana 5; arco coperto = 40.5+5 = 45.5 →
    // attesi 9.1 con 10 punti osservati (109%) → limitata a 100
    const ts = [BASE, BASE + 0.5 * M];
    for (let i = 1; i <= 8; i++) ts.push(BASE + (0.5 + i * 5) * M);
    const q = samplingQuality(punti(ts));
    expect(q.medianaIntervMs).toBe(5 * M);
    expect(q.giorni[0].attesi).toBeLessThan(10);
    expect(q.giorni[0].copertura).toBe(100);
  });

  test("attribuzione al giorno Europe/Rome (cambio data a mezzanotte Roma)", () => {
    // 21:00 UTC = 23:00 Roma del 10/10; 22:30 UTC = 00:30 Roma dell'11/10
    const q = samplingQuality(punti([Date.UTC(2026, 9, 10, 21, 0, 0), Date.UTC(2026, 9, 10, 22, 30, 0)]));
    expect(q.giorni.map((g) => g.key)).toEqual(["2026-10-10", "2026-10-11"]);
    expect(q.giorni[0].osservati).toBe(1);
    expect(q.giorni[1].osservati).toBe(1);
  });

  test("giorni in ordine cronologico e attesi ≥ 1 anche per giornate a punto singolo", () => {
    const q = samplingQuality(punti([Date.UTC(2026, 9, 10, 12, 0, 0), Date.UTC(2026, 9, 11, 12, 0, 0)]));
    expect(q.giorni.map((g) => g.key)).toEqual(["2026-10-10", "2026-10-11"]);
    for (const g of q.giorni) {
      expect(g.attesi).toBeGreaterThanOrEqual(1);
      expect(g.copertura).toBeCloseTo(100, 5);
    }
    // e il buco di 24h tra i due punti è segnalato
    expect(q.gaps).toHaveLength(1);
    expect(q.gaps[0].ms).toBe(24 * 3_600_000);
  });

  test("i duplicati (dt ≤ 0) non contano né nell'intervallo né come tempo coperto", () => {
    const ts = [BASE, BASE, BASE + 5 * M];
    const q = samplingQuality(punti(ts));
    expect(q.totalePunti).toBe(3); // tutti i punti restano nell'archivio
    expect(q.medianaIntervMs).toBe(5 * M); // ma solo dt > 0 fa statistica
  });

  test("romeDayKey: data Roma, non UTC", () => {
    expect(romeDayKey(Date.UTC(2026, 9, 10, 21, 0, 0))).toBe("2026-10-10");
    expect(romeDayKey(Date.UTC(2026, 9, 10, 22, 30, 0))).toBe("2026-10-11");
    expect(romeDayKey(Date.UTC(2026, 9, 10, 0, 30, 0))).toBe("2026-10-10");
  });
});
