/**
 * I50 — Test della libreria core `time.ts`: conversioni safe di epoch,
 * formattazioni Europe/Rome it-IT, countdown e progresso finestra.
 */
import { describe, test, expect } from "bun:test";
import {
  formatCountdown,
  formatDateTimeRome,
  formatDateRome,
  formatDuration,
  formatTimeRome,
  msUntil,
  romeZoneInfo,
  toDate,
  windowProgress,
} from "@/lib/time";

// Epoch deterministici:
// estate 2026 (CEST, UTC+2): 15/06/2026 12:00 UTC → 14:00 a Roma
const ESTATE = Date.UTC(2026, 5, 15, 12, 0, 0);
// inverno 2026 (CET, UTC+1): 15/01/2026 12:00 UTC → 13:00 a Roma
const INVERNO = Date.UTC(2026, 0, 15, 12, 0, 0);

describe("time: toDate", () => {
  test("null/undefined/vuoto/non valido → null", () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate("")).toBeNull();
    expect(toDate("  ")).toBeNull();
    expect(toDate("non è una data")).toBeNull();
    expect(toDate(true)).toBeNull();
  });

  test("Date valida passata, Date invalida → null", () => {
    const d = new Date(ESTATE);
    expect(toDate(d)?.getTime()).toBe(ESTATE);
    expect(toDate(new Date("zzz"))).toBeNull();
  });

  test("epoch in secondi e in millisecondi", () => {
    expect(toDate(ESTATE / 1000)?.getTime()).toBe(ESTATE);
    expect(toDate(ESTATE)?.getTime()).toBe(ESTATE);
  });

  test("stringa di sole cifre 10/13 → epoch", () => {
    expect(toDate(String(Math.floor(ESTATE / 1000)))?.getTime()).toBe(ESTATE);
    expect(toDate(String(ESTATE))?.getTime()).toBe(ESTATE);
  });

  test("stringa ISO interpretata", () => {
    expect(toDate("2026-06-15T12:00:00Z")?.getTime()).toBe(ESTATE);
  });

  test("epoch troppo piccolo per essere credibile → tempo reale, non moltiplicato", () => {
    // < 1e9 → trattato come ms grezzi (1970), non come secondi
    expect(toDate(500)?.getTime()).toBe(500);
  });
});

describe("time: formattazioni Europe/Rome", () => {
  test("formatTimeRome: estate CEST (+2), inverno CET (+1)", () => {
    expect(formatTimeRome(ESTATE)).toBe("14:00:00");
    expect(formatTimeRome(INVERNO)).toBe("13:00:00");
  });

  test("formatTimeRome senza secondi", () => {
    expect(formatTimeRome(ESTATE, false)).toBe("14:00");
  });

  test("formatDateTimeRome: gg/mm/aaaa, HH:MM", () => {
    expect(formatDateTimeRome(ESTATE)).toBe("15/06/2026, 14:00");
  });

  test("formatDateRome: giorno della settimana e mese in italiano", () => {
    const s = formatDateRome(ESTATE);
    expect(s).toContain("giugno");
    expect(s).toContain("2026");
    expect(/lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica/.test(s)).toBe(true);
  });

  test("valori nulli → segnaposto «—»", () => {
    expect(formatTimeRome(null)).toBe("—");
    expect(formatDateTimeRome("xyz")).toBe("—");
    expect(formatDateRome(undefined)).toBe("—");
  });

  test("romeZoneInfo: offset estivo +2 e invernale +1 (nomi zona dipendono dall'ICU del runtime)", () => {
    expect(romeZoneInfo(ESTATE)).toContain("02");
    expect(romeZoneInfo(INVERNO)).toContain("01");
  });
});

describe("time: countdown e durate", () => {
  test("formatCountdown: null/invalido → «—», ≤0 → «0s»", () => {
    expect(formatCountdown(null)).toBe("—");
    expect(formatCountdown(Number.NaN)).toBe("—");
    expect(formatCountdown(-100)).toBe("0s");
    expect(formatCountdown(0)).toBe("0s");
  });

  test("formatCountdown: secondi, minuti, ore, giorni", () => {
    expect(formatCountdown(45_000)).toBe("45s");
    expect(formatCountdown(2 * 60_000 + 5_000)).toBe("2m 05s");
    expect(formatCountdown(2 * 3_600_000 + 34 * 60_000 + 5_000)).toBe("2h 34m 05s");
    expect(formatCountdown(3 * 86_400_000 + 3 * 3_600_000)).toBe("3g 03h 00m");
  });

  test("formatDuration: giorni/ore/minuti in italiano", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(5 * 60_000)).toBe("5 min");
    expect(formatDuration(90 * 60_000)).toBe("1 ora 30 min");
    expect(formatDuration(24 * 3_600_000)).toBe("1 giorno");
    expect(formatDuration(2 * 86_400_000 + 3 * 3_600_000)).toBe("2 giorni 3 ore");
  });
});

describe("time: finestre", () => {
  test("msUntil: futuro → differenza, passato → null", () => {
    const ora = 1_000_000;
    expect(msUntil(ora + 5_000, ora)).toBe(5_000);
    expect(msUntil(ora - 1, ora)).toBeNull();
    expect(msUntil(null, ora)).toBeNull();
  });

  test("windowProgress: metà finestra → 50", () => {
    const start = Date.UTC(2026, 5, 15, 10, 0, 0);
    const end = Date.UTC(2026, 5, 15, 14, 0, 0);
    expect(windowProgress(start, end, start + 2 * 3_600_000)).toBeCloseTo(50, 5);
  });

  test("windowProgress: clamp 0–100 e casi null", () => {
    const start = Date.UTC(2026, 5, 15, 10, 0, 0);
    const end = Date.UTC(2026, 5, 15, 14, 0, 0);
    expect(windowProgress(start, end, start - 60_000)).toBe(0);
    expect(windowProgress(start, end, end + 60_000)).toBe(100);
    expect(windowProgress(null, end)).toBeNull();
    expect(windowProgress(end, start)).toBeNull(); // total <= 0
    expect(windowProgress(start, null)).toBeNull();
  });
});
