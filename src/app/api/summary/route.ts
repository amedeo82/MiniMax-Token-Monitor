import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * I80 — Endpoint read-only di sintesi (KPI aggregati) per widget esterni.
 *
 * `GET /api/summary` senza chiave e senza parametri: restituisce SOLO numeri
 * aggregati già pubblici (le stesse percentuali mostrate nella dashboard), per
 * statusline, home assistant, script cron e simili. Nessuna autenticazione
 * perché non serve: qui NON ci sono segreti né dati grezzi estesi — solo
 * conteggi, estremi temporali e l'ultimo rilevamento.
 *
 * ADR-8 (read-only) intoccato: tutte le query sono di lettura
 * (`count`/`findMany`/`groupBy`) — l'endpoint non scrive nulla.
 *
 * Struttura della risposta (tutti i timestamp sono epoch ms):
 * {
 *   ok: true,
 *   generato: number,                       // momento della risposta
 *   punti: { totale, api, demo, altro },   // archivio storico (UsagePoint)
 *   arco: { primo: number|null, ultimo: number|null },
 *   ultimoRilevamento: { t, interval, weekly, source } | null,
 *   eventi: { totale, perKind: Record<string, number>, ultimo: number|null },
 *   downsample: { ore: number, prima: number|null, ultima: number|null }  // I68
 * }
 */

/** Le origini attese; tutto il resto finisce in «altro». */
const SORGENTI = ["api", "demo"] as const;

export async function GET() {
  try {
    // --- Archivio storico (UsagePoint) --------------------------------
    const totalePunti = await db.usagePoint.count();
    const perSource = await db.usagePoint.groupBy({
      by: ["source"],
      _count: { _all: true },
    });
    const contaSource = (nome: string) =>
      perSource.find((r) => r.source === nome)?._count._all ?? 0;
    const noti = SORGENTI.reduce((a, s) => a + contaSource(s), 0);

    const primo = await db.usagePoint.findFirst({ orderBy: { t: "asc" }, select: { t: true } });
    const ultimo = await db.usagePoint.findFirst({
      orderBy: { t: "desc" },
      select: { t: true, interval: true, weekly: true, source: true },
    });

    // --- Registro eventi (UsageEventRecord) ---------------------------
    const totaleEventi = await db.usageEventRecord.count();
    const perKind = await db.usageEventRecord.groupBy({
      by: ["kind"],
      _count: { _all: true },
    });
    const ultimoEvento = await db.usageEventRecord.findFirst({
      orderBy: { t: "desc" },
      select: { t: true },
    });

    // --- Bucket orari derivati (DownsampledPoint, I68) ----------------
    const ore = await db.downsampledPoint.count();
    const primaOra = await db.downsampledPoint.findFirst({
      orderBy: { hourStart: "asc" },
      select: { hourStart: true },
    });
    const ultimaOra = await db.downsampledPoint.findFirst({
      orderBy: { hourStart: "desc" },
      select: { hourStart: true },
    });

    return NextResponse.json({
      ok: true,
      generato: Date.now(),
      punti: {
        totale: totalePunti,
        api: contaSource("api"),
        demo: contaSource("demo"),
        altro: totalePunti - noti,
      },
      arco: {
        primo: primo?.t.getTime() ?? null,
        ultimo: ultimo?.t.getTime() ?? null,
      },
      ultimoRilevamento:
        ultimo === null
          ? null
          : {
              t: ultimo.t.getTime(),
              interval: ultimo.interval,
              weekly: ultimo.weekly,
              source: ultimo.source,
            },
      eventi: {
        totale: totaleEventi,
        perKind: Object.fromEntries(perKind.map((r) => [r.kind, r._count._all])),
        ultimo: ultimoEvento?.t.getTime() ?? null,
      },
      downsample: {
        ore,
        prima: primaOra?.hourStart.getTime() ?? null,
        ultima: ultimaOra?.hourStart.getTime() ?? null,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore di lettura dal database.";
    return NextResponse.json(
      { ok: false, error: { code: "db_read", message } },
      { status: 500 },
    );
  }
}
