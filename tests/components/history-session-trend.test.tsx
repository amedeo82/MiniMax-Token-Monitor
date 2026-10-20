/**
 * I127 — Proiezione sulla FINESTRA CORRENTE (ritmo di sessione).
 *
 * Prima di I127 il verdetto d'esaurimento, la pace e la card «Esaurimento
 * previsto» usavano la corda sugli ultimi 60 punti (computeTrend): con uno
 * storico giovane quella corda copre GIORNI e include le ore di inattività
 * (in produzione: +0.37 %/h di lungo periodo mentre la sessione attiva
 * bruciava al 18–36 %/h) — il verdetto «Quota sufficiente fino al reset»
 * diventava fuorviante proprio quando l'utente sta consumando.
 *
 * Da I127 la proiezione usa computeSessionTrend (solo i rilevamenti della
 * finestra attiva: blocco fisso UTC corrente per la 5h, settimana corrente
 * da lunedì 00:00 UTC per la settimanale — stesso allineamento di
 * detectCyclesFinestre/verdetto V8) quando ci sono ≥2 rilevamenti; altrimenti
 * ricade sul trend lungo CON etichetta esplicita della base.
 *
 * I test componente usano container.textContent (testo misto con <strong>:
 * getByText sarebbe ambiguo tra i parent). Cleanup esplicito (I123).
 */
import "./setup-dom";
import { describe, test, expect, beforeEach } from "bun:test";
import { render, cleanup } from "@testing-library/react";
import {
  StatsPanel,
  computeSessionTrend,
  computeTrend,
  type HistoryPoint,
  type TrendStats,
} from "@/components/history-chart";

const H = 3_600_000;
/* Martedì 20/10/2026, 11:30 UTC = 13:30 Roma (CEST, UTC+2).
   Blocco 5h corrente: 10:00 UTC (15:00 fine) — settimana corrente: lun 19/10 00:00 UTC. */
const NOW = Date.UTC(2026, 9, 20, 11, 30);
const INIZIO_BLOCCO = Date.UTC(2026, 9, 20, 10);
const INIZIO_SETTIMANA = Date.UTC(2026, 9, 19, 0, 0);
const FINE_BLOCCO = Date.UTC(2026, 9, 20, 15);

const mk = (t: number, interval: number, weekly = 95): HistoryPoint => ({ t, interval, weekly });

beforeEach(() => {
  cleanup();
});

