/**
 * Esportazione dei dati locali della dashboard (storico quota, registro eventi)
 * in CSV o JSON, con download lato browser.
 *
 * Formato CSV: separatore «;» (compatibile con Excel in locale it-IT) e BOM UTF-8
 * per la corretta visualizzazione delle lettere accentate.
 */

import type { HistoryPoint } from "@/components/history-chart";
import type { UsageEvent } from "./usage-events";
import { formatDateTimeRome } from "./time";

const CSV_SEP = ";";

/** Scarica un file di testo via Blob + link temporaneo. */
export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(v: string | number | null): string {
  if (v === null) return "";
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells: (string | number | null)[]): string {
  return cells.map(csvCell).join(CSV_SEP);
}

/** Timestamp compatto per i nomi file: 20261002-154530 */
export function fileStamp(t: number = Date.now()): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Storico quota → CSV (timestamp, data Roma, ora Roma, % intervallo, % settimanale). */
export function historyToCsv(points: HistoryPoint[]): string {
  const rows = [
    csvRow(["timestamp_iso", "data_ora_roma", "percentuale_5h", "percentuale_settimanale"]),
    ...points.map((p) =>
      csvRow([
        new Date(p.t).toISOString(),
        formatDateTimeRome(p.t),
        p.interval.toFixed(1).replace(".", ","),
        p.weekly.toFixed(1).replace(".", ","),
      ]),
    ),
  ];
  return "\uFEFF" + rows.join("\r\n");
}

/** Registro eventi → CSV (timestamp, data Roma, tipo, modello, finestra, messaggio, %). */
export function eventsToCsv(events: UsageEvent[]): string {
  const rows = [
    csvRow(["timestamp_iso", "data_ora_roma", "tipo", "modello", "finestra", "messaggio", "percentuale"]),
    ...events.map((e) =>
      csvRow([
        new Date(e.t).toISOString(),
        formatDateTimeRome(e.t),
        e.kind,
        e.model ?? "",
        e.win ?? "",
        e.message,
        e.value !== null ? e.value.toFixed(1).replace(".", ",") : "",
      ]),
    ),
  ];
  return "\uFEFF" + rows.join("\r\n");
}

/** Scarica lo storico in CSV. */
export function exportHistoryCsv(points: HistoryPoint[]): void {
  downloadTextFile(`minimax-storico-quota-${fileStamp()}.csv`, historyToCsv(points));
}

/** Scarica lo storico in JSON. */
export function exportHistoryJson(points: HistoryPoint[]): void {
  downloadTextFile(
    `minimax-storico-quota-${fileStamp()}.json`,
    JSON.stringify({ exportedAt: new Date().toISOString(), points }, null, 2),
    "application/json;charset=utf-8",
  );
}

/** Scarica il registro eventi in CSV. */
export function exportEventsCsv(events: UsageEvent[]): void {
  downloadTextFile(`minimax-eventi-${fileStamp()}.csv`, eventsToCsv(events));
}
