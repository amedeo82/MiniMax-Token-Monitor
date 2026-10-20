/**
 * Fase 3 (batch 1) — Test delle aggregazioni I57/I58/I61/I63/I64 in cycles.ts:
 * spreco per ciclo, prevedibilità, calendario per giorno, oggi vs media,
 * distribuzione del residuo.
 */
import { describe, test, expect } from "bun:test";
import {
  BAND_COLORS,
  consumoGiornaliero,
  detectCycles,
  distribuzioneResiduo,
  evoluzionePrevedibilita,
  oggiVsMedia,
  prevedibilitaCicli,
  sprecoPerCiclo,
} from "@/lib/cycles";
import type { HistoryPoint } from "@/components/history-chart";

const H = 3_600_000;
const GIORNO = 86_400_000;
// Estate 2026 (Roma UTC+2): lunedì 15/06/2026 12:00 UTC
const LUN = Date.UTC(2026, 5, 15, 12, 0, 0);

const mk = (t: number, interval: number, weekly = 90): HistoryPoint => ({ t, interval, weekly });

/** Serie con 3 cicli completati con spreci noti + ciclo in corso. */
function serieCicli(): HistoryPoint[] {
  // ciclo 1: 90 → 20 (spreco 20 al reset), durata 2h
  // ciclo 2: 95 → 3  (spreco 3), durata 2h
  // ciclo 3: 92 → 44 (spreco 44), durata 2h
  // in corso: da 96 in discesa
  return [
    mk(LUN, 90), mk(LUN + H, 55), mk(LUN + 2 * H, 20),
    mk(LUN + 3 * H, 95), mk(LUN + 4 * H, 50), mk(LUN + 5 * H, 3),
    mk(LUN + 6 * H, 92), mk(LUN + 7 * H, 70), mk(LUN + 8 * H, 44),
    mk(LUN + 9 * H, 96), mk(LUN + 10 * H, 80),
  ];
}

describe("I57: sprecoPerCiclo", () => {
  test("media/mediana/max/clean sui cicli completati", () => {
    const w = sprecoPerCiclo(detectCycles(serieCicli(), "interval"));
    expect(w).not.toBeNull();
    expect(w!.n).toBe(3);
    // spreci: [20, 3, 44] → media 22,33; mediana 20; max 44; clean (<5) = 1
    expect(w!.media).toBeCloseTo(22.333, 2);
    expect(w!.mediana).toBe(20);
    expect(w!.max).toBe(44);
    expect(w!.clean).toBe(1);
    expect(w!.percClean).toBeCloseTo(33.333, 2);
  });

  test("null senza cicli completati; il ciclo in corso NON conta", () => {
    expect(sprecoPerCiclo([])).toBeNull();
    const w = sprecoPerCiclo(detectCycles([mk(LUN, 90), mk(LUN + H, 50)], "interval"));
    expect(w).toBeNull(); // unico ciclo in corso
  });
});

