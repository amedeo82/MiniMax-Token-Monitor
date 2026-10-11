// Conteggio punti/eventi DB (uso post-rollback per documentare lo stato ripristinato)
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const punti = await db.usagePoint.groupBy({ by: ["source"], _count: { _all: true } });
const eventi = await db.usageEventRecord.count();
const prima = await db.usagePoint.findFirst({ orderBy: { t: "asc" }, select: { t: true, source: true } });
const ultimo = await db.usagePoint.findFirst({ orderBy: { t: "desc" }, select: { t: true, source: true } });
console.log("PUNTI:", JSON.stringify(punti));
console.log("EVENTI:", eventi);
console.log("PRIMO:", prima ? new Date(prima.t).toISOString() : null);
console.log("ULTIMO:", ultimo ? new Date(ultimo.t).toISOString() : null);
await db.$disconnect();
