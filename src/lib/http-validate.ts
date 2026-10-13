/**
 * Validazione degli input HTTP condivisa dalle API routes (I91).
 *
 * Prima di I91 `toEpoch` e `toFloat` erano duplicate IDENTICHE in tre routes
 * (`/api/history`, `/api/events`, `/api/history/models`): qualsiasi correzione
 * (es. una soglia diversa per l'epoch in secondi) avrebbe dovuto essere
 * replicata a mano. L'estrazione qui mantiene le stesse semantiche:
 *
 * - `toEpoch`: epoch ms (> 1e12) o secondi (> 1e9, ×1000); altro → null.
 * - `toFloat`: numero finito o stringa numerica, CLAMPATO a [0, 100]; altro → null.
 */

/** Epoch ms da un valore numerico o numerico-stringa; null se non interpretabile. */
export function toEpoch(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!isFinite(n)) return null;
  if (n > 1_000_000_000_000) return n; // ms
  if (n > 1_000_000_000) return n * 1000; // s
  return null;
}

/** Percentuale 0–100 da numero o stringa numerica; null se assente/non valida. */
export function toFloat(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return Math.max(0, Math.min(100, v));
  if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v))) {
    return Math.max(0, Math.min(100, Number(v)));
  }
  return null;
}
