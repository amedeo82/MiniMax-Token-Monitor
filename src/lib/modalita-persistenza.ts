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

import { tmpdir } from "node:os";
import { join } from "node:path";

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
 * (`file:${cwd}/db/custom.db`): dal I115 l'URL `file:` è consumato DIRETTAMENTE
 * dal driver libsql (adapter prisma 7), che risolve i percorsi relativi contro
 * il CWD — con il vecchio motore nativo (fino a I114) Prisma li risolveva
 * contro prisma/schema.prisma (probe empirica I107-fix: `file:./db/custom.db`
 * dal costruttore atterrava su `prisma/db/custom.db`): il default assoluto
 * è corretto sotto ENTRAMBE le semantiche.
 *
 * Motivo dell'esistenza: l'URL della persistenza locale deve essere SEMPRE
 * esplicito e governato da una regola UNICA (regola I107-fix, valida ancora):
 * senza URL esplicito il vecchio client nativo esigeva env("DATABASE_URL")
 * dallo schema e il primo $queryRaw esplodeva con «Environment variable not
 * found: DATABASE_URL» in ogni ambiente senza file `.env` (bug I107
 * riprodotto: pannello «Persistenza» in deployment senza variabili). Dal I115
 * lo schema non porta più URL (prisma 7) e l'URL esplicito viaggia nella
 * config dell'adapter libsql — la funzione resta la FONTE UNICA della regola
 * (passthrough DATABASE_URL / default assoluto / Vercel tmpdir).
 *
 * I107-fix2 — regola SERVERLESS: su Vercel (`VERCEL=1`) il filesystem del
 * deployment è READ-ONLY (solo `/tmp` è scrivibile) e la directory `db/` non
 * esiste nel bundle: il default dal CWD atterra su `/var/task/db/custom.db` e
 * SQLite muore al primo `$queryRaw` con «Error code 14: Unable to open the
 * database file» (SQLITE_CANTOPEN, bug riprodotto dal report utente). Con
 * `VERCEL=1` il default va quindi in `tmpdir()/db/custom.db` — scrivibile;
 * la factory prepara la directory padre (vedi `preparaDirectoryFile` in
 * db-factory.ts: SQLite NON crea le cartelle). Il file resta EFFIMERO (ogni
 * istanza serverless parte vuota): per la persistenza duratura su Vercel si
 * imposta `TURSO_DATABASE_URL` (README §Persistenza). `DATABASE_URL` esplicita
 * vince SEMPRE, anche su Vercel (passthrough invariato).
 */
export function urlPersistenzaLocale(): string {
  const env = process.env.DATABASE_URL?.trim();
  if (env) return env;
  // Serverless (Vercel): CWD read-only → il default vive nel tmpdir scrivibile.
  if (process.env.VERCEL === "1") return `file:${join(tmpdir(), "db", "custom.db")}`;
  return `file:${process.cwd()}/db/custom.db`;
}

/**
 * I119 — Livello di log del PrismaClient DIPENDENTE DALL'AMBIENTE (audit
 * sicurezza: igiene dei log di runtime).
 *
 * Fino a I119 la factory passava `log: ["query"]` SEMPRE: in produzione ogni
 * query — con i valori dei parametri — finiva nei runtime logs (Vercel:
 * retention piattaforma, visibili al team). Il database non contiene segreti
 * (chiave MiniMax = client-side per design, token Turso = env), MA contiene
 * stringhe inserite dagli utenti (messaggi degli eventi) e la traiettoria
 * corretta è loggare il meno possibile: query log = noise + superficie di
 * esposizione + overhead per ogni query.
 *
 * Regola (stesso pattern delle altre funzioni qui: ambiente→configurazione,
 * iniettabile per i test):
 * - `NODE_ENV === "production"` → `["warn", "error"]`: guasti REALI del motore
 *   restano nei log, il traffico normale non vieta più nulla;
 * - tutti gli altri ambienti (dev, test) → `["query"]`: la visibilità delle
 *   query resta il comportamento storico di sviluppo.
 */
export function livelloLogPrisma(
  env: Record<string, string | undefined> = process.env,
): ("query" | "warn" | "error")[] {
  return env.NODE_ENV === "production" ? ["warn", "error"] : ["query"];
}
