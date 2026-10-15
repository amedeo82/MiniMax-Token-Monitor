/**
 * I107-fix3 — Schema della persistenza INCORPORATO NEL CODICE (D1 «zero
 * migrazione», docs/09 §8).
 *
 * Problema: il fix I107-fix2 ha reso apribile il file SQLite anche su Vercel
 * (default in `/tmp/db/custom.db`), ma il file appena creato è VUOTO — le
 * tabelle le creava localmente `bun run db:push` e su un'istanza serverless
 * fresca non esistono: il pannello «Persistenza» esplodeva con
 * «Invalid prisma.downsampledPoint.count() invocation: The table
 * `main.DownsampledPoint` does not exist in the current database» (report
 * utente) e con esso ogni scrittura server (storico, eventi).
 *
 * Soluzione: il DDL delle 4 tabelle è incorporato qui sotto (esatto per
 * costruzione: generato con `prisma migrate diff --from-empty` sullo schema
 * Prisma, reso idempotente con IF NOT EXISTS) e applicato ALL'AVVIO del
 * client, su ENTRAMBE le branche (SQLite nativo e adapter libsql/Turso — lo
 * dialetto è lo stesso). Un database Turso appena creato funziona quindi
 * senza passare da `db-push-turso.mjs`, che resta il passo esplicito
 * documentato (README §Persistenza).
 *
 * Semantica di `preparaSchema`:
 * - IDEMPOTENTE: IF NOT EXISTS su ogni statement — riavvii, hot-reload dev e
 *   istanze concorrenti non si disturbano (un eventuale SQLITE_BUSY si
 *   risolve al ciclo successivo: il guasto non è mascherato, riemerge dalla
 *   prima query reale col messaggio preciso);
 * - UNA VOLTA PER CLIENT (cache WeakMap): il primo avvio restituisce la
 *   promise condivisa; chi vuole DETERMINISMO (route /api/persistenza prima
 *   dei conteggi) fa `await preparaSchema(db)`, gli altri non attendono;
 * - BEST-EFFORT: un client senza accesso SQL raw (mock dei test, client
 *   incoerente) non ha nulla da inizializzare — si esce subito; un DDL
 *   fallito viene segnalato su stderr e i seguenti provano comunque, così
 *   uno schema parziale si completa al prossimo avvio.
 *
 * il DDL NON contiene dati né indici oltre a quelli dello schema: nessuna
 * migrazione, nessun dato toccato (CREATE IF NOT EXISTS su tabelle esistenti
 * è un no-op).
 */

/** DDL delle 4 tabelle + indici, reso idempotente (fonte: `prisma migrate diff`). */
export const SCHEMA_PERSISTENZA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS "UsagePoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "t" DATETIME NOT NULL,
    "interval" REAL,
    "weekly" REAL,
    "source" TEXT NOT NULL DEFAULT 'api',
    "region" TEXT NOT NULL DEFAULT 'eu',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE TABLE IF NOT EXISTS "DownsampledPoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hourStart" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'api',
    "minInterval" REAL,
    "maxInterval" REAL,
    "sumInterval" REAL NOT NULL DEFAULT 0,
    "lastInterval" REAL,
    "minWeekly" REAL,
    "maxWeekly" REAL,
    "sumWeekly" REAL NOT NULL DEFAULT 0,
    "lastWeekly" REAL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastT" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE TABLE IF NOT EXISTS "UsageEventRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "t" DATETIME NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT,
    "win" TEXT,
    "message" TEXT NOT NULL,
    "value" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE TABLE IF NOT EXISTS "ModelUsagePoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "model" TEXT NOT NULL,
    "win" TEXT NOT NULL,
    "t" DATETIME NOT NULL,
    "percent" REAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'api',
    "region" TEXT NOT NULL DEFAULT 'eu',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "UsagePoint_t_key" ON "UsagePoint"("t")`,
  `CREATE INDEX IF NOT EXISTS "UsagePoint_t_idx" ON "UsagePoint"("t")`,
  `CREATE INDEX IF NOT EXISTS "DownsampledPoint_hourStart_idx" ON "DownsampledPoint"("hourStart")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DownsampledPoint_hourStart_source_key" ON "DownsampledPoint"("hourStart", "source")`,
  `CREATE INDEX IF NOT EXISTS "UsageEventRecord_t_idx" ON "UsageEventRecord"("t")`,
  `CREATE INDEX IF NOT EXISTS "UsageEventRecord_kind_idx" ON "UsageEventRecord"("kind")`,
  `CREATE INDEX IF NOT EXISTS "ModelUsagePoint_model_idx" ON "ModelUsagePoint"("model")`,
  `CREATE INDEX IF NOT EXISTS "ModelUsagePoint_t_idx" ON "ModelUsagePoint"("t")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ModelUsagePoint_model_win_t_key" ON "ModelUsagePoint"("model", "win", "t")`,
];

/** Avvii di bootstrap già presi in carico, per client (una sola esecuzione). */
const avvii = new WeakMap<object, Promise<void>>();

/**
 * Garantisce che lo schema esista sul database del client (idempotente).
 * Restituisce la promise del bootstrap: `await` per il determinismo (route
 * diagnostica), fire-and-forget all'avvio della factory.
 */
export function preparaSchema(client: object): Promise<void> {
  const giàAvviato = avvii.get(client);
  if (giàAvviato) return giàAvviato;

  // Client senza accesso SQL raw (mock dei test, client incoerente): il
  // bootstrap non è possibile — le query reali riporteranno l'eventuale
  // schema mancante col loro messaggio. Esco senza promesse rovesciate.
  if (typeof (client as { $executeRawUnsafe?: unknown }).$executeRawUnsafe !== "function") {
    return Promise.resolve();
  }

  const avvio = (async () => {
    for (const ddl of SCHEMA_PERSISTENZA) {
      try {
        await (client as { $executeRawUnsafe: (sql: string) => Promise<unknown> }).$executeRawUnsafe(ddl);
      } catch (e) {
        // Best-effort: il guasto NON è mascherato (stderr) e i statement
        // seguenti provano comunque; la prima query reale riporterà l'errore
        // preciso se lo schema resta incompleto.
        console.error("[schema-persistenza] DDL non applicato:", e instanceof Error ? e.message : e);
      }
    }
  })();
  avvii.set(client, avvio);
  return avvio;
}
