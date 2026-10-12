/**
 * I52 — rimozione dei 4 punti demo scritti dalla sessione di verifica del 09/10/2026
 * ~16:22 UTC (ids 1163, 1164, 1166, 1167): dopo il close/reopen del browser le
 * route-mock si sono perse col nuovo context e i push demo sono passati (lezione
 * I30 rafforzata). I demo PREESISTENTI restano (condizione accettata).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const IDS = [1163, 1164, 1166, 1167];

const found = await prisma.usagePoint.findMany({
  where: { id: { in: IDS }, source: "demo" },
  select: { id: true, t: true, source: true },
});
console.log("trovati:", found);

const res = await prisma.usagePoint.deleteMany({
  where: { id: { in: IDS }, source: "demo" },
});
console.log("eliminati:", res.count);

const perSource = await prisma.usagePoint.groupBy({
  by: ["source"],
  _count: { _all: true },
});
console.log("DB finale:", perSource.map((r) => `${r.source}: ${r._count._all}`).join(", "));
await prisma.$disconnect();