describe("I127: computeSessionTrend", () => {
  test("usa SOLO i punti della finestra 5h corrente (i vecchi non contano)", () => {
    const serie = [
      mk(NOW - 26 * H, 95), // ieri: fuori dal blocco corrente
      mk(INIZIO_BLOCCO + 30 * 60_000, 90), // 10:30 UTC, dentro il blocco
      mk(NOW, 50), // 11:30 UTC, dentro il blocco
    ];
    const st = computeSessionTrend(serie, "interval", NOW);
    expect(st).not.toBeNull();
    expect(st!.samples).toBe(2);
    expect(st!.ratePerHour).toBeCloseTo(40, 6); // 40 punti in 1 ora
    expect(st!.windowMs).toBe(H);
    expect(st!.lastValue).toBe(50);
    // esaurimento lineare: 50% al 40%/h → 1,25h dall'ultimo rilevamento
    expect(st!.exhaustionAt).toBe(NOW + 1.25 * H);
    expect(st!.exhaustionMs).toBeCloseTo(1.25 * H, 6);

    // il trend di lungo periodo sulla STESSA serie è radicalmente diverso:
    // è la dimostrazione della differenza di base (corda 60 punti = 26,5h)
    const lungo = computeTrend(serie, "interval");
    expect(lungo.ratePerHour).not.toBeNull();
    expect(lungo.ratePerHour!).toBeLessThan(5);
  });

  test("null con meno di 2 punti nel blocco corrente (i punti vecchi NON rientrano)", () => {
    const serie = [
      mk(NOW - 26 * H, 95),
      mk(NOW - 25 * H, 90),
      mk(INIZIO_BLOCCO + 30 * 60_000, 88), // unico punto nel blocco corrente
    ];
    expect(computeSessionTrend(serie, "interval", NOW)).toBeNull();
  });

  test("il confine del blocco è inclusivo e il punto ESATTAMENTE all'inizio conta", () => {
    const serie = [mk(INIZIO_BLOCCO, 100), mk(INIZIO_BLOCCO + 2 * H, 80)];
    const st = computeSessionTrend(serie, "interval", NOW);
    expect(st).not.toBeNull();
    expect(st!.samples).toBe(2);
    expect(st!.ratePerHour).toBeCloseTo(10, 6);
  });

  test("finestra settimanale: settimana corrente da lunedì 00:00 UTC", () => {
    const serie = [
      mk(NOW - 30 * H, 60, 90), // lun 05:30 UTC, dentro la settimana
      mk(NOW, 55, 80), // mar 11:30 UTC
    ];
    const st = computeSessionTrend(serie, "weekly", NOW);
    expect(st).not.toBeNull();
    expect(st!.samples).toBe(2);
    // 10 punti in 30 ore (da lun 05:30 a mar 11:30 UTC)
    expect(st!.ratePerHour).toBeCloseTo(10 / 30, 6);
    expect(st!.lastValue).toBe(80);
  });

  test("consumo nullo → rate 0 senza esaurimento stimato", () => {
    const serie = [mk(INIZIO_BLOCCO + H, 60), mk(INIZIO_BLOCCO + 2 * H, 60)];
    const st = computeSessionTrend(serie, "interval", NOW);
    expect(st).not.toBeNull();
    expect(st!.ratePerHour).toBe(0);
    expect(st!.exhaustionAt).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* I127 — StatsPanel: base di sessione con etichetta, fallback dichiarato */
/* ------------------------------------------------------------------ */

/** Trend di lungo periodo finto: ritmo basso (l'inattività diluisce la media). */
const trendLungo: TrendStats = {
  ratePerHour: 0.5,
  exhaustionMs: null,
  exhaustionAt: null,
  samples: 40,
  windowMs: 40 * H,
  lastT: NOW,
  lastValue: 50,
};

/** Serie di sessione: 90→50 nel blocco corrente = 40 %/h, esaurimento 12:45 UTC. */
const serieSessione = [mk(INIZIO_BLOCCO + 30 * 60_000, 90), mk(NOW, 50)];
const sessione = computeSessionTrend(serieSessione, "interval", NOW)!;

describe("I127: StatsPanel usa il ritmo della finestra in corso", () => {
  test("verdetto e pace sulla base di sessione, con etichetta esplicita", () => {
    const { container } = render(
      <StatsPanel
        trend={trendLungo}
        sessionTrend={sessione}
        win="interval"
        resetAt={FINE_BLOCCO}
        remaining={50}
      />,
    );
    const testo = container.textContent ?? "";
    // la base dichiarata è la sessione, non la media di lungo periodo
    expect(testo).toContain("Al ritmo della finestra in corso");
    expect(testo).toContain("+40.00 %/h");
    expect(testo).not.toContain("Al ritmo medio di lungo periodo");
    // esaurimento 12:45 UTC < reset 15:00 UTC → rischio + fermo tecnico
    expect(testo).toContain("Rischio esaurimento prima del reset");
    expect(testo).toContain("Fermo tecnico prima del reset");
    // la card media affianca il ritmo della sessione
    expect(testo).toContain("Finestra in corso:");
    // la card esaurimento dichiara la base di sessione
    expect(testo).toContain("Sul ritmo della finestra in corso");
  });

  test("fallback dichiarato sul trend lungo quando la sessione non è stimabile", () => {
    const { container } = render(
      <StatsPanel
        trend={trendLungo}
        sessionTrend={null}
        win="interval"
        resetAt={FINE_BLOCCO}
        remaining={50}
      />,
    );
    const testo = container.textContent ?? "";
    expect(testo).toContain("Il consumo è quasi nullo (+0.50 %/h)");
    expect(testo).not.toContain("Finestra in corso:");
    expect(testo).not.toContain("Sul ritmo della finestra in corso");
  });
});
