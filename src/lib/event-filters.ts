/**
 * I77 — Filtri del registro eventi (client-side, sul registro già caricato).
 *
 * Il registro locale conserva fino a 200 eventi (l'archivio server fino a 5.000):
 * quando il diario si riempie i filtri permettono di isolare rapidamente ciò che
 * interessa — per TIPO (reset / soglie / errori / note), per TESTO (ricerca sulla
 * descrizione e sul modello) e per PERIODO (oggi a Roma / ultime 24h / ultima
 * settimana).
 *
 * I filtri sono una VISTA: non toccano né il registro locale né l'archivio server
 * (l'export esporta sempre l'archivio completo — see event-log.tsx).
 *
 * Funzioni pure, deterministiche (now iniettabile per i test).
 */

import { TZ_ROME } from "./time";
import type { UsageEvent, UsageEventKind } from "./usage-events";

export type EventPeriod = "tutto" | "oggi" | "24h" | "7g";

export interface EventPeriodMeta {
  id: EventPeriod;
  label: string;
}

export const EVENT_PERIODS: EventPeriodMeta[] = [
  { id: "tutto", label: "Tutto il periodo" },
  { id: "oggi", label: "Oggi (Roma)" },
  { id: "24h", label: "Ultime 24 ore" },
  { id: "7g", label: "Ultimi 7 giorni" },
];

export interface EventFilters {
  /** Kind selezionati; array VUOTO = nessun filtro (tutti i kind). */
  kinds: UsageEventKind[];
  /** Ricerca testuale case-insensitive su message e model; stringa vuota = nessun filtro. */
  query: string;
  period: EventPeriod;
}

export const EMPTY_EVENT_FILTERS: EventFilters = { kinds: [], query: "", period: "tutto" };

/** Offset (ms) del fuso Europe/Rome all'istante dato (secondi di precisione). */
function romeOffsetMs(instantMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_ROME,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - (instantMs - (instantMs % 1000));
}

/**
 * Epoch ms della mezzanotte di OGGI a Europe/Rome (DST-safe): parte dalla data
 * Y-M-D osservata a Roma, ricostruisce la mezzanotte «naive» in UTC e sottrae
 * l'offset del fuso (ricalcolato una seconda volta per il caso limite in cui la
 * mezzanotte cada in una fascia DST diversa dalla prima stima).
 */
export function startOfTodayRome(nowMs: number): number {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_ROME,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
  const [y, m, d] = ymd.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d);
  // Stima con l'offset alla mezzanotte naive, poi RAFFINATA ricalcolando
  // l'offset all'istante stimato (la soluzione risolve t + offset(t) == naive;
  // serve solo per i fusi che cambiano ora esattamente a mezzanotte — Roma no,
  // ma la formula resta corretta e generale).
  const stima = naive - romeOffsetMs(naive);
  return naive - romeOffsetMs(stima);
}

/** Epoch ms di inizio periodo ( «tutto» → −∞ = 0). */
export function periodStartMs(period: EventPeriod, nowMs: number): number {
  switch (period) {
    case "oggi":
      return startOfTodayRome(nowMs);
    case "24h":
      return nowMs - 24 * 3_600_000;
    case "7g":
      return nowMs - 7 * 86_400_000;
    case "tutto":
    default:
      return 0;
  }
}

/**
 * Applica i filtri preservando l'ordine di input: periodo → kind → ricerca.
 * - periodo: `t >= inizio periodo` (bordo inclusivo);
 * - kind: nessuno selezionato = tutti;
 * - ricerca: substring case-insensitive su `message` e `model` (null escluso).
 */
export function filterEvents(events: UsageEvent[], filters: EventFilters, nowMs: number): UsageEvent[] {
  const from = periodStartMs(filters.period, nowMs);
  const kinds = filters.kinds;
  const query = filters.query.trim().toLowerCase();

  return events.filter((e) => {
    if (e.t < from) return false;
    if (kinds.length > 0 && !kinds.includes(e.kind)) return false;
    if (query !== "") {
      const haystack = `${e.message} ${e.model ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}