describe("I63: prevedibilitaCicli", () => {
  test("σ popolazione, CV e indice di regolarità", () => {
    const p = prevedibilitaCicli(detectCycles(serieCicli(), "interval"));
    expect(p).not.toBeNull();
    expect(p!.n).toBe(3);
    expect(p!.mediaMs).toBe(2 * H);
    expect(p!.sigmaMs).toBe(0); // durate tutte identiche
    expect(p!.cv).toBe(0);
    expect(p!.indice).toBe(100); // perfettamente regolari
  });

  test("durate variabili → cv > 0 e indice < 100", () => {
    const serie = [
      mk(LUN, 90), mk(LUN + H, 55), mk(LUN + 2 * H, 20), // ciclo 2h
      mk(LUN + 3 * H, 95), mk(LUN + 7 * H, 50), mk(LUN + 10 * H, 3), // ciclo 7h
      mk(LUN + 11 * H, 92), mk(LUN + 14 * H, 70), mk(LUN + 17 * H, 44), // ciclo 3h
      mk(LUN + 18 * H, 96),
    ];
    const p = prevedibilitaCicli(detectCycles(serie, "interval"));
    expect(p).not.toBeNull();
    expect(p!.mediaMs).toBeCloseTo(5 * H, 6); // (2 + 7 + 6) / 3
    expect(p!.cv).toBeGreaterThan(0.3);
    expect(p!.indice).toBeLessThan(70);
  });

  test("null con meno di 3 cicli completati", () => {
    const serie = [mk(LUN, 90), mk(LUN + H, 55), mk(LUN + 2 * H, 20), mk(LUN + 3 * H, 96)];
    expect(prevedibilitaCicli(detectCycles(serie, "interval"))).toBeNull();
    expect(prevedibilitaCicli([])).toBeNull();
  });

  /* --- I127: caveat «campione ridotto» — onestà statistica sull'indice --- */

  test("I127: campioneRidotto true con meno di 7 cicli completati", () => {
    // serieCicli(): 3 cicli completati (2h ciascuno) + 1 in corso
    const p = prevedibilitaCicli(detectCycles(serieCicli(), "interval"));
    expect(p).not.toBeNull();
    expect(p!.n).toBe(3);
    expect(p!.campioneRidotto).toBe(true);
  });

  test("I127: campioneRidotto false con 7+ cicli completati", () => {
    // 7 cicli completati da 2h (reset osservato: salto +75 verso 95) + in corso
    const serie: HistoryPoint[] = [];
    for (let i = 0; i < 7; i++) {
      const base = LUN + 3 * i * H;
      serie.push(mk(base, 95), mk(base + H, 60), mk(base + 2 * H, 20));
    }
    serie.push(mk(LUN + 21 * H, 96), mk(LUN + 22 * H, 88));
    const p = prevedibilitaCicli(detectCycles(serie, "interval"));
    expect(p).not.toBeNull();
    expect(p!.n).toBe(7);
    expect(p!.campioneRidotto).toBe(false);
    // durate tutte identiche (2h) → indice perfetto
    expect(p!.indice).toBe(100);
  });
});

