import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emptyHourBucket, hourStartOf, mergeHourBucket, type HourStats } from "@/lib/downsample";
import { toEpoch } from "@/lib/http-validate";
import { schemaCorpoPunti, schemaPuntoStorico } from "@/lib/api-schemi";

export const dynamic = "force-dynamic";

/**
 * I16 — Persistenza server-side dello storico quote (SQLite via Prisma).
 *
 * Il browser replica qui ogni punto rilevato (fire-and-forget); all'avvio
 * riscarica lo storico e lo fonde con il buffer locale. La chiave API NON
 * viene mai salvata: questo endpoint tratta solo percentuali residue e timestamp.
 *
 * POST   { points: [{ t, interval, weekly, source, region }] }  → upsert + pruning
 * GET    ?limit=2000&since=<epoch ms>                           → i punti PIÙ RECENTI (fino a limit), ordinati per t
 * DELETE                                                          → svuota lo storico
 *
 * I93 — la GET serve la fetta PIÙ RECENTE: prima usava `orderBy t asc` +
 * `take limit`, che con archivio più grande del limit restituiva i punti
 * PIÙ VECCHI — l'esatto opposto del bisogno dei consumatori (merge all'avvio
 * e export vogliono la contemporaneità, e il pruning FIFO conserva proprio
 * i più recenti). Fix: `orderBy t desc` + `take limit` + inversione, così
 * l'output resta cronologico (contratto invariato) ma la fetta è la giusta.
 */

/** Numero massimo di punti conservati sul server (pruning FIFO dopo ogni POST). */
const SERVER_HISTORY_MAX = 10_000;
/** Limite difensivo per la query GET. */
const GET_LIMIT_MAX = 10_000;

/** Elimina i punti più vecchi di 90 giorni e oltre SERVER_HISTORY_MAX (FIFO). */
async function pruneHistory(): Promise<void> {
  const cutoff90d = new Date(Date.now() - 90 * 24 * 3600_000);
  await db.usagePoint.deleteMany({ where: { t: { lt: cutoff90d } } });
  // I68 — i bucket orari derivati seguono la stessa finestra di conservazione:
  // oltre i 90 giorni anche la grana oraria perde interesse (il backfill
  // può ricostruire la tabella dai punti superstiti in qualunque momento).
  await db.downsampledPoint.deleteMany({ where: { hourStart: { lt: cutoff90d } } });

  const count = await db.usagePoint.count();
  if (count <= SERVER_HISTORY_MAX) return;
  const keep = await db.usagePoint.findMany({
    orderBy: { t: "desc" },
    take: SERVER_HISTORY_MAX,
    select: { t: true },
  });
  const oldestKept = keep[keep.length - 1]?.t;
  if (oldestKept) {
    await db.usagePoint.deleteMany({ where: { t: { lt: oldestKept } } });
  }
}

/**
 * I68 — Aggiorna (incrementalmente) il bucket orario derivato del punto
 * appena salvato. Errore NON bloccante per il salvataggio del punto grezzo:
 * il downsample è una comodità e il backfill può ricostruirlo in ogni momento.
 */
async function updateHourBucket(
  t: number,
  interval: number | null,
  weekly: number | null,
  source: string,
): Promise<void> {
  const hs = new Date(hourStartOf(t));
  const key = { hourStart_source: { hourStart: hs, source } };
  const existing = await db.downsampledPoint.findUnique({ where: key });
  const bucket = mergeHourBucket(
    existing
      ? {
          hourStart: existing.hourStart.getTime(),
          source: existing.source,
          interval: {
            min: existing.minInterval,
            max: existing.maxInterval,
            somma: existing.sumInterval,
            ultimo: existing.lastInterval,
          },
          weekly: {
            min: existing.minWeekly,
            max: existing.maxWeekly,
            somma: existing.sumWeekly,
            ultimo: existing.lastWeekly,
          },
          count: existing.count,
          lastT: existing.lastT.getTime(),
        }
      : emptyHourBucket(hs.getTime(), source),
    { t, interval, weekly },
  );
  const stats = (s: HourStats) => ({
    min: s.min,
    max: s.max,
    somma: s.somma,
    ultimo: s.ultimo,
  });
  const i = stats(bucket.interval);
  const w = stats(bucket.weekly);
  await db.downsampledPoint.upsert({
    where: key,
    create: {
      hourStart: hs,
      source,
      minInterval: i.min,
      maxInterval: i.max,
      sumInterval: i.somma,
      lastInterval: i.ultimo,
      minWeekly: w.min,
      maxWeekly: w.max,
      sumWeekly: w.somma,
      lastWeekly: w.ultimo,
      count: bucket.count,
      lastT: new Date(bucket.lastT),
    },
    update: {
      minInterval: i.min,
      maxInterval: i.max,
      sumInterval: i.somma,
      lastInterval: i.ultimo,
      minWeekly: w.min,
      maxWeekly: w.max,
      sumWeekly: w.somma,
      lastWeekly: w.ultimo,
      count: bucket.count,
      lastT: new Date(bucket.lastT),
    },
  });
}

