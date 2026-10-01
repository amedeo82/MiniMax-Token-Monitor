/**
 * Utility per la gestione di date e orari nel fuso orario Europe/Rome
 * con formattazione in locale italiano (it-IT).
 */

export const TZ_ROME = "Europe/Rome";
export const LOCALE_IT = "it-IT";

/** Converte in modo sicuro un valore (epoch sec/ms, stringa ISO o Date) in Date. */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  if (typeof value === "number" && isFinite(value)) {
    // Epoch in millisecondi (> 1e12) oppure in secondi
    const ms = value > 1_000_000_000_000 ? value : value > 1_000_000_000 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Solo cifre → epoch numerico
    if (/^\d{10,13}$/.test(trimmed)) return toDate(Number(trimmed));
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Formatta data e ora complete: "2 ottobre 2026, 17:45:03 (CEST)" */
export function formatFullRome(value: unknown): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat(LOCALE_IT, {
    timeZone: TZ_ROME,
    dateStyle: "long",
    timeStyle: "medium",
  }).format(d);
}

/** Formatta data e ora brevi: "02/10/2026 17:45" */
export function formatDateTimeRome(value: unknown): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat(LOCALE_IT, {
    timeZone: TZ_ROME,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Solo ora: "17:45:03" */
export function formatTimeRome(value: unknown, withSeconds = true): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat(LOCALE_IT, {
    timeZone: TZ_ROME,
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  }).format(d);
}

/** Solo data: "venerdì 2 ottobre 2026" */
export function formatDateRome(value: unknown): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat(LOCALE_IT, {
    timeZone: TZ_ROME,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Giorno e ora: "ven 2 ott, 17:45" — utile per etichette dei grafici */
export function formatShortRome(value: unknown): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat(LOCALE_IT, {
    timeZone: TZ_ROME,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Offset del fuso orario (CET/CEST) per una data: "+02:00 (CEST)" */
export function romeZoneInfo(value: unknown = new Date()): string {
  const d = toDate(value) ?? new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_ROME,
    timeZoneName: "short",
  }).formatToParts(d);
  const zone = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const offsetStr = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_ROME,
    timeZoneName: "longOffset",
  })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value;
  const offset = (offsetStr ?? "").replace("GMT", "UTC");
  return `${offset} ${zone}`.trim();
}

/** Ora corrente a Roma in formato HH:MM:SS */
export function nowRomeTime(): string {
  return formatTimeRome(Date.now());
}

/**
 * Conto alla rovescia in millisecondi → "2h 34m 05s" / "4g 3h" / "45s"
 */
export function formatCountdown(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !isFinite(ms)) return "—";
  if (ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  if (days > 0) return `${days}g ${pad(hours)}h ${pad(minutes)}m`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
}

/** Durata in ms → "5 ore" / "7 giorni" / "3h 20m" */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? "giorno" : "giorni"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "ora" : "ore"}`);
  if (minutes && !days) parts.push(`${minutes} min`);
  return parts.join(" ") || "0 min";
}

/** Millisecondi rimanenti fino a una data (null se passata o sconosciuta). */
export function msUntil(value: unknown, now: number = Date.now()): number | null {
  const d = toDate(value);
  if (!d) return null;
  const diff = d.getTime() - now;
  return diff > 0 ? diff : null;
}

/** Percentuale di avanzamento di una finestra (0–100). */
export function windowProgress(start: unknown, end: unknown, now: number = Date.now()): number | null {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return null;
  const total = e.getTime() - s.getTime();
  if (total <= 0) return null;
  const elapsed = now - s.getTime();
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}
