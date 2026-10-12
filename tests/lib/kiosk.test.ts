/**
 * I87 — Test di `lib/kiosk.ts`: modalità kiosk/TV.
 *
 * Copre il nuovo `readKioskMode` (stessa semantica di `readCompactMode` I73),
 * la rotazione `nextKioskView`, la finestra notturna `isNightRome` (22:00–06:59
 * Europe/Rome, con epoch sintetici CEST e CET), la sanitizzazione di
 * `loadKioskState` e la gestione URL di `kioskHref`.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  isNightRome,
  kioskHref,
  KIOSK_DEFAULTS,
  KIOSK_ROTATION_OPTIONS,
  KIOSK_STORAGE_KEY,
  loadKioskState,
  nextKioskView,
  readKioskMode,
  saveKioskState,
  romeHour,
  type KioskState,
} from "@/lib/kiosk";

/**
 * Storage in memoria iniettato su window.localStorage per la durata di ogni test:
 * nella suite completa altri file possono aver sostituito lo storage globale
 * (o un window non-happy-dom può esporre un localStorage parziale) — lo shadow
 * deterministico rende i test di persistenza indipendenti dall'ordine.
 */
function creaStorageMemoria(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    key: (i: number) => (Array.from(m.keys())[i] ?? null),
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    writable: true,
    value: creaStorageMemoria(),
  });
});

afterEach(() => {
  // Rimuove lo shadow: il descrittore originale (happy-dom o altro) torna visibile.
  delete (window as unknown as Record<string, unknown>).localStorage;
});

describe("kiosk: readKioskMode (?kiosk=1)", () => {
  test("valori che ATTIVANO il kiosk", () => {
    expect(readKioskMode("?kiosk=1")).toBe(true);
    expect(readKioskMode("?kiosk")).toBe(true);
    expect(readKioskMode("?kiosk=true")).toBe(true);
    expect(readKioskMode("?kiosk=TRUE")).toBe(true);
    expect(readKioskMode("?compact=0&kiosk=1")).toBe(true);
  });

  test("valori che NON attivano il kiosk", () => {
    expect(readKioskMode("?kiosk=0")).toBe(false);
    expect(readKioskMode("?kiosk=false")).toBe(false);
    expect(readKioskMode("?kiosk=off")).toBe(false);
    expect(readKioskMode("?compact=1")).toBe(false);
    expect(readKioskMode("")).toBe(false);
    expect(readKioskMode(null)).toBe(false);
    expect(readKioskMode(undefined)).toBe(false);
  });

  test("accetta la stringa anche senza il «?» iniziale", () => {
    expect(readKioskMode("kiosk=1")).toBe(true);
    expect(readKioskMode("kiosk=0&x=2")).toBe(false);
  });
});

describe("kiosk: rotazione delle viste", () => {
  test("nextKioskView cicla quote → grafico → analisi → quote", () => {
    expect(nextKioskView("quote")).toBe("grafico");
    expect(nextKioskView("grafico")).toBe("analisi");
    expect(nextKioskView("analisi")).toBe("quote");
  });
});

describe("kiosk: finestra notturna Europe/Rome", () => {
  // Epoch sintetici con offset esplicito: CEST (UTC+2) a ottobre, CET (UTC+1) a gennaio.
  test("romeHour estrae l'ora locale (h23) da epoch CEST e CET", () => {
    expect(romeHour(Date.parse("2026-10-12T23:30:00+02:00"))).toBe(23);
    expect(romeHour(Date.parse("2026-10-12T12:00:00+02:00"))).toBe(12);
    expect(romeHour(Date.parse("2026-01-15T03:30:00+01:00"))).toBe(3);
    expect(romeHour(Date.parse("2026-01-15T00:30:00+01:00"))).toBe(0); // h23: mezzanotte = 0, non 24
  });

  test("isNightRome: notte = 22:00–06:59 inclusi agli estremi", () => {
    expect(isNightRome(Date.parse("2026-10-12T21:59:00+02:00"))).toBe(false);
    expect(isNightRome(Date.parse("2026-10-12T22:00:00+02:00"))).toBe(true);
    expect(isNightRome(Date.parse("2026-10-12T23:59:00+02:00"))).toBe(true);
    expect(isNightRome(Date.parse("2026-01-15T06:59:00+01:00"))).toBe(true);
    expect(isNightRome(Date.parse("2026-01-15T07:00:00+01:00"))).toBe(false);
    expect(isNightRome(Date.parse("2026-01-15T03:00:00+01:00"))).toBe(true);
  });
});

describe("kiosk: persistenza e sanitizzazione (localStorage)", () => {
  test("roundtrip saveKioskState → loadKioskState", () => {
    const stato: KioskState = { enabled: true, rotation: true, rotationSeconds: 60, nightDim: true };
    saveKioskState(stato);
    expect(loadKioskState()).toEqual(stato);
  });

  test("senza chiave salvata: default (kiosk spento)", () => {
    expect(loadKioskState()).toEqual(KIOSK_DEFAULTS);
  });

  test("JSON corrotto: default senza lanciare", () => {
    window.localStorage.setItem(KIOSK_STORAGE_KEY, "{non json");
    expect(loadKioskState()).toEqual(KIOSK_DEFAULTS);
  });

  test("campi invalidi sanificati: seconds fuori lista → default, booleani stretti", () => {
    window.localStorage.setItem(
      KIOSK_STORAGE_KEY,
      JSON.stringify({ enabled: "yes", rotation: 1, rotationSeconds: 37, nightDim: "true" }),
    );
    expect(loadKioskState()).toEqual(KIOSK_DEFAULTS);
  });

  test("rotationSeconds valido (dalla lista) preservato", () => {
    window.localStorage.setItem(
      KIOSK_STORAGE_KEY,
      JSON.stringify({ enabled: true, rotation: false, rotationSeconds: 300, nightDim: false }),
    );
    expect(loadKioskState().rotationSeconds).toBe(300);
    expect(KIOSK_ROTATION_OPTIONS.some((o) => o.value === 300)).toBe(true);
  });
});

describe("kiosk: kioskHref (URL coerente senza navigazioni)", () => {
  const BASE = "https://example.test/?compact=0&x=2";

  test("attiva: aggiunge kiosk=1 preservando gli altri parametri", () => {
    const url = new URL(kioskHref(BASE, true));
    expect(url.searchParams.get("kiosk")).toBe("1");
    expect(url.searchParams.get("x")).toBe("2");
  });

  test("disattiva: rimuove kiosk preservando gli altri parametri", () => {
    const url = new URL(kioskHref("https://example.test/?kiosk=1&x=2", false));
    expect(url.searchParams.get("kiosk")).toBeNull();
    expect(url.searchParams.get("x")).toBe("2");
  });

  test("URL invalido: restituito identico (nessuna eccezione)", () => {
    expect(kioskHref("non-un-url", true)).toBe("non-un-url");
  });
});
