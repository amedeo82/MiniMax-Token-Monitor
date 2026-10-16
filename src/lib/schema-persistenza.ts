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
 * - IDEMPOTENTE: IF NOT EXISTS su ogni statement — riavvii, hot-reload dev,
 *   riprove e istanze concorrenti non si disturbano (CREATE IF NOT EXISTS su
 *   tabelle esistenti è un no-op);
 * - UNA VOLTA PER CLIENT (cache WeakMap): il primo avvio restituisce la
 *   promise condivisa; chi vuole DETERMINISMO fa `await preparaSchema(db)`
 *   prima di toccare il DB (I107-fix4: lo fanno TUTTE le rotte, non solo la
 *   diagnostica), gli altri non attendono;
 * - RIPROVATO (I107-fix4): il bootstrap è RIPETUTO finché una passata non
 *   chiude senza errori, finché a esaurire i tentativi. Motivo misurato
 *   (scripts/verifiche/verifica-i107-fix4-gate.mjs): all'avvio di un'istanza
 *   fredda il motore può non essere ANCORA connesso quando partono i primi
 *   statement («Engine is not yet connected», «Response from the Engine was
 *   empty») — col solo fire-and-forget il guasto restava (cache senza
 *   riprove) e lo schema restava parziale o vuoto PER TUTTA LA VITA
 *   dell'istanza: su Vercel ogni rotta DB rispondeva 500 «table does not
 *   exist» (report utente 16/10/2026). L'attesa fra le passate (breve) dà al
 *   motore il tempo di connettersi; le passate successive completano ciò che
 *   la prima non è riuscita a creare;
 * - BEST-EFFORT E ONESTO: un client senza accesso SQL raw (mock dei test,
 *   client incoerente) non ha nulla da inizializzare — si esce subito; un
 *   DDL fallito viene segnalato su stderr e i seguenti provano comunque; se
 *   dopo l'ultimo tentativo lo schema resta incompleto, il guasto non è
 *   mascherato: riemerge dalla prima query reale col messaggio preciso.
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

/** Tentativi massimi del bootstrap completo (I107-fix4: motore freddo). */
const TENTATIVI_BOOTSTRAP = 3;
/** Attesa fra i tentativi (ms): dà al motore il tempo di connettersi. */
const ATTESA_TRA_TENTATIVI_MS = 50;

/**
 * Una passata di DDL sul client: applica TUTTI gli statement in ordine e
 * restituisce il numero di fallimenti (ognuno segnalato su stderr — mai
 * mascherato). Idempotente: le passate successive ripartono da tutti gli
 * statement e completano ciò che le precedenti non sono riuscite a creare.
 */
async function passataDDL(client: object): Promise<number> {
  let falliti = 0;
  for (const ddl of SCHEMA_PERSISTENZA) {
    try {
      await (client as { $executeRawUnsafe: (sql: string) => Promise<unknown> }).$executeRawUnsafe(ddl);
    } catch (e) {
      falliti += 1;
      console.error("[schema-persistenza] DDL non applicato:", e instanceof Error ? e.message : e);
    }
  }
  return falliti;
}

/**
 * Garantisce che lo schema esista sul database del client (idempotente).
 * Restituisce la promise del bootstrap: `await` per il determinismo (TUTTE le
 * rotte che toccano il DB, I107-fix4), fire-and-forget all'avvio della factory.
 *
 * I107-fix4 — il bootstrap è ripetuto (TENTATIVI_BOOTSTRAP) finché una passata
 * non chiude senza errori: su istanza fredda il motore può rifiutare i primi
 * statement («Engine is not yet connected») e senza riprove lo schema restava
 * parziale per l'intera vita dell'istanza (probe verifica-i107-fix4-gate.mjs:
 * 0/8 riuscite senza gate, 8/8 col gate).
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
    for (let tentativo = 1; tentativo <= TENTATIVI_BOOTSTRAP; tentativo++) {
      const falliti = await passataDDL(client);
      if (falliti === 0) return;
      // Altri tentativi solo se qualcosa è fallito: l'attesa breve lascia
      // connettere il motore, le passate successive completano lo schema.
      if (tentativo < TENTATIVI_BOOTSTRAP) {
        await new Promise((risolta) => setTimeout(risolta, ATTESA_TRA_TENTATIVI_MS));
      }
    }
  })();
  avvii.set(client, avvio);
  return avvio;
}
