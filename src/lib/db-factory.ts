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
 * 2. Env assente (sviluppo locale, CI) → STESSO adapter libsql su `file:` SQLite
 *    (`DATABASE_URL`, default `db/custom.db`): dal I115 (prisma 7) il costruttore
 *    NON ha più `datasourceUrl` né motore nativo — l'adapter è l'UNICO modo di
 *    connettersi; il comportamento del ramo locale resta IDENTICO a prima
 *    (stesso file SQLite, stesse route, zero sorprese).
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
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

import { preparaSchema } from "./schema-persistenza";
import { urlPersistenzaLocale } from "./modalita-persistenza";

/* I107 — la regola ambiente→modalità vive nel MODULO PROPRIO
   src/lib/modalita-persistenza.ts (pattern «unità pura separata»): le route
   la importano da lì senza aggiungere import nominati a "@/lib/db" (i mock
   di processo I99/I95 del modulo shim espongono solo `{ db }` — bun applica
   il PRIMO mock registrato per specificatore). La ri-esportazione mantiene
   stabile la superficie pubblica per lo shim db.ts e i test I106. */
export {
  modalitaPersistenza,
  urlPersistenzaLocale,
  type ModalitaPersistenza,
} from "./modalita-persistenza";

/**
 * Factory dell'istanza PrismaClient secondo l'ambiente. Esportata per i test
 * (il singleton `db` qui sotto è valutato una sola volta per processo: i test
 * chiamano questa funzione con ambienti diversi invece di re-importare).
 */
export function creaPrismaClient(): PrismaClient {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  let adapter: PrismaLibSql;
  if (url) {
    // I106 — ramo portabile: adapter libsql. Il token è opzionale (database
    // Turso pubblici e URL `file:` non lo richiedono); mai stampato.
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;
    adapter = new PrismaLibSql({ url, authToken });
  } else {
    // I115 — prisma 7: `datasourceUrl` è stato RIMOSSO dalle opzioni del client
    // (insieme al motore nativo Rust): ENTRAMBI i rami passano dall'adapter,
    // anche il locale (stesso file SQLite, via URL `file:` che libsql apre
    // nativamente). La regola I107-fix «URL SEMPRE esplicito» resta valida —
    // viaggia ora dentro la config dell'adapter: il driver gestisce la
    // connessione e lo schema non porta più l'URL (vedi prisma.config.ts per
    // il CLI). Default: DATABASE_URL se presente, altrimenti il default
    // documentato db/custom.db come percorso ASSOLUTO (vedi la nota in
    // modalita-persistenza.ts; su Vercel senza env il default vive nel tmpdir
    // scrivibile, I107-fix2).
    const urlLocale = urlPersistenzaLocale();
    preparaDirectoryFile(urlLocale);
    adapter = new PrismaLibSql({ url: urlLocale });
  }
  // I107-fix3 — schema GARANTITO all'avvio (D1 «zero migrazione»): DDL
  // idempotente incorporato in src/lib/schema-persistenza.ts, su ENTRAMBE le
  // branche (stesso dialetto SQLite/libSQL). Fire-and-forget: la route di
  // diagnostica attende il gate (preparaSchema) prima dei conteggi; un DB
  // fresco (/tmp su Vercel, Turso appena creato) funziona senza db:push né
  // db-push-turso.mjs. I guasti DDL non sono mascherati (stderr) e riemergono
  // dalle query reali.
  const client = new PrismaClient({ adapter, log: ["query"] });
  void preparaSchema(client);
  return client;
}

/**
 * I107-fix2 — SQLite NON crea le cartelle del file: apre il percorso così com'è
 * e fallisce con SQLITE_CANTOPEN («Error code 14: Unable to open the database
 * file») se la directory padre manca o non è scrivibile — clone fresco senza
 * `db/` (è gitignored: solo `db/*.db` lo è, la cartella non arriva nel checkout)
 * e Vercel, dove il bundle è read-only. Per gli URL `file:` con percorso
 * ASSOLUTO prepara la directory padre, best-effort: un eventuale guasto (es.
 * filesystem davvero read-only) NON viene mascherato — riemerge dal motore
 * SQLite col messaggio preciso. I percorsi RELATIVI sono lasciati a Prisma
 * (li risolve contro prisma/schema.prisma, non al CWD — probe I107-fix:
 * ricostruirne la regola qui la duplicherebbe con il rischio di sbagliarsela).
 */
function preparaDirectoryFile(url: string): void {
  if (!url.startsWith("file:")) return;
  const percorso = url.slice("file:".length).split("?")[0] ?? "";
  if (!percorso.startsWith("/")) return;
  try {
    mkdirSync(dirname(percorso), { recursive: true });
  } catch {
    // best-effort: il guasto reale riemerge dal motore SQLite (es. error 14)
  }
}

/** Singleton alla convenzione Next (hot-reload dev: una sola istanza). */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? creaPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
