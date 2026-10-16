/**
 * I107-fix4 — Verifica empirica della CORSA tra il bootstrap DDL fire-and-forget
 * e le prime query delle rotte (bug di produzione su Vercel: 500 su /api/events,
 * /api/history, /api/history/models).
 *
 * Contesto: la factory (src/lib/db-factory.ts) lancia `void preparaSchema(client)`
 * all'avvio, ma fino al fix3 SOLO /api/persistenza attendeva il gate; le altre
 * rotte interpellavano il DB subito. Su un'istanza serverless fresca (file /tmp
 * nuovo, oppure Turso con RTT di rete) la prima query parte CON il DDL ancora
 * in volo → «The table … does not exist» → 500. In locale il guasto non si vede:
 * `bun run db:push` ha già creato le tabelle e il file esiste da sempre.
 *
 * Scenari (N tentativi su file SQLite freschi, zero credenziali):
 *   A — SENZA gate (il bug): `void preparaSchema(client)` e IMMEDIATAMENTE le
 *       stesse letture concorrenti che fa la dashboard all'avvio (findMany su
 *       UsagePoint / UsageEventRecord e SELECT raw su ModelUsagePoint).
 *   B — COL gate (il fix): `await preparaSchema(client)` PRIMA delle stesse
 *       letture — deve riuscire SEMPRE (determinismo, non probabilità).
 *
 * Esito del probe: B deve essere 100% verde; A è OSSERVAZIONALE (la corsa è
 * reale ma il suo esito locale dipende dal motore: su Vercel/Turso la finestra
 * si allarga di ordini di grandezza e il guasto è sistematico — report utente).
 *
 * Uso: bun scripts/verifiche/verifica-i107-fix4-gate.mjs
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { preparaSchema } from "../../src/lib/schema-persistenza.ts";

const N = 8;
const TIMEOUT_MS = 15_000;

/** Client Prisma nativo su file SQLite FRESH in una directory temporanea. */
function clienteSuFileFresco() {
  const dir = mkdtempSync(join(tmpdir(), "i107-fix4-"));
  const client = new PrismaClient({ datasourceUrl: `file:${join(dir, "custom.db")}` });
  return { dir, client };
}

/** Le stesse letture concorrenti della dashboard all'avvio (3 rotte diverse). */
function lettureConcorrenti(client) {
  return Promise.allSettled([
    client.usagePoint.findMany({ take: 1, orderBy: { t: "desc" } }),
    client.usageEventRecord.findMany({ take: 1, orderBy: { t: "desc" } }),
    client.$queryRaw`SELECT COUNT(*) AS c FROM "ModelUsagePoint"`,
  ]);
}

const conTimeout = (p, ms) =>
  Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout ${ms} ms`)), ms)),
  ]);

async function scenario(nome, colGate) {
  let ok = 0;
  const guasti = [];
  for (let i = 0; i < N; i++) {
    const { dir, client } = clienteSuFileFresco();
    try {
      if (colGate) {
        await preparaSchema(client); // ← IL FIX: il gate è atteso, non corsa
      } else {
        void preparaSchema(client); // ← IL BUG: fire-and-forget, query immediata
      }
      const esiti = await conTimeout(lettureConcorrenti(client), TIMEOUT_MS);
      const falliti = esiti.filter((e) => e.status === "rejected");
      if (falliti.length === 0) {
        ok += 1;
      } else {
        guasti.push(falliti.map((e) => String(e.reason?.message ?? e.reason).split("\n")[0]));
      }
    } catch (e) {
      guasti.push([String(e?.message ?? e).split("\n")[0]]);
    } finally {
      await client.$disconnect().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return { nome, ok, guasti };
}

console.log(`I107-fix4 — corsa DDL vs prime query (${N} file freschi per scenario)\n`);

const a = await scenario("A — senza gate (il bug)", false);
console.log(`[${a.nome}] letturepulite: ${a.ok}/${N} senza errori`);
for (const g of a.guasti) console.log(`  guasto: ${g.join(" | ")}`);
if (a.ok === N) {
  console.log("  nota onesta: localmente il motore può chiudere la corsa in favore delle query");
  console.log("  (file veloce, pool Prisma); su serverless/Turso la finestra si allarga di ordini");
  console.log("  di grandezza e il guasto diventa sistematico (report utente su Vercel).");
}

const b = await scenario("B — col gate (il fix)", true);
console.log(`\n[${b.nome}] letturepulite: ${b.ok}/${N} senza errori`);
for (const g of b.guasti) console.log(`  guasto: ${g.join(" | ")}`);

const verdicto = b.ok === N;
console.log(`\nVerdetto: ${verdicto ? "PASS" : "FAIL"} — col gate il primo accesso ai dati vede SEMPRE lo schema pronto${verdicto ? "" : " (ATTESO: mai guasti nello scenario B)"}`);
process.exit(verdicto ? 0 : 1);