export async function POST(req: NextRequest) {
  /* I103 — validazione del body con zod (lib/api-schemi.ts): cap batch 500 e
     normalizzazione dei campi contrattuali (t/interval/weekly/source/region)
     ora vivono negli schemi; il contratto esterno è invariato (test I99). */
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Corpo della richiesta non è JSON valido." } },
      { status: 400 },
    );
  }

  const parsedCorpo = schemaCorpoPunti.safeParse(body);
  const points = parsedCorpo.success ? parsedCorpo.data : [];
  if (points.length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Nessun punto valido nell'array points." } },
      { status: 400 },
    );
  }

  try {
    let stored = 0;
    for (const p of points) {
      /* I103 — riga normalizzata dallo schema: t null → scartata (come prima). */
      const parsed = schemaPuntoStorico.safeParse(p);
      if (!parsed.success) continue;
      const { t, interval, weekly, source, region } = parsed.data;
      if (t === null) continue;
      const data = { interval, weekly, source, region };
      await db.usagePoint.upsert({
        where: { t: new Date(t) },
        create: { t: new Date(t), ...data },
        update: data,
      });
      // I68 — bucket orario derivato: un errore qui NON blocca il punto grezzo
      try {
        await updateHourBucket(t, data.interval, data.weekly, data.source);
      } catch {
        /* il backfill può ricostruire il bucket in qualunque momento */
      }
      stored += 1;
    }

    await pruneHistory();
    const total = await db.usagePoint.count();
    return NextResponse.json({ ok: true, stored, total });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore di scrittura sul database.";
    return NextResponse.json(
      { ok: false, error: { code: "db_write", message } },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "2000");
  const limit = isFinite(limitRaw) ? Math.max(1, Math.min(GET_LIMIT_MAX, Math.floor(limitRaw))) : 2000;
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw !== null ? toEpoch(sinceRaw) : null;

  // I68 — grana oraria derivata: bucket già aggregati (min/max/media/ultimo
  // per ora UTC e sorgente), per export leggeri e consumi esterni.
  if (url.searchParams.get("granularity") === "hour") {
    const sourceRaw = url.searchParams.get("source");
    try {
      const rows = await db.downsampledPoint.findMany({
        where: {
          ...(since !== null ? { hourStart: { gte: new Date(since) } } : {}),
          ...(sourceRaw !== null && sourceRaw !== "" ? { source: sourceRaw.slice(0, 16) } : {}),
        },
        orderBy: { hourStart: "asc" },
        take: limit,
      });
      const total = await db.downsampledPoint.count();
      return NextResponse.json({
        ok: true,
        total,
        hours: rows.map((r) => ({
          t: r.hourStart.getTime(),
          source: r.source,
          count: r.count,
          interval: {
            min: r.minInterval,
            max: r.maxInterval,
            media: r.count > 0 ? r.sumInterval / r.count : null,
            ultimo: r.lastInterval,
          },
          weekly: {
            min: r.minWeekly,
            max: r.maxWeekly,
            media: r.count > 0 ? r.sumWeekly / r.count : null,
            ultimo: r.lastWeekly,
          },
        })),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Errore di lettura dal database.";
      return NextResponse.json(
        { ok: false, error: { code: "db_read", message } },
        { status: 500 },
      );
    }
  }

  try {
    /* I93 — orderBy DESC + take = la fetta PIÙ RECENTE; il reverse in coda
       restaura l'ordine cronologico atteso dai client (merge/export). */
    const rows = await db.usagePoint.findMany({
      where: since !== null ? { t: { gte: new Date(since) } } : undefined,
      orderBy: { t: "desc" },
      take: limit,
    });
    rows.reverse();
    const total = await db.usagePoint.count();
    return NextResponse.json({
      ok: true,
      total,
      points: rows.map((r) => ({
        t: r.t.getTime(),
        interval: r.interval,
        weekly: r.weekly,
        source: r.source,
        region: r.region,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore di lettura dal database.";
    return NextResponse.json(
      { ok: false, error: { code: "db_read", message } },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const deleted = await db.usagePoint.deleteMany({});
    return NextResponse.json({ ok: true, deleted: deleted.count });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore di cancellazione dal database.";
    return NextResponse.json(
      { ok: false, error: { code: "db_delete", message } },
      { status: 500 },
    );
  }
}
