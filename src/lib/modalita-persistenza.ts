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

/**
 * I107-fix — URL effettivo del ramo SQLite nativo: `DATABASE_URL` se presente,
 * altrimenti il default DOCUMENTATO «db/custom.db» (README §Persistenza:
 * «nessuna env extra», docs/09 §6).
 *
 * Il default è un percorso ASSOLUTO qualificato dal CWD del processo server
 * (`file:${cwd}/db/custom.db`): Prisma risolve i percorsi `file:` relativi
 * rispetto a prisma/schema.prisma e NON rispetto al CWD (probe empirica
 * I107-fix: `file:./db/custom.db` dal costruttore atterrava su
 * `prisma/db/custom.db`) — il default relativo sarebbe stato creato/aperto
 * nel posto sbagliato.
 *
 * Motivo dell'esistenza: `new PrismaClient()` SENZA `datasourceUrl` esplicito
 * esige `env("DATABASE_URL")` dallo schema e il primo `$queryRaw` esplode con
 * «Environment variable not found: DATABASE_URL» in ogni ambiente senza file
 * `.env` (bug I107 riprodotto: pannello «Persistenza» in deployment senza
 * variabili configurate). Il ramo adapter libsql NON ne ha bisogno (il driver
 * gestisce la connessione), il motore nativo SÌ — quindi il ramo nativo passa
 * SEMPRE un URL esplicito via questa funzione.
 */
export function urlPersistenzaLocale(): string {
  return process.env.DATABASE_URL?.trim() || `file:${process.cwd()}/db/custom.db`;
}
