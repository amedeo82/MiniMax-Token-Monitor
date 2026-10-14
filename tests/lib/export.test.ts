/**
 * I99 — Contratto dei formati di esportazione (lib/export.ts).
 *
 * Il CSV usa «;» come separatore (Excel it-IT), BOM UTF-8, decimali con la
 * virgola e quoting per celle con virgolette/separatori/andate a capo; il
 * JSON incapsula i dati con exportedAt. (downloadTextFile richiede il DOM:
 * qui si fissano i formati, non il download.)
 */
import { describe, test, expect } from "bun:test";
import { historyToCsv, eventsToCsv, fileStamp } from "../../src/lib/export";

const T = new Date("2026-10-14T10:30:00Z").getTime();

describe("I99 — lib/export: formati CSV/JSON", () => {
  test("historyToCsv: BOM, intestazione, separatore ;, decimali con virgola", () => {
    const csv = historyToCsv([{ t: T, interval: 87.5, weekly: 64.25 }]);
    expect(csv.startsWith("\uFEFF")).toBeTrue();
    const righe = csv.slice(1).split("\r\n");
    expect(righe[0]).toBe("timestamp_iso;data_ora_roma;percentuale_5h;percentuale_settimanale");
    expect(righe[1]).toContain("2026-10-14T10:30:00.000Z");
    expect(righe[1]).toContain(";87,5;");
    expect(righe[1]).toContain(";64,3"); // toFixed(1) arrotonda 64.25 → 64.3
  });

  test("eventsToCsv: colonne evento, null → cella vuota, valore con virgola", () => {
    const csv = eventsToCsv([
      { id: "e1", t: T, kind: "reset", model: "general", win: "interval", message: "reset rilevato", value: 85 },
      { id: "e2", t: T, kind: "error", model: null, win: null, message: "errore rete", value: null },
    ]);
    const righe = csv.slice(1).split("\r\n");
    expect(righe[0]).toBe("timestamp_iso;data_ora_roma;tipo;modello;finestra;messaggio;percentuale");
    expect(righe[1]).toContain(";reset;general;interval;reset rilevato;85,0");
    expect(righe[2]).toContain(";error;;;errore rete;");
  });

  test("quoting CSV: celle con ; o virgolette o newline racchiuse e raddoppiate", () => {
    const csv = eventsToCsv([{ id: "e", t: T, kind: "info", model: null, win: null, message: 'chiave; con "doppie" e\ncapo', value: null }]);
    const riga = csv.slice(1).split("\r\n")[1];
    expect(riga).toContain('"chiave; con ""doppie"" e\ncapo"');
  });

  test("fileStamp: formato compatto AAAAMMGG-HHMMSS nel fuso locale", () => {
    const stamp = fileStamp(T);
    expect(stamp).toMatch(/^\d{8}-\d{6}$/);
  });
});
