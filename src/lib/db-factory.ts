/**
 * I106 — Factory della persistenza server PORTABILE.
 *
 * Selezione del motore DRIVEN DALLE VARIABILI D'AMBIENTE, una sola factory
 * per tutta l'app (route API, sync server, export — tutti consumano `db`
 * tramite lo shim src/lib/db.ts):
 *
 * 1. `TURSO_DATABASE_URL` presente → driver adapter libsql (`@prisma/adapter-libsql`)
 *    verso Turso (`libsql://…`, con `TURSO_AUTH_TOKEN` opzionale per i database
 *    protetti) oppure verso qualsiasi URL libsql (`file:` compreso). Stesso schema,
 *    stesse route, SQL raw parametrizzato ($queryRaw/$executeRaw) incluso.
 * 2. Env assente (sviluppo locale, CI) → PrismaClient NATIVO su SQLite
 *    (`DATABASE_URL`, default `db/custom.db`): comportamento IDENTICO a prima
 *    di I106 — nessun adapter, nessun servizio esterno, zero sorprese.
 *
 * Il modulo è separato da src/lib/db.ts PER I TEST: i test dei contratti HTTP
 * (I99) e dei guard (I95) mockano "@/lib/db" a livello di processo — importare
 * la factory da un modulo proprio la rende verificabile senza collisioni
 * (pattern: unità pura in modulo proprio, shim per il consumo).
 *
 * Segreti: l'URL/token Turso restano SOLO nell'ambiente (Vercel/local .env);
 * nessun valore viene loggato o esposto al client (le route API non lo
 * ritornano mai).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

/* I107 — la regola ambiente→modalità vive nel MODULO PROPRIO
   src/lib/modalita-persistenza.ts (pattern «unità pura separata»): le route
   la importano da lì senza aggiungere import nominati a "@/lib/db" (i mock
   di processo I99/I95 del modulo shim espongono solo `{ db }` — bun applica
   il PRIMO mock registrato per specificatore). La ri-esportazione mantiene
   stabile la superficie pubblica per lo shim db.ts e i test I106. */
export { modalitaPersistenza, type ModalitaPersistenza } from "./modalita-persistenza";

/**
 * Factory dell'istanza PrismaClient secondo l'ambiente. Esportata per i test
 * (il singleton `db` qui sotto è valutato una sola volta per processo: i test
 * chiamano questa funzione con ambienti diversi invece di re-importare).
 */
export function creaPrismaClient(): PrismaClient {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  if (url) {
    // I106 — ramo portabile: adapter libsql. Il token è opzionale (database
    // Turso pubblici e URL `file:` non lo richiedono); mai stampato.
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;
    const adapter = new PrismaLibSQL({ url, authToken });
    return new PrismaClient({ adapter, log: ["query"] });
  }
  // Ramo locale (default): identico al pre-I106.
  return new PrismaClient({ log: ["query"] });
}

/** Singleton alla convenzione Next (hot-reload dev: una sola istanza). */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? creaPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
