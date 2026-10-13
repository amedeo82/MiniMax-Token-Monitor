/**
 * I42 — Accesso dati alla tabella `ModelUsagePoint` (storico per modello).
 *
 * NOTA IMPLEMENTATIVA: questa tabella usa l'SQL raw parametrizzato di Prisma
 * ($queryRaw/$executeRaw) invece degli accessor tipizzati. Motivo: il processo
 * dev può tenere in memoria (globalThis + require cache) un PrismaClient
 * generato PRIMA del push dello schema, dove l'accessor `modelUsagePoint` non
 * esiste — l'SQL raw invece dipende solo dal motore SQLite e dalla tabella
 * effettivamente creata da `bun run db:push`. Le query sono tutte
 * parametrizzate (nessuna concatenazione di stringhe: nessun rischio injection).
 */

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface ModelPointRow {
  model: string;
  win: "interval" | "weekly";
  /** Epoch ms del rilevamento. */
  t: number;
  percent: number;
  source: string;
  region: string;
}

function assertWin(win: string): win is "interval" | "weekly" {
  return win === "interval" || win === "weekly";
}

/** Upsert di un punto per-modello (dedup sulla chiave unica model+win+t). */
export async function upsertModelPoint(p: ModelPointRow): Promise<void> {
  if (!assertWin(p.win)) throw new Error(`Finestra non valida: ${p.win}`);
  await db.$executeRaw`
    INSERT INTO "ModelUsagePoint" ("model", "win", "t", "percent", "source", "region", "createdAt")
    VALUES (${p.model}, ${p.win}, ${new Date(p.t).toISOString()}, ${p.percent}, ${p.source}, ${p.region}, ${new Date().toISOString()})
    ON CONFLICT ("model", "win", "t") DO UPDATE SET
      "percent" = ${p.percent},
      "source" = ${p.source},
      "region" = ${p.region}
  `;
}

/** Conta tutte le righe per-modello. */
export async function countModelPoints(): Promise<number> {
  const rows = await db.$queryRaw<{ c: number }[]>`SELECT COUNT(*) AS c FROM "ModelUsagePoint"`;
  return Number(rows[0]?.c ?? 0);
}

/** Legge le righe per-modello (filtri opzionali): la fetta PIÙ RECENTE (fino a
 *  limit) restituita in ordine cronologico (t poi id).
 *  I93 — prima `ORDER BY t ASC LIMIT n`: con archivio più grande del limit
 *  restituiva le righe PIÙ VECCHIE (l'esatto opposto del merge all'avvio e
 *  degli export, che vogliono la contemporaneità — e il pruning FIFO conserva
 *  proprio le più recenti). Fix: `ORDER BY t DESC` + LIMIT + inversione.
 *  I filtri sono composti con Prisma.sql/Prisma.join: valori sempre
 *  parametrizzati, sintassi segnaposto gestita dal driver. */
export async function findModelPoints(opts: {
  /** "all" o undefined = nessun filtro modello. */
  model?: string;
  win?: "interval" | "weekly";
  since?: number;
  limit: number;
}): Promise<ModelPointRow[]> {
  const limit = Math.max(1, Math.min(10_000, Math.floor(opts.limit)));
  const conds: Prisma.Sql[] = [];
  if (opts.model && opts.model !== "all") conds.push(Prisma.sql`"model" = ${opts.model}`);
  if (opts.win) conds.push(Prisma.sql`"win" = ${opts.win}`);
  if (opts.since !== undefined) conds.push(Prisma.sql`"t" >= ${new Date(opts.since).toISOString()}`);
  const where = conds.length > 0 ? Prisma.sql` WHERE ${Prisma.join(conds, " AND ")}` : Prisma.empty;
  const rows = await db.$queryRaw<
    { model: string; win: string; t: string; percent: number; source: string; region: string }[]
  >(
    /* I93 — DESC + LIMIT = la fetta PIÙ RECENTE; il reverse in coda restaura
       l'ordine cronologico (t ASC) atteso dai client. */
    Prisma.sql`SELECT "model", "win", "t", "percent", "source", "region" FROM "ModelUsagePoint"${where} ORDER BY "t" DESC, "id" DESC LIMIT ${limit}`,
  );
  rows.reverse();
  const out: ModelPointRow[] = [];
  for (const r of rows) {
    if (!assertWin(r.win)) continue;
    out.push({
      model: r.model,
      win: r.win,
      t: new Date(r.t).getTime(),
      percent: r.percent,
      source: r.source,
      region: r.region,
    });
  }
  return out;
}

/** Pruning: righe più vecchie di 90 giorni + cap FIFO globale a 10.000. */
export async function pruneModelHistory(max = 10_000): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
  await db.$executeRaw`DELETE FROM "ModelUsagePoint" WHERE "t" < ${cutoff}`;
  await db.$executeRaw`
    DELETE FROM "ModelUsagePoint" WHERE "id" NOT IN (
      SELECT "id" FROM "ModelUsagePoint" ORDER BY "t" DESC, "id" DESC LIMIT ${max}
    )
  `;
}

/** Cancella le righe per-modello (tutte se model è undefined/"all"). */
export async function deleteModelPoints(model?: string): Promise<number> {
  if (!model || model === "all") {
    const n = await db.$executeRaw`DELETE FROM "ModelUsagePoint"`;
    return Number(n);
  }
  const n = await db.$executeRaw`DELETE FROM "ModelUsagePoint" WHERE "model" = ${model}`;
  return Number(n);
}
