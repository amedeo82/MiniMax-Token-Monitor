/**
 * Batch 1 client-only — Test di `lib/event-filters.ts` (I77): filtri del
 * registro eventi per kind, testo e periodo (con confine «oggi» a Roma DST-safe).
 */
import { describe, test, expect } from "bun:test";
import {
  EVENT_PERIODS,
  EMPTY_EVENT_FILTERS,
  filterEvents,
  startOfTodayRome,
  periodStartMs,
} from "@/lib/event-filters";
import type { UsageEvent } from "@/lib/usage-events";

const H = 3_600_000;

let seq = 0;
const ev = (t: number, kind: UsageEvent["kind"], message: string, model: string | null = "general", value: number | null = null): UsageEvent => ({
  id: `e${++seq}`,
  t,
  kind,
  model,
  win: null,
  message,
  value,
});

/** Istante noto in un giorno a ora legale: 15/10/2026 12:00 Roma (= 10:00 UTC). */
const NOW = Date.UTC(2026, 9, 15, 10, 0, 0);

describe("event-filters: startOfTodayRome", () => {
  test("mezzanotte di Roma: 15/10/2026 00:00 CEST = 22:00 UTC del 14/10", () => {
    expect(startOfTodayRome(NOW)).toBe(Date.UTC(2026, 9, 14, 22, 0, 0));
  });

  test("DST-safe: in ora solare (15/12/2026) l'offset è +1h, non +2h", () => {
    const dic = Date.UTC(2026, 11, 15, 10, 0, 0);
    expect(startOfTodayRome(dic)).toBe(Date.UTC(2026, 11, 14, 23, 0, 0));
  });

  test("un evento alle 00:30 di Roma di oggi rientra in «oggi», uno di ieri no", () => {
    const inizio = startOfTodayRome(NOW);
    const oggiMattina = inizio + 30 * 60_000;
    const ieriSera = inizio - 2 * H;
    expect(oggiMattina >= inizio).toBe(true);
    expect(ieriSera < inizio).toBe(true);
    expect(periodStartMs("oggi", NOW)).toBe(inizio);
  });
});

describe("event-filters: filterEvents", () => {
  const registro = [
    ev(NOW - 1 * H, "reset", "Finestra 5h resettata al 100%"),
    ev(NOW - 3 * H, "warn", "Soglia di attenzione superata", "general", 24),
    ev(NOW - 26 * H, "crit", "Quota quasi esaurita", "general", 6),
    ev(NOW - 30 * H, "error", "Rilevamento fallito: timeout"),
    ev(NOW - 50 * H, "info", "Ritorno all'endpoint primario token_plan/remains", null),
  ];

  test("filtri vuoti (EMPTY) → tutto il registro, ordine preservato", () => {
    expect(filterEvents(registro, EMPTY_EVENT_FILTERS, NOW)).toEqual(registro);
  });

  test("periodo «24h» esclude gli eventi più vecchi di 24 ore (bordo inclusivo)", () => {
    const out = filterEvents(registro, { ...EMPTY_EVENT_FILTERS, period: "24h" }, NOW);
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.t >= NOW - 24 * H)).toBe(true);
  });

  test("periodo «7g» non esclude nulla (registro più corto di 7 giorni)", () => {
    expect(filterEvents(registro, { ...EMPTY_EVENT_FILTERS, period: "7g" }, NOW)).toHaveLength(5);
  });

  test("chips kind: solo i kind selezionati passano", () => {
    const out = filterEvents(registro, { ...EMPTY_EVENT_FILTERS, kinds: ["reset", "crit"] }, NOW);
    expect(out.map((e) => e.kind)).toEqual(["reset", "crit"]);
  });

  test("ricerca testuale case-insensitive su messaggio e modello", () => {
    const out = filterEvents(registro, { ...EMPTY_EVENT_FILTERS, query: "  SOGLIA " }, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("warn");
    const perModello = filterEvents(registro, { ...EMPTY_EVENT_FILTERS, query: "general" }, NOW);
    // reset, warn, crit hanno model "general" esplicito; error lo ha per default di ev()
    expect(perModello.map((e) => e.kind)).toEqual(["reset", "warn", "crit", "error"]);
  });

  test("filtri COMBINATI (periodo + kind + testo) si intersecano", () => {
    const out = filterEvents(
      registro,
      { kinds: ["warn", "crit"], query: "quota", period: "24h" },
      NOW,
    );
    expect(out).toHaveLength(0); // il crit «Quota» è a −26h, fuori dal periodo
    const out2 = filterEvents(
      registro,
      { kinds: ["warn", "crit"], query: "quota", period: "7g" },
      NOW,
    );
    expect(out2).toHaveLength(1);
    expect(out2[0].kind).toBe("crit");
  });

  test("query con soli spazi non filtra nulla", () => {
    expect(filterEvents(registro, { ...EMPTY_EVENT_FILTERS, query: "   " }, NOW)).toHaveLength(5);
  });

  test("registro vuoto → risultato vuoto con qualsiasi filtro", () => {
    expect(filterEvents([], { kinds: ["error"], query: "x", period: "oggi" }, NOW)).toEqual([]);
  });

  test("i 4 periodi dichiarati esistono", () => {
    expect(EVENT_PERIODS.map((p) => p.id)).toEqual(["tutto", "oggi", "24h", "7g"]);
  });
});
