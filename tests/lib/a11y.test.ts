/**
 * I79 — Test delle descrizioni di accessibilità (lib/a11y.ts).
 *
 * Le tre funzioni sono pure: griglie fake deterministiche → frasi attese.
 * I numeri nel testo usano toFixed(1) (punto decimale, come tutto il progetto).
 */
import { describe, test, expect } from "bun:test";
import {
  descrizioneCalendario,
  descrizioneHeatmap,
  descrizioneResetClock,
} from "@/lib/a11y";
import type { CalendarGrid, HeatmapGrid } from "@/lib/cycles";
import { formatDateTimeRome } from "@/lib/time";

function heatmapFake(): HeatmapGrid {
  // 7×24 tutte a 0 tranne il picco: mercoledì (d=2) ore 14 → 3.1
  const cells: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  cells[2][14] = 3.1;
  cells[0][9] = 0.4;
  return { cells, events: Array.from({ length: 7 }, () => new Array<number>(24).fill(0)), total: 45.2, max: 3.1, populated: 96 };
}

describe("I79 — descrizioneHeatmap", () => {
  test("griglia piena: totale, picco giorno+ora, blocchi attivi su 168", () => {
    const t = descrizioneHeatmap(heatmapFake(), "finestra di 5 ore");
    expect(t).toContain("Heatmap del consumo per giorno della settimana e ora del giorno (finestra di 5 ore)");
    expect(t).toContain("Consumo totale attribuito 45.2%");
    expect(t).toContain("mer alle 14:00 con 3.1%");
    expect(t).toContain("96 blocchi giorno-ora con consumo su 168");
  });

  test("griglia vuota: frase sensata senza picco", () => {
    const vuota: HeatmapGrid = {
      cells: Array.from({ length: 7 }, () => new Array<number>(24).fill(0)),
      events: Array.from({ length: 7 }, () => new Array<number>(24).fill(0)),
      total: 0,
      max: 0,
      populated: 0,
    };
    const t = descrizioneHeatmap(vuota, "finestra settimanale");
    expect(t).toContain("nessun consumo attribuito");
    expect(t).toContain("finestra settimanale");
    expect(t).not.toContain("Ora di picco");
  });
});

describe("I79 — descrizioneCalendario", () => {
  test("griglia piena: totale, giorni, giorno più intenso con data", () => {
    const cellaVuota = { date: null, value: null };
    const grid: CalendarGrid = {
      weeks: [
        [cellaVuota, { date: "2026-09-28", value: 1.5 }, { date: "2026-10-05", value: 8.2 }, cellaVuota, cellaVuota, cellaVuota, cellaVuota],
        [{ date: "2026-10-06", value: 2.0 }, cellaVuota, cellaVuota, cellaVuota, cellaVuota, cellaVuota, cellaVuota],
      ],
      max: 8.2,
      giorni: 3,
      total: 120.5,
    };
    const t = descrizioneCalendario(grid, "finestra di 5 ore");
    expect(t).toContain("Calendario del consumo per giorno di calendario (ultime 2 settimane, finestra di 5 ore)");
    expect(t).toContain("Consumo totale 120.5% su 3 giorni con dati");
    expect(t).toContain("Giorno più intenso: 2026-10-05 con 8.2%");
    expect(t).toContain("La settimana corrente è l'ultima colonna");
  });

  test("griglia vuota: frase sensata", () => {
    const vuota: CalendarGrid = { weeks: [[{ date: null, value: null }]], max: 0, giorni: 0, total: 0 };
    const t = descrizioneCalendario(vuota, "finestra settimanale");
    expect(t).toContain("nessun consumo attribuito");
  });
});

describe("I79 — descrizioneResetClock", () => {
  const ora = Date.UTC(2026, 9, 12, 13, 30, 0); // lun 12 ott 2026 13:30 UTC
  const da = ora - 7 * 86_400_000;
  const resetInterval = da + 86_400_000; // dentro la finestra
  const resetWeekly = ora - 3_600_000; // dentro la finestra, più recente

  test("reset visibili: conteggio per finestra, ultimo in ora Roma, blocchi UTC", () => {
    const t = descrizioneResetClock(
      [
        { t: resetInterval, win: "interval" },
        { t: resetWeekly, win: "weekly" },
      ],
      da,
      ora,
    );
    expect(t).toContain("Orologio dei reset: 2 reset osservati negli ultimi 7 giorni");
    expect(t).toContain("1 della finestra di 5 ore e 1 settimanali");
    expect(t).toContain(`Ultimo reset: ${formatDateTimeRome(resetWeekly)}`);
    expect(t).toContain("blocchi teorici alle 00:00, 05:00, 10:00, 15:00, 20:00");
  });

  test("reset fuori finestra esclusi dal conteggio", () => {
    const fuori = da - 86_400_000; // prima dell'inizio della finestra
    const t = descrizioneResetClock([{ t: fuori, win: "interval" }], da, ora);
    expect(t).toContain("nessun reset osservato");
  });

  test("nessun reset: frase sensata con blocchi teorici", () => {
    const t = descrizioneResetClock([], da, ora);
    expect(t).toContain("nessun reset osservato");
    expect(t).toContain("00:00, 05:00, 10:00, 15:00, 20:00");
  });
});
