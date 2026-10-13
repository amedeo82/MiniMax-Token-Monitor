/**
 * Funzioni statistiche condivise tra i moduli di analisi (I91).
 *
 * Prima di I91 la mediana era duplicata in tre posti (`lib/sampling.ts`,
 * `lib/rate-anomalies.ts`, inline in `lib/cycles.ts` per I57): tre copie con
 * la stessa semantica ma manutenzione separata — il classico punto in cui una
 * correzione futura (es. gestione NaN) avrebbe dovuto essere fatta tre volte.
 * Da qui l'estrazione: una sola definizione, import dove serve.
 */

/** Mediana di un array (media dei due centrali se pari; array vuoto → 0). */
export function medianaDi(valori: number[]): number {
  if (valori.length === 0) return 0;
  const s = [...valori].sort((a, b) => a - b);
  const mezzo = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mezzo] : (s[mezzo - 1] + s[mezzo]) / 2;
}
