/**
 * Probe I111 — formato di MEMORIZZAZIONE dei DateTime Prisma su SQLite:
 * il client tipizzato (create/upsert) vs INSERT raw con ISO esplicito.
 * Determina con che cosa i confronti stringa raw devono lavorare.
 * Zero credenziali: file temporaneo.
 */
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { preparaSchema } from "../../src/lib/schema-persistenza";

const DIR = join(tmpdir(), "i111-probe-datetime");
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const client = new PrismaClient({ datasourceUrl: `file:${join(DIR, "probe.db")}` });
await preparaSchema(client);

const t1 = new Date("2026-10-16T12:00:00.000Z");
// Via client tipizzato (come fa /api/history con l'accessor Prisma)
await client.usagePoint.create({ data: { t: t1, interval: 50, weekly: 60 } });
// Via raw SQL con ISO esplicito (come fa la lib I42 per ModelUsagePoint)
await client.$executeRaw`INSERT INTO "UsagePoint" ("t", "interval", "weekly", "source", "region", "createdAt") VALUES (${new Date("2026-10-16T13:00:00.000Z").toISOString()}, 51, 61, 'api', 'eu', ${new Date().toISOString()})`;

const righe = await client.$queryRaw`SELECT typeof("t") AS tipo, "t" AS t, typeof("createdAt") AS tipoC, "createdAt" AS c FROM "UsagePoint" ORDER BY "id"`;
console.log(JSON.stringify(righe, (_k, v) => (typeof v === "bigint" ? Number(v) : v), 2));

// Il confronto che fa la manutenzione: "t" < cutoff ISO
const cutoff = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
const nIso = await client.$queryRaw`SELECT COUNT(*) AS v FROM "UsagePoint" WHERE "t" < ${cutoff}`;
console.log("COUNT(t < ISO-cutoff) su 2 righe RECENTI (atteso 0 se confronto corretto):", String((righe as unknown as Array<{ t: string }>).length), "->", String((nIso as Array<{ v: bigint }>)[0]?.v));

// E con cutoff epoch ms
const cutoffMs = Date.now() - 90 * 24 * 3600_000;
const nMs = await client.$queryRaw`SELECT COUNT(*) AS v FROM "UsagePoint" WHERE "t" < ${cutoffMs}`;
console.log("COUNT(t < epoch-ms-cutoff):", String((nMs as Array<{ v: bigint }>)[0]?.v));

await client.$disconnect();
rmSync(DIR, { recursive: true, force: true });
