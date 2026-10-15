/**
 * I107 — Regola ambiente→modalità in un MODULO PROPRIO (pattern I106: unità
 * pura separata dalla factory per la testabilità senza collisioni).
 *
 * Motivazione: i test dei contratti HTTP (I99) e dei guard (I95) mockano
 * "@/lib/db" a livello di processo e bun applica il PRIMO mock registrato
 * per specificatore — una route che aggiunge un import nominato da "@/lib/db"
 * (es. `modalitaPersistenza`) rompe il link quando un altro file ha già
 * mockato il modulo con la sola `{ db }`. La regola vive quindi in un modulo
 * suo, importabile dalle route senza toccare la superficie mockata; la
 * factory continua a RI-ESPORTARLA (superficie pubblica stabile per lo shim
 * `db.ts` e per i test I106).
 *
 * Semantica INVARIATA all'I106: solo `TURSO_DATABASE_URL` (presente e non
 * vuoto dopo il trim) attiva la modalità "turso"; tutto il resto è "locale".
 * Il token da solo NON basta (lezione I106, testato in tests/lib/db.test.ts).
 */

export type ModalitaPersistenza = "turso" | "locale";

/** Modalità attuale della persistenza server (diagnostica/documentazione). */
export function modalitaPersistenza(): ModalitaPersistenza {
  return process.env.TURSO_DATABASE_URL?.trim() ? "turso" : "locale";
}
