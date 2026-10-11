/**
 * I73 — Modalità compatta / widget (`?compact=1`).
 *
 * Con il querystring `?compact=1` la dashboard si riduce a un widget: solo
 * anelli principali + countdown + ritmo, per schermi secondari, statusboard o
 * come vista alternativa della PWA installata (stesso URL con parametro).
 *
 * Valori accettati per il parametro `compact`: assento-vuoto (`?compact`),
 * `1`, `true` (case-insensitive). Qualsiasi altro valore (`0`, `false`, `off`,
 * spazzatura) NON attiva la modalità — default esplicito e prevedibile.
 *
 * Funzione pura: la stringa di ricerca è iniettabile (accetta con o senza «?»),
 * così la modalità è testabile senza window.
 */

export function readCompactMode(search: string | null | undefined): boolean {
  if (!search) return false;
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const raw = params.get("compact");
    if (raw === null) return false;
    const v = raw.trim().toLowerCase();
    return v === "" || v === "1" || v === "true";
  } catch {
    return false;
  }
}
