import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * I16 — Persistenza server-side dello storico quote (SQLite via Prisma).
 *
 * Il browser replica qui ogni punto rilevato (fire-and-forget); all'avvio
 * riscarica lo storico e lo fonde con il buffer locale. La chiave API NON
 * viene mai salvata: questo endpoint tratta solo percentuali residue e timestamp.
 *
 * POST   { points: [{ t, interval, weekly, source, region }] }  → upsert + pruning
 * GET    ?limit=2000&since=<epoch ms>                           → punti ordinati per t
 * DELETE                                                          → svuota lo storico
 */

/** Numero massimo di punti conservati sul server (pruning FIFO dopo ogni POST). */
const SERVER_HISTORY_MAX = 10_000;
/** Limite difensivo per la query GET. */
const GET_LIMIT_MAX = 10_000;

interface IncomingPoint {
  t?: unknown;
  interval?: unknown;
  weekly?: unknown;
  source?: unknown;
  region?: unknown;
}

function toFloat(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return Math.max(0, Math.min(100, v));
  if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v))) {
    return Math.max(0, Math.min(100, Number(v)));
  }
  return null;
}

function toEpoch(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!isFinite(n)) return null;
  if (n > 1_000_000_000_000) return n; // ms
  if (n > 1_000_000_000) return n * 1000; // s
  return null;
}

/** Elimina i punti più vecchi di 90 giorni e oltre SERVER_HISTORY_MAX (FIFO). */
async function pruneHistory(): Promise<void> {
  const cutoff90d = new Date(Date.now() - 90 * 24 * 3600_000);
  await db.usagePoint.deleteMany({ where: { t: { lt: cutoff90d } } });

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

export async function POST(req: NextRequest) {
  let body: { points?: IncomingPoint[] };
  try {
    body = (await req.json()) as { points?: IncomingPoint[] };
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Corpo della richiesta non è JSON valido." } },
      { status: 400 },
    );
  }

  const points = Array.isArray(body.points) ? body.points.slice(0, 500) : [];
  if (points.length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Nessun punto valido nell'array points." } },
      { status: 400 },
    );
  }

  try {
    let stored = 0;
    for (const p of points) {
      const t = toEpoch(p.t);
      if (t === null) continue;
      const data = {
        interval: toFloat(p.interval),
        weekly: toFloat(p.weekly),
        source: typeof p.source === "string" && p.source ? p.source.slice(0, 16) : "api",
        region: p.region === "cn" ? "cn" : "eu",
      };
      await db.usagePoint.upsert({
        where: { t: new Date(t) },
        create: { t: new Date(t), ...data },
        update: data,
      });
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

  try {
    const rows = await db.usagePoint.findMany({
      where: since !== null ? { t: { gte: new Date(since) } } : undefined,
      orderBy: { t: "asc" },
      take: limit,
    });
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