describe("I128: evoluzionePrevedibilita", () => {
  test("null con meno di 3 cicli completati", () => {
    expect(evoluzionePrevedibilita([])).toBeNull();
    // 1 completato + 1 in corso
    const serie = [mk(LUN, 90), mk(LUN + H, 55), mk(LUN + 2 * H, 20), mk(LUN + 3 * H, 96)];
    expect(evoluzionePrevedibilita(detectCycles(serie, "interval"))).toBeNull();
  });

  test("punto unico con 3 completati: nessun delta, salto 0 (serieCicli: 3×2h)", () => {
    const evo = evoluzionePrevedibilita(detectCycles(serieCicli(), "interval"));
    expect(evo).not.toBeNull();
    expect(evo!.serie).toHaveLength(1);
    expect(evo!.serie[0].n).toBe(3);
    expect(evo!.serie[0].indice).toBe(100); // durate identiche
    expect(evo!.serie[0].delta).toBeNull();
    expect(evo!.ultimoDelta).toBeNull();
    expect(evo!.maxSalto).toBe(0);
  });

  test("I128: ricalcolo cumulativo coerente con prevedibilitaCicli + delta (durati 2,2,2,7h)", () => {
    // ciclo 4 lungo 7h: l'indice crolla da 100 (k=3) a 33 (k=4)
    const serie = [
      mk(LUN, 90), mk(LUN + H, 55), mk(LUN + 2 * H, 20), // ciclo 1: 2h
      mk(LUN + 3 * H, 95), mk(LUN + 4 * H, 60), mk(LUN + 5 * H, 20), // ciclo 2: 2h
      mk(LUN + 6 * H, 95), mk(LUN + 7 * H, 60), mk(LUN + 8 * H, 20), // ciclo 3: 2h
      mk(LUN + 9 * H, 96), mk(LUN + 15 * H, 50), mk(LUN + 16 * H, 3), // ciclo 4: 7h
      mk(LUN + 17 * H, 96), // in corso: NON conta
    ];
    const cicli = detectCycles(serie, "interval");
    const evo = evoluzionePrevedibilita(cicli);
    expect(evo).not.toBeNull();
    expect(evo!.serie).toHaveLength(2); // k = 3 e k = 4 (l'in corso è escluso)
    // l'ultimo punto coincide con la prevedibilità sull'intero campione
    const p = prevedibilitaCicli(cicli);
    expect(p).not.toBeNull();
    expect(evo!.serie[1].n).toBe(4);
    expect(evo!.serie[1].indice).toBe(p!.indice);
    expect(evo!.serie[1].cv).toBeCloseTo(p!.cv, 9);
    // k=4: media 3,25h, cv 0,6662 → indice 33; delta = 33 − 100 = −67
    expect(evo!.serie[1].indice).toBe(33);
    expect(evo!.serie[1].delta).toBe(-67);
    expect(evo!.serie[0].indice).toBe(100);
    expect(evo!.serie[0].delta).toBeNull();
    expect(evo!.ultimoDelta).toBe(-67);
    expect(evo!.maxSalto).toBe(67);
  });

  test("I128: percorso su 5 completati (2,2,2,7,6h) — ultimo Δ positivo, salto max resta 67", () => {
    const serie = [
      mk(LUN, 90), mk(LUN + H, 55), mk(LUN + 2 * H, 20), // ciclo 1: 2h
      mk(LUN + 3 * H, 95), mk(LUN + 4 * H, 60), mk(LUN + 5 * H, 20), // ciclo 2: 2h
      mk(LUN + 6 * H, 95), mk(LUN + 7 * H, 60), mk(LUN + 8 * H, 20), // ciclo 3: 2h
      mk(LUN + 9 * H, 96), mk(LUN + 15 * H, 50), mk(LUN + 16 * H, 3), // ciclo 4: 7h
      mk(LUN + 17 * H, 96), mk(LUN + 19 * H, 60), mk(LUN + 23 * H, 10), // ciclo 5: 6h
      mk(LUN + 24 * H, 96), mk(LUN + 25 * H, 80), // in corso
    ];
    const evo = evoluzionePrevedibilita(detectCycles(serie, "interval"));
    expect(evo).not.toBeNull();
    expect(evo!.serie).toHaveLength(3);
    // k=3: 100 · k=4: 33 · k=5: media 3,8h, cv 0,5861 → indice 41
    expect(evo!.serie.map((s) => s.indice)).toEqual([100, 33, 41]);
    expect(evo!.serie.map((s) => s.n)).toEqual([3, 4, 5]);
    expect(evo!.serie[0].delta).toBeNull();
    expect(evo!.serie[1].delta).toBe(-67);
    expect(evo!.serie[2].delta).toBe(8); // 41 − 33
    expect(evo!.ultimoDelta).toBe(8);
    expect(evo!.maxSalto).toBe(67); // max(|−67|, |8|)
  });
});

describe("I61: distribuzioneResiduo", () => {
  test("assegnazione con ceil (84,5 → 80–90) e conteggi", () => {
    const serie = [
      mk(LUN, 84.5), // fascia 80–90
      mk(LUN + H, 100), // fascia 90–100
      mk(LUN + 2 * H, 0), // fascia 0–10
      mk(LUN + 3 * H, 10), // fascia 10–20 (ceil(10/10)=1)
      mk(LUN + 4 * H, 84.5),
    ];
    const d = distribuzioneResiduo(serie, "interval");
    expect(d.n).toBe(5);
    expect(d.fasce).toHaveLength(10);
    expect(d.fasce[0].count).toBe(2);
    expect(d.fasce[1].count).toBe(0);
    expect(d.fasce[8].count).toBe(2);
    expect(d.fasce[9].count).toBe(1);
    expect(d.max).toBe(2);
    expect(d.fasce[8].color).toBe(BAND_COLORS[8]);
    expect(BAND_COLORS).toHaveLength(10);
  });

  test("serie vuota → tutto zero, max 0", () => {
    const d = distribuzioneResiduo([], "interval");
    expect(d.n).toBe(0);
    expect(d.max).toBe(0);
    expect(d.fasce.every((f) => f.count === 0)).toBe(true);
  });
});

