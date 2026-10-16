/**
 * Probe I111 — comportamento della COUNT FIFO con LIMIT parametrizzato vs
 * letterale, sul motore SQLite nativo via Prisma ($queryRaw).
 * Zero credenziali: file temporaneo.
 */
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { preparaSchema } from "../../src/lib/schema-persistenza";

const DIR = join(tmpdir(), "i111-probe-fifo");
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const client = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${join(DIR, "probe.db")}` }) });
await preparaSchema(client);

const ora = Date.now();
const giorni = (n: number) => new Date(ora - n * 24 * 3600_000);
for (const i of [0, 1, 2, 3, 4]) {
  await client.usagePoint.create({ data: { t: giorni(i), interval: i, weekly: i } });
}

const cap = 10_000;

// A) COUNT con LIMIT parametrizzato (tagged template)
const a = await client.$queryRaw`SELECT COUNT(*) AS v FROM "UsagePoint" WHERE "id" NOT IN (SELECT "id" FROM "UsagePoint" ORDER BY "t" DESC, "id" DESC LIMIT ${cap})`;
console.log("A) COUNT LIMIT ?:", String((a as Array<{v: bigint}>)[0]?.v));

// B) COUNT con LIMIT letterale ($queryRawUnsafe)
const b = await client.$queryRawUnsafe(`SELECT COUNT(*) AS v FROM "UsagePoint" WHERE "id" NOT IN (SELECT "id" FROM "UsagePoint" ORDER BY "t" DESC, "id" DESC LIMIT ${cap})`);
console.log("B) COUNT LIMIT literal:", String((b as Array<{v: bigint}>)[0]?.v));

// C) la subquery da sola, parametrizzata
const c = await client.$queryRaw`SELECT "id" FROM "UsagePoint" ORDER BY "t" DESC, "id" DESC LIMIT ${cap}`;
console.log("C) subquery LIMIT ? righe:", Array.isArray(c) ? c.length : c, `n=${(c as unknown[]).length}`);

// D) DELETE equivalente: quante righe colpisce davvero
const d = await client.$executeRaw`DELETE FROM "UsagePoint" WHERE "id" NOT IN (SELECT "id" FROM "UsagePoint" ORDER BY "t" DESC, "id" DESC LIMIT ${cap})`;
console.log("D) DELETE LIMIT ?: righe eliminate =", d);
const rimaste = await client.usagePoint.count();
console.log("   rimaste =", rimaste);

await client.$disconnect();
rmSync(DIR, { recursive: true, force: true });
