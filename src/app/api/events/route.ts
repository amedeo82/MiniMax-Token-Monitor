import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toEpoch, toFloat } from "@/lib/http-validate";

export const dynamic = "force-dynamic";

/**
 * I27 — Persistenza server-side del registro eventi (SQLite via Prisma).
 *
 * Il browser replica qui ogni evento del registro (reset rilevati, soglie
 * superate, errori di rilevamento) in fire-and-forget; all'avvio riscarica
 * l'archivio e lo fonde con il registro locale (dedup per id). Il registro
 * locale resta limitato a 200 voci (diario di sessione); il server conserva
 * l'archivio completo per l'export CSV/JSON di lungo periodo.
 *
 * Nessuna chiave API transita da qui: solo timestamp, tipo, messaggio e
 * percentuale residua dell'evento.
 *
 * POST   { events: [{ id, t, kind, model, win, message, value }] } → upsert + pruning
 * GET    ?limit=2000&since=<epoch ms>&kind=reset                    → eventi PIÙ RECENTI (fino a limit) ordinati per t
 * DELETE                                                            → svuota l'archivio
 *
 * I93 — la GET serve la fetta PIÙ RECENTE (stesso fix di /api/history):
 * prima `orderBy t asc` + `take limit` restituiva gli eventi PIÙ VECCHI
 * quando l'archivio superava il limit — il merge all'avvio (limit 2000 su
 * archivio fino a 5.000) e l'export «Archivio server» perdevano la
 * contemporaneità. Fix: `orderBy t desc` + `take limit` + inversione,
 * output cronologico invariato, fetta corretta.
 */

/** Numero massimo di eventi conservati sul server (pruning FIFO dopo ogni POST). */
const SERVER_EVENTS_MAX = 5_000;
/** Limite difensivo per la query GET. */
const GET_LIMIT_MAX = 5_000;
/** Retention massima dell'archivio eventi. */
const RETENTION_DAYS = 180;

/** Tipi di evento ammessi (stessa enum di lib/usage-events.ts). */
const VALID_KINDS = new Set(["reset", "warn", "crit", "error", "info"]);
/** Finestre ammesse. */
const VALID_WINS = new Set(["interval", "weekly"]);

interface IncomingEvent {
  id?: unknown;
  t?: unknown;
  kind?: unknown;
  model?: unknown;
  win?: unknown;
  message?: unknown;
  value?: unknown;
}

function optionalString(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.slice(0, max) : null;
}

/** Elimina gli eventi più vecchi di RETENTION_DAYS e oltre SERVER_EVENTS_MAX (FIFO). */
async function pruneEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600_000);
  await db.usageEventRecord.deleteMany({ where: { t: { lt: cutoff } } });

  const count = await db.usageEventRecord.count();
  if (count <= SERVER_EVENTS_MAX) return;
  const keep = await db.usageEventRecord.findMany({
    orderBy: { t: "desc" },
    take: SERVER_EVENTS_MAX,
    select: { t: true },
  });
  const oldestKept = keep[keep.length - 1]?.t;
  if (oldestKept) {
    await db.usageEventRecord.deleteMany({ where: { t: { lt: oldestKept } } });
  }
}

export async function POST(req: NextRequest) {
  let body: { events?: IncomingEvent[] };
  try {
    body = (await req.json()) as { events?: IncomingEvent[] };
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Il corpo della richiesta non è JSON valido." } },
      { status: 400 },
    );
  }

  const incoming = Array.isArray(body.events) ? body.events.slice(0, 500) : [];
  if (incoming.length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Nessun evento valido nell'array events." } },
      { status: 400 },
    );
  }

  try {
    let stored = 0;
    for (const ev of incoming) {
      const id = optionalString(ev.id, 64);
      const t = toEpoch(ev.t);
      const kind = typeof ev.kind === "string" && VALID_KINDS.has(ev.kind) ? ev.kind : null;
      const message = optionalString(ev.message, 500);
      // Servono id, timestamp, tipo e messaggio: altrimenti la riga è scartata.
      if (!id || t === null || !kind || !message) continue;

      const data = {
        t: new Date(t),
        kind,
        model: optionalString(ev.model, 64),
        win: typeof ev.win === "string" && VALID_WINS.has(ev.win) ? ev.win : null,
        message,
        value: toFloat(ev.value),
      };
      await db.usageEventRecord.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
      stored += 1;
    }

    await pruneEvents();
    const total = await db.usageEventRecord.count();
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
  const kindRaw = url.searchParams.get("kind");
  const kind = kindRaw !== null && VALID_KINDS.has(kindRaw) ? kindRaw : null;

  try {
    /* I93 — orderBy DESC + take = la fetta PIÙ RECENTE; il reverse in coda
       restaura l'ordine cronologico atteso dai client (merge/export). */
    const rows = await db.usageEventRecord.findMany({
      where: {
        ...(since !== null ? { t: { gte: new Date(since) } } : {}),
        ...(kind !== null ? { kind } : {}),
      },
      orderBy: { t: "desc" },
      take: limit,
    });
    rows.reverse();
    const total = await db.usageEventRecord.count();
    return NextResponse.json({
      ok: true,
      total,
      events: rows.map((r) => ({
        id: r.id,
        t: r.t.getTime(),
        kind: r.kind,
        model: r.model,
        win: r.win,
        message: r.message,
        value: r.value,
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
    const deleted = await db.usageEventRecord.deleteMany({});
    return NextResponse.json({ ok: true, deleted: deleted.count });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore di cancellazione dal database.";
    return NextResponse.json(
      { ok: false, error: { code: "db_delete", message } },
      { status: 500 },
    );
  }
}