describe("I58/I64: consumoGiornaliero + oggiVsMedia", () => {
  test("griglia con settimana corrente come ULTIMA riga e celle lun→dom", () => {
    // Consumo attribuito: lun 15/06 (midpoint), mar 16/06
    const serie = [
      mk(LUN, 90), // Roma lun 14:00
      mk(LUN + 2 * H, 80), // midpoint Roma lun 15:00 → −10 a lunedì
      mk(LUN + 6 * H, 70), // midpoint Roma lun 17:00 → −10 a lunedì
      mk(LUN + 26 * H, 60), // midpoint Roma mar ~06:00 → −10 a martedì
      mk(LUN + 28 * H, 95), // reset (salto +35, ≥85)
      mk(LUN + 30 * H, 96), // recupero sopra il minimo: nessun consumo
    ];
    const g = consumoGiornaliero(serie, "interval", 4);
    expect(g.weeks.length).toBeLessThanOrEqual(4);
    expect(g.weeks.length).toBeGreaterThan(0);
    const ultima = g.weeks[g.weeks.length - 1];
    expect(ultima).toHaveLength(7);
    // tutte le settimane lun→dom: la prima cella di ogni riga è un lunedì
    const primaSettimana = g.weeks[0];
    expect(primaSettimana).toHaveLength(7);
    // total = 30; giorni = 2; max = 20 (le prime due discese cadono entrambe di lunedì)
    expect(g.total).toBeCloseTo(30, 6);
    expect(g.giorni).toBe(2);
    expect(g.max).toBeCloseTo(20, 6);
  });

  test("oggi escluso dalla media degli stessi weekday", () => {
    // 3 lunedì: consumo 10, 20 e oggi 30 → media confrontabile = (10+20)/2 = 15
    const serie: HistoryPoint[] = [];
    let v = 95;
    for (const settimana of [0, 1, 2]) {
      const lunedi = Date.UTC(2026, 5, 1 + 7 * settimana, 12, 0, 0); // 01/06/2026 è lunedì
      // discesa da v a v−10 nel giorno (midpoint nello stesso giorno)
      serie.push(mk(lunedi, v), mk(lunedi + 2 * H, v - 10));
      // reset prima del ciclo successivo (il valore risale per il prossimo giro)
      v = v - 10 + 15;
    }
    serie.push(mk(Date.UTC(2026, 5, 22, 18, 0, 0), 95)); // lun 22/06: giorno "oggi" di chiusura
    const o = oggiVsMedia(serie, "interval", 5);
    // tre lunedì con consumo 10 ciascuno (01/06, 08/06, 15/06); "oggi" = ultimo
    // giorno con consumo (15/06); confrontabili: 01/06 e 08/06 → media 10
    expect(o.giorniConsiderati).toBe(2);
    expect(o.media).toBeCloseTo(10, 6);
    expect(o.oggi).toBeCloseTo(10, 6);
    expect(o.differenza).toBeCloseTo(0, 6);
    expect(o.senzaMedia).toBe(false);
  });

  test("storico insufficiente → senzaMedia true e zero al sicuro", () => {
    const o = oggiVsMedia([mk(LUN, 90), mk(LUN + H, 80)], "interval", 5);
    expect(o.senzaMedia).toBe(true);
    expect(o.media).toBe(0);
    expect(o.differenza).toBeCloseTo(o.oggi, 6);
  });
});
