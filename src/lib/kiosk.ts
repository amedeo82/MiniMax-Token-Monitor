/**
 * I45 — Modalità kiosk/TV: stato, persistenza e regole pure.
 *
 * Il kiosk è una vista per monitor dedicato (TV / dashboard permanente):
 * attivabile con il parametro URL `?kiosk=1`, dal toggle nell'header, ed
 * uscibile con Esc o con il bottone sempre disponibile nella barra kiosk.
 *
 * Decisioni di design:
 * - lo stato kiosk vive in un proprio localStorage key (`mm-dash-kiosk-v1`),
 *   NON in DashboardSettings: il dialog «Impostazioni → Salva» riscrive
 *   l'intero oggetto settings dallo stato locale del form e cancellerebbe
 *   le preferenze kiosk; separare le chiavi rende i due flussi indipendenti;
 * - `isNightRome()` è una funzione PURA testata separatamente (verifica I45):
 *   la finestra notturna è fissata 22:00–06:59 in Europe/Rome (il fuso di
 *   riferimento dell'intera dashboard, ADR-1).
 */

export type KioskView = "quote" | "grafico" | "analisi";

/** Ordine di rotazione: quote → grafico → analisi → quote… */
export const KIOSK_VIEWS: { key: KioskView; label: string }[] = [
  { key: "quote", label: "Quote" },
  { key: "grafico", label: "Grafico" },
  { key: "analisi", label: "Analisi" },
];

export function nextKioskView(v: KioskView): KioskView {
  return v === "quote" ? "grafico" : v === "grafico" ? "analisi" : "quote";
}

/** Stato completo del kiosk, persistito in localStorage. */
export interface KioskState {
  /** Kiosk attivo (sopravvive al reload — criterio di accettazione). */
  enabled: boolean;
  /** Rotazione automatica tra le viste (opzionale, default OFF). */
  rotation: boolean;
  /** Intervallo di rotazione in secondi. */
  rotationSeconds: number;
  /** Dimming notturno opzionale (22:00–06:59 Europe/Rome). */
  nightDim: boolean;
}

export const KIOSK_DEFAULTS: KioskState = {
  enabled: false,
  rotation: false,
  rotationSeconds: 30,
  nightDim: false,
};

export const KIOSK_STORAGE_KEY = "mm-dash-kiosk-v1";

/** Intervalli di rotazione proposti nella barra kiosk (secondi). */
export const KIOSK_ROTATION_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: "15 secondi" },
  { value: 30, label: "30 secondi" },
  { value: 60, label: "1 minuto" },
  { value: 120, label: "2 minuti" },
  { value: 300, label: "5 minuti" },
];

/** Carica lo stato kiosk dal localStorage, sanificando i campi invalidi. */
export function loadKioskState(): KioskState {
  if (typeof window === "undefined") return KIOSK_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KIOSK_STORAGE_KEY);
    if (!raw) return KIOSK_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<KioskState> & Record<string, unknown>;
    const seconds = Number(parsed.rotationSeconds);
    return {
      enabled: parsed.enabled === true,
      rotation: parsed.rotation === true,
      rotationSeconds: KIOSK_ROTATION_OPTIONS.some((o) => o.value === seconds) ? seconds : KIOSK_DEFAULTS.rotationSeconds,
      nightDim: parsed.nightDim === true,
    };
  } catch {
    return KIOSK_DEFAULTS;
  }
}

/** Persiste lo stato kiosk (best effort: quota piena ignorata). */
export function saveKioskState(state: KioskState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KIOSK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota piena: lo stato resta in memoria per la sessione */
  }
}

/**
 * Ora locale (0–23) in Europe/Rome per un istante dato.
 * `hourCycle: "h23"` evita l'ambiguità «24» della mezzanotte.
 */
export function romeHour(epochMs: number): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(epochMs));
  const n = Number(h);
  return isFinite(n) ? n : 12;
}

/** Finestra notturna del dimming: 22:00–06:59 inclusive in Europe/Rome. */
export function isNightRome(epochMs: number): boolean {
  const h = romeHour(epochMs);
  return h >= 22 || h < 7;
}

/**
 * URL corrente con il parametro `kiosk` aggiunto (valore "1") o rimosso,
 * preservando gli altri parametri. Usato con history.replaceState per tenere
 * la barra degli indirizzi coerente senza navigazioni.
 */
export function kioskHref(currentHref: string, enabled: boolean): string {
  try {
    const url = new URL(currentHref);
    if (enabled) url.searchParams.set("kiosk", "1");
    else url.searchParams.delete("kiosk");
    return url.toString();
  } catch {
    return currentHref;
  }
}
